# tools/textract_s3_async_batch.py
"""
Async S3 Textract batch runner (waves until done).

- Discovers images under --images-root (recursively).
- Uploads to s3://<bucket>/<prefix>/<relpath>/<filename>.
- Starts StartDocumentTextDetection for each file not yet cached or in state as DONE.
- Polls until jobs complete, refilling submission slots until all items are processed.
- Writes Textract JSON to --cache-dir mirroring relative paths.
- Persists a jobs state JSON so re-runs resume.

Supported suffixes: .png .jpg .jpeg .tiff .tif .bmp .pdf (Textract async supports PDFs and TIFFs too).
"""

import argparse
import concurrent.futures as futures
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

IMG_EXTS = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".pdf"}

def rel_key(images_root: Path, file_path: Path) -> str:
    return str(file_path.relative_to(images_root)).replace("\\", "/")

def s3_key(prefix: str, relpath: str) -> str:
    # put file directly under prefix/<folder(s)>/<filename>
    # also URL-unsafe chars are fine; boto encodes as needed
    return f"{prefix.rstrip('/')}/{relpath}"

def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def load_state(state_file: Path) -> Dict:
    if state_file.exists():
        try:
            return json.loads(state_file.read_text("utf-8"))
        except Exception:
            return {}
    return {}

def save_state(state_file: Path, state: Dict):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), "utf-8")
    tmp.replace(state_file)

def list_images(images_root: Path, limit: Optional[int]) -> List[Path]:
    files = []
    for p in images_root.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXTS:
            files.append(p)
            if limit and len(files) >= limit:
                break
    return sorted(files)

def s3_upload_if_needed(s3, bucket: str, key: str, local_path: Path):
    try:
        # small optimization: if exists with same size, skip
        head = s3.head_object(Bucket=bucket, Key=key)
        remote_size = head.get("ContentLength", -1)
        local_size = local_path.stat().st_size
        if remote_size == local_size:
            return
    except ClientError:
        pass
    s3.upload_file(str(local_path), bucket, key)

def start_job(textract, bucket: str, key: str) -> str:
    resp = textract.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    return resp["JobId"]

def poll_job(textract, job_id: str) -> Tuple[str, List[Dict]]:
    """Polls until COMPLETE/FAILED. Returns (status, pages)."""
    while True:
        resp = textract.get_document_text_detection(JobId=job_id, MaxResults=1000)
        status = resp["JobStatus"]
        if status in ("SUCCEEDED", "FAILED", "PARTIAL_SUCCESS"):
            pages = []
            next_token = resp.get("NextToken")
            blocks = resp.get("Blocks", [])
            pages.extend(blocks)
            while next_token:
                resp = textract.get_document_text_detection(JobId=job_id, MaxResults=1000, NextToken=next_token)
                blocks = resp.get("Blocks", [])
                pages.extend(blocks)
                next_token = resp.get("NextToken")
            return status, pages
        time.sleep(2)

def write_textract_json(cache_dir: Path, relpath: str, blocks: List[Dict]):
    out = cache_dir / (Path(relpath).with_suffix("").as_posix() + ".textract.json")
    out = cache_dir / (relpath + ".textract.json") if out.name.startswith(".") else out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"Blocks": blocks}), "utf-8")

def already_cached(cache_dir: Path, relpath: str) -> bool:
    out = cache_dir / (relpath + ".textract.json")
    return out.exists()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images-root", required=True, help="Local images root (scanned recursively)")
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--aws-region", required=True)
    ap.add_argument("--cache-dir", default="textract-cache")
    ap.add_argument("--state-file", default="textract-jobs.json")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--poll-seconds", type=int, default=3)
    args = ap.parse_args()

    images_root = Path(args.images_root).resolve()
    cache_dir = Path(args.cache_dir).resolve()
    state_path = Path(args.state_file).resolve()

    boto3.setup_default_session(region_name=args.aws_region)
    s3 = boto3.client("s3")
    tex = boto3.client("textract")

    files = list_images(images_root, args.limit or None)
    print(f"Discovered {len(files)} files.")

    state = load_state(state_path)
    # state schema:
    # { "<relpath>": {"status": "PENDING|UPLOADED|STARTED|DONE|ERROR", "job_id": "...", "error": "..."} }

    # Build worklist
    work: List[Tuple[Path, str, str]] = []  # (local_path, relpath, s3key)
    for fp in files:
        relpath = rel_key(images_root, fp)
        key = s3_key(args.prefix, relpath)
        # Skip if cache already has textract JSON
        if already_cached(cache_dir, relpath):
            state.setdefault(relpath, {})["status"] = "DONE"
            continue
        st = state.get(relpath, {})
        if st.get("status") == "DONE":
            continue
        work.append((fp, relpath, key))

    # Queues
    pending = work[:]  # to upload/start
    in_progress: Dict[str, Tuple[str, str]] = {}  # job_id -> (relpath, key)

    # Submission + polling loop (waves until both pending and in_progress are empty)
    try:
        while pending or in_progress:
            # Fill available slots
            slots = max(args.concurrency - len(in_progress), 0)
            while slots > 0 and pending:
                fp, relpath, key = pending.pop(0)
                try:
                    s3_upload_if_needed(s3, args.bucket, key, fp)
                    state.setdefault(relpath, {})["status"] = "UPLOADED"
                    save_state(state_path, state)
                    job_id = start_job(tex, args.bucket, key)
                    state[relpath]["status"] = "STARTED"
                    state[relpath]["job_id"] = job_id
                    save_state(state_path, state)
                    in_progress[job_id] = (relpath, key)
                    print(f"[START] {Path(relpath).name} -> JobId {job_id}")
                except ClientError as e:
                    msg = str(e)
                    state.setdefault(relpath, {})["status"] = "ERROR"
                    state[relpath]["error"] = msg
                    save_state(state_path, state)
                    print(f"[ERROR start] {fp}: {msg}")
                except Exception as e:
                    state.setdefault(relpath, {})["status"] = "ERROR"
                    state[relpath]["error"] = str(e)
                    save_state(state_path, state)
                    print(f"[ERROR start] {fp}: {e}")
                finally:
                    slots = max(args.concurrency - len(in_progress), 0)

            if not in_progress:
                # No jobs running, try to submit more (or break if none left)
                if not pending:
                    break
                else:
                    # short nap before trying again (in case of throttling)
                    time.sleep(1)
                    continue

            # Poll currently running jobs (round-robin)
            done_ids = []
            for job_id, (relpath, key) in list(in_progress.items()):
                try:
                    # quick status peek
                    resp = tex.get_document_text_detection(JobId=job_id, MaxResults=1)
                    status = resp.get("JobStatus")
                    if status in ("SUCCEEDED", "FAILED", "PARTIAL_SUCCESS"):
                        # finalize by fetching all pages
                        status, blocks = poll_job(tex, job_id)
                        if status == "SUCCEEDED" or status == "PARTIAL_SUCCESS":
                            write_textract_json(cache_dir, relpath, blocks)
                            state[relpath]["status"] = "DONE"
                            print(f"[DONE] {Path(relpath).name}")
                        else:
                            state[relpath]["status"] = "ERROR"
                            state[relpath]["error"] = f"Job {job_id} finished with {status}"
                            print(f"[ERROR job] {Path(relpath).name}: {status}")
                        save_state(state_path, state)
                        done_ids.append(job_id)
                except ClientError as e:
                    code = getattr(e, "response", {}).get("Error", {}).get("Code")
                    if code in ("ThrottlingException", "ProvisionedThroughputExceededException"):
                        # light backoff and continue
                        time.sleep(1.5)
                        continue
                    # other errors: mark error and drop
                    state[relpath]["status"] = "ERROR"
                    state[relpath]["error"] = str(e)
                    save_state(state_path, state)
                    print(f"[ERROR poll] {Path(relpath).name}: {e}")
                    done_ids.append(job_id)
                except Exception as e:
                    state[relpath]["status"] = "ERROR"
                    state[relpath]["error"] = str(e)
                    save_state(state_path, state)
                    print(f"[ERROR poll] {Path(relpath).name}: {e}")
                    done_ids.append(job_id)

            for jid in done_ids:
                in_progress.pop(jid, None)

            # gentle pacing between waves
            time.sleep(max(1, args.poll_seconds))
    finally:
        save_state(state_path, state)

    # Summary
    total = len(files)
    done = sum(1 for v in state.values() if v.get("status") == "DONE")
    errs = sum(1 for v in state.values() if v.get("status") == "ERROR")
    print(f"No IN_PROGRESS jobs. Done.")
    print(f"Cache ready for {done} files at {cache_dir} (errors: {errs}, total seen: {total})")

if __name__ == "__main__":
    main()
