import importlib.util
import os

import torch

# Load SatireDetector from satire_detector.py (same directory; not a package)
_dir = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("satire_detector_mod", os.path.join(_dir, "satire_detector.py"))
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)
SatireDetector = _mod.SatireDetector

# load the detector
detector = SatireDetector()
model = detector.model
device = detector.device

# load the best model state from file if it exists
best_model_path = os.path.join(_dir, "best_satire_detector.pt")
if os.path.exists(best_model_path):
  state = torch.load(best_model_path, map_location=device)
  is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
  if not is_desklib_checkpoint:
    model.load_state_dict(state, strict=True)
    print(f"Loaded best model weights from {best_model_path}.")
else:
  print("No best_satire_detector.pt found; exporting base DistilBERT classification head.")

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

onnx_path = os.path.join(_dir, "satire_detector.onnx")

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
