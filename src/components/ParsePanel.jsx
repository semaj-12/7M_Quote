import React, { useMemo, useState, useEffect } from "react";

/**
 * Props:
 *   status: "STARTED" | "PARSING" | "DONE" | ...
 *   result: parse payload from /api/parse/status (or null while loading)
 */
export default function ParsePanel({ status, result }) {
  const isParsing = !result || (status && status !== "DONE");
  const analyzedAt = useMemo(() => new Date(), []);

  // ----- helpers -----
  const fmtMoney = (n) =>
    isFinite(n)
      ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      : "$0.00";

  const fmtDateTime = (d) =>
    d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const roundToNearest = (value, nearest) => Math.round(value / nearest) * nearest;

  const coerceNumber = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const asLengthLabel = (it) => {
    const lenIn = it?.lengthIn ?? it?.length_in ?? null;
    const lenFt = it?.lengthFt ?? it?.length_ft ?? null;
    const len = it?.length ?? null;

    if (lenIn && Number(lenIn) > 0) return `${Number(lenIn)}"`;
    if (lenFt && Number(lenFt) > 0) return `${Number(lenFt)} ft`;
    if (typeof len === "string" && len.trim()) return len;
    return null;
  };

  const materialSpecOf = (it) => {
    const size = (it?.size || "").toString().trim();
    const mat = (it?.material || "").toString().trim();
    const spec = (it?.materialSpec || it?.spec || "").toString().trim();
    if (spec) return spec;
    if (size && mat) return `${size} ${mat}`; // e.g., 2"x2"x.125 HSS
    if (size) return size;
    const desc = (it?.desc || it?.description || "").toString().trim();
    if (desc) return desc;
    return "Unspecified";
  };

  const deriveQuoteTitle = (res) => {
    const fromTitleBlock =
      res?.titleBlock?.title ||
      res?.titleBlock?.drawingTitle ||
      res?.titleBlock?.drawing ||
      res?.titleBlock?.sheetTitle ||
      "";
    if (fromTitleBlock) return String(fromTitleBlock);
    const firstDesc = res?.takeoff?.[0]?.desc || "";
    if (firstDesc) return String(firstDesc);
    const n = (Date.now() / 1000) | 0;
    return `Quote # ${n % 1000}`;
  };

  const sumMaterialBase = (lines) => {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((sum, ln) => {
      const matCost =
        ln?.materialCost ?? coerceNumber(ln?.weightLb) * coerceNumber(ln?.pricePerLb);
      return sum + coerceNumber(matCost);
    }, 0);
  };

  const sumLaborHours = (lines) => {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((sum, ln) => sum + coerceNumber(ln?.laborHours), 0);
  };

  // ----- header data -----
  const quoteTitle = useMemo(() => deriveQuoteTitle(result), [result]);
  const revision = result?.titleBlock?.revision || "—";
  const scale = result?.titleBlock?.scale || "—";

  // ----- tabs -----
  const [tab, setTab] = useState("takeoff"); // "takeoff" | "costs"

  // ----- derive from result -----
  const estimateLines = result?.estimate?.lines || [];
  const initialMatBase = useMemo(() => {
    const fromServer = coerceNumber(result?.estimate?.materialSubtotal);
    return fromServer || sumMaterialBase(estimateLines);
  }, [result, estimateLines]);

  const serverLaborSubtotal = coerceNumber(result?.estimate?.laborSubtotal);
  const initialLaborHours = useMemo(() => {
    const hoursFromLines = sumLaborHours(estimateLines);
    if (hoursFromLines > 0) return hoursFromLines;
    if (serverLaborSubtotal > 0) return serverLaborSubtotal / 65; // default rate
    return 0;
  }, [estimateLines, serverLaborSubtotal]);

  // ----- controls (editable) -----
  const [laborMode, setLaborMode] = useState("shop"); // "shop" | "field"
  const [rateShop, setRateShop] = useState(65);
  const [rateField, setRateField] = useState(85);
  const selectedRate = laborMode === "shop" ? rateShop : rateField;

  const [laborHours, setLaborHours] = useState(Number(initialLaborHours.toFixed(2)));
  const [markupPct, setMarkupPct] = useState(50); // material markup
  const [includeMarkupInTotal, setIncludeMarkupInTotal] = useState(true);
  const [freight, setFreight] = useState(0);
  const [fuel, setFuel] = useState(0);
  const [taxOn, setTaxOn] = useState(false);
  const [taxRate, setTaxRate] = useState(8.75);

  // ----- computed totals -----
  const materialBase = useMemo(() => initialMatBase, [initialMatBase]);
  const materialWithMarkup = useMemo(
    () => materialBase * (1 + markupPct / 100),
    [materialBase, markupPct]
  );
  const laborCost = useMemo(() => laborHours * selectedRate, [laborHours, selectedRate]);

  const materialUsedInTotal = includeMarkupInTotal ? materialWithMarkup : materialBase;
  const preTaxSubtotal = materialUsedInTotal + laborCost + freight + fuel;
  const taxAmount = taxOn ? materialUsedInTotal * (taxRate / 100) : 0;
  const grandTotalUnrounded = preTaxSubtotal + taxAmount;
  const grandTotalRounded = roundToNearest(grandTotalUnrounded, 5);

  // ----- progress bar -----
  const [fakeProgress, setFakeProgress] = useState(8);
  useEffect(() => {
    if (!isParsing) return;
    const t = setInterval(() => {
      setFakeProgress((p) => (p > 92 ? p : p + Math.random() * 6));
    }, 500);
    return () => clearInterval(t);
  }, [isParsing]);

  // ----- grouping for takeoff -----
  const takeoffGroups = useMemo(() => {
    const arr = Array.isArray(result?.takeoff) ? result.takeoff : [];
    const map = new Map();
    for (const it of arr) {
      const key = materialSpecOf(it);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries()); // [ [spec, items[]], ... ]
  }, [result]);

  return (
    <div className="h-full flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{quoteTitle}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 border border-blue-200">
              Revision: {revision}
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 border border-blue-200">
              Scale: {scale}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 border border-gray-200">
              Analyzed: {fmtDateTime(analyzedAt)}
            </span>
          </div>

          {/* Tabs */}
          <div className="mt-3 border-b border-gray-200">
            <nav className="-mb-px flex gap-6" aria-label="Tabs">
              {[
                { id: "takeoff", label: "Material Takeoff" },
                { id: "costs", label: "Cost Breakdown" },
              ].map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    className={
                      "whitespace-nowrap py-2 text-sm font-medium border-b-2 " +
                      (active
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300")
                    }
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Loading */}
        {isParsing && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-800 mb-2">Parsing drawing…</div>
            <div className="w-full h-2 bg-blue-100 rounded">
              <div
                className="h-2 bg-blue-600 rounded transition-all"
                style={{ width: `${Math.min(100, fakeProgress)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-blue-700">This may take a moment for complex drawings.</div>
          </div>
        )}

        {/* Takeoff */}
        {!isParsing && tab === "takeoff" && (
          <div className="space-y-4">
            {takeoffGroups.length === 0 ? (
              <div className="text-sm text-gray-600 border rounded-md p-3">
                No takeoff items were detected.
              </div>
            ) : (
              takeoffGroups.map(([spec, items]) => (
                <div key={spec} className="border rounded-md overflow-hidden">
                  <div className="bg-blue-50 border-b px-3 py-2 text-sm font-semibold text-blue-800 border-blue-200">
                    {spec}
                  </div>
                  <ul className="divide-y">
                    {items.map((it, idx) => {
                      const qty = coerceNumber(it?.qty, 0);
                      const lengthLabel = asLengthLabel(it);
                      return (
                        <li key={idx} className="px-3 py-2 text-sm flex justify-between">
                          <div className="text-gray-800">
                            {qty > 0 ? `${qty} qty` : "—"}
                            {lengthLabel ? ` @ ${lengthLabel}` : ""}
                          </div>
                          <div className="text-gray-500">
                            {(it?.item ?? "") && <span className="mr-2">#{String(it.item)}</span>}
                            {(it?.desc ?? "") && <span>{String(it.desc)}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}

        {/* Costs */}
        {!isParsing && tab === "costs" && (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900">Cost Summary</h3>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Labor:</span>
                    <div className="inline-flex rounded-md border overflow-hidden">
                      <button
                        className={
                          "px-3 py-1 text-sm " +
                          (laborMode === "shop" ? "bg-blue-600 text-white" : "bg-white text-gray-700")
                        }
                        onClick={() => setLaborMode("shop")}
                      >
                        Shop
                      </button>
                      <button
                        className={
                          "px-3 py-1 text-sm border-l " +
                          (laborMode === "field" ? "bg-blue-600 text-white" : "bg-white text-gray-700")
                        }
                        onClick={() => setLaborMode("field")}
                      >
                        Field
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Shop $/hr</label>
                    <input
                      type="number"
                      className="w-20 rounded border px-2 py-1 text-sm"
                      value={rateShop}
                      onChange={(e) => setRateShop(coerceNumber(e.target.value, 65))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Field $/hr</label>
                    <input
                      type="number"
                      className="w-20 rounded border px-2 py-1 text-sm"
                      value={rateField}
                      onChange={(e) => setRateField(coerceNumber(e.target.value, 85))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Labor hrs</label>
                    <input
                      type="number"
                      className="w-24 rounded border px-2 py-1 text-sm"
                      value={laborHours}
                      min={0}
                      step="0.25"
                      onChange={(e) => setLaborHours(Math.max(0, coerceNumber(e.target.value, 0)))}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Material Costs */}
                <div className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">Material (base)</div>
                    <div className="text-sm font-semibold">{fmtMoney(materialBase)}</div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm text-gray-600">Markup %</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-20 rounded border px-2 py-1 text-sm"
                        value={markupPct}
                        min={0}
                        max={300}
                        step="1"
                        onChange={(e) => setMarkupPct(Math.max(0, coerceNumber(e.target.value, 50)))}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm text-gray-600">Material (with markup)</div>
                    <div className="text-sm font-semibold">{fmtMoney(materialWithMarkup)}</div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="text-sm text-gray-700">Include markup in total</label>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={includeMarkupInTotal}
                      onChange={(e) => setIncludeMarkupInTotal(e.target.checked)}
                    />
                  </div>
                </div>

                {/* Labor & Extras */}
                <div className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">
                      Labor ({laborMode === "shop" ? "Shop" : "Field"} @ {fmtMoney(selectedRate)}/hr)
                    </div>
                    <div className="text-sm font-semibold">{fmtMoney(laborCost)}</div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700">Freight</label>
                    <input
                      type="number"
                      className="w-28 rounded border px-2 py-1 text-sm text-right"
                      value={freight}
                      min={0}
                      step="1"
                      onChange={(e) => setFreight(Math.max(0, coerceNumber(e.target.value, 0)))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-700">Fuel surcharge</label>
                    <input
                      type="number"
                      className="w-28 rounded border px-2 py-1 text-sm text-right"
                      value={fuel}
                      min={0}
                      step="1"
                      onChange={(e) => setFuel(Math.max(0, coerceNumber(e.target.value, 0)))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700 flex items-center gap-2">
                      <label>Sales tax</label>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={taxOn}
                        onChange={(e) => setTaxOn(e.target.checked)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-20 rounded border px-2 py-1 text-sm"
                        value={taxRate}
                        min={0}
                        step="0.25"
                        onChange={(e) => setTaxRate(Math.max(0, coerceNumber(e.target.value, 8.75)))}
                        disabled={!taxOn}
                      />
                      <span className="text-sm text-gray-600">%</span>
                    </div>
                  </div>

                  {taxOn && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-gray-600">Tax on material</div>
                      <div className="font-medium">{fmtMoney(taxAmount)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Totals */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">Subtotal (pre-tax)</div>
                  <div className="font-medium">{fmtMoney(preTaxSubtotal)}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">Grand total (unrounded)</div>
                  <div className="font-medium">{fmtMoney(grandTotalUnrounded)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between text-base">
                  <div className="font-semibold text-gray-900">Grand total (rounded to $5)</div>
                  <div className="font-semibold text-blue-700">{fmtMoney(grandTotalRounded)}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded border text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    // reset
                    setLaborHours(Number(initialLaborHours.toFixed(2)));
                    setMarkupPct(50);
                    setIncludeMarkupInTotal(true);
                    setFreight(0);
                    setFuel(0);
                    setTaxOn(false);
                    setTaxRate(8.75);
                    setLaborMode("shop");
                    setRateShop(65);
                    setRateField(85);
                  }}
                >
                  Reset
                </button>

                  {/* Placeholder; wire later */}
                <button
                  className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={async () => {
                    const payload = {
                      title: quoteTitle,
                      analyzedAt: analyzedAt.toISOString(),
                      totals: {
                        materialBase,
                        materialWithMarkup,
                        includeMarkupInTotal,
                        laborMode,
                        rateShop,
                        rateField,
                        laborHours,
                        laborCost,
                        freight,
                        fuel,
                        taxOn,
                        taxRate,
                        preTaxSubtotal,
                        taxAmount,
                        grandTotalUnrounded,
                        grandTotalRounded,
                      },
                      source: result,
                    };
                    try {
                      const r = await fetch("/api/quotes/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      if (!r.ok) throw new Error(`Save failed (${r.status})`);
                      alert("Quote saved.");
                    } catch (e) {
                      alert("Failed to save quote (API not wired yet). Check console for payload.");
                      console.log("Save payload (preview):", payload);
                    }
                  }}
                >
                  Save as Quote
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fallback error */}
        {!isParsing && !result && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Could not load parse result. Try re-uploading the drawing.
          </div>
        )}
      </div>
    </div>
  );
}
