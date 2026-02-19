import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# for regex (url, emoji) removal
import re
import pyshorteners
import regex

def emoji_removal(text):
    emoji_pattern = regex.compile(r'\p{Emoji}', flags=regex.UNICODE)
    return emoji_pattern.sub(r'', text)

def url_removal(text) :
    url_pattern = re.compile(r'https?://\S+|www\.\S+(?<![).,;?!])')
    return url_pattern.sub(r'', text)

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

    # test cases made by gemini
    if __name__ == "__main__":
        emoji_test_cases = [
          # 1. The "Easy" Cases (Standard single or grouped emojis)
          "Hello world! 😀",
          "This is fire 🔥🚀💯",
          
          # 2. Zero-Width Joiners (ZWJ) - The hardest test!
          # These are actually multiple emojis glued together. Weak regex breaks here.
          "Coding all night 👩‍💻 fixing bugs...",
          "Family trip 👨‍👩‍👧‍👦 was so fun!",
          
          # 3. Skin Tone Modifiers
          # Weak regex will delete the hand but leave a weird colored box behind.
          "High five 🙏🏽 and thumbs up 👍🏿",
          
          # 4. Flags (Regional Indicators)
          # Flags are made of two invisible country code letters.
          "I love the 🇺🇸 and 🇰🇷 flags!",
          
          # 5. Keycap / Number Emojis
          # Should delete the emoji numbers but leave standard text numbers alone.
          "Top 3️⃣ reasons to learn Python. Regular numbers: 1 2 3.",
          
          # 6. Embedded Emojis (No spaces)
          # Ensures your function doesn't accidentally delete the attached English letters.
          "Wait,what?😱I didn't know that!",
          
          # 7. Weird Symbols & Pictographs
          "Call me ☎️ or send mail ✉️. Danger ⚠️",
          
          # 8. The Control Case (Should NOT be deleted)
          # Standard text emoticons and punctuation must survive.
          "I am so happy :) This is great! ¯\\_(ツ)_/¯"
        ]

        print("Emoji Removal Tests\n")
        

        
        for i, test_string in enumerate(emoji_test_cases):
            # Run your function
            cleaned_string = emoji_removal(test_string)
            
            # Print the results side-by-side
            print(f"Test {i+1}:")
            print(f"  Original: '{test_string}'")
            print(f"  Cleaned:  '{cleaned_string}'")
            print("-" * 40)

        print("--- Running URL Removal Tests ---\n")
        
        url_test_cases = [
            # 1. The "Easy" Cases (Standard HTTP/HTTPS)
            # "Check out my website at https://www.example.com it is cool.",
            # "Here is an unsecure link http://badsite.com/virus",
            
            # 2. The "Messy Punctuation" Cases
            # "Is this the right link? https://reddit.com/r/learnpython?",  # Question mark attached
            # "Go here: https://github.com/sdewhitt/SlopMop.",             # Period attached
            "(Source: https://wikipedia.org/wiki/AI)" ,                  # Inside parentheses
            
            # 3. The "Query String" Cases (Very common on Twitter/YouTube)
            # "Watch this https://youtube.com/watch?v=dQw4w9WgXcQ&t=43s",
            # "Buy now https://amazon.com/item?ref=twitter_ad&campaign=1",
            
            # 4. Multiple URLs in one post
            # "Link 1: https://site.com and Link 2: http://other.com/page",
            
            # 5. The "No HTTP" Cases (The hardest ones to catch)
            # "You don't need http, just go to www.google.com",
            "Check my soundcloud soundcloud.com/mixtape",
            "Short link here bit.ly/3xyz789",
            
            # 6. The Control Case (Should not be altered)
            "There are no links in this post, just some text and a 100% human."
        ]
        
        for i, test_string in enumerate(url_test_cases):
            # Run your function
            cleaned_string = url_removal(test_string)
            
            # Print the results side-by-side
            print(f"Test {i+1}:")
            print(f"  Original: '{test_string}'")
            print(f"  Cleaned:  '{cleaned_string}'")
            print("-" * 40)

