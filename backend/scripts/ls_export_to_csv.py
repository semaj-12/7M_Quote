#!/usr/bin/env python3
import json
import csv
import argparse
from collections import defaultdict, deque

def parse_args():
    ap = argparse.ArgumentParser(description="Convert Label Studio export (with SAME_RECORD + UNIT_OF) to CSV rows.")
    ap.add_argument("--input", "-i", required=True, help="Path to Label Studio export JSON (Tasks + Annotations).")
    ap.add_argument("--out", "-o", required=True, help="Output CSV path.")
    return ap.parse_args()

# ---- Helpers ----

def region_label(region):
    # Only rectanglelabels used in your config; be defensive anyway
    try:
        return region["value"]["rectanglelabels"][0]
    except Exception:
        return None

def region_text(region):
    # If you typed per-region text in the TextArea, LS stores it here
    # Otherwise, we leave it None (you can OCR later if you want)
    try:
        if "text" in region["value"] and region["value"]["text"]:
            return region["value"]["text"][0]
    except Exception:
        pass
    return None

def is_relation(entry):
    return entry.get("type") == "relation"

def build_region_map(results):
    # Map region id -> region entry
    reg = {}
    for r in results:
        if r.get("id") and r.get("type", "").endswith("labels"):
            reg[r["id"]] = r
    return reg

def build_graph_and_unit_map(results, region_map):
    """
    Returns:
      graph: undirected adjacency dict using ONLY SAME_RECORD edges
      unit_of: dict mapping VALUE_REGION_ID -> UNIT_TEXT
    """
    graph = defaultdict(list)
    unit_of = {}

    for rel in filter(is_relation, results):
        from_id = rel.get("from_id")
        to_id   = rel.get("to_id")
        labels  = rel.get("labels") or []
        if not from_id or not to_id or not labels:
            continue
        rel_type = labels[0]

        if rel_type == "SAME_RECORD":
            # undirected edges for grouping
            graph[from_id].append((to_id, rel_type))
            graph[to_id].append((from_id, rel_type))

        elif rel_type == "UNIT_OF":
            # Determine which side is the UNIT and which is the numeric value
            fr = region_map.get(from_id)
            to = region_map.get(to_id)
            if not fr or not to:
                continue

            fr_label = region_label(fr)
            to_label = region_label(to)

            fr_text = region_text(fr)
            to_text = region_text(to)

            # We prefer using the textual content of the UNIT region.
            # Handle either direction:
            if fr_label == "UNIT" and to_label != "UNIT":
                unit_text = fr_text
                if unit_text is None:
                    unit_text = "UNIT"  # fallback if you didn't transcribe; you can improve later
                unit_of[to_id] = unit_text
            elif to_label == "UNIT" and fr_label != "UNIT":
                unit_text = to_text
                if unit_text is None:
                    unit_text = "UNIT"
                unit_of[from_id] = unit_text
            else:
                # If both are UNIT or neither are UNIT, skip (schema mismatch)
                pass

    return graph, unit_of

def cluster_same_record(start_id, graph):
    # BFS/DFS over SAME_RECORD edges
    seen = set()
    q = deque([start_id])
    while q:
        cur = q.popleft()
        if cur in seen:
            continue
        seen.add(cur)
        for nbr, rel_type in graph.get(cur, []):
            if rel_type == "SAME_RECORD" and nbr not in seen:
                q.append(nbr)
    return seen

# ---- Main conversion ----

def main():
    args = parse_args()
    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    all_rows = []

    for task in data:
        anns = task.get("annotations") or []
        for ann in anns:
            results = ann.get("result") or []
            region_map = build_region_map(results)
            graph, unit_map = build_graph_and_unit_map(results, region_map)

            visited = set()

            for rid, region in region_map.items():
                if rid in visited:
                    continue

                # Start clusters from relevant labels to avoid grabbing title-block noise
                lbl = region_label(region)
                if lbl is None:
                    continue

                # Choose what labels should seed a record cluster:
                # include BOM_* or numeric/measure fields likely to be in a takeoff
                seed_ok = (
                    lbl.startswith("BOM_") or
                    lbl in ("DIM_VALUE", "UNIT")  # include UNIT so we don't miss unit-only clusters
                )
                if not seed_ok:
                    continue

                cluster_ids = cluster_same_record(rid, graph)
                visited.update(cluster_ids)

                # Build a row from the cluster
                row = {}
                for cid in cluster_ids:
                    creg = region_map[cid]
                    clabel = region_label(creg)
                    ctext  = region_text(creg)

                    # Put the base field in the row
                    if clabel:
                        # If the same label appears multiple times in a cluster,
                        # append with an index or semicolon-join. We'll join here:
                        if clabel in row and ctext:
                            row[clabel] = f"{row[clabel]}; {ctext}" if row[clabel] else ctext
                        else:
                            row.setdefault(clabel, ctext)

                    # If this region has a UNIT attached, add UNIT columns
                    if cid in unit_map:
                        unit_txt = unit_map[cid]
                        if clabel:
                            row[f"{clabel}_UNIT"] = unit_txt
                            # Convenience combined field if the value exists
                            if ctext is not None:
                                row[f"{clabel}_WITH_UNIT"] = f"{ctext} {unit_txt}".strip()

                # Only add non-empty rows
                if any(v not in (None, "") for v in row.values()):
                    all_rows.append(row)

    # Collect columns
    fieldnames = sorted({k for r in all_rows for k in r.keys()})

    # Write CSV
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in all_rows:
            writer.writerows([r])

    print(f"✅ Wrote {len(all_rows)} rows to {args.out}")

if __name__ == "__main__":
    main()
