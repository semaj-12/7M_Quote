#!/usr/bin/env python3
"""
Reads a JSONL of pipeline outputs and a ground-truth CSV, reports per-field accuracy.
CSV columns: image,weld_symbols_present,weld_symbols_count,dim_values_count,bom_tag_count,bom_material_count,bom_qty_count
"""

import csv, json, sys, os
from collections import defaultdict

FIELDS = [
    "weld_symbols_present",
    "weld_symbols_count",
    "dim_values_count",
    "bom_tag_count",
    "bom_material_count",
    "bom_qty_count",
]

def load_gt(csv_path):
    gt = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            img = r["image"]
            row = {}
            for k in FIELDS:
                v = r[k].strip()
                if k == "weld_symbols_present":
                    row[k] = v.lower() in ("1","true","yes","y","t")
                else:
                    row[k] = int(v)
            gt[img] = row
    return gt

def load_preds(jsonl_path):
    preds = {}
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            o = json.loads(line)
            img = o["image"]
            final = o.get("final") or o.get("layout_pred") or {}
            preds[img] = final
    return preds

def main():
    if len(sys.argv) < 3:
        print("Usage: python -m hybrid.tools.eval_against_groundtruth <hybrid_batch.jsonl> <groundtruth.csv>")
        sys.exit(2)
    jpath, cpath = sys.argv[1], sys.argv[2]
    gt = load_gt(cpath)
    pr = load_preds(jpath)

    totals = defaultdict(int)
    correct = defaultdict(int)
    missing = 0
    tested = 0

    for img, g in gt.items():
        if img not in pr:
            missing += 1
            continue
        p = pr[img]
        tested += 1
        for k in FIELDS:
            if k not in p:
                continue
            pv = p[k]
            gv = g[k]
            totals[k] += 1
            if pv == gv:
                correct[k] += 1

    print(f"Images in GT: {len(gt)} | evaluated: {tested} | missing preds: {missing}")
    for k in FIELDS:
        t = totals[k]
        c = correct[k]
        acc = (c / t) if t else 0.0
        print(f"{k:22s}  {c:4d}/{t:4d}  acc={acc:.3f}")

if __name__ == "__main__":
    main()
