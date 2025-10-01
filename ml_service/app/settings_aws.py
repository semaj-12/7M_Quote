# ml_service/app/settings_aws.py
import os
from dataclasses import dataclass
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

# ---------- Helpers ----------
def _get_ssm_param(name: str, with_decryption: bool = False) -> Optional[str]:
    try:
        ssm = boto3.client("ssm", region_name=os.getenv("AWS_REGION", "us-west-2"))
        resp = ssm.get_parameter(Name=name, WithDecryption=with_decryption)
        return resp["Parameter"]["Value"]
    except (BotoCoreError, ClientError):
        return None

def _get_secret(secret_id: str) -> Optional[str]:
    try:
        sm = boto3.client("secretsmanager", region_name=os.getenv("AWS_REGION", "us-west-2"))
        resp = sm.get_secret_value(SecretId=secret_id)
        # SecretString is typical for API keys
        if "SecretString" in resp:
            return resp["SecretString"]
        # If using binary, decode as needed (not typical for keys)
        return None
    except (BotoCoreError, ClientError):
        return None

def _env_or(default: str, env_key: str, fallback: Optional[str] = None) -> str:
    """Return env var if set, otherwise fallback string, otherwise default."""
    val = os.getenv(env_key)
    if val: return val
    if fallback: return fallback
    return default

# ---------- Data classes ----------
from dataclasses import dataclass

@dataclass
class Thresholds:
    entity_min: float
    page_coverage: float
    textract_word_min: float

@dataclass
class ModelIDs:
    donut_id: str
    layoutlmv3_id: str

@dataclass
class Secrets:
    openai_api_key: str
    hf_token: str

@dataclass
class Settings:
    thresholds: Thresholds
    models: ModelIDs
    secrets: Secrets
    s3_data_bucket: str
    aws_region: str

# ---------- Load from AWS (with env fallbacks) ----------
def load_settings() -> Settings:
    region = os.getenv("AWS_REGION", "us-west-2")

    # SSM parameter names (adjust to your naming)
    p_entity_min       = os.getenv("SSM_THRESH_ENTITY_MIN", "/7mquote/router/entity_min")
    p_page_coverage    = os.getenv("SSM_THRESH_PAGE_COVERAGE", "/7mquote/router/page_coverage")
    p_textract_min     = os.getenv("SSM_THRESH_TEXTRACT_WORD_MIN", "/7mquote/router/textract_word_min")
    p_donut_id         = os.getenv("SSM_DONUT_MODEL_ID", "/7mquote/models/donut_id")
    p_layoutlmv3_id    = os.getenv("SSM_LAYOUTLMV3_MODEL_ID", "/7mquote/models/layoutlmv3_id")
    p_s3_bucket        = os.getenv("SSM_S3_DATA_BUCKET", "/7mquote/s3/data_bucket")

    # Secrets Manager IDs (adjust to your naming)
    s_openai_key_id    = os.getenv("SM_OPENAI_API_KEY", "openai/api_key")
    s_hf_token_id      = os.getenv("SM_HF_TOKEN", "huggingface/token")

    # Pull from SSM (with local env fallbacks)
    entity_min       = float(_get_ssm_param(p_entity_min) or os.getenv("THRESH_ENTITY_MIN", "0.60"))
    page_coverage    = float(_get_ssm_param(p_page_coverage) or os.getenv("THRESH_PAGE_COVERAGE", "0.80"))
    textract_min     = float(_get_ssm_param(p_textract_min) or os.getenv("THRESH_TEXTRACT_WORD_MIN", "0.70"))
    donut_id         = _get_ssm_param(p_donut_id) or os.getenv("DONUT_MODEL_ID", "naver-clova-ix/donut-base")
    layoutlmv3_id    = _get_ssm_param(p_layoutlmv3_id) or os.getenv("LAYOUTLMV3_MODEL_ID", "microsoft/layoutlmv3-base")
    s3_data_bucket   = _get_ssm_param(p_s3_bucket) or os.getenv("S3_DATA_BUCKET", "s3://YOUR-BUCKET")

    # Pull from Secrets Manager (with local env fallbacks)
    openai_api_key   = _get_secret(s_openai_key_id) or os.getenv("OPENAI_API_KEY", "")
    hf_token         = _get_secret(s_hf_token_id) or os.getenv("HUGGING_FACE_HUB_TOKEN", "")

    return Settings(
        thresholds=Thresholds(
            entity_min=entity_min,
            page_coverage=page_coverage,
            textract_word_min=textract_min
        ),
        models=ModelIDs(
            donut_id=donut_id,
            layoutlmv3_id=layoutlmv3_id
        ),
        secrets=Secrets(
            openai_api_key=openai_api_key,
            hf_token=hf_token
        ),
        s3_data_bucket=s3_data_bucket,
        aws_region=region
    )

# Expose as module-level singleton (like the local settings)
settings = load_settings()
