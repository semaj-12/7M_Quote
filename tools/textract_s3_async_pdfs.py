"""
Async Textract pipeline for PDFs (S3 input, local cache output).

- Discovers PDFs under --pdf-root (recursively)
- Uploads each PDF to s3://<bucket>/<prefix>/<relative_path>.pdf
- Starts StartDocumentTextDetection for each PDF
- Polls with GetDocumentTextDetection until SUCCEEDED/FAILED
- On success, writes per-page cache files:
    <cache-dir>/<relpath>_p0001.textract-lines.json
    <cache-dir>/<relpath>_p0002.textract-lines.json
  (relpath mirrors your local folder structure; extensions removed)

These files are small JSON payloads with the PAGE's lines and words, ready
for downstream converters to consume without re-calling Textract.

Requirements: boto3, botocore, tqdm
"""

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from tqdm import tqdm


def s3_client(region: str):
    return boto3.client("s3", region_name=region)


def textract_client(region: str):
    return boto3.client("textract", region_name=region)


def iter_pdfs(pdf_root: Path, limit: Optional[int]) -> List[Path]:
    files = sorted(pdf_root.rglob("*.pdf"))
    return files[:limit] if limit else files


def rel_key(root: Path, file: Path) -> str:
    # Relative path with forward slashes, without drive letter
    rp = file.relative_to(root).as_posix()
    return rp


def upload_if_needed(s3, bucket: str, key: str, local: Path) -> None:
    # PutObject with simple overwrite; S3 is source of truth for Textract.
    s3.upload_file(str(local), bucket, key)


def start_job(tex, bucket: str, key: str) -> str:
    resp = tex.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    return resp["JobId"]


def load_state(state_file: Path) -> Dict:
    if state_file.exists():
        try:
            return json.loads(state_file.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state_file: Path, state: Dict) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(state_file)


def page_blocks_by_page_id(blocks: List[Dict]) -> Dict[int, Dict[str, List[Dict]]]:
    """
    Group LINES and WORDS by Page number.
    Returns: {page_index: {"LINES":[...], "WORDS":[...]}}
    """
    out: Dict[int, Dict[str, List[Dict]]] = {}
    for b in blocks:
        page = b.get("Page", 1)
        if page not in out:
            out[page] = {"LINES": [], "WORDS": []}
        if b["BlockType"] == "LINE":
            out[page]["LINES"].append(b)
        elif b["BlockType"] == "WORD":
            out[page]["WORDS"].append(b)
    return out


def write_page_cache(cache_dir: Path, rel_pdf_no_ext: str, page: int, page_payload: Dict) -> Path:
    # <cache-dir>/<relpath>_p0001.textract-lines.json
    stem = f"{rel_pdf_no_ext}_p{page:04d}"
    out_path = cache_dir / f"{stem}.textract-lines.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(page_payload, ensure_ascii=False), encoding="utf-8")
    return out_path


def poll_job_and_cache(tex, job_id: str, cache_dir: Path, rel_pdf_key: str, poll_seconds: int = 2) -> Dict:
    """
    Poll GetDocumentTextDetection until job finishes, then write per-page cache.
    Returns a summary dict with status and page count.
    """
    next_token = None
    status = None
    blocks_all: List[Dict] = []

    while True:
        kwargs = {"JobId": job_id}
        if next_token:
            kwargs["NextToken"] = next_token
        resp = tex.get_document_text_detection(**kwargs)
        status = resp["JobStatus"]
        if status == "SUCCEEDED":
            blocks_all.extend(resp.get("Blocks", []))
            next_token = resp.get("NextToken")
            if not next_token:
                break
        elif status in ("FAILED", "PARTIAL_SUCCESS"):
            break
        else:  # IN_PROGRESS
            time.sleep(poll_seconds)

    summary = {"JobStatus": status, "PagesCached": 0, "Message": resp.get("StatusMessage")}

    if status != "SUCCEEDED":
        return summary

    grouped = page_blocks_by_page_id(blocks_all)
    # rel_pdf_key like "textract/input/foo/bar.pdf" -> to rel path without extension
    rel_pdf_no_ext = Path(rel_pdf_key).with_suffix("").as_posix()

    for page_idx, payload in grouped.items():
        write_page_cache(cache_dir, rel_pdf_no_ext, page_idx, payload)
        summary["PagesCached"] += 1

    return summary


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pdf-root", required=True, help="Folder with source PDFs (recursively scanned)")
    p.add_argument("--bucket", required=True)
    p.add_argument("--prefix", required=True, help="S3 prefix to upload under (e.g. textract/pdf-input)")
    p.add_argument("--aws-region", required=True)
    p.add_argument("--cache-dir", required=True, help="Local cache dir for per-page JSON")
    p.add_argument("--state-file", required=True, help="Local JSON file to track jobs")
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--poll-seconds", type=int, default=2)
    args = p.parse_args()

    pdf_root = Path(args.pdf_root).resolve()
    cache_dir = Path(args.cache_dir).resolve()
    state_file = Path(args.state_file).resolve()

    s3 = s3_client(args.aws_region)
    tex = textract_client(args.aws_region)

    state = load_state(state_file)
    state.setdefault("jobs", {})       # by s3 key
    state.setdefault("files", {})      # by rel pdf
    save_state(state_file, state)

    pdfs = iter_pdfs(pdf_root, args.limit if args.limit and args.limit > 0 else None)
    if not pdfs:
        print("No PDFs found.")
        return

    print(f"Discovered {len(pdfs)} PDFs.")

    # 1) Upload + start jobs (skip those already done/succeeded)
    for pdf in tqdm(pdfs, desc="START"):
        rel = rel_key(pdf_root, pdf)
        s3_key = f"{args.prefix.rstrip('/')}/{rel}"
        if state["jobs"].get(s3_key, {}).get("JobStatus") == "SUCCEEDED":
            continue
        try:
            upload_if_needed(s3, args.bucket, s3_key, pdf)
            job_id = start_job(tex, args.bucket, s3_key)
            state["jobs"][s3_key] = {"JobId": job_id, "JobStatus": "IN_PROGRESS", "rel": rel}
            save_state(state_file, state)
        except ClientError as e:
            print(f"[ERROR start] {rel}: {e}")
            state["jobs"][s3_key] = {"JobId": None, "JobStatus": "ERROR", "Error": str(e), "rel": rel}
            save_state(state_file, state)

    # 2) Poll in batches until all not IN_PROGRESS are done
    while True:
        in_progress = {k: v for k, v in state["jobs"].items() if v.get("JobStatus") == "IN_PROGRESS"}
        if not in_progress:
            print("No IN_PROGRESS jobs. Done.")
            break

        # poll concurrently
        with cf.ThreadPoolExecutor(max_workers=args.concurrency) as ex:
            futs = {}
            for s3_key, meta in in_progress.items():
                futs[ex.submit(poll_job_and_cache, tex, meta["JobId"], cache_dir, s3_key, args.poll_seconds)] = s3_key

            for fut in cf.as_completed(futs):
                s3_key = futs[fut]
                rel = state["jobs"][s3_key]["rel"]
                try:
                    summary = fut.result()
                    state["jobs"][s3_key]["JobStatus"] = summary["JobStatus"]
                    state["jobs"][s3_key]["Summary"] = summary
                    save_state(state_file, state)
                    if summary["JobStatus"] == "SUCCEEDED":
                        print(f"[CACHED] {rel} -> {summary['PagesCached']} page(s)")
                    else:
                        msg = summary.get("Message") or ""
                        print(f"[ERROR job] {rel}: {summary['JobStatus']} {msg}".strip())
                except Exception as e:
                    state["jobs"][s3_key]["JobStatus"] = "ERROR"
                    state["jobs"][s3_key]["Error"] = str(e)
                    save_state(state_file, state)
                    print(f"[ERROR poll] {rel}: {e}")

    # 3) Final note
    print(f"Cache ready at {cache_dir}")
    print(f"State: {state_file}")


if __name__ == "__main__":
    main()
