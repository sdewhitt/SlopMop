import os
import gzip
import torch
from text_detector import TextDetectors

# load the detector 
detector = TextDetectors()
model = detector.model
device = detector.device

# load the best model state from file if it exists
best_model_path = os.path.join(os.path.dirname(__file__), "best_text_detector_smaller.pt")

state = torch.load(best_model_path, map_location=device)
model.load_state_dict(state, strict=True)
print(f"Loaded best model weights from {best_model_path}.")

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
onnx_path = "model_training/text_model/text_detector.onnx"

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