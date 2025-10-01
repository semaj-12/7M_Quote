# ml_service/app/settings.py
import os
from dataclasses import dataclass

@dataclass
class Thresholds:
    entity_min: float = float(os.getenv("THRESH_ENTITY_MIN", "0.60"))
    page_coverage: float = float(os.getenv("THRESH_PAGE_COVERAGE", "0.80"))
    textract_word_min: float = float(os.getenv("THRESH_TEXTRACT_WORD_MIN", "0.70"))

@dataclass
class ModelIDs:
    donut_id: str = os.getenv("DONUT_MODEL_ID", "naver-clova-ix/donut-base")
    layoutlmv3_id: str = os.getenv("LAYOUTLMV3_MODEL_ID", "microsoft/layoutlmv3-base")

@dataclass
class Secrets:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    hf_token: str = os.getenv("HUGGING_FACE_HUB_TOKEN", "")

@dataclass
class Settings:
    thresholds: Thresholds = Thresholds()
    models: ModelIDs = ModelIDs()
    secrets: Secrets = Secrets()

settings = Settings()
