# backend/hybrid/adapters/donut_adapter.py
import os
import io
import logging
from typing import Optional

from PIL import Image
import torch
from transformers import DonutProcessor, VisionEncoderDecoderModel

logger = logging.getLogger("hybrid.donut_adapter")
logger.setLevel(logging.INFO)

DONUT_ENV = "HYBRID_DONUT_DIR"

_PROCESSOR = None
_MODEL = None


def _shrink_to_rgb(path: str, max_side: int = 2300) -> Image.Image:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((int(w * scale), int(h * scale)))
    return im


def _load_donut_if_available() -> bool:
    global _PROCESSOR, _MODEL
    if _PROCESSOR is not None and _MODEL is not None:
        return True

    ckpt = os.environ.get(DONUT_ENV, "").strip()
    if not ckpt or not os.path.isdir(ckpt):
        logger.info("[Donut] No checkpoint directory set; returning placeholder output.")
        return False

    needed = ["config.json", "model.safetensors", "processor_config.json"]
    # some Donut exports have "preprocessor_config.json" instead of "processor_config.json"
    if not os.path.isfile(os.path.join(ckpt, "processor_config.json")) and not os.path.isfile(os.path.join(ckpt, "preprocessor_config.json")):
        needed.append("preprocessor_config.json")

    missing = [f for f in needed if not os.path.isfile(os.path.join(ckpt, f))]
    if missing:
        logger.info("[Donut] Checkpoint missing %s; returning placeholder output.", missing)
        return False

    try:
        # trust_remote_code=True avoids the constrained-beam warning migration
        _PROCESSOR = DonutProcessor.from_pretrained(ckpt, trust_remote_code=True)
        _MODEL = VisionEncoderDecoderModel.from_pretrained(ckpt, trust_remote_code=True)
        _MODEL.eval()
        if torch.cuda.is_available():
            _MODEL.to("cuda")
        logger.info("[OK] Donut loaded from: %s", ckpt)
        return True
    except Exception:
        logger.exception("[Donut] Failed to load; returning placeholder output.")
        return False


def predict_page(image_path: str, max_new_tokens: int = 200) -> str:
    """
    Returns the raw Donut string (e.g., "<s_answer>{...}</s>").
    If the checkpoint isn't available, returns a short placeholder string so the pipeline won't break.
    """
    loaded = _load_donut_if_available()
    if not loaded:
        return "<s_answer> extra </s>"

    im = _shrink_to_rgb(image_path, max_side=2300)
    pixel_values = _PROCESSOR(images=im, return_tensors="pt").pixel_values
    if torch.cuda.is_available():
        pixel_values = pixel_values.to("cuda")

    # Seed with "<s_answer>{" which helps JSON-like starts
    input_ids = _PROCESSOR.tokenizer("<s_answer>{", add_special_tokens=False, return_tensors="pt").input_ids
    if torch.cuda.is_available():
        input_ids = input_ids.to("cuda")

    with torch.no_grad():
        out = _MODEL.generate(
            pixel_values=pixel_values,
            decoder_input_ids=input_ids,
            max_new_tokens=max_new_tokens,
            num_beams=1,
            do_sample=False,
            use_cache=False,  # avoid gradient checkpoint cache conflict warnings
            pad_token_id=_PROCESSOR.tokenizer.pad_token_id or _PROCESSOR.tokenizer.eos_token_id,
            eos_token_id=_PROCESSOR.tokenizer.eos_token_id,
        )

    text = _PROCESSOR.tokenizer.batch_decode(out, skip_special_tokens=False)[0]
    # Keep the head only (the batch—when streamed—can be very long/noisy)
    return text[:2000]
