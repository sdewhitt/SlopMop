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
from datasets import load_dataset, Dataset # type: ignore[import-untyped]
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


# Custom model for desklib/ai-text-detector-v1.01 (single logit + sigmoid, not AutoModelForSequenceClassification)
class DesklibAIDetectionModel(PreTrainedModel):
  config_class = AutoConfig

  def __init__(self, config):
    super().__init__(config)
    self.model = AutoModel.from_config(config)
    self.classifier = nn.Linear(config.hidden_size, 1)

  def forward(self, input_ids, attention_mask=None, labels=None):
    outputs = self.model(input_ids, attention_mask=attention_mask)
    last_hidden_state = outputs[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
    sum_embeddings = torch.sum(last_hidden_state * input_mask_expanded, dim=1)
    sum_mask = torch.clamp(input_mask_expanded.sum(dim=1), min=1e-9)
    pooled_output = sum_embeddings / sum_mask
    logits = self.classifier(pooled_output)
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
  # _bold_three = '\U0001d7f9'
  # heart_pattern = r'(^|\s)</?\s*[3' + _bold_three + r']\s*(?=\s|$|[.,!?])'
  # text = re.sub(heart_pattern, r'\1', text)

  
  # remove all other emots :3 :) etc
  # emoticon_pattern = r'(?i)(^|\s)(:3|:\)|:\)\)|:\(|:\(\(|:0|:-?[pdxo)(]|x-?d|;-?\))(?=\s|$|[.,!?])'
  # text = re.sub(emoticon_pattern, r'\1', text)

  # remove katakana/special characters used for faces
  text = re.sub(r'[ツᴥꈍᴗꈊ・ω・｀ω´╥﹏╥⋆𝜗𝜚₊✩‧˚౨ৎ𓂃˖˳·ִֶָ𝟑ᐟ]+', '', text)

  # remove all empty brackets
  # text = re.sub(r'\(\s*\)|\[\s*\]|\{\s*\}', '', text)

  # remove _/¯ ¯\_
  # text = re.sub(r'[\\_/<>\-¯]{2,}', '', text)
  # print("text after _/¯ ¯\_ removal: ", text)

  # remove all emojis
  text = emoji_removal(text)

  # remove user handles
  text = re.sub(r'@\w+', '', text)

  # clean up leaftover gaps
  clean_up = re.sub(r'\n+', ' ', text)


  return re.sub(r'\s+', ' ', clean_up).strip()

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
def sample_subset(dataset, n_human=2, n_ai=2, n_mixed=0, seed=None):
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
  def __init__(self):
    self.model_name = "desklib/ai-text-detector-v1.01"
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
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
      self.model.to(self.device)
      self.model.eval()
      print(f"Successfully loaded [{self.model_name}] to [{self.device}]")
    except Exception as e:
      print(f"Error loading model [{self.model_name}]: {e}")
      print("Falling back to [distilbert-base-uncased]")
      self.model_name = "distilbert-base-uncased"
      self.use_binary_logit = False
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
      self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name, num_labels=2)
      self.model.to(self.device)

if __name__ == "__main__":
    detector = TextDetectors()

    # load the best model state from file if it exists
    best_model_gzip_path = os.path.join(os.path.dirname(__file__), "best_text_detector.pt.gz")

    if os.path.exists(best_model_gzip_path):
      with gzip.open(best_model_gzip_path, "rb") as f:
        state = torch.load(f, map_location=detector.device)
        is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
        if detector.use_binary_logit and is_desklib_checkpoint:
          detector.model.load_state_dict(state, strict=True)
          print(f"Loaded best model weights from {best_model_gzip_path}.")
        elif (not detector.use_binary_logit) and (not is_desklib_checkpoint):
          detector.model.load_state_dict(state, strict=True)
          print(f"Loaded best model weights from {best_model_gzip_path}.")
    else:
      print(f"No saved best model found at {best_model_gzip_path}; using freshly loaded weights.")

    print("Detector initialized.\n")

    # load the dataset, clean the data, tokenize the data, and set the format
    raw = load_dataset("gsingh1-py/train")
    dataset = raw["train"] if isinstance(raw, dict) else raw
    # convert to (text, label) if this is gsingh1 format (Human_story + AI columns)
    if "Human_story" in dataset.column_names and "label" not in dataset.column_names:
      dataset = gsingh1_to_text_label(dataset)
    # use a small random subset (50 human + 50 AI + 50 mixed) per run for faster training
    dataset = sample_subset(dataset, n_human=5, n_ai=5, n_mixed=0, seed=None)
    print(f"Using subset of {len(dataset)} examples for training.\n")


    # split for validation
    n = len(dataset)
    indices = np.arange(n)
    # shuffle the indices
    np.random.seed(42)
    np.random.shuffle(indices)
    # get the validation indices
    val_size = int(0.2 * n)
    val_indices = indices[:val_size]
    # get the training indices
    train_indices = indices[val_size:]
    train_dataset = dataset.select(train_indices)
    # get the validation dataset
    val_dataset = dataset.select(val_indices)

    # get the text column from the dataset, clean, tokenize, and set the format for both training and validation
    text_column = get_text_column(train_dataset)

    cleaned_train_dataset = train_dataset.map(lambda ex: clean_example(ex, text_column))
    cleaned_val_dataset = val_dataset.map(lambda ex: clean_example(ex, text_column))

    tokenized_train_dataset = cleaned_train_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer, text_column), batched=True, batch_size=1000)
    tokenized_val_dataset = cleaned_val_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer, text_column), batched=True, batch_size=1000)

    tokenized_train_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])
    tokenized_val_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])

    train_dataloader = DataLoader(tokenized_train_dataset, batch_size=16, shuffle=True)
    val_dataloader = DataLoader(tokenized_val_dataset, batch_size=16, shuffle=False)
    
    # create the optimizer and loss function
    optimizer = AdamW(detector.model.parameters(), lr=5e-5)

    # 10 rounds of training
    epochs = 2

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

    # TensorBoard writer (run: tensorboard --logdir=runs)
    log_dir = os.path.join(os.path.dirname(__file__), "runs")
    writer = SummaryWriter(log_dir=log_dir)

    # train the model
    for epoch in range(epochs):
      total_loss = 0
      detector.model.train()
      # train the model with the training data
      # for batch in train_dataloader:
      for batch in tqdm(train_dataloader, desc=f"Training", unit="batch"):
        batch_counter += 1
        start = time.time()

        # move the batch, attention mask, and labels to the device
        input_ids = batch['input_ids'].to(detector.device)
        attention_mask = batch['attention_mask'].to(detector.device)
        labels = batch['label'].to(detector.device)

        # zero the gradients to avoid accumulation
        optimizer.zero_grad()
        # forward pass to get the outputs
        outputs = detector.model(input_ids, attention_mask=attention_mask)

        # get the logits from the outputs
        logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits
        if detector.use_binary_logit:
          loss = loss_fn(logits.squeeze(-1), labels.float())
        else:
          loss = loss_fn(logits, labels)
        # backward pass to update the weights
        loss.backward()
        # update the weights
        optimizer.step()
        total_loss += loss.item()

        end = time.time()
        time_taken = end - start

        # export batch data to export.txt
        with open(export_file_path, "a") as f:
          f.write(f"Batch {batch_counter}: Loss: {loss.item():.10f}\n")
          f.write(f"s/batch: {time_taken:.10f}\n")

      # calculate the average loss for the epoch
      avg_loss = total_loss / len(train_dataloader)
      writer.add_scalar("Loss/train", avg_loss, epoch)
      print(f"Epoch {epoch+1}/{epochs} : Avg loss: {avg_loss:.10f}")
      # export epoch data to export.txt
      with open(export_file_path, "a") as f:
        f.write(f"Epoch {epoch+1}/{epochs}: Loss: {avg_loss:.10f}\n")
        f.write(f"s/epoch: {time_taken:.10f}\n")
        f.write(f"avr s/batch: {time_taken / len(train_dataloader):.10f}\n")

      # validate the model
      detector.model.eval()
      total_val_loss = 0
      # disable gradient calculation for validation (no need to update the weights)
      with torch.no_grad():
        for batch in val_dataloader:
          input_ids = batch['input_ids'].to(detector.device)
          attention_mask = batch['attention_mask'].to(detector.device)
          labels = batch['label'].to(detector.device)
          outputs = detector.model(input_ids, attention_mask=attention_mask)
          logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits
          # calculate the validation loss
          if detector.use_binary_logit:
            loss = loss_fn(logits.squeeze(-1), labels.float())
          else:
            loss = loss_fn(logits, labels)
          total_val_loss += loss.item()
      # calculate the average validation loss for the epoch
      avg_val_loss = total_val_loss / len(val_dataloader)
      writer.add_scalar("Loss/val", avg_val_loss, epoch)

      print(f"Epoch {epoch+1}/{epochs} : Avg val loss: {avg_val_loss:.10f}")
      # export validation data to export.txt
      with open(export_file_path, "a") as f:
        f.write(f"Epoch {epoch+1}/{epochs}: Avg val loss: {avg_val_loss:.10f}\n")

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

    # load the best model state if it exists
    if best_model_state:
      print(f"Loading best model state from epoch {best_epoch+1}")
      detector.model.load_state_dict(best_model_state)
      # save the best model state to a file
      # torch.save(detector.model.state_dict(), "model_training/text_model/best_text_detector.pt")

      best_model_state_fp = detector.model.state_dict()
      best_model_state_fp16 = {k: v.half() for k, v in best_model_state_fp.items()}
      torch.save(best_model_state_fp16, "model_training/text_model/best_text_detector_fp16.pt")
      with gzip.open(best_model_gzip_path, "wb") as f:
        torch.save(best_model_state, f)
      print(f"Saved best model weights to {best_model_gzip_path} and best_text_detector_fp16.pt")
    writer.close()
    print("Training complete.")