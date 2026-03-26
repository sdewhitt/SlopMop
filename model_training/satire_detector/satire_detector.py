import os
import re
import torch  # type: ignore[import-untyped]
import torch.nn as nn
from transformers import AutoModelForSequenceClassification, AutoTokenizer  # type: ignore[import-untyped]

# for data loading
import csv
import random
import datasets  # type: ignore[import-untyped]
from datasets import load_dataset, Dataset  # type: ignore[import-untyped]
from torch.utils.data import DataLoader, Dataset as TorchDataset, Subset  # type: ignore[import-untyped]

# for training loop
from torch.optim import AdamW
import copy
import numpy as np  # type: ignore[import-untyped]

# for social media preprocessing
import regex  # type: ignore[import-untyped]

# for training progress
from tqdm.auto import tqdm  # type: ignore[import-untyped]
from typing import Optional, List, Dict, Tuple

# remove all emojis
def emoji_removal(text):
  emoji_pattern = regex.compile(r'\p{Emoji}', flags=regex.UNICODE)
  return emoji_pattern.sub(r'', text)

# preprocess a single text 
def preprocess_text(text):
  # url pattern so that even the shortened versions also gets removed
  text = re.sub(r'\b(?:https?://|www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*[a-zA-Z0-9/_-])?', '', text)

  # remove all HTML tags
  text = re.sub(r'<[^>]*>', '', text)

  # remove all braille art
  text = re.sub(r'[\u2800-\u28FF]+', '', text)
  
  # remove dingbats, stars etc
  text = re.sub(r'[\u2500-\u27BF]+', '', text)

  # remove <3 / </3 heart emoticons (ASCII 3 and Unicode 𝟑 U+1D7F9) in one step so nothing is left behind
  _bold_three = '\U0001d7f9'
  heart_pattern = r'(^|\s)</?\s*[3' + _bold_three + r']\s*(?=\s|$|[.,!?])'
  text = re.sub(heart_pattern, r'\1', text)

  # remove all other emots :3 :) etc
  emoticon_pattern = r'(?i)(^|\s)(:3|:\)|:\)\)|:\(|:\(\(|:0|:-?[pdxo)(]|x-?d|;-?\))(?=\s|$|[.,!?])'
  text = re.sub(emoticon_pattern, r'\1', text)

  # remove katakana/special characters used for faces
  text = re.sub(r'[ツᴥꈍᴗꈊ・ω・｀ω´╥﹏╥⋆𝜗𝜚₊✩‧˚౨ৎ𓂃˖˳·ִֶָ𝟑ᐟ]+', '', text)

  # remove all empty brackets
  text = re.sub(r'\(\s*\)|\[\s*\]|\{\s*\}', '', text)

  # remove _/¯ ¯\_
  text = re.sub(r'[\\_/<>\-¯]{2,}', '', text)
  # print("text after _/¯ ¯\_ removal: ", text)

  # remove all emojis
  text = emoji_removal(text)

  # remove user handles
  text = re.sub(r'@\w+', '', text)

  # clean up leaftover gaps
  clean_up = re.sub(r'\n+', ' ', text)

  return re.sub(r'\s+', ' ', clean_up).strip()


def clean_example(example: dict, text_column: str = "text") -> dict:
  example[text_column] = preprocess_text(example[text_column])
  return example


def get_text_column(dataset: Dataset) -> str:
  cols = dataset.column_names
  if "text" in cols:
    return "text"
  for c in cols:
    if c.lower() not in ("label", "labels", "id", "idx"):
      return c
  return cols[0] if cols else "text"


def tokenize_batch(batch: dict, tokenizer, text_column: str = "text") -> dict:
  return tokenizer(
    batch[text_column],
    padding="max_length",
    truncation=True,
    max_length=512,
  )

# satire keywords
SATIRE_KEYWORDS: List[str] = [
  "satire",
  "parody",
  "shit post",
  "shitpost",
  "shitposting",
  "sarcasm",
  "sarcastic",
  "joke",
  "satirical",
  "humor",
  "comedic",
  "tongue-in-cheek",
  "not serious",
  "for laughs",
  "meme",
  "satire post",
  "parody post",
]


# build regex pattern from SATIRE_KEYWORDS for whole-word matching
def _build_keyword_pattern() -> re.Pattern:
  escaped = [re.escape(kw) for kw in SATIRE_KEYWORDS]
  return re.compile(r"\b(" + "|".join(escaped) + r")\b", re.IGNORECASE)


_SATIRE_PATTERN = _build_keyword_pattern()


# scan text for satire-indicator keywords/tags
def extract_satire_keywords(text: str) -> List[str]:
  if not text or not isinstance(text, str):
    return []
  # return list of matched keywords
  return list(set(m.group(0).lower() for m in _SATIRE_PATTERN.finditer(text)))


# return true if text contains any satire-indicator keyword
def has_satire_keywords(text: str) -> bool:
  return len(extract_satire_keywords(text)) > 0


# add new keyword to the dictionary and rebuild the pattern
def add_satire_keyword(keyword: str) -> None:
  global _SATIRE_PATTERN
  kw = keyword.strip().lower()
  if kw and kw not in SATIRE_KEYWORDS:
    SATIRE_KEYWORDS.append(kw)
    _SATIRE_PATTERN = _build_keyword_pattern()

class SatireDataset(TorchDataset):
  def __init__(
    self,
    csv_path: Optional[str] = None,
    texts: Optional[List[str]] = None,
    labels: Optional[List[int]] = None,
    tokenizer=None,
    text_column: str = "text",
    max_length: int = 512,
    preprocess_fn=None,
  ) -> None:
    if csv_path is not None:
      self.texts, self.labels = self._load_csv(csv_path, text_column)
    elif texts is not None and labels is not None:
      self.texts = list(texts)
      self.labels = list(labels)
    else:
      raise ValueError("Provide either csv_path or (texts, labels)")

    self.tokenizer = tokenizer
    self.max_length = max_length
    self.preprocess_fn = preprocess_fn or preprocess_text

    # Preprocess and tokenize all examples
    self.input_ids = []
    self.attention_mask = []
    self._tokenize_all()

  # load the dataset from a CSV file
  def _load_csv(self, csv_path: str, text_column: str) -> Tuple[List[str], List[int]]:
    texts: List[str] = []
    labels: List[int] = []

    with open(csv_path, newline="", encoding="utf-8") as f:
      reader = csv.DictReader(f)
      cols = reader.fieldnames or []
      tc = text_column if text_column in cols else ("text" if "text" in cols else cols[0])
      for row in reader:
        text = row.get(tc, "")
        label = row.get("label", 0)
        texts.append(str(text) if text else "")
        labels.append(int(label) if label is not None and str(label).strip() else 0)
    return texts, labels

  # tokenize the text
  def _tokenize_all(self) -> None:
    if self.tokenizer is None:
      return
    cleaned = [self.preprocess_fn(t) for t in self.texts]
    enc = self.tokenizer(
      cleaned,
      padding="max_length",
      truncation=True,
      max_length=self.max_length,
      return_tensors="pt",
    )
    self.input_ids = enc["input_ids"]
    self.attention_mask = enc["attention_mask"]

  def __len__(self) -> int:
    return len(self.labels)

  def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
    return {
      "input_ids": self.input_ids[idx].clone(),
      "attention_mask": self.attention_mask[idx].clone(),
      "label": torch.tensor(self.labels[idx], dtype=torch.long),
    }


def sample_subset(dataset, n_human=50, n_ai=50, n_mixed=50, seed=None):
  rng = random.Random(seed)
  indices_0 = [i for i in range(len(dataset)) if dataset["label"][i] == 0]
  indices_1 = [i for i in range(len(dataset)) if dataset["label"][i] == 1]
  rng.shuffle(indices_0)
  rng.shuffle(indices_1)
  human_idx = indices_0[:n_human]
  ai_idx = indices_1[:n_ai]
  remainder = [i for i in range(len(dataset)) if i not in set(human_idx) | set(ai_idx)]
  rng.shuffle(remainder)
  mixed_idx = remainder[:n_mixed]
  sel = human_idx + ai_idx + mixed_idx
  rng.shuffle(sel)
  return dataset.select(sel)


# using hugging face (Thewillonline/reddit-sarcasm) dataset
REDDIT_SARCASM_DATASET = "Thewillonline/reddit-sarcasm"
_WEAK_SARCASM = re.compile(
  r"(?i)(?:^|\s)/s(?:\s|$|[.,!?…])|"
  r"\b(sarcasm|sarcastic|\/s|obvious\s+sarcasm|totally\s+serious|not\s+serious\s+at\s+all)\b"
)


def weak_sarcasm_label_from_text(text: str) -> int:
  if not text or not isinstance(text, str):
    return 0
  return 1 if _WEAK_SARCASM.search(text) else 0



# add weak binary labels for supervised fine-tuning:
# 1 = likely sarcasm (/s tag, common markers), 0 = otherwise
def load_reddit_sarcasm_hf_with_weak_labels(
  split_slice: str = "train[:100000]",
) -> Dataset:
  raw = load_dataset(REDDIT_SARCASM_DATASET, split=split_slice)

  def add_label(ex: dict) -> dict:
    t = ex.get("text") or ""
    return {"label": weak_sarcasm_label_from_text(t)}

  return raw.map(add_label)


# merge the hugging face reddit-sarcasm dataset with the local CSV dataset
def merge_hf_reddit_sarcasm_with_csv(
  csv_path: str,
  tokenizer,
  hf_split_slice: str = "train[:100000]",
  n_label0: int = 250,
  n_label1: int = 250,
  n_mixed: int = 100,
  seed: Optional[int] = None,
) -> SatireDataset:
  hf_ds = load_reddit_sarcasm_hf_with_weak_labels(split_slice=hf_split_slice)
  hf_ds = sample_subset(hf_ds, n_human=n_label0, n_ai=n_label1, n_mixed=n_mixed, seed=seed)
  hf_texts = [hf_ds[i]["text"] for i in range(len(hf_ds))]
  hf_labels = [int(hf_ds[i]["label"]) for i in range(len(hf_ds))]

  csv_texts: List[str] = []
  csv_labels: List[int] = []
  with open(csv_path, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    cols = reader.fieldnames or []
    tc = "text" if "text" in cols else cols[0]
    for row in reader:
      csv_texts.append(str(row.get(tc, "") or ""))
      csv_labels.append(int(row["label"]) if row.get("label") not in (None, "") else 0)

  merged_texts = hf_texts + csv_texts
  merged_labels = hf_labels + csv_labels
  return SatireDataset(texts=merged_texts, labels=merged_labels, tokenizer=tokenizer)


# create the dataloaders
def create_satire_dataloaders(
  csv_path: str,
  tokenizer,
  batch_size: int = 16,
  val_ratio: float = 0.2,
  test_ratio: float = 0.1,
  seed: int = 42,
  num_workers: int = 0,
  use_hf_reddit_sarcasm: bool = False,
  hf_split_slice: str = "train[:100000]",
  n_hf_label0: int = 250,
  n_hf_label1: int = 250,
  n_hf_mixed: int = 100,
) -> Tuple[DataLoader, DataLoader, DataLoader, int, int, int]:
  # create the dataset (optional: mix Thewillonline/reddit-sarcasm + local CSV)
  if use_hf_reddit_sarcasm:
    full_dataset = merge_hf_reddit_sarcasm_with_csv(
      csv_path=csv_path,
      tokenizer=tokenizer,
      hf_split_slice=hf_split_slice,
      n_label0=n_hf_label0,
      n_label1=n_hf_label1,
      n_mixed=n_hf_mixed,
      seed=seed,
    )
  else:
    full_dataset = SatireDataset(csv_path=csv_path, tokenizer=tokenizer)
  n = len(full_dataset)
  if n == 0:
    raise ValueError(f"No examples found in {csv_path}")

  # shuffle the indices
  indices = np.arange(n)
  np.random.seed(seed)
  np.random.shuffle(indices)

  # seperate the dataset into test, validation, and training sets
  test_n = int(n * test_ratio)
  val_n = int(n * val_ratio)


  test_indices = indices[:test_n].tolist()
  val_indices = indices[test_n : test_n + val_n].tolist()
  train_indices = indices[test_n + val_n :].tolist()

  # create the datasets
  train_dataset = Subset(full_dataset, train_indices)
  val_dataset = Subset(full_dataset, val_indices)
  test_dataset = Subset(full_dataset, test_indices)

  # create the dataloaders
  train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=num_workers)
  # create the validation dataloader
  val_loader = DataLoader(val_dataset,batch_size=batch_size,shuffle=False,num_workers=num_workers)
  # create the test dataloader
  test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False, num_workers=num_workers,)
  # return the dataloaders and the number of examples in each set
  return train_loader, val_loader, test_loader, len(train_indices), len(val_indices), len(test_indices)



# use distillbert-base-uncased for lighter model
class SatireDetector:
  # initialize the model
  def __init__(self):
    # set the model name
    self.model_name = "distilbert-base-uncased"
    self.tokenizer = None
    self.model = None

    if torch.cuda.is_available():
      self.device = torch.device("cuda")
    elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
      self.device = torch.device("mps")
    else:
      self.device = torch.device("cpu")
    self._initialize_model()

  def _initialize_model(self) -> None:
    print(f"Loading model [{self.model_name}]...")
    self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
    self.model = AutoModelForSequenceClassification.from_pretrained(
      self.model_name,
      num_labels=2,  # satire vs non-satire
    )
    self.model.to(self.device)
    self.model.eval()
    print(f"Successfully loaded [{self.model_name}] to [{self.device}]")

  # predict the label of the text
  def predict(self, text: str, return_prob: bool = False):
    # tokenize the text
    enc = self.tokenizer(
      text,
      padding="max_length",
      truncation=True,
      max_length=512,
      return_tensors="pt",
    )
    # move the text to the device
    enc = {k: v.to(self.device) for k, v in enc.items()}
    # set the model to evaluation mode
    self.model.eval()
    # get the outputs from the model
    with torch.no_grad():
      outputs = self.model(**enc)
    # get the logits from the model
    logits = outputs.logits
    # get the probabilities from the model
    probs = torch.softmax(logits, dim=1)
    # get the probability of the satire label
    prob_satire = probs[0, 1].item()
    # get the label of the text
    label = "satire" if prob_satire >= 0.5 else "non_satire"
    # return the label and the probability if needed
    if return_prob:
      return label, prob_satire
    return label


# training script
def train_on_social_media_data(
  detector: SatireDetector,
  csv_path: str,
  epochs: int = 2,
  batch_size: int = 16,
  lr: float = 5e-5,
  val_ratio: float = 0.2,
  test_ratio: float = 0.1,
  seed: int = 42,
  use_hf_reddit_sarcasm: bool = False,
  hf_split_slice: str = "train[:100000]",
  n_hf_label0: int = 50,
  n_hf_label1: int = 50,
  n_hf_mixed: int = 100,
) -> None:
  # load the dataset
  print(f"Loading dataset from {csv_path}...")
  if use_hf_reddit_sarcasm:
    print(
      f"Mixing Hugging Face {REDDIT_SARCASM_DATASET} ({hf_split_slice}, sample_subset) with CSV for sarcasm/satire cues."
    )
  # create the dataloaders
  train_loader, val_loader, test_loader, train_n, val_n, test_n = create_satire_dataloaders(
    csv_path=csv_path,
    tokenizer=detector.tokenizer,
    batch_size=batch_size,
    val_ratio=val_ratio,
    test_ratio=test_ratio,
    seed=seed,
    use_hf_reddit_sarcasm=use_hf_reddit_sarcasm,
    hf_split_slice=hf_split_slice,
    n_hf_label0=n_hf_label0,
    n_hf_label1=n_hf_label1,
    n_hf_mixed=n_hf_mixed,
  )

  # create the optimizer and loss function
  optimizer = AdamW(detector.model.parameters(), lr=lr)
  loss_fn = torch.nn.CrossEntropyLoss()
  best_val_loss = float("inf")
  best_model_state = None
  best_epoch = 0

  print(f"Training on {train_n} examples, validation {val_n}, test {test_n}")
  print(f"Epochs: {epochs}, batch_size: {batch_size}, lr: {lr}\n")

  # train the model
  for epoch in range(epochs):
    # set the model to training mode
    detector.model.train()
    total_loss = 0
    total_correct = 0
    total_samples = 0

    # train the model
    for batch in tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}", unit="batch"):
      # move the batch to the device
      input_ids = batch["input_ids"].to(detector.device)
      # move the attention mask to the device
      attention_mask = batch["attention_mask"].to(detector.device)
      # move the labels to the device
      labels = batch["label"].to(detector.device)

      optimizer.zero_grad()
      # get the outputs from the model
      outputs = detector.model(input_ids, attention_mask=attention_mask)
      # get the loss
      loss = loss_fn(outputs.logits, labels)
      # backward pass to update the weights
      loss.backward()
      # update the weights
      optimizer.step()

      total_loss += loss.item()
      preds = outputs.logits.argmax(dim=1)
      total_correct += (preds == labels).sum().item()
      total_samples += labels.size(0)

    avg_train_loss = total_loss / len(train_loader)
    train_acc = 100 * total_correct / total_samples

    # validate the model
    detector.model.eval()
    # initialize the validation loss
    val_loss = 0
    # initialize the validation correct
    val_correct = 0
    # initialize the validation samples
    val_samples = 0
    # validate the model
    with torch.no_grad():
      for batch in val_loader:
        input_ids = batch["input_ids"].to(detector.device)
        attention_mask = batch["attention_mask"].to(detector.device)
        labels = batch["label"].to(detector.device)
        outputs = detector.model(input_ids, attention_mask=attention_mask)
        val_loss += loss_fn(outputs.logits, labels).item()
        preds = outputs.logits.argmax(dim=1)
        val_correct += (preds == labels).sum().item()
        val_samples += labels.size(0)

    avg_val_loss = val_loss / len(val_loader)
    val_acc = 100 * val_correct / val_samples

    print(f"Epoch {epoch+1}: train loss={avg_train_loss:.4f} acc={train_acc:.2f}% | val loss={avg_val_loss:.4f} acc={val_acc:.2f}%")

    if avg_val_loss < best_val_loss:
      best_val_loss = avg_val_loss
      best_model_state = copy.deepcopy(detector.model.state_dict())
      best_epoch = epoch + 1

  # save the best model
  if best_model_state:
    detector.model.load_state_dict(best_model_state)
    best_model_path = os.path.join(os.path.dirname(__file__), "best_satire_detector.pt")
    torch.save(best_model_state, best_model_path)
    print(f"\nBest model (epoch {best_epoch}) saved to {best_model_path}")

  # evaluate the model
  detector.model.eval()
  # initialize the test correct
  test_correct = 0
  # initialize the test samples
  test_samples = 0
  with torch.no_grad():
    # evaluate the model
    for batch in test_loader:
      # move the batch to the device
      input_ids = batch["input_ids"].to(detector.device)
      attention_mask = batch["attention_mask"].to(detector.device)
      labels = batch["label"].to(detector.device)
      outputs = detector.model(input_ids, attention_mask=attention_mask)
      preds = outputs.logits.argmax(dim=1)
      test_correct += (preds == labels).sum().item()
      test_samples += labels.size(0)
  test_acc = 100 * test_correct / test_samples
  print(f"Test accuracy: {test_acc:.2f}%")


if __name__ == "__main__":
  datasets.disable_progress_bars()
  detector = SatireDetector()

  best_model_path = os.path.join(os.path.dirname(__file__), "best_satire_detector.pt")
  test_dataset_path = os.path.join(os.path.dirname(__file__), "test_dataset.csv")

  if os.path.exists(best_model_path):
    state = torch.load(best_model_path, map_location=detector.device)
    is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
    if not is_desklib_checkpoint:
      detector.model.load_state_dict(state, strict=True)
      print(f"Loaded best model weights from {best_model_path}.")

  if os.path.exists(test_dataset_path):
    train_on_social_media_data(
      detector,
      csv_path=test_dataset_path,
      epochs=4,
      batch_size=16,
      lr=5e-5,
      use_hf_reddit_sarcasm=True,
      hf_split_slice="train[:100000]",
      n_hf_label0=250,
      n_hf_label1=250,
      n_hf_mixed=100,
    )
  else:
    print(f"No test_dataset.csv found at {test_dataset_path}")
    print("Place test_dataset.csv (columns: text, label; 0=non_satire, 1=satire) in this directory to train.")

  print("Detector initialized.\n")
