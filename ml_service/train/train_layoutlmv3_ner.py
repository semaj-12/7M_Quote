import os, json
from datasets import load_dataset, DatasetDict
from transformers import AutoProcessor, LayoutLMv3ForTokenClassification, TrainingArguments, Trainer
import torch

MODEL_ID = os.environ.get("LAYOUTLMV3_ID", "microsoft/layoutlmv3-base")
OUT_DIR = os.environ.get("OUT_DIR", "./out/layoutlmv3")
LABELS = ["O","B-PROJECT_NAME","I-PROJECT_NAME","B-SHEET_NO","I-SHEET_NO","B-REVISION","I-REVISION","B-DATE","I-DATE"]

processor = AutoProcessor.from_pretrained(MODEL_ID, apply_ocr=False)
id2label = {i:l for i,l in enumerate(LABELS)}
label2id = {l:i for i,l in enumerate(LABELS)}
model = LayoutLMv3ForTokenClassification.from_pretrained(MODEL_ID, num_labels=len(LABELS), id2label=id2label, label2id=label2id)

# Expect dataset fields: {"image": path, "words": [..], "boxes": [[x0,y0,x1,y1]..], "labels":[..]} per sample
def encode(batch):
    enc = processor(images=[Image.open(p).convert("RGB") for p in batch["image"]],
                    words=batch["words"], boxes=batch["boxes"], truncation=True, padding="max_length", return_tensors="pt")
    enc["labels"] = torch.tensor([[label2id.get(l,"O" ) for l in labels] + [label2id["O"]] * (enc["input_ids"].shape[1]-len(labels))
                                  for labels in batch["labels"]])
    return enc

from PIL import Image
ds = DatasetDict({
  "train": load_dataset("json", data_files={"train":"./data_layoutlmv3/train.json"})["train"],
  "validation": load_dataset("json", data_files={"validation":"./data_layoutlmv3/val.json"})["validation"],
}).map(encode, batched=True, remove_columns=ds["train"].column_names)

args = TrainingArguments(
  output_dir=OUT_DIR, per_device_train_batch_size=2, per_device_eval_batch_size=2,
  num_train_epochs=5, learning_rate=5e-5, evaluation_strategy="epoch", save_total_limit=2, fp16=True
)
trainer = Trainer(model=model, args=args, train_dataset=ds["train"], eval_dataset=ds["validation"])
trainer.train()
trainer.save_model(OUT_DIR)
processor.save_pretrained(OUT_DIR)
