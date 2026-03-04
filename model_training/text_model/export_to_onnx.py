import os
import torch
from text_detector import TextDetectors

# load the detector
detector = TextDetectors()
model = detector.model
device = detector.device

# load the best model state from file if it exists
best_model_path = os.path.join(os.path.dirname(__file__), "best_text_detector_fp16.pt")
if os.path.exists(best_model_path):
    state = torch.load(best_model_path, map_location=device)
    is_desklib_checkpoint = any(k.startswith("model.") for k in state.keys())
    if detector.use_binary_logit and is_desklib_checkpoint:
        model.load_state_dict(state, strict=True)
    elif (not detector.use_binary_logit) and (not is_desklib_checkpoint):
        model.load_state_dict(state, strict=True)
    print(f"Loaded best model weights from {best_model_path}.")
else:
    print("No best model checkpoint found; exporting base model weights.")

model.eval()
model.to(device)

# Verify fine-tuned weights are loaded (run one inference before export, while still FP32)
from text_detector import calculate_confidence
test_conf = calculate_confidence(detector, "The quick brown fox jumps over the lazy dog.")
print(f"Pre-export sanity check: confidence = {test_conf:.4f}")
if 0.4 < test_conf < 0.6:
    print("WARNING: Output ~0.5 suggests base weights, not fine-tuned. Check best_text_detector.pt.gz loaded.")
else:
    print("OK: Extreme confidence indicates fine-tuned weights are loaded.")

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

# Export to ONNX in FP32 first (FP16 export has dtype issues during tracing)
onnx_path_fp32 = "text_detector_fp32.onnx"
onnx_path = "text_detector.onnx"

torch.onnx.export(
    model,
    (input_ids, attention_mask),
    onnx_path_fp32,
    input_names=["input_ids", "attention_mask"],
    output_names=["logits"],
    dynamic_axes={
        "input_ids": {0: "batch_size", 1: "seq_len"},
        "attention_mask": {0: "batch_size", 1: "seq_len"},
        "logits": {0: "batch_size"},
    },
    opset_version=18,
    do_constant_folding=True,
    dynamo=False,  # Legacy exporter; avoids UnicodeEncodeError on Windows
)
print(f"Exported FP32 ONNX to {onnx_path_fp32}")

# Convert to FP16 for smaller model (~800MB vs ~1.6GB)
import onnx
from onnxconverter_common import float16

model_onnx = onnx.load(onnx_path_fp32)
model_onnx_fp16 = float16.convert_float_to_float16(model_onnx)
onnx.save(model_onnx_fp16, onnx_path)
print(f"Converted to FP16 and saved to {onnx_path}")

# Remove temp FP32 file
os.remove(onnx_path_fp32)
if os.path.exists(onnx_path_fp32 + ".data"):
    os.remove(onnx_path_fp32 + ".data")