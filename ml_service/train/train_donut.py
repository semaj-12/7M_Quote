import json, os
from datasets import load_dataset, DatasetDict
from transformers import DonutProcessor, VisionEncoderDecoderModel, Seq2SeqTrainingArguments, Seq2SeqTrainer
import torch

# Expect a dataset with {"image": <path>, "target_json": <json string>} per sample
DATA_DIR = os.environ.get("DATA_DIR", "./data_donut")
MODEL_ID = os.environ.get("MODEL_ID", "naver-clova-ix/donut-base")
OUT_DIR = os.environ.get("OUT_DIR", "./out/donut")

processor = DonutProcessor.from_pretrained(MODEL_ID)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_ID)

def preprocess(batch):
    images = [processor.image_processor(Image.open(p).convert("RGB"), return_tensors="pt").pixel_values[0] for p in batch["image"]]
    text = [json.dumps(json.loads(t)) for t in batch["target_json"]]
    # Donut uses special prompt <s_docvqa> or custom task tokens; keep simple for now:
    enc = processor.tokenizer(text, padding="max_length", max_length=512, truncation=True, return_tensors="pt")
    return {"pixel_values": torch.stack(images), "labels": enc.input_ids}

from PIL import Image
from glob import glob

def make_dataset(split):
    # expects files: {split}.jsonl with lines: {"image":"path","target_json":"{...}"}
    lines = [json.loads(l) for l in open(os.path.join(DATA_DIR, f"{split}.jsonl")).read().splitlines()]
    return {"image":[l["image"] for l in lines], "target_json":[l["target_json"] for l in lines]}

train = make_dataset("train"); val = make_dataset("val")
ds = DatasetDict({
  "train": load_dataset("json", data_files={"train": os.path.join(DATA_DIR, "train.jsonl")})["train"],
  "validation": load_dataset("json", data_files={"validation": os.path.join(DATA_DIR, "val.jsonl")})["validation"],
}).map(preprocess, batched=True, remove_columns=["image","target_json"])

args = Seq2SeqTrainingArguments(
    output_dir=OUT_DIR, per_device_train_batch_size=2, per_device_eval_batch_size=2,
    num_train_epochs=5, learning_rate=5e-5, predict_with_generate=True, fp16=True, save_total_limit=2,
    evaluation_strategy="epoch", logging_steps=50
)
trainer = Seq2SeqTrainer(model=model, args=args, train_dataset=ds["train"], eval_dataset=ds["validation"])
trainer.train()
trainer.save_model(OUT_DIR)
processor.save_pretrained(OUT_DIR)
