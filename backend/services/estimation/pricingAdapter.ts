// backend/services/estimation/pricingAdapter.ts
import type { PricingProvider } from "./estimateCosts";

function normalizeMaterial(materialType: string) {
  const key = (materialType || "steel").toLowerCase();
  if (key.includes("stain")) return "stainless";
  if (key.includes("alum"))  return "aluminum";
  return "steel";
}

export const pricingProvider: PricingProvider = {
  async getPricePerPound(materialType: string, region: string) {
    const mat = normalizeMaterial(materialType);
    try {
      // Lazy-load to avoid boot-time crashes if that service pulls missing schema/db
      const mod = await import("../material-pricing-service");
      const materialPricingService = (mod as any).materialPricingService;
      const res = await materialPricingService.getRealTimePricing(mat, region || "national");
      const best = res?.[0];
      if (best?.pricePerPound) return best.pricePerPound;
    } catch (e:any) {
      console.warn("[pricingProvider] fallback $/lb; reason:", e?.message || e);
    }
    // Fallbacks
    return mat === "aluminum" ? 2.2 : mat === "stainless" ? 3.0 : 1.2;
  }
};
