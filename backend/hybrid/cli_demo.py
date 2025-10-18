# /home/sagemaker-user/7m/hybrid/cli_demo.py
import argparse, json
from .pipeline import run_hybrid_on_image

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="Path to PNG/JPG page")
    ap.add_argument("--donut", default=None, help="Override Donut model dir")
    ap.add_argument("--context", default="", help="Optional tiny context string to help validator")
    args = ap.parse_args()
    out = run_hybrid_on_image(args.image, donut_model_dir=args.donut, page_context=args.context)
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
