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
def sample_subset(dataset, n_human=32, n_ai=32, n_mixed=32 , seed=None):
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

# for calculating confidence score 
def calculate_confidence(self, text: str, clean: bool = True):
  # clean the text if needed
  if clean:
    text = preprocess_text(text)

  # tokenize the text
  enc = self.tokenizer(
    text,
    padding="max_length",
    truncation=True,
    max_length=512,
    return_tensors="pt"
  )

  # move the text to the device
  enc = {k: v.to(self.device) for k, v in enc.items()}
  # evaluation mode
  self.model.eval()
  # output, no weights are updated
  with torch.no_grad():
    outputs = self.model(**enc)

  # get the logits from the outputs
  logits = outputs["logits"] if isinstance(outputs, dict) else outputs.logits
  # get the logit from the logits
  logit = logits.squeeze(-1).item() if self.use_binary_logit else logits[0, 1].item()
  # get the probability from the logit
  prob = torch.sigmoid(torch.tensor(logit)).item()
  # return the probability
  return prob

class TextDetectors:
  """
  Implementation of the TextDetector class (design section 3)
  """

  # initialize the model
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
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
      self.model.to(self.device)
      self.model.eval()
      print(f"Successfully loaded [{self.model_name}] to [{self.device}]")
    except Exception as e:
      # if error, fall back to distilbert-base-uncased
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

        # confidence and accuracy (pred = AI if prob >= 0.5)
        if detector.use_binary_logit:
          probs = torch.sigmoid(logits.squeeze(-1))
        else:
          probs = torch.softmax(logits, dim=1)[:, 1]
        preds = (probs >= 0.5).long()
        correct = (preds == labels).sum().item()
        batch_size = labels.size(0)
        batch_accuracy_pct = (correct / batch_size) * 100
        confidence_pct = probs.mean().item() * 100

        print(f"Batch {batch_counter}: Loss: {loss.item():.4f} | Confidence: {confidence_pct:.2f}% | Accuracy: {batch_accuracy_pct:.2f}% | Labels: {labels[0].item()}")

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
          f.write(f"    Batch {batch_counter}: Loss: {loss.item():.10f} | Confidence: {confidence_pct:.2f}% | Accuracy: {batch_accuracy_pct:.2f}% | s/batch: {time_taken:.10f}\n")

      # calculate the average loss for the epoch
      avg_loss = total_loss / len(train_dataloader)
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
        f.write(f"  s/epoch: {time_taken:.4f} | avr s/batch: {time_taken / len(train_dataloader):.4f}\n")

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
      # torch.save(detector.model.state_dict(), "model_training/text_model/best_text_detector.pt")

      best_model_state_fp = detector.model.state_dict()
      best_model_state_fp16 = {k: v.half() for k, v in best_model_state_fp.items()}
      torch.save(best_model_state_fp16, "model_training/text_model/best_text_detector_fp16.pt")
      with gzip.open(best_model_gzip_path, "wb") as f:
        torch.save(best_model_state, f)
      print(f"Saved best model weights to {best_model_gzip_path} and best_text_detector_fp16.pt")
    writer.close()
    print("Training complete.")