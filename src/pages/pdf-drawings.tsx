import React, { useCallback, useEffect, useMemo, useState } from "react";
import ParsePanel from "@/components/ParsePanel";
import PreParseSidebar from "@/components/PreParseSidebar";

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
  const [s3Key, setS3Key] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<string | null>(null); // "AWAIT_HINTS" | "PARSING" | "DONE" | "FAILED" | null
  const [parseResult, setParseResult] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // ── Pretend org/company until you wire real values from auth/backend
  const companyName = useMemo(
    () => (parseResult && (parseResult.companyName || parseResult.orgName)) || "Your Company",
    [parseResult]
  );
  const orgId = useMemo(
    () => (parseResult && (parseResult.orgId || parseResult.organizationId)) || "<org-id>",
    [parseResult]
  );

  // We want a docVerId BEFORE parsing so the sidebar can save hints against it.
  const [docVerId, setDocVerId] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `docver-${Date.now()}`
  );

  const mustJson = async (res: Response, label: string) => {
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`${label} failed (${res.status}). CT=${ct}. Snippet: ${text.slice(0, 200)}`);
    }
    return res.json();
  };

  // 1) User picks file → upload only. Do NOT start parsing yet.
  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setParseStatus(null);
    setParseResult(null);
    setJobId(null);
    // new doc version id for this upload session
    setDocVerId(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `docver-${Date.now()}`);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch(`${API}/api/upload`, { method: "POST", body: fd, cache: "no-store" });
      const resp = (await mustJson(upRes, "Upload")) as UploadResp;
      if (!resp.ok) throw new Error(resp.error || "Upload failed");

      setS3Url(resp.viewUrl || resp.s3Url);
      setS3Key(resp.s3Key);
      setLocalPath(resp.localPath ?? null);

      // 👉 We stop here and show the Pre-parse sidebar FIRST
      setParseStatus("AWAIT_HINTS");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Upload error");
    } finally {
      setIsUploading(false);
    }
  }, []);

  // 2) After user answers sidebar, they click "Start parsing" (we’ll render the button below)
  const startParsing = useCallback(async () => {
    if (!s3Key) return;
    setIsStarting(true);
    try {
      const startRes = await fetch(`${API}/api/parse/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // include docVerId/orgId so backend can correlate hints saved earlier
        body: JSON.stringify({
          s3Key,
          localPath: localPath ?? null,
          useAI: false,
          docVerId,
          orgId
        }),
        cache: "no-store",
      });
      const start = await mustJson(startRes, "Parse start");
      if (!start.ok) throw new Error(start.error || "parse start failed");

      setJobId(start.jobId as string);
      setParseStatus("PARSING");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Could not start parsing");
    } finally {
      setIsStarting(false);
    }
  }, [s3Key, localPath, docVerId, orgId]);

  // 3) Poll parsing status once we have a jobId
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      // we already set PARSING in startParsing; keep polling until done.
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 2000));
        const qs = new URLSearchParams({
          jobId,
          region: "Anaheim, CA",
          laborRate: "65",
          useAI: "0",
          docVerId
        });
        try {
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
          setParseStatus("FAILED");
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, docVerId]);

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
          {/* Left: PDF viewer */}
          <div className="col-span-7 bg-white border rounded-md">
            <iframe src={s3Url} style={{ width: "100%", height: "80vh", border: "none" }} title="PDF" />
          </div>

          {/* Right column */}
          <div className="col-span-5 bg-white border rounded-md">
            {/* BEFORE parsing: show Pre-parse sidebar only */}
            {parseStatus === "AWAIT_HINTS" && (
              <div className="flex h-[80vh]">
                <PreParseSidebar
                  companyName={companyName}
                  orgId={orgId}
                  docVerId={docVerId}
                />
                {/* Start button rail */}
                <div className="w-36 border-l p-3 flex flex-col justify-end">
                  <button
                    className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    onClick={startParsing}
                    disabled={isStarting}
                    title="Begin parsing with these answers"
                  >
                    {isStarting ? "Starting…" : "Start parsing"}
                  </button>
                  <p className="text-[11px] text-gray-500 mt-2">
                    We’ll use your answers to improve takeoff & pricing.
                  </p>
                </div>
              </div>
            )}

            {/* DURING/AFTER parsing: show ParsePanel; (optional) keep sidebar hidden */}
            {parseStatus !== "AWAIT_HINTS" && (
              <div className="flex h-[80vh]">
                <div className="flex-1 overflow-y-auto">
                  <ParsePanel status={parseStatus} result={parseResult} />
                </div>
                {/* If you want the sidebar to remain visible while PARSING, uncomment below:
                {parseStatus !== "DONE" && (
                  <PreParseSidebar
                    companyName={companyName}
                    orgId={orgId}
                    docVerId={docVerId}
                  />
                )} */}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
