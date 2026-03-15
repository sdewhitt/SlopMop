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
import copy
import numpy as np  # type: ignore[import-untyped]

# for social media preprocessing
import regex  # type: ignore[import-untyped]

# for training progress
from tqdm.auto import tqdm  # type: ignore[import-untyped]
from typing import Optional, List, Dict, Tuple


# ── Social media text preprocessing ─────────────────────────────────────────
def emoji_removal(text: str) -> str:
  emoji_pattern = regex.compile(r"\p{Emoji}", flags=regex.UNICODE)
  return emoji_pattern.sub(r"", text)


def preprocess_social_media_text(text: str) -> str:
  """Preprocess text for social media: URLs, emojis, handles, etc."""
  if not text or not isinstance(text, str):
    return ""
  # URL removal
  text = re.sub(
    r"\b(?:https?://|www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*[a-zA-Z0-9/_-])?",
    "",
    text,
  )
  # HTML tags
  text = re.sub(r"<[^>]*>", "", text)
  # User handles (@username)
  text = re.sub(r"@\w+", "", text)
  # Emojis
  text = emoji_removal(text)
  # Emoticons :3 :) etc
  emoticon_pattern = r"(?i)(^|\s)(:3|:\)|:\)\)|:\(|:\(\(|:0|:-?[pdxo)(]|x-?d|;-?\))(?=\s|$|[.,!?])"
  text = re.sub(emoticon_pattern, r"\1", text)
  # Collapse whitespace
  text = re.sub(r"\n+", " ", text)
  return re.sub(r"\s+", " ", text).strip()


def clean_example(example: dict, text_column: str = "text") -> dict:
  example[text_column] = preprocess_social_media_text(example[text_column])
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


# ── Dataset & DataLoader Implementation ──────────────────────────────────────
class SatireDataset(TorchDataset):
  """
  PyTorch Dataset for satire detection. Loads from CSV, preprocesses text,
  and tokenizes for DistilBERT. Expects columns: text, label (0=non_satire, 1=satire).
  """

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
    self.preprocess_fn = preprocess_fn or preprocess_social_media_text

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


# create the dataloaders
def create_satire_dataloaders(
  csv_path: str,
  tokenizer,
  batch_size: int = 16,
  val_ratio: float = 0.2,
  test_ratio: float = 0.1,
  seed: int = 42,
  num_workers: int = 0,
) -> Tuple[DataLoader, DataLoader, DataLoader, int, int, int]:
  # create the dataset
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
  val_ratio: float = 0.2,
  test_ratio: float = 0.1,
  seed: int = 42,
) -> None:
  # load the dataset
  print(f"Loading dataset from {csv_path}...")
  # create the dataloaders
  train_loader, val_loader, test_loader, train_n, val_n, test_n = create_satire_dataloaders(
    csv_path=csv_path,
    tokenizer=detector.tokenizer,
    batch_size=16,
    val_ratio=val_ratio,
    test_ratio=test_ratio,
    seed=seed,
  )


  print(f"Training on {train_n} examples, validation {val_n}, test {test_n}")


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
    )
  else:
    print(f"No test_dataset.csv found at {test_dataset_path}")
    print("Place test_dataset.csv (columns: text, label; 0=non_satire, 1=satire) in this directory to train.")

  print("Detector initialized.\n")
