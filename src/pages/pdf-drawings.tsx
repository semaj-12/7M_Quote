import React, { useCallback, useEffect, useState } from "react";
import ParsePanel from "@/components/ParsePanel";

type UploadResp = {
  ok: boolean;
  s3Key: string;
  s3Url: string;
  viewUrl?: string;
  localPath?: string | null;
  error?: string;
};

const API = (() => {
  const env = (import.meta.env.VITE_API_BASE || "").trim();
  if (env) return env;
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "http://localhost:5000"; // fallback in dev if proxy isn't working
  }
  return "";
})();


export default function PdfDrawings() {
  const [s3Url, setS3Url] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mustJson = async (res: Response, label: string) => {
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`${label} failed (${res.status}). CT=${ct}. Snippet: ${text.slice(0, 200)}`);
    }
    return res.json();
  };

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setParseStatus(null);
    setParseResult(null);

    try {
      // 1) Upload
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch(`${API}/api/upload`, { method: "POST", body: fd, cache: "no-store" });
      const resp = (await mustJson(upRes, "Upload")) as UploadResp;
      if (!resp.ok) throw new Error(resp.error || "Upload failed");
      setS3Url(resp.viewUrl || resp.s3Url);

      // 2) Kick off Textract
      const startRes = await fetch(`${API}/api/parse/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key: resp.s3Key, localPath: resp.localPath ?? null, useAI: false }),
        cache: "no-store",
      });
      const start = await mustJson(startRes, "Parse start");
      if (!start.ok) throw new Error(start.error || "parse start failed");

      setJobId(start.jobId as string);
      setParseStatus("STARTED");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Upload error");
    } finally {
      setIsUploading(false);
    }
  }, []);

  // 3) Poll parsing status
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      setParseStatus("PARSING");
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 2000));
        const qs = new URLSearchParams({
          jobId,
          region: "Anaheim, CA",
          laborRate: "65",
          useAI: "0",
        });
        try {
          // cache-buster + no-store so we never get a cached status
          const statusRes = await fetch(`${API}/api/parse/status?${qs.toString()}&t=${Date.now()}`, {
            cache: "no-store",
          });
          const s = await mustJson(statusRes, "Parse status");
          if (!s.ok) {
            console.error(s.error || "status failed");
            setParseStatus(s.status || "FAILED");
            break;
          }
          if (s.done) {
            setParseResult(s.result);
            setParseStatus("DONE");
            break;
          }
        } catch (e) {
          console.error(e);
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white p-3 border rounded-md">
        <label className="block">
          <span className="font-medium">Upload drawing (PDF)</span>
          <input
            type="file"
            accept="application/pdf"
            className="mt-2"
            onChange={onFileChange}
            disabled={isUploading}
          />
        </label>
      </div>

      {s3Url && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 bg-white border rounded-md">
            <iframe src={s3Url} style={{ width: "100%", height: "80vh", border: "none" }} title="PDF" />
          </div>
          <div className="col-span-5 bg-white border rounded-md max-h-[80vh] overflow-y-auto">
            <ParsePanel status={parseStatus} result={parseResult} />
          </div>
        </div>
      )}
    </div>
  );
}
