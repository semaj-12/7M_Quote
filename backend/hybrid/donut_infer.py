# /home/sagemaker-user/7m/hybrid/donut_infer.py
import json, re, torch
from PIL import Image
from typing import Optional, Dict, Any
from transformers import DonutProcessor, VisionEncoderDecoderModel

# Point at your best Donut run:
DEFAULT_MODEL_DIR = "/home/sagemaker-user/7m/outputs/donut_from_ls_ft17"

class DonutRunner:
    def __init__(self, model_dir: str = DEFAULT_MODEL_DIR, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = DonutProcessor.from_pretrained(model_dir, use_fast=True)
        self.model = VisionEncoderDecoderModel.from_pretrained(model_dir).to(self.device)
        tok = self.processor.tokenizer
        if "<s_answer>" in tok.get_vocab():
            self.model.config.decoder_start_token_id = tok.convert_tokens_to_ids("<s_answer>")
        if self.model.config.pad_token_id is None and tok.pad_token_id is not None:
            self.model.config.pad_token_id = tok.pad_token_id
        if self.model.config.eos_token_id is None and tok.eos_token_id is not None:
            self.model.config.eos_token_id = tok.eos_token_id
        self.tok = tok

    def _extract_inner(self, s: str) -> str:
        m = re.search(r"<s_answer>(.*)</s>", s, flags=re.DOTALL)
        return m.group(1).strip() if m else s.strip()

    def _aggressive_json_repair(self, s: str) -> Optional[Dict[str, Any]]:
        # minimal repairs
        s = s.strip()
        s = s.replace("’", "'").replace("“", '"').replace("”", '"')
        s = s.replace("'", '"')
        s = re.sub(r",\s*([}\]])", r"\1", s)
        s = re.sub(r'(\w)":', r'"\1":', s)
        # force key casing we expect (optional heuristics)
        try:
            return json.loads(s)
        except Exception:
            return None

    def predict_counts(self, image_path: str, max_new_tokens: int = 160) -> Dict[str, Any]:
        image = Image.open(image_path).convert("RGB")
        pix = self.processor(image, return_tensors="pt").pixel_values.to(self.device)
        # Strongly bias into JSON by seeding with '<s_answer>{'
        seed = self.tok("<s_answer>{", add_special_tokens=False, return_tensors="pt").input_ids.to(self.device)
        out = self.model.generate(
            pixel_values=pix,
            decoder_input_ids=seed,
            max_new_tokens=max_new_tokens,
            num_beams=1,
            do_sample=False,
            use_cache=False,
            pad_token_id=self.tok.pad_token_id or self.tok.eos_token_id,
            eos_token_id=self.tok.eos_token_id,
            length_penalty=0.0,
            early_stopping=True,
        )
        raw = self.tok.batch_decode(out, skip_special_tokens=False)[0]
        inner = self._extract_inner(raw)
        pj = self._aggressive_json_repair(inner)
        return {"raw": raw, "json": pj}
