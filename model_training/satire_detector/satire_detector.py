import os
import torch  # type: ignore[import-untyped]
import torch.nn as nn
from transformers import AutoModel, AutoConfig, AutoModelForSequenceClassification, AutoTokenizer  # type: ignore[import-untyped]
from transformers.modeling_utils import PreTrainedModel  # type: ignore[import-untyped]

# for data loading
import random
import datasets  # type: ignore[import-untyped]
from datasets import load_dataset, Dataset  # type: ignore[import-untyped]
from torch.utils.data import DataLoader  # type: ignore[import-untyped]

# for training loop
from torch.optim import AdamW
import copy


# use distilbert-base-uncased for satire detection as well
class SatireDetector:

    def __init__(self):
      self.model_name = "distilbert-base-uncased"
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
      print(f"Loading model [{self.model_name}]...")
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
      self.model = AutoModelForSequenceClassification.from_pretrained(
        self.model_name,
        num_labels=2,  # satire vs non-satire
      )
      self.model.to(self.device)
      self.model.eval()
      print(f"Successfully loaded [{self.model_name}] to [{self.device}]")


if __name__ == "__main__":
  datasets.disable_progress_bars()
  detector = SatireDetector()

  # load the best model state from file if it exists
  best_model_path = os.path.join(os.path.dirname(__file__), "best_satire_detector.pt")
  state = None
  is_desklib_checkpoint = False

  if os.path.exists(best_model_path):
    state = torch.load(best_model_path, map_location=detector.device)
    is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
    if not is_desklib_checkpoint:
      detector.model.load_state_dict(state, strict=True)
      print(f"Loaded best model weights from {best_model_path}.")
  if state is None:
    print(f"No saved best model found; using freshly loaded weights.")

  
  print("Detector initialized.\n")
