import os
import gzip
import torch
from text_detector import TextDetectors

# load the detector 
detector = TextDetectors()
model = detector.model
device = detector.device

# load the best model state from file if it exists
script_dir = os.path.dirname(__file__)
best_gz = os.path.join(script_dir, "best_text_detector_smaller.pt.gz")
best_pt = os.path.join(script_dir, "best_text_detector_smaller.pt")
best_model_path = best_gz if os.path.exists(best_gz) else best_pt
if os.path.exists(best_model_path):
  if best_model_path.endswith(".gz"):
    try:
      with gzip.open(best_model_path, "rb") as f:
        state = torch.load(f, map_location=device)
    except gzip.BadGzipFile:
      with open(best_model_path, "rb") as f:
        state = torch.load(f, map_location=device)
  else:
    with open(best_model_path, "rb") as f:
      state = torch.load(f, map_location=device)
  is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
  if (detector.use_binary_logit and is_desklib_checkpoint) or (not detector.use_binary_logit and not is_desklib_checkpoint):
    model.load_state_dict(state, strict=True)
  print(f"Loaded best model weights from {best_model_path}.")
else:
  print("No best model checkpoint found; exporting base model weights.")

model.eval()
model.to(device)

# dummy input
dummy = detector.tokenizer(
  "Dummy text for ONNX export.",
  padding="max_length",
  truncation=True,
  max_length=512,
  return_tensors="pt",
)

input_ids = dummy["input_ids"].to(detector.device)
attention_mask = dummy["attention_mask"].to(detector.device)

# finally export the model to onnx
onnx_path = "text_detector.onnx"

torch.onnx.export(
  model,
  (input_ids, attention_mask),
  onnx_path,
  input_names=["input_ids", "attention_mask"],
  output_names=["logits"],
  dynamic_axes={
      "input_ids": {0: "batch_size", 1: "seq_len"},
      "attention_mask": {0: "batch_size", 1: "seq_len"},
      "logits": {0: "batch_size"},
  },
  opset_version=14,
  do_constant_folding=True,
)
print(f"Exported ONNX model to {onnx_path}")