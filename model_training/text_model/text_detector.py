import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# for regex (url, emoji) removal
import re
import pyshorteners
import regex

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

  def classify(self, text, return_probs=False):
    """
    preprocess text, tokenize (model's tokenizer) and run classification.
    if return_probs=True, returns softmax probabilities.
    """

    # preprocess text
    cleaned = preprocess_text(text)

    # tokenize (model's tokenizer)
    inputs = self.tokenizer(
      cleaned,
      # return tensors as pytorch tensors
      return_tensors="pt",
      # pad the input to the same length
      padding=True,
      # truncate the input to the same length
      truncation=True,
      # max length of the input (for now)
      max_length=512,
    )

    # move the input to the device
    inputs = {k: v.to(self.device) for k, v in inputs.items()}

    # run the model
    with torch.no_grad():
      outputs = self.model(**inputs)

    # get the logits
    logits = outputs.logits

    # return the probabilities
    if return_probs:
      return torch.softmax(logits, dim=-1).cpu() # softmax probabilities
    return logits.cpu() # logits


def _ai_result_tier(ai_prob):
    pct = ai_prob * 100
    if pct < 60:
        return "Human"
    if pct < 80:
        return "Mixed"
    return "AI"


if __name__ == "__main__":
    detector = TextDetectors()
    print("Detector initialized.\n")
    if hasattr(detector.model.config, "id2label"):
        print("Class meaning (id -> label):", detector.model.config.id2label)
    # Which class index is "AI" (for Human/Mixed/AI tiers)
    id2label = getattr(detector.model.config, "id2label", None) or {}
    ai_class_idx = 1
    for idx, label in id2label.items():
        s = str(label).lower() if label else ""
        if "ai" in s or "generated" in s:
            ai_class_idx = int(idx)
            break
    print(f"Using class {ai_class_idx} as AI probability for Human/Mixed/AI tiers.\n")

    test_cases = [
        "<shreddit-title> <title>=\"Doctors and nurses of Reddit, what is something patients do that they think is helpful but actually makes your job harder? : <r/AskReddit\"></shreddit-title> ",
        "The quick brown fox jumps over the lazy dog. Natural language is often repetitive.",
        "@sfsa11 @fddd OMG 😂 look at this: https://bit.ly/xyz ¯\_(ツ)_/¯ It's crazy 🚀",
        "In conclusion, the aforementioned considerations suggest a multifaceted approach.",
        "Is this a scam? www.fake-login.com/auth 🇺🇸 Please help <3 <br>",
    ]


    for i, raw_text in enumerate(test_cases):
        print(f"\n--- Test {i + 1} ---")

        # input
        print("Input:")
        print(f"  {repr(raw_text)}")

        # preprocess
        cleaned = preprocess_text(raw_text)
        print("After preprocess :")
        print(f"  {repr(cleaned)}")

        # tokenize
        tok = detector.tokenizer(
            cleaned,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        )

        # classify (returns 2-class probabilities)
        probs = detector.classify(raw_text, return_probs=True)
        p = probs.numpy()[0]
        ai_prob = float(p[ai_class_idx])
        tier = _ai_result_tier(ai_prob)
        ai_pct = ai_prob * 100
        print("Output (class probabilities):")
        print(f"  probs = {p}")
        print(f"  -> class 0: {p[0]:.4f}  |  class 1: {p[1]:.4f}")
        print(f"  -> predicted class: {p.argmax()} (index with highest prob)")
        print(f"  -> Result: {tier} ({ai_pct:.1f}% AI)  [0–60% Human, 60–80% Mixed, 80%+ AI]")

        print("-" * 60)