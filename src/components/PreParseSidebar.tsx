import { useEffect, useMemo, useState } from "react";

type LeadTime = "STANDARD" | "RUSH" | "FLEX";

export default function PreParseSidebar({
  companyName,
  orgId,
  docVerId,
  initial
}: {
  companyName: string;
  orgId: string;
  docVerId: string;
  initial?: {
    will_deliver?: boolean;
    deliver_zip?: string;
    lead_time?: LeadTime;
    will_install?: boolean;
  };
}) {
  // state
  const [willDeliver, setWillDeliver] = useState<boolean>(initial?.will_deliver ?? false);
  const [deliverZip, setDeliverZip] = useState<string>(initial?.deliver_zip ?? "");
  const [leadTime, setLeadTime] = useState<LeadTime>(initial?.lead_time ?? "STANDARD");
  const [willInstall, setWillInstall] = useState<boolean>(initial?.will_install ?? false);

  const zipOk = useMemo(() => !willDeliver || /^\d{5}$/.test(deliverZip), [willDeliver, deliverZip]);

  const payload = {
    org_id: orgId,
    doc_ver_id: docVerId,
    company_name: companyName,
    will_deliver: willDeliver,
    deliver_zip: willDeliver ? deliverZip : undefined,
    lead_time: leadTime,
    will_install: willInstall
  };

  // autosave on change
  useEffect(() => {
    const ctrl = new AbortController();
    async function save() {
      if (!zipOk) return;
      try {
        await fetch(`/api/hints/${docVerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
      } catch {
        /* ignore for now; you can add a toast */
      }
    }
    save();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [willDeliver, deliverZip, leadTime, willInstall, zipOk, docVerId]);

  return (
    <aside className="w-80 h-full flex flex-col border-l bg-white">
      <div className="px-4 pt-3 pb-2 border-b bg-white sticky top-0 z-10">
        <h3 className="text-lg font-semibold text-gray-900">Project context</h3>
        <p className="text-xs text-gray-600 mt-0.5">
          These help the AI parse and price accurately.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Deliver? */}
        <div className="border rounded-md overflow-hidden">
          <div className="bg-blue-50 border-b px-3 py-2 text-sm font-semibold text-blue-800 border-blue-200">
            Delivery
          </div>
          <div className="p-3 space-y-3">
            <div className="text-sm text-gray-700">
              Will “{companyName}” deliver this project?
            </div>
            <div className="inline-flex rounded-md border overflow-hidden">
              <button
                className={"px-3 py-1 text-sm " + (willDeliver ? "bg-blue-600 text-white" : "bg-white text-gray-700")}
                onClick={() => setWillDeliver(true)}
              >
                Yes
              </button>
              <button
                className={"px-3 py-1 text-sm border-l " + (!willDeliver ? "bg-blue-600 text-white" : "bg-white text-gray-700")}
                onClick={() => setWillDeliver(false)}
              >
                No
              </button>
            </div>

            {willDeliver && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">Delivery ZIP</label>
                <input
                  className={`w-full rounded border px-2 py-1 text-sm ${zipOk ? "border-gray-300" : "border-red-500"}`}
                  placeholder="e.g., 92801"
                  maxLength={5}
                  value={deliverZip}
                  onChange={(e) => setDeliverZip(e.target.value)}
                />
                {!zipOk && (
                  <div className="text-xs text-red-600 mt-1">Enter a 5-digit ZIP.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lead time */}
        <div className="border rounded-md overflow-hidden">
          <div className="bg-blue-50 border-b px-3 py-2 text-sm font-semibold text-blue-800 border-blue-200">
            Lead time
          </div>
          <div className="p-3 space-y-2">
            <div className="text-sm text-gray-700">Select one</div>
            <div className="flex flex-wrap gap-2">
              {(["STANDARD","RUSH","FLEX"] as LeadTime[]).map(opt => (
                <button
                  key={opt}
                  className={
                    "px-3 py-1 text-sm rounded border " +
                    (leadTime === opt ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300")
                  }
                  onClick={() => setLeadTime(opt)}
                >
                  {opt === "STANDARD" ? "Standard (7–10d)" : opt === "RUSH" ? "Rush (<3d)" : "Flexible (>10d)"}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600">
              Rush changes price deltas and labor scheduling.
            </p>
          </div>
        </div>

        {/* Field install */}
        <div className="border rounded-md overflow-hidden">
          <div className="bg-blue-50 border-b px-3 py-2 text-sm font-semibold text-blue-800 border-blue-200">
            Installation
          </div>
          <div className="p-3 space-y-2">
            <div className="text-sm text-gray-700">Will “{companyName}” field-install this project?</div>
            <div className="inline-flex rounded-md border overflow-hidden">
              <button
                className={"px-3 py-1 text-sm " + (willInstall ? "bg-blue-600 text-white" : "bg-white text-gray-700")}
                onClick={() => setWillInstall(true)}
              >
                Yes
              </button>
              <button
                className={"px-3 py-1 text-sm border-l " + (!willInstall ? "bg-blue-600 text-white" : "bg-white text-gray-700")}
                onClick={() => setWillInstall(false)}
              >
                No
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Shop-only vs shop + field affects labor routing and cost.
            </p>
          </div>
        </div>

        {/* FYI card */}
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          Stock sizes are auto-suggested after parsing based on your history and nesting.
        </div>
      </div>
    </aside>
  );
}
