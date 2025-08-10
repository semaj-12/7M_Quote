import { type GeoLocationResult } from './geo-client';

export interface MaterialPricing {
  basePrice: number;
  regionalMultiplier: number;
  transportCost: number;
  finalPrice: number;
  currency: string;
}

export interface PricingFactors {
  steelHubDistance: number;
  regionalZone: string;
  transportMultiplier: number;
  marketVolatility: number;
  urgencyPremium: number;
}

export class GeoMaterialPricing {
  private basePrices: Record<string, number> = {
    'A36': 0.65,      // $/lb for A36 structural steel
    'A572': 0.72,     // $/lb for A572 high-strength steel
    'A992': 0.68,     // $/lb for A992 wide flange beams
    'A500': 0.70,     // $/lb for A500 hollow structural sections
    'A706': 0.85,     // $/lb for A706 rebar
    'Stainless304': 3.20,  // $/lb for 304 stainless steel
    'Stainless316': 4.10,  // $/lb for 316 stainless steel
    'Aluminum6061': 2.80,  // $/lb for 6061 aluminum
  };

  private regionalMultipliers: Record<string, number> = {
    'Great Lakes': 1.0,
    'Great Lakes - Hub Adjacent': 0.95,
    'Great Lakes - Remote': 1.15,
    'Northeast': 1.08,
    'Northeast - Hub Adjacent': 1.03,
    'Northeast - Remote': 1.20,
    'South Central': 1.02,
    'South Central - Hub Adjacent': 0.97,
    'South Central - Remote': 1.12,
    'West Coast': 1.12,
    'West Coast - Hub Adjacent': 1.07,
    'West Coast - Remote': 1.25,
    'Southeast': 1.05,
    'Southeast - Hub Adjacent': 1.00,
    'Southeast - Remote': 1.18,
    'Mountain/Plains': 1.10,
    'Mountain/Plains - Remote': 1.22,
  };

  calculateMaterialPrice(
    materialGrade: string,
    weightLbs: number,
    geoResult: GeoLocationResult,
    urgency: 'standard' | 'rush' | 'emergency' = 'standard'
  ): MaterialPricing {
    const basePrice = this.basePrices[materialGrade] || this.basePrices['A36'];
    const regionalMultiplier = this.regionalMultipliers[geoResult.regionalPricingZone] || 1.0;
    const closestHub = geoResult.steelHubDistances[0];
    
    // Calculate transport cost based on distance and weight
    const transportCost = this.calculateTransportCost(closestHub.distance, weightLbs);
    
    // Apply urgency premium
    const urgencyMultiplier = {
      'standard': 1.0,
      'rush': 1.15,
      'emergency': 1.30
    }[urgency];
    
    // Calculate final price
    const adjustedBasePrice = basePrice * regionalMultiplier * urgencyMultiplier;
    const materialCost = adjustedBasePrice * weightLbs;
    const finalPrice = materialCost + transportCost;
    
    return {
      basePrice: parseFloat((basePrice * weightLbs).toFixed(2)),
      regionalMultiplier,
      transportCost: parseFloat(transportCost.toFixed(2)),
      finalPrice: parseFloat(finalPrice.toFixed(2)),
      currency: 'USD'
    };
  }

  private calculateTransportCost(distanceMiles: number, weightLbs: number): number {
    const baseCostPerMile = 0.02; // $0.02 per mile per pound
    const minimumTransportCost = 50; // $50 minimum transport cost
    
    // Calculate distance-based cost
    let transportCost = distanceMiles * baseCostPerMile * weightLbs;
    
    // Apply distance tiers
    if (distanceMiles <= 50) {
      transportCost *= 0.8; // 20% discount for local delivery
    } else if (distanceMiles <= 150) {
      transportCost *= 0.9; // 10% discount for regional delivery
    } else if (distanceMiles > 500) {
      transportCost *= 1.2; // 20% surcharge for long distance
    }
    
    return Math.max(transportCost, minimumTransportCost);
  }

  getPricingFactors(geoResult: GeoLocationResult): PricingFactors {
    const closestHub = geoResult.steelHubDistances[0];
    
    return {
      steelHubDistance: closestHub.distance,
      regionalZone: geoResult.regionalPricingZone,
      transportMultiplier: closestHub.transportCostMultiplier,
      marketVolatility: this.calculateMarketVolatility(geoResult.regionalPricingZone),
      urgencyPremium: this.calculateUrgencyPremium(closestHub.distance)
    };
  }

  private calculateMarketVolatility(regionalZone: string): number {
    // Simulate market volatility based on regional factors
    const volatilityFactors: Record<string, number> = {
      'Great Lakes': 0.05,  // 5% volatility - stable steel production region
      'Northeast': 0.08,    // 8% volatility - higher demand variability
      'South Central': 0.06, // 6% volatility - oil & gas demand
      'West Coast': 0.12,   // 12% volatility - import/export fluctuations
      'Southeast': 0.07,    // 7% volatility - growing construction market
      'Mountain/Plains': 0.10, // 10% volatility - remote location premiums
    };
    
    // Extract base region from zone string
    const baseRegion = regionalZone.split(' -')[0];
    return volatilityFactors[baseRegion] || 0.08;
  }

  private calculateUrgencyPremium(distance: number): number {
    // Urgency premium increases with distance
    if (distance <= 100) return 0.15; // 15% premium for rush orders
    if (distance <= 300) return 0.20; // 20% premium
    if (distance <= 500) return 0.25; // 25% premium
    return 0.30; // 30% premium for remote locations
  }

  generatePricingReport(
    materials: Array<{grade: string; weight: number}>,
    geoResult: GeoLocationResult,
    urgency: 'standard' | 'rush' | 'emergency' = 'standard'
  ): {
    materials: Array<MaterialPricing & {grade: string; weight: number}>;
    totalCost: number;
    pricingFactors: PricingFactors;
    recommendations: string[];
  } {
    const materialPricing = materials.map(material => ({
      grade: material.grade,
      weight: material.weight,
      ...this.calculateMaterialPrice(material.grade, material.weight, geoResult, urgency)
    }));
    
    const totalCost = materialPricing.reduce((sum, item) => sum + item.finalPrice, 0);
    const pricingFactors = this.getPricingFactors(geoResult);
    const recommendations = this.generateRecommendations(geoResult, pricingFactors, urgency);
    
    return {
      materials: materialPricing,
      totalCost: parseFloat(totalCost.toFixed(2)),
      pricingFactors,
      recommendations
    };
  }

  private generateRecommendations(
    geoResult: GeoLocationResult,
    factors: PricingFactors,
    urgency: 'standard' | 'rush' | 'emergency'
  ): string[] {
    const recommendations: string[] = [];
    
    // Distance-based recommendations
    if (factors.steelHubDistance > 300) {
      recommendations.push("Consider bulk ordering to reduce per-unit transport costs for future projects");
    }
    
    if (factors.steelHubDistance < 100) {
      recommendations.push("Excellent location for competitive steel pricing due to proximity to major hub");
    }
    
    // Regional recommendations
    if (factors.regionalZone.includes('West Coast')) {
      recommendations.push("Consider alternative materials or suppliers due to higher regional costs");
    }
    
    if (factors.regionalZone.includes('Hub Adjacent')) {
      recommendations.push("Take advantage of hub-adjacent pricing for volume discounts");
    }
    
    // Market volatility recommendations
    if (factors.marketVolatility > 0.10) {
      recommendations.push("High market volatility - consider price locks for large orders");
    }
    
    // Urgency recommendations
    if (urgency === 'emergency' && factors.steelHubDistance > 200) {
      recommendations.push("Emergency delivery to remote location - consider local suppliers if available");
    }
    
    return recommendations;
  }
}

export const geoMaterialPricing = new GeoMaterialPricing();