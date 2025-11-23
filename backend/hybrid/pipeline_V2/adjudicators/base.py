# backend/hybrid/pipeline_V2/adjudicators/base.py
from __future__ import annotations

import json
from typing import Dict, Any

from openai import OpenAI

from ..config import settings

client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL or None,
)


def _call_adj_model(prompt: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Call the adjudication model (e.g. gpt-4.1-mini) with a structured prompt + data
    and return a parsed JSON object.

    NOTE:
    - We do NOT use `response_format` because the OpenAI SDK version in this
      environment does not support that argument on Responses.create().
    - We prefer `response.output_text` when available, and fall back
      to indexing into `response.output[0].content[0].text`.
    """
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set; required for adjudicator")

    # We'll send a single "message" with both the instructions and the JSON payload as text.
    # The model is instructed to return strict JSON.
    full_input = {
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": (
                    prompt.strip()
                    + "\n\nHere is the input JSON you must adjudicate:\n"
                    + json.dumps(data)
                ),
            }
        ],
    }

    response = client.responses.create(
        model=settings.ADJ_MODEL_NAME,
        input=[full_input],
    )

    # 1) Prefer the convenience property if present
    json_text = getattr(response, "output_text", None)

    # 2) Fallback to older-style indexing if needed
    if not json_text:
        output = getattr(response, "output", None)
        if output is None or len(output) == 0:
            raise RuntimeError(f"adjudicator response had no output: {response!r}")

        first_item = output[0]
        content_list = getattr(first_item, "content", None)
        if not content_list:
            raise RuntimeError(f"adjudicator response.output[0] had no content: {response!r}")

        out0 = content_list[0]
        if hasattr(out0, "text"):
            json_text = out0.text
        else:
            json_text = str(out0)

    return json.loads(json_text)
