import React from "react";

export default function ParsePanel({ status, result }) {
  if (!status) return null;
  if (status !== "DONE") {
    return (
      <div className="p-3 border rounded-md">
        <div className="font-semibold">Parsing…</div>
        <div className="text-sm text-gray-600">{status}</div>
      </div>
    );
  }
  return (
    <div className="p-3 border rounded-md space-y-4">
      <div>
        <div className="font-semibold">Title Block</div>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result?.titleBlock, null, 2)}</pre>
      </div>
      <div>
        <div className="font-semibold">Material Takeoff</div>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result?.takeoff, null, 2)}</pre>
      </div>
      <div>
        <div className="font-semibold">Cost Breakdown</div>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result?.estimate, null, 2)}</pre>
      </div>
    </div>
  );
}
