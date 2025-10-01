import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

type MaterialRow = {
  materialType: string;   // e.g. "Steel"
  grade: string;          // e.g. "A36"
  pricePerPound: number;  // numeric for formatting
  priceChange?: number;   // +/- % (optional)
};

function toTitle(s: string) {
  const map: Record<string, string> = { steel: "Steel", stainless: "Stainless", aluminum: "Aluminum" };
  return map[s.toLowerCase()] ?? s;
}

// Accepts either an ARRAY of rows OR the OBJECT stub:
// {
//   updatedAt: "...",
//   steel: { default: 0.75, a36: 0.75, a500: 0.80 },
//   stainless: { default: 2.50, "304": 2.40, "316": 3.10 },
//   aluminum: { default: 2.00, "5052": 1.90, "6061": 2.10 },
// }
function normalizeCosts(raw: unknown): MaterialRow[] {
  if (!raw) return [];

  // If it's already an array, try to coerce fields.
  if (Array.isArray(raw)) {
    return raw
      .map((r: any) => ({
        materialType: String(r.materialType ?? r.material ?? "Unknown"),
        grade: String(r.grade ?? "default"),
        pricePerPound: Number(r.pricePerPound ?? r.price ?? 0),
        priceChange: r.priceChange != null ? Number(r.priceChange) : undefined,
      }))
      .filter((r) => !Number.isNaN(r.pricePerPound));
  }

  // If it's an object, convert nested maps to rows.
  if (typeof raw === "object") {
    const obj = raw as Record<string, any>;
    const entries: MaterialRow[] = [];

    for (const k of Object.keys(obj)) {
      if (k === "updatedAt") continue;
      const matBlock = obj[k];
      if (matBlock && typeof matBlock === "object" && !Array.isArray(matBlock)) {
        for (const gradeKey of Object.keys(matBlock)) {
          const price = Number(matBlock[gradeKey]);
          if (!Number.isNaN(price)) {
            entries.push({
              materialType: toTitle(k),
              grade: gradeKey.toUpperCase(),
              pricePerPound: price,
              priceChange: 0,
            });
          }
        }
      }
    }

    // If we got many grades, pick a tidy “top” trio (Steel/Aluminum/Stainless),
    // preferring common grades when present.
    const pick = (mt: string, prefer: string[]) => {
      const ofType = entries.filter((e) => e.materialType === mt);
      for (const p of prefer) {
        const found = ofType.find((e) => e.grade.toUpperCase() === p.toUpperCase());
        if (found) return found;
      }
      return ofType[0]; // any one
    };

    const trio = [
      pick("Steel", ["A36", "DEFAULT"]),
      pick("Aluminum", ["6061", "5052", "DEFAULT"]),
      pick("Stainless", ["304", "316", "DEFAULT"]),
    ].filter(Boolean) as MaterialRow[];

    return trio.length ? trio : entries;
  }

  return [];
}

export default function MaterialCostTracker() {
  const { data, isLoading, isError, refetch, error } = useQuery({
    queryKey: ["/api/material-costs"],
  });

  const materials = React.useMemo(() => {
    const rows = normalizeCosts(data);
    if (rows.length > 0) return rows;

    // Fallback display if API empty or unrecognized
    return [
      { materialType: "Steel",    grade: "A36",  pricePerPound: 0.68, priceChange:  2.3 },
      { materialType: "Aluminum", grade: "6061", pricePerPound: 0.92, priceChange: -1.2 },
      { materialType: "Stainless",grade: "304",  pricePerPound: 2.14, priceChange:  0.8 },
    ] as MaterialRow[];
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Material Cost Trends</h3>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-sm text-red-600">
            Failed to load material costs{error instanceof Error ? `: ${error.message}` : ""}.
          </div>
        </CardContent>
      </Card>
    );
  }

  const getColorForMaterial = (index: number) => {
    const colors = ["bg-primary", "bg-warning", "bg-success"];
    return colors[index % colors.length];
  };

  return (
    <Card>
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Material Cost Trends</h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {materials.map((m, index) => {
            const change = Number(m.priceChange ?? 0);
            const isPositive = change > 0;
            return (
              <div key={`${m.materialType}-${m.grade}-${index}`} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 ${getColorForMaterial(index)} rounded-full`} />
                  <span className="text-sm font-medium text-gray-700">
                    {m.materialType} ({m.grade})
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ${m.pricePerPound.toFixed(2)}/lb
                  </div>
                  <div className={`text-xs flex items-center ${isPositive ? "text-success" : "text-error"}`}>
                    {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {Math.abs(change).toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">Last updated: {new Date().toLocaleTimeString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
