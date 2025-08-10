// src/components/ParsePanel.tsx
import React from "react";

type TakeoffItem = {
  item?: string | number;
  desc?: string;
  qty?: number;
  material?: string;
  size?: string;
  lengthFt?: number;
  weightLb?: number;
  __laborHoursHint?: number;
};
type Estimate = {
  materialSubtotal?: number;
  laborSubtotal?: number;
  total?: number;
  lines?: Array<{ label: string; amount: number }>;
};

export default function ParsePanel({
  status,
  result,
}: {
  status: string | null;
  result: {
    titleBlock?: Record<string, any>;
    takeoff?: TakeoffItem[];
    estimate?: Estimate;
  } | null;
}) {
  if (!status) return null;

  const badgeClass =
    status === "SUCCEEDED" || status === "DONE"
      ? "bg-green-100 text-green-800"
      : status === "FAILED"
      ? "bg-red-100 text-red-800"
      : "bg-yellow-100 text-yellow-800";

  const takeoff = result?.takeoff ?? [];
  const est = result?.estimate ?? {};

  return (
    <div className="p-4 space-y-4">
      {/* Status */}
      <div className={`inline-block text-xs px-2 py-1 rounded ${badgeClass}`}>Status: {status}</div>

      {/* Price summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 border rounded-md">
          <div className="text-xs text-gray-500">Material Subtotal</div>
          <div className="text-xl font-semibold">${(est.materialSubtotal ?? 0).toFixed(2)}</div>
        </div>
        <div className="p-3 border rounded-md">
          <div className="text-xs text-gray-500">Labor Subtotal</div>
          <div className="text-xl font-semibold">${(est.laborSubtotal ?? 0).toFixed(2)}</div>
        </div>
        <div className="p-3 border rounded-md">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-xl font-semibold">${(est.total ?? 0).toFixed(2)}</div>
        </div>
      </div>

      {/* Price breakdown (optional lines array) */}
      {Array.isArray(est.lines) && est.lines.length > 0 && (
        <div className="p-3 border rounded-md">
          <div className="font-semibold mb-2">Price Breakdown</div>
          <ul className="text-sm space-y-1">
            {est.lines.map((l, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-gray-600">{l.label}</span>
                <span className="font-medium">${l.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Title block */}
      {result?.titleBlock && (
        <div className="p-3 border rounded-md">
          <div className="font-semibold mb-2">Title Block</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {Object.entries(result.titleBlock).map(([k, v]) => (
              <React.Fragment key={k}>
                <div className="text-gray-500">{k}</div>
                <div className="font-medium break-words">{String(v)}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Takeoff table */}
      <div className="p-3 border rounded-md">
        <div className="font-semibold mb-2">Material Takeoff</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">Qty</th>
                <th className="py-2 pr-2">Material</th>
                <th className="py-2 pr-2">Size</th>
                <th className="py-2 pr-2">Length (ft)</th>
                <th className="py-2 pr-2">Weight (lb)</th>
                <th className="py-2 pr-2">Labor (h)</th>
              </tr>
            </thead>
            <tbody>
              {takeoff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-500">
                    No takeoff rows detected yet.
                  </td>
                </tr>
              ) : (
                takeoff.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 pr-2">{r.item ?? "-"}</td>
                    <td className="py-1 pr-2">{r.desc ?? "-"}</td>
                    <td className="py-1 pr-2">{r.qty ?? "-"}</td>
                    <td className="py-1 pr-2">{r.material ?? "-"}</td>
                    <td className="py-1 pr-2">{r.size ?? "-"}</td>
                    <td className="py-1 pr-2">{r.lengthFt ?? "-"}</td>
                    <td className="py-1 pr-2">{r.weightLb ?? "-"}</td>
                    <td className="py-1 pr-2">{r.__laborHoursHint ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
