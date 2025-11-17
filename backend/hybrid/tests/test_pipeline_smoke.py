from pathlib import Path

from PIL import Image

import sys

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"
for candidate in (ROOT, BACKEND):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from hybrid import pipeline


class _DummyDonut:
    def __init__(self, *args, **kwargs):
        pass

    def predict_counts(self, image_path: str):
        return {
            "raw": "<s_answer>{\"weld_symbols_present\": true, \"weld_symbols_count\": 2, \"dim_values_count\": 1, \"bom_tag_count\": 0, \"bom_material_count\": 0, \"bom_qty_count\": 0}</s>",
            "json": {
                "weld_symbols_present": True,
                "weld_symbols_count": 2,
                "dim_values_count": 1,
            },
        }


def _dummy_counts(**overrides):
    base = {
        "weld_symbols_present": False,
        "weld_symbols_count": 0,
        "dim_values_count": 0,
        "bom_tag_count": 0,
        "bom_material_count": 0,
        "bom_qty_count": 0,
    }
    base.update(overrides)
    return base


def test_run_hybrid_on_image_smoke(monkeypatch, tmp_path):
    img_path = Path(tmp_path) / "sample.png"
    Image.new("RGB", (32, 32), color="white").save(img_path)

    monkeypatch.setattr(pipeline, "DonutRunner", _DummyDonut)
    monkeypatch.setattr(pipeline, "predict_counts_with_layoutlm", lambda path: _dummy_counts(weld_symbols_count=1, bom_tag_count=3))
    monkeypatch.setattr(pipeline, "predict_counts_with_textract", lambda path: _dummy_counts(dim_values_count=5, bom_qty_count=4))
    monkeypatch.setattr(pipeline.reducto_adapter, "predict", lambda image_path, cfg: [
        {"entity_type": "WELD"},
        {"entity_type": "DIMENSION"},
    ])
    monkeypatch.setattr(pipeline, "init_doc_logs", lambda log_path, basename: {
        "doc_id": "doc-1",
        "entities_path": tmp_path / "entities.ndjson",
        "summary_path": tmp_path / "summary.ndjson",
    })
    monkeypatch.setattr(pipeline, "log_entity", lambda *args, **kwargs: None)
    monkeypatch.setattr(pipeline, "log_summary", lambda *args, **kwargs: None)
    monkeypatch.setattr(pipeline, "_load_cfg", lambda path: {"telemetry": {"enabled": False}, "fusion_rules": {"provider_weights": {}}, "primary": "reducto"})

    result = pipeline.run_hybrid_on_image(str(img_path))

    assert result["weld_symbols_present"] is True
    assert result["weld_symbols_count"] >= 2
    assert result["dim_values_count"] >= 5
    assert result["bom_qty_count"] >= 4
