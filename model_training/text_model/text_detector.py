import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

class TextDetectors:
  """
  Implementation of the TextDetector class (design section 3)
  """
  def __init__(self):
    self.model_name = "desklib/ai-text-detector-v1.01"
    # empty container for tokenizor (translator) and model
    self.tokenizer = None
    self.model = None
    # cuda = NVDIA GPU
    self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    self._initialize_model()

  def _initialize_model(self):
    """
    Load the pre-trained transformer
    """
    print(f"Loading model [{self.model_name}]...")

    try:
      # Load in the actual tokenizer
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)

      # Load the model
      self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
      self.model.to(self.device)
      self.model.eval()
      print(f"Successfully loaded [{self.model_name}] to [{self.device}]")
    except Exception as e:
      print(f"Error loading model [{self.model_name}]")

      print(f"Falling back to [distilbert-base-uncased]")
      self.model_name = "distilbert-base-uncased"
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
      self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name, num_labels=2)
      self.model.to(self.device)


if __name__ == "__main__":
    detector = TextDetectors()
    print("Test passed : Detector has been initialized")