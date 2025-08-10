// backend/services/estimation/estimateCosts.ts
export type TakeoffItem = {
  item?: string;
  material?: string;
  size?: string;
  thicknessIn?: number;
  lengthFt?: number;
  qty?: number;
  weightLb?: number;         // we will fill from datasets
  /** Optional: if ML provides per-line hours, use it */
  __laborHoursHint?: number;
};

export type EstimationInput = {
  region?: string;
  laborRatePerHour: number;
  historicalFactor?: number;
  items: TakeoffItem[];
};

export type EstimationOutput = {
  materialSubtotal: number;
  laborSubtotal: number;
  total: number;
  lines: Array<{
    desc: string;
    qty: number;
    weightLb: number;
    pricePerLb: number;
    materialCost: number;
    laborHours: number;
    laborCost: number;
  }>;
};

export interface PricingProvider {
  getPricePerPound(materialType: string, region: string): Promise<number>;
}

function heuristicLaborHours(it: TakeoffItem): number {
  if (it.__laborHoursHint && it.__laborHoursHint > 0) return it.__laborHoursHint;
  const w = it.weightLb ?? 0;
  const setupHr = 0.25;
  const minPerLb = 0.8 / 60;
  return setupHr + (w * minPerLb);
}

export async function estimateCosts(input: EstimationInput, pricing: PricingProvider): Promise<EstimationOutput> {
  const region = input.region || "national";
  let materialSubtotal = 0, laborSubtotal = 0;
  const lines: EstimationOutput["lines"] = [];

  for (const it of input.items) {
    const qty = it.qty ?? 1;
    const materialKey = (it.material || "steel").toLowerCase();
    const pricePerLb = await pricing.getPricePerPound(materialKey, region);
    const weight = (it.weightLb ?? 0) * qty;
    const materialCost = weight * pricePerLb;

    const laborHoursSingle = heuristicLaborHours(it) * (input.historicalFactor ?? 1.0);
    const laborHours = laborHoursSingle * qty;
    const laborCost = laborHours * input.laborRatePerHour;

    materialSubtotal += materialCost;
    laborSubtotal += laborCost;

    lines.push({
      desc: `${it.item || it.material || "Item"} ${it.size || ""}`.trim(),
      qty,
      weightLb: +weight.toFixed(2),
      pricePerLb: +pricePerLb.toFixed(2),
      materialCost: +materialCost.toFixed(2),
      laborHours: +laborHours.toFixed(2),
      laborCost: +laborCost.toFixed(2),
    });
  }

  const total = materialSubtotal + laborSubtotal;
  return {
    materialSubtotal: +materialSubtotal.toFixed(2),
    laborSubtotal: +laborSubtotal.toFixed(2),
    total: +total.toFixed(2),
    lines
  };
}
