import torch # type: ignore[import-untyped]
from transformers import AutoModelForSequenceClassification, AutoTokenizer # type: ignore[import-untyped]

# for regex (url, emoji) removal
import re
import regex  # type: ignore[import-untyped]

# for data loading
from datasets import load_dataset # type: ignore[import-untyped]
from torch.utils.data import DataLoader # type: ignore[import-untyped]
def emoji_removal(text):
  emoji_pattern = regex.compile(r'\p{Emoji}', flags=regex.UNICODE)
  return emoji_pattern.sub(r'', text)


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

def clean_batch(batch):
  return {"text": [preprocess_text(t) for t in batch["text"]]}

def tokenize_batch(batch, tokenizer):
  return tokenizer(
  batch["text"],
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
    print("Detector initialized.\n")

    dataset = load_dataset('csv', data_files='model_training/text_model/test_dataset.csv', split='train')
    cleaned_dataset = dataset.map(clean_batch, batched=True, batch_size=1000)
    tokenized_dataset = cleaned_dataset.map(lambda x: tokenize_batch(x, detector.tokenizer), batched=True, batch_size=1000)
    tokenized_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])
    train_dataloader = DataLoader(tokenized_dataset, batch_size=16, shuffle=True)

    for batch in train_dataloader:
        print(batch)
        break
    print("Training data loaded.")