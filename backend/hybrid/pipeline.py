# /home/sagemaker-user/7m/hybrid/pipeline.py
import os
from typing import Dict, Any
from .donut_infer import DonutRunner
from .layoutlm_infer import predict_counts_with_layoutlm
from .textract_infer import predict_counts_with_textract
from .reconcile import reconcile_counts
from .schemas import Counts

USE_OPENAI = bool(int(os.environ.get("USE_OPENAI_VALIDATOR", "0")))

def run_hybrid_on_image(
    image_path: str,
    donut_model_dir: str = None,
    page_context: str = ""
) -> Dict[str, Any]:

    donut = DonutRunner(model_dir=donut_model_dir) if donut_model_dir else DonutRunner()
    d_out = donut.predict_counts(image_path)             # {"raw": str, "json": dict|None}

    l_out = predict_counts_with_layoutlm(image_path)     # {} for now (optional)
    t_out = predict_counts_with_textract(image_path)     # {} for now (optional)

    reconciled = reconcile_counts(d_out, l_out, t_out)
    if USE_OPENAI:
        from .openai_validator import validate_with_openai
        try:
            return validate_with_openai(page_context or os.path.basename(image_path), reconciled)
        except Exception:
            # fall back safely if OpenAI is unavailable
            return Counts(**reconciled).model_dump()
    else:
        return Counts(**reconciled).model_dump()
