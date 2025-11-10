import os
import json
import datetime
import hashlib
from typing import Any, Dict, List, Optional

def _today_dir(base: str) -> str:
    day = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    path = os.path.join(base, day)
    os.makedirs(path, exist_ok=True)
    return path

def _hash_file_name(name: str) -> str:
    h = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12]
    return h

def _append_ndjson(path: str, obj: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

def init_doc_logs(log_base: str, source_name: str) -> Dict[str, str]:
    ddir = _today_dir(log_base)
    doc_id = _hash_file_name(source_name)
    entities_path = os.path.join(ddir, f"{doc_id}.entities.ndjson")
    summary_path  = os.path.join(ddir, f"{doc_id}.summary.ndjson")
    return {"doc_id": doc_id, "entities_path": entities_path, "summary_path": summary_path}

def log_entity(entities_path: str,
               base_fields: Dict[str, Any],
               cand: Dict[str, Any],
               provider_weights: Dict[str, float]) -> None:
    row = {
        "ts": datetime.datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
        **base_fields,
        "entity_type": cand.get("entity_type"),
        "entity_id": cand.get("id"),
        "page": cand.get("page"),
        "bbox": cand.get("bbox"),
        "provider": cand.get("provider"),
        "provider_weights": provider_weights,
        "confidence_raw": cand.get("confidence"),
        "confidence_calibrated": cand.get("confidence_calibrated", cand.get("confidence")),
        "accepted": cand.get("_accepted", False),
        "selection_reason": cand.get("_reason"),
        "disagreement_class": cand.get("_disagreement"),
        "escalated_from_hotspot": cand.get("_escalated", False),
        "fallback_consulted": cand.get("_fallbacks", []),
        "agreement_partners": cand.get("_agreement_partners", []),
        "adjudicator_used": cand.get("_adjudicator_used", False),
        "latency_ms": (cand.get("_provider_meta") or {}).get("latency_ms"),
        "adapter_version": (cand.get("_provider_meta") or {}).get("adapter_version"),
        "schema_version": (cand.get("_provider_meta") or {}).get("schema_version"),
        "prompt_version": (cand.get("_provider_meta") or {}).get("prompt_version"),
        "low_confidence": cand.get("low_confidence", False)
    }
    _append_ndjson(entities_path, row)

def log_summary(summary_path: str,
                base_fields: Dict[str, Any],
                latency_ms: Dict[str, int],
                counts: Dict[str, int],
                accepted_by_provider: Dict[str, int],
                conflicts_detected: int,
                adjudications: int,
                validator_corrections: int,
                schema_version: str,
                config_hash: str,
                adapters: Dict[str, str],
                cost_estimate: Optional[Dict[str, float]] = None) -> None:
    row = {
        "ts": datetime.datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
        **base_fields,
        "cost_estimate": cost_estimate or {},
        "latency_ms": latency_ms,
        "entities": counts,
        "accepted_by_provider": accepted_by_provider,
        "conflicts_detected": conflicts_detected,
        "adjudications": adjudications,
        "validator_corrections": validator_corrections,
        "schema_version": schema_version,
        "ensemble_config_hash": config_hash,
        "adapters": adapters
    }
    _append_ndjson(summary_path, row)
