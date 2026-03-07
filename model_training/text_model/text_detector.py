import os
import torch  # type: ignore[import-untyped]
import torch.nn as nn
from transformers import AutoModel, AutoConfig, AutoModelForSequenceClassification, AutoTokenizer  # type: ignore[import-untyped]
from transformers.modeling_utils import PreTrainedModel  # type: ignore[import-untyped]

# for regex (url, emoji) removal
import re
import regex  # type: ignore[import-untyped]

# for data loading
import random
import datasets  # type: ignore[import-untyped]
from datasets import load_dataset, Dataset  # type: ignore[import-untyped]
from torch.utils.data import DataLoader # type: ignore[import-untyped]

# for training loop
from torch.optim import AdamW
import copy

# for saving the model
import gzip

# for training progress tracking
from tqdm.auto import tqdm

# for loss curve visualization
from torch.utils.tensorboard import SummaryWriter

# for exporting the training progress
import time

# for validation loop
import numpy as np


# for stress testing
from stress_test_generator import StressTestGenerator

# Custom model for desklib/ai-text-detector-v1.01 (single logit + sigmoid, not AutoModelForSequenceClassification)
class DesklibAIDetectionModel(PreTrainedModel):
  config_class = AutoConfig

  # initialize the model
  def __init__(self, config):
    super().__init__(config)
    self.model = AutoModel.from_config(config)
    self.classifier = nn.Linear(config.hidden_size, 1)


  def forward(self, input_ids, attention_mask=None, labels=None):
    # forward pass to get the outputs
    outputs = self.model(input_ids, attention_mask=attention_mask)
    # get the last hidden state
    last_hidden_state = outputs[0]
    # expand the attention mask to the same size as the last hidden state
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
    # sum the embeddings
    sum_embeddings = torch.sum(last_hidden_state * input_mask_expanded, dim=1)
    # sum the mask
    sum_mask = torch.clamp(input_mask_expanded.sum(dim=1), min=1e-9)
    # pool the embeddings
    pooled_output = sum_embeddings / sum_mask
    # get the logits
    logits = self.classifier(pooled_output)
    # get the loss
    loss = None
    if labels is not None:
      loss = nn.BCEWithLogitsLoss()(logits.view(-1), labels.float())
    return {"logits": logits, "loss": loss}

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


# pattern for LLM metadata left in generated posts (e.g. SubSimulatorGPT2)
_LLM_METADATA_PATTERN = re.compile(
  r'version\s+\d+\.\d+\.\d+\s*;\s*Engine:\s*text-(?:curie|babbage|davinci|ada|gpt)-?\d*',
  re.IGNORECASE
)


def has_llm_metadata(text: str) -> bool:
  return bool(_LLM_METADATA_PATTERN.search(text))


# clean a batch of examples
def clean_batch(batch):
  return {"text": [preprocess_text(t) for t in batch["text"]]}

# clean a single example
def clean_example(example, text_column="text"):
  example[text_column] = preprocess_text(example[text_column])
  return example

# get the text column from the dataset
def get_text_column(dataset):
  cols = dataset.column_names
  if "text" in cols:
    return "text"
  for c in cols:
    if c.lower() not in ("label", "labels", "id", "idx"):
      return c
  return cols[0] if cols else "text"

# convert gsingh1 dataset to (text, label) dataset
def gsingh1_to_text_label(dataset):
  # convert the dataset to a (text, label) dataset
  human_col = "Human_story"
  skip = {"prompt", human_col, "input_ids", "attention_mask"}
  ai_cols = [c for c in dataset.column_names if c not in skip]
  texts, labels = [], []
  for row in dataset:
    # add the human column to the dataset
    if human_col in row and row[human_col] and str(row[human_col]).strip():
      texts.append(row[human_col])
      labels.append(0)
    # add the AI columns to the dataset
    for col in ai_cols:
      if col in row and row[col] and str(row[col]).strip():
        texts.append(row[col])
        labels.append(1)
  # return the dataset with the text and label columns
  return Dataset.from_dict({"text": texts, "label": labels})


# runing every batch in gsignh1 will take hours, so choose 50 or 100 of each label and 100 of mixed at random per run
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


# tokenize a batch
def tokenize_batch(batch, tokenizer, text_column="text"):
  return tokenizer(
    batch[text_column],
    padding="max_length",
    truncation=True,
    max_length=512
  )

class TextDetectors:
  """
  Implementation of the TextDetector class (design section 3)
  """

  # initialize the model
  def __init__(self):
    self.model_name = "distilbert-base-uncased"
    # empty container for tokenizor (translator) and model
    self.tokenizer = None
    self.model = None
    # CPU > MPS (Apple Silicon) > CUDA (NVIDIA) for speed
    if torch.cuda.is_available():
      self.device = torch.device("cuda")
    elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
      self.device = torch.device("mps")
    else:
      self.device = torch.device("cpu")

    self._initialize_model()

  # initialize the model
  def _initialize_model(self):
    """
    Load the pre-trained transformer.
    desklib/ai-text-detector-v1.01 uses a custom single-logit architecture; use DesklibAIDetectionModel.
    """
    print(f"Loading model [{self.model_name}]...")
    self.use_binary_logit = self.model_name == "desklib/ai-text-detector-v1.01"

    try:
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
      if self.use_binary_logit:
        self.model = DesklibAIDetectionModel.from_pretrained(self.model_name)
      else:
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name, num_labels=2)
      self.model.to(self.device)
      self.model.eval()
      print(f"Successfully loaded [{self.model_name}] to [{self.device}]")
    except Exception as e:
      # if error, fall back to desklib/ai-text-detector-v1.01
      print(f"Error loading model [{self.model_name}]: {e}")
      print("Falling back to [desklib/ai-text-detector-v1.01]")
      self.model_name = "desklib/ai-text-detector-v1.01"
      self.use_binary_logit = True
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
      self.model = DesklibAIDetectionModel.from_pretrained(self.model_name)
      self.model.to(self.device)

  # could change the human_max and ai_min to be more accurate
  def calculate_confidence(
    self,
    text: str,
    clean: bool = True,
    human_max: float = 0.40,
    ai_min: float = 0.70,
    return_pct: bool = False,
  ):
    # clean the text if needed
    if clean:
      text = preprocess_text(text)
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
    # evaluation mode
    self.model.eval()
    # output, no weights are updated
    with torch.no_grad():
      outputs = self.model(**enc)
    logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits
    if self.use_binary_logit:
      prob = torch.sigmoid(logits.squeeze(-1)).item()
    else:
      prob = torch.softmax(logits, dim=1)[0, 1].item()

    # add 50% or 30% to confidence if LLM metadata (version; Engine: text-xxx; etc.) is present
    if has_llm_metadata(text):
      if prob <= 0.1:
        prob = prob + 0.7
        print("Added 70% to confidence because LLM metadata is present.")
      elif prob <= 0.2:
        prob = prob + 0.6
        print("Added 60% to confidence because LLM metadata is present.")
      elif prob <= 0.3:
        prob = prob + 0.5
        print("Added 50% to confidence because LLM metadata is present.")
      elif prob <= 0.4:
        prob = prob + 0.4
        print("Added 40% to confidence because LLM metadata is present.")
      elif prob <= 0.5:
        prob = prob + 0.3
        print("Added 30% to confidence because LLM metadata is present.")
      elif prob <= 0.6:
        print("Added 20% to confidence because LLM metadata is present.")
        prob = prob + 0.2
      else:
        print("Added 0% to confidence because LLM metadata is present.")


    # get the label based on the probability
    if prob < human_max:
      label = "human"
    elif prob < ai_min:
      label = "mixed"
    else:
      label = "ai"

    confidence = prob * 100 if return_pct else prob
    return confidence, label

  # convert the probability to a label
  def prob_to_label(self, prob: float, human_max: float = 0.4, ai_min: float = 0.70) -> str:
    if prob < human_max:
      return "human"
    elif prob < ai_min:
      return "mixed"
    return "ai"

if __name__ == "__main__":
    datasets.disable_progress_bars()
    detector = TextDetectors()

    # load the best model state from file if it exists
    best_model_path = os.path.join(os.path.dirname(__file__), "best_text_detector(smaller).pt")
    best_model_gzip_path = os.path.join(os.path.dirname(__file__), "best_text_detector(smaller).pt.gz")
    state = None
    is_desklib_checkpoint = False


    if os.path.exists(best_model_path):
      state = torch.load(best_model_path, map_location=detector.device)
      is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
      if detector.use_binary_logit and is_desklib_checkpoint:
        detector.model.load_state_dict(state, strict=True)
        print(f"Loaded best model weights from {best_model_path}.")
      elif (not detector.use_binary_logit) and (not is_desklib_checkpoint):
        detector.model.load_state_dict(state, strict=True)
        print(f"Loaded best model weights from {best_model_path}.")
    if state is None:
      print(f"No saved best model found; using freshly loaded weights.")

    # best_model_fp_path = os.path.join(os.path.dirname(__file__), "best_text_detector_fp16(smaller).pt")
    # if os.path.exists(best_model_fp_path):
    #   state = torch.load(best_model_fp_path, map_location=detector.device)
    #   is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
    #   if detector.use_binary_logit and is_desklib_checkpoint:
    #     detector.model.load_state_dict(state, strict=True)
    #     print(f"Loaded best model weights from {best_model_fp_path}.")
    #   elif (not detector.use_binary_logit) and (not is_desklib_checkpoint):
    #     detector.model.load_state_dict(state, strict=True)
    #     print(f"Loaded best model weights from {best_model_fp_path}.")
    # else:
    #   print(f"No saved best model found at {best_model_fp_path}; using freshly loaded weights.")
    

    print("Detector initialized.\n")

    # load both datasets and combine
    raw_gsingh = load_dataset("gsingh1-py/train")
    gsingh = raw_gsingh["train"] if isinstance(raw_gsingh, dict) else raw_gsingh
    if "Human_story" in gsingh.column_names and "label" not in gsingh.column_names:
      gsingh = gsingh1_to_text_label(gsingh)
    gsingh = sample_subset(gsingh, n_human=250, n_ai=250, n_mixed=250, seed=None)

    csv_path = os.path.join(os.path.dirname(__file__), "test_dataset.csv")
    raw_csv = load_dataset("csv", data_files=csv_path)
    csv_ds = raw_csv["train"] if isinstance(raw_csv, dict) else raw_csv
    csv_ds = csv_ds.map(lambda x: {"label": int(x["label"]) if x.get("label") is not None else 0})

    # use test_dataset.csv for social media post focused testing
    # csv_path = os.path.join(os.path.dirname(__file__), "test_dataset.csv")
    # raw = load_dataset("csv", data_files=csv_path)
    # dataset = raw["train"] if isinstance(raw, dict) else raw
    # # ensure label is int
    # dataset = dataset.map(lambda x: {"label": int(x["label"]) if x.get("label") is not None else 0})
    # print(f"Using {len(dataset)} examples from {csv_path} for training.\n")

    # use both datasets for training
    dataset = datasets.concatenate_datasets([gsingh, csv_ds])
    print(f"Using {len(gsingh)} from gsingh1-py + {len(csv_ds)} from test_dataset.csv = {len(dataset)} examples.\n")
    

    # split for validation, training, and testing
    n = len(dataset)
    indices = np.arange(n)

    # shuffle the indices
    np.random.seed(42)
    np.random.shuffle(indices)

    # get the testing indices
    test_size = int(0.2 * n)
    test_indices = indices[test_size:]
    # get the validation indices
    val_size = int(0.2 * n)
    val_indices = indices[:val_size]
    # get the training indices
    train_indices = indices[val_size:]
    train_dataset = dataset.select(train_indices)


    # get the validation dataset
    val_dataset = dataset.select(val_indices)
    # get the testing dataset
    test_dataset = dataset.select(test_indices)
    n_test = len(test_dataset)
    half = n_test // 2
    # split the testing dataset into normal and stress test datasets
    test_normal_dataset = test_dataset.select(range(half))
    test_stress_dataset = test_dataset.select(range(half, n_test))

    # get the text column from the dataset, clean, tokenize, and set the format for both training and validation
    text_column = get_text_column(train_dataset)
    if is_desklib_checkpoint:
      print("Using desklib checkpoint (knowledge distillation).")

    else:
      print("Using distilbert checkpoint (no knowledge distillation).")
      cleaned_train_dataset = train_dataset.map(lambda ex: clean_example(ex, text_column))

    USE_KNOWLEDGE_DISTILLATION = False
    cleaned_train_dataset = train_dataset.map(lambda ex: clean_example(ex, text_column))
    cleaned_val_dataset = val_dataset.map(lambda ex: clean_example(ex, text_column))
    cleaned_test_normal_dataset = test_normal_dataset.map(lambda ex: clean_example(ex, text_column))
    cleaned_test_stress_dataset = test_stress_dataset.map(lambda ex: clean_example(ex, text_column))

    # if the checkpoint is desklib, use knowledge distillation
    if is_desklib_checkpoint:
      teacher_model = None
      teacher_tokenizer = None
      # load the teacher model
      teacher_model = DesklibAIDetectionModel.from_pretrained("desklib/ai-text-detector-v1.01")
      # load the teacher model state from file
      teacher_model.load_state_dict(state, strict=True)
      # move the teacher model to the device
      teacher_model.to(detector.device)
      # set the teacher model to evaluation mode
      teacher_model.eval()
      # load the teacher tokenizer
      teacher_tokenizer = AutoTokenizer.from_pretrained("desklib/ai-text-detector-v1.01")
      USE_KNOWLEDGE_DISTILLATION = True
      print("Knowledge distillation enabled: teacher=desklib (from .pt), student=distilbert")

      # collate the text batch
      def collate_text_batch(batch):
        texts = [b["text"] for b in batch]
        labels = torch.tensor([b["label"] for b in batch], dtype=torch.long)
        return {"text": texts, "label": labels}
      
      train_dataloader_distill = DataLoader(cleaned_train_dataset, batch_size=16, shuffle=True, collate_fn=collate_text_batch) if USE_KNOWLEDGE_DISTILLATION else None
    else:
      tokenized_train_dataset = cleaned_train_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer, text_column), batched=True, batch_size=1000)
      tokenized_train_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])
      train_dataloader = DataLoader(tokenized_train_dataset, batch_size=16, shuffle=True)

    
    tokenized_val_dataset = cleaned_val_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer, text_column), batched=True, batch_size=1000)
    tokenized_test_normal_dataset = cleaned_test_normal_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer, text_column), batched=True, batch_size=1000)
    tokenized_test_stress_dataset = cleaned_test_stress_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer, text_column), batched=True, batch_size=1000)


    tokenized_val_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])
    tokenized_test_normal_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])
    tokenized_test_stress_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])

    val_dataloader = DataLoader(tokenized_val_dataset, batch_size=16, shuffle=False)
    test_normal_dataloader = DataLoader(tokenized_test_normal_dataset, batch_size=16, shuffle=False)
    test_stress_dataloader = DataLoader(tokenized_test_stress_dataset, batch_size=16, shuffle=False)

    # create the optimizer and loss function
    optimizer = AdamW(detector.model.parameters(), lr=5e-5)

    epochs = 4

    # loss function (BCE for desklib single-logit, CrossEntropy for 2-class models)
    loss_fn = torch.nn.BCEWithLogitsLoss() if detector.use_binary_logit else torch.nn.CrossEntropyLoss()
    best_loss = float('inf')

    # for improving training efficiency
    early_stopping_patience = 3
    early_stopping_counter = 0
    best_model_state = None
    best_epoch = 0

    # for export file
    batch_counter = 0
    export_file_path = os.path.join(os.path.dirname(__file__), "export.txt")


    print(f"Start training...\n")


    # knowledge distillation parameters
    DISTILL_ALPHA = 0.5  # alpha * CE(hard) + (1-alpha) * distill_loss
    DISTILL_TEMP = 2.0   # temperature for soft targets (reserved for future use)

    with open(export_file_path, "a") as f:
      f.write(f"\n\n ------------------------------------- \n")

    # TensorBoard writer (run: tensorboard --logdir=runs)
    log_dir = os.path.join(os.path.dirname(__file__), "runs")
    writer = SummaryWriter(log_dir=log_dir)

    # for accuracy tracking
    epoch_train_accuracies = []
    epoch_val_accuracies = []

    # train the model
    for epoch in range(epochs):
      total_loss = 0
      total_train_correct = 0
      total_train_samples = 0
      detector.model.train()
      batch_counter = 0
      dataloader = train_dataloader_distill if USE_KNOWLEDGE_DISTILLATION else train_dataloader

      for batch in tqdm(dataloader, desc=f"Training", unit="batch"):
        batch_counter += 1
        start = time.time()

        # if knowledge distillation is enabled, use the teacher model to get the logits
        if USE_KNOWLEDGE_DISTILLATION:
          # get the texts and labels
          texts, labels = batch["text"], batch["label"].to(detector.device)
          # tokenize the texts
          student_enc = detector.tokenizer(texts, padding="max_length", truncation=True, max_length=512, return_tensors="pt")
          # tokenize the texts for the teacher model
          teacher_enc = teacher_tokenizer(texts, padding="max_length", truncation=True, max_length=512, return_tensors="pt")
          # move the input ids and attention mask to the device
          input_ids = student_enc["input_ids"].to(detector.device)
          # move the attention mask to the device
          attention_mask = student_enc["attention_mask"].to(detector.device)
          teacher_input_ids = teacher_enc["input_ids"].to(detector.device)
          teacher_attention_mask = teacher_enc["attention_mask"].to(detector.device)
        else:
          # if knowledge distillation is not enabled, just use current model to get the logits
          input_ids = batch["input_ids"].to(detector.device)
          attention_mask = batch["attention_mask"].to(detector.device)
          labels = batch["label"].to(detector.device)

        # zero the gradients
        optimizer.zero_grad()
        # get the outputs from the model
        outputs = detector.model(input_ids, attention_mask=attention_mask)
        # get the logits
        logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits

        # if knowledge distillation is enabled, use the teacher model to get the logits
        if USE_KNOWLEDGE_DISTILLATION:
          # get the outputs from the teacher model
          with torch.no_grad():
            teacher_outputs = teacher_model(teacher_input_ids, attention_mask=teacher_attention_mask)
            teacher_logits = teacher_outputs["logits"].squeeze(-1)
            teacher_prob = torch.sigmoid(teacher_logits)
          # get the probabilities from the student model
          student_prob = torch.softmax(logits, dim=1)[:, 1]
          # get the cross-entropy loss
          ce_loss = loss_fn(logits, labels)
          # get the distillation loss
          distill_loss = torch.nn.functional.mse_loss(student_prob, teacher_prob)
          loss = DISTILL_ALPHA * ce_loss + (1 - DISTILL_ALPHA) * distill_loss
        elif detector.use_binary_logit:
          # get the loss for the binary logit model
          loss = loss_fn(logits.squeeze(-1), labels.float())
        else:
          # get the loss for the multi-class model
          loss = loss_fn(logits, labels)



        # confidence and accuracy (uses same thresholds as calculate_confidence)
        if detector.use_binary_logit:
          probs = torch.sigmoid(logits.squeeze(-1))
        else:
          probs = torch.softmax(logits, dim=1)[:, 1]
        preds = (probs >= 0.5).long()
        correct = 0
        batch_size = labels.size(0)

        for i in range (batch_size):
          print(f"Epoch {epoch+1} Batch {batch_counter} Example {i+1}: ")
          conf_pct = probs[i].item()
          result = detector.prob_to_label(conf_pct)
          if (labels[i].item() == 1 and result == "ai") or (labels[i].item() == 0 and result == "human"):
            print(f"Correct prediction [label: {labels[i].item()}] [result: {result}] [confidence: {conf_pct * 100:.2f}%]\n")
            correct += 1
          elif (labels[i].item() == 1 and result == "mixed") or (labels[i].item() == 0 and result == "mixed"):
            print(f"Mixed prediction [label: {labels[i].item()}] [result: {result}] [confidence: {conf_pct * 100:.2f}%]\n")
            correct += 1
          else:
            print(f"Incorrect prediction [label: {labels[i].item()}] [result: {result}] {conf_pct * 100:.2f}%\n")

        batch_accuracy_pct = (correct / batch_size) * 100
        print(f"Batch {batch_counter}: Loss: {loss.item():.4f} | Accuracy: {batch_accuracy_pct:.2f}%")

        # backward pass to update the weights
        loss.backward()
        # update the weights
        optimizer.step()
        total_loss += loss.item()

        end = time.time()
        time_taken = end - start

        total_train_correct += correct
        total_train_samples += batch_size

        # export batch data to export.txt
        with open(export_file_path, "a") as f:
          f.write(f"    Batch {batch_counter}: Loss: {loss.item():.10f} | Accuracy: {batch_accuracy_pct:.2f}% | s/batch: {time_taken:.10f}\n")

      # calculate the average loss for the epoch
      avg_loss = total_loss / len(dataloader)
      writer.add_scalar("Loss/train", avg_loss, epoch)

      # validate the model
      detector.model.eval()

      total_val_loss = 0
      total_val_correct = 0
      total_val_samples = 0

      # w/o weights
      with torch.no_grad():
        for batch in val_dataloader:
          # move the batch, attention mask, and labels to the device
          input_ids = batch['input_ids'].to(detector.device)
          attention_mask = batch['attention_mask'].to(detector.device)
          labels = batch['label'].to(detector.device)
          outputs = detector.model(input_ids, attention_mask=attention_mask)
          logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits
          # get the loss and probabilities
          if detector.use_binary_logit:
            loss = loss_fn(logits.squeeze(-1), labels.float())
            probs = torch.sigmoid(logits.squeeze(-1))
          else:
            loss = loss_fn(logits, labels)
            probs = torch.softmax(logits, dim=1)[:, 1]
          total_val_loss += loss.item()
          # get the predictions
          preds = (probs >= 0.5).long()
          total_val_correct += (preds == labels).sum().item()
          total_val_samples += labels.size(0)
      # calculate the average validation loss for the epoch
      avg_val_loss = total_val_loss / len(val_dataloader)
      epoch_train_accuracy_pct = (total_train_correct / total_train_samples) * 100 if total_train_samples else 0
      epoch_val_accuracy_pct = (total_val_correct / total_val_samples) * 100 if total_val_samples else 0
      epoch_train_accuracies.append(epoch_train_accuracy_pct)
      epoch_val_accuracies.append(epoch_val_accuracy_pct)

      writer.add_scalar("Loss/val", avg_val_loss, epoch)
      writer.add_scalar("Accuracy/train", epoch_train_accuracy_pct, epoch)
      writer.add_scalar("Accuracy/val", epoch_val_accuracy_pct, epoch)

      print(f"Epoch {epoch+1}/{epochs} : Avg loss: {avg_loss:.4f} | Val loss: {avg_val_loss:.4f} | Train acc: {epoch_train_accuracy_pct:.2f}% | Val acc: {epoch_val_accuracy_pct:.2f}%")
      with open(export_file_path, "a") as f:
        f.write(f"Epoch {epoch+1}/{epochs} [SUMMARY]: Loss: {avg_loss:.4f} | Val loss: {avg_val_loss:.4f} | Train acc: {epoch_train_accuracy_pct:.2f}% | Val acc: {epoch_val_accuracy_pct:.2f}%\n")
        f.write(f"  s/epoch: {time_taken:.4f} | avr s/batch: {time_taken / len(dataloader):.4f}\n")

      # return to training mode
      detector.model.train()

      # compare train vs validation loss
      gap = avg_loss - avg_val_loss
      if gap < -0.1:
        print(f"Overfitting: train {avg_loss:.4f} vs val {avg_val_loss:.4f}")

      # check if the loss is the best loss
      if avg_val_loss < best_loss:
        best_loss = avg_val_loss

        # reset the early stopping counter (no overfitting)
        early_stopping_counter = 0

        # copy the best model state so that we can load it for later runs as well
        best_model_state = copy.deepcopy(detector.model.state_dict())
        best_epoch = epoch
      else:
        # increment the early stopping counter
        early_stopping_counter += 1

      # if early stopping counter is greater than the early stopping patience, break the loop
      if early_stopping_counter >= early_stopping_patience:
        print(f"Early stopping triggered at epoch {epoch+1}")
        break

    # session summary
    avg_train_accuracy = sum(epoch_train_accuracies) / len(epoch_train_accuracies) if epoch_train_accuracies else 0
    avg_val_accuracy = sum(epoch_val_accuracies) / len(epoch_val_accuracies) if epoch_val_accuracies else 0
    print(f"\n--- Training Session Summary ---")
    print(f"Avg train accuracy: {avg_train_accuracy:.2f}%")
    print(f"Avg val accuracy: {avg_val_accuracy:.2f}%")
    print(f"Best model from epoch: {best_epoch + 1}")
    with open(export_file_path, "a") as f:
      f.write(f"\n--- SESSION SUMMARY ---\n")
      f.write(f"Avg train accuracy: {avg_train_accuracy:.2f}%\n")
      f.write(f"Avg val accuracy: {avg_val_accuracy:.2f}%\n")
      f.write(f"Best model from epoch: {best_epoch + 1}\n")

    # load the best model state if it exists
    if best_model_state:
      print(f"Loading best model state from epoch {best_epoch+1}")
      detector.model.load_state_dict(best_model_state)
      # save the best model state to a file
      torch.save(detector.model.state_dict(), "model_training/text_model/best_text_detector(smaller).pt")

      best_model_state_fp = detector.model.state_dict()
      best_model_state_fp16 = {k: v.half() for k, v in best_model_state_fp.items()}
      torch.save(best_model_state_fp16, os.path.join(os.path.dirname(__file__), "best_text_detector_fp16(smaller).pt"))
      torch.save(best_model_state, best_model_path)
      print(f"Saved best model weights to {best_model_path} and best_text_detector_fp16(smaller).pt")
    writer.close()
    print("Training complete.")

    print("Start testing...")
    # test the model
    detector.model.eval()
    total_test_loss = 0.0
    total_test_correct = 0
    total_test_samples = 0


    with torch.no_grad():
      for batch in test_normal_dataloader:
        input_ids = batch["input_ids"].to(detector.device)
        attention_mask = batch["attention_mask"].to(detector.device)
        labels = batch["label"].to(detector.device)

        outputs = detector.model(input_ids, attention_mask=attention_mask)
        logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits

        if detector.use_binary_logit:
          loss = loss_fn(logits.squeeze(-1), labels.float())
          probs = torch.sigmoid(logits.squeeze(-1))
        else:
          loss = loss_fn(logits, labels)
          probs = torch.softmax(logits, dim=1)[:, 1]

        total_test_loss += loss.item()

        preds = (probs >= 0.5).long()
        total_test_correct += (preds == labels).sum().item()
        total_test_samples += labels.size(0)

    avg_test_loss = total_test_loss / len(test_normal_dataloader)
    test_accuracy_pct = (total_test_correct / total_test_samples) * 100 if total_test_samples else 0.0
    print(f"Test loss: {avg_test_loss:.4f} | Test accuracy: {test_accuracy_pct:.2f}%")
    with open(export_file_path, "a") as f:
      f.write(f"Test loss: {avg_test_loss:.4f} | Test accuracy: {test_accuracy_pct:.2f}%\n")
    print("Testing complete.")

    print("Start stress testing...")
    # stress test the model

    tester = StressTestGenerator()

    stress_test_dataset = tester.generate_stress_test_dataset(test_stress_dataset)
    stress_test_dataloader = DataLoader(stress_test_dataset, batch_size=16, shuffle=False)

    detector.model.eval()
    total_stress_test_loss = 0.0
    total_stress_test_correct = 0
    total_stress_test_samples = 0

    with torch.no_grad():
      for batch in test_stress_dataloader:
        input_ids = batch["input_ids"].to(detector.device)
        attention_mask = batch["attention_mask"].to(detector.device)
        labels = batch["label"].to(detector.device)

        outputs = detector.model(input_ids, attention_mask=attention_mask)
        logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits

        if detector.use_binary_logit:
          loss = loss_fn(logits.squeeze(-1), labels.float())
          probs = torch.sigmoid(logits.squeeze(-1))
        else:
          loss = loss_fn(logits, labels)
          probs = torch.softmax(logits, dim=1)[:, 1]

        total_stress_test_loss += loss.item()

        preds = (probs >= 0.5).long()
        total_stress_test_correct += (preds == labels).sum().item()
        total_stress_test_samples += labels.size(0)

    print(f"Total stress test correct: {total_stress_test_correct} | Total stress test samples: {total_stress_test_samples}")
    avg_stress_test_loss = total_stress_test_loss / len(test_stress_dataloader)
    stress_test_accuracy_pct = (total_stress_test_correct / total_stress_test_samples) * 100 if total_stress_test_samples else 0.0
    print(f"Stress test loss: {avg_stress_test_loss:.4f} | Stress test accuracy: {stress_test_accuracy_pct:.2f}%")
    with open(export_file_path, "a") as f:
      f.write(f"Stress test loss: {avg_stress_test_loss:.4f} | Stress test accuracy: {stress_test_accuracy_pct:.2f}%\n")
    print("Stress testing complete.")