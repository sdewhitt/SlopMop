"""One-off accuracy test using test_dataset.csv. Run with: python accuracy_test.py"""
import csv
import httpx

CSV_PATH = "../model_training/text_model/test_dataset.csv"
API_URL = "http://127.0.0.1:8000/detect"

def main():
    correct = 0
    total = 0
    results = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row["text"].strip().strip('"')
            true_label = int(row["label"])  # 0=human, 1=AI
            try:
                r = httpx.post(API_URL, json={"text": text}, timeout=30)
                r.raise_for_status()
                data = r.json()
                pred_label = 1 if data["label"] == "ai" else 0
                confidence = data["confidence"]
                ok = pred_label == true_label
                correct += int(ok)
                total += 1
                preview = (text[:50] + "...").encode("ascii", errors="replace").decode()
                results.append((preview, true_label, pred_label, confidence, ok))
            except Exception as e:
                print(f"Error: {e}")
                preview = (text[:50] + "...").encode("ascii", errors="replace").decode()
                results.append((preview, true_label, "ERR", 0, False))
                total += 1
    print("\n=== Model Accuracy Test ===\n")
    for text_preview, true_l, pred_l, conf, ok in results:
        true_s = "AI" if true_l == 1 else "human"
        pred_s = "AI" if pred_l == 1 else "human" if pred_l == 0 else "ERR"
        status = "OK" if ok else "X"
        print(f"{status} True: {true_s:5} | Pred: {pred_s:5} | conf: {conf:.4f} | {text_preview}")
    print(f"\nAccuracy: {correct}/{total} = {100*correct/total:.1f}%")

if __name__ == "__main__":
    main()
