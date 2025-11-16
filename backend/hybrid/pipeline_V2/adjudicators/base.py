from __future__ import annotations
from typing import List, Any, Dict, Sequence
import json

from openai import OpenAI

from ..config import settings
from ..types import BomRow, WeldSymbol, DimensionEntity, SheetMetadata, ProviderResult

client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL or None,
)


def _call_adj_model(prompt: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generic helper to call gpt-4.1-mini with JSON output.
    """
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set; required for adjudicator")

    response = client.responses.create(
        model=settings.ADJ_MODEL_NAME,
        instructions=prompt,
        input=json.dumps(data),
        response_format={"type": "json_object"},
    )
    json_text = response.output[0].content[0].text  # type: ignore[attr-defined]
    return json.loads(json_text)
