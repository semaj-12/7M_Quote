import axios from 'axios';
import { db } from './db';
import { materialCosts } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

export interface MarketDataSource {
  name: string;
  url: string;
  apiKey?: string;
  updateFrequency: number; // minutes
  reliability: number; // 0-1 score
}

export interface RealTimePricing {
  materialType: string;
  grade: string;
  pricePerPound: number;
  priceChange24h: number;
  marketTrend: 'increasing' | 'decreasing' | 'stable';
  volatility: number;
  volume: number;
  source: string;
  timestamp: Date;
  confidence: number;
}

export interface TransportationCost {
  distance: number;
  costPerMile: number;
  fuelSurcharge: number;
  totalCost: number;
  estimatedDays: number;
}

export interface PricingAlert {
  id: string;
  userId: number;
  materialType: string;
  triggerPrice: number;
  currentPrice: number;
  alertType: 'above' | 'below' | 'change';
  isActive: boolean;
}

// Steel mill and distribution hub locations for transportation calculations
const STEEL_HUBS = [
  { name: 'Nucor - Arkansas', lat: 35.2010, lng: -91.8318, capacity: 'high' },
  { name: 'US Steel - Pennsylvania', lat: 40.4406, lng: -79.9959, capacity: 'very_high' },
  { name: 'Cleveland-Cliffs - Indiana', lat: 41.5868, lng: -87.3467, capacity: 'high' },
  { name: 'Steel Dynamics - Texas', lat: 30.0686, lng: -94.1266, capacity: 'medium' },
  { name: 'Gerdau - Florida', lat: 25.7617, lng: -80.1918, capacity: 'medium' }
];

export class MaterialPricingService {
  private marketSources: MarketDataSource[] = [
    {
      name: 'LME (London Metal Exchange)',
      url: 'https://api.lme.com/v1/metals',
      updateFrequency: 15,
      reliability: 0.95
    },
    {
      name: 'CME Group Steel',
      url: 'https://api.cmegroup.com/market-data/steel',
      updateFrequency: 30,
      reliability: 0.90
    },
    {
      name: 'SteelBenchmarker',
      url: 'https://api.steelbenchmarker.com/prices',
      updateFrequency: 60,
      reliability: 0.85
    },
    {
      name: 'Platts Steel',
      url: 'https://api.platts.com/steel',
      updateFrequency: 60,
      reliability: 0.88
    }
  ];

  // Fetch real-time material prices from multiple sources
  async getRealTimePricing(materialType: string, location: string): Promise<RealTimePricing[]> {
    const promises = this.marketSources.map(source => 
      this.fetchFromSource(source, materialType, location)
    );

    const results = await Promise.allSettled(promises);
    const validPrices = results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<RealTimePricing>).value)
      .filter(price => price !== null);

    // Aggregate and validate pricing data
    return this.aggregatePricingData(validPrices);
  }

  // Calculate transportation costs from nearest steel hubs
  async calculateTransportationCosts(
    destination: { lat: number; lng: number },
    materialWeight: number
  ): Promise<TransportationCost[]> {
    return STEEL_HUBS.map(hub => {
      const distance = this.calculateDistance(hub.lat, hub.lng, destination.lat, destination.lng);
      const costPerMile = this.getCostPerMile(materialWeight);
      const fuelSurcharge = this.getCurrentFuelSurcharge();
      
      return {
        distance,
        costPerMile,
        fuelSurcharge: distance * fuelSurcharge,
        totalCost: (distance * costPerMile) + (distance * fuelSurcharge),
        estimatedDays: Math.ceil(distance / 500) // Assuming 500 miles per day
      };
    }).sort((a, b) => a.totalCost - b.totalCost);
  }

  // Track market volatility and trends
  async analyzeMarketTrends(materialType: string, days: number = 30): Promise<{
    trend: 'increasing' | 'decreasing' | 'stable';
    volatility: number;
    priceRange: { min: number; max: number; avg: number };
    forecast: number[];
  }> {
    const historicalData = await this.getHistoricalPricing(materialType, days);
    
    const prices = historicalData.map(d => d.pricePerPound);
    const trend = this.calculateTrend(prices);
    const volatility = this.calculateVolatility(prices);
    const priceRange = {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((sum, price) => sum + price, 0) / prices.length
    };

    // Simple moving average forecast for next 7 days
    const forecast = this.generateForecast(prices, 7);

    return { trend, volatility, priceRange, forecast };
  }

  // Set up pricing alerts for users
  async createPricingAlert(alert: Omit<PricingAlert, 'id'>): Promise<PricingAlert> {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newAlert = { ...alert, id };
    
    // Store in database
    await this.storePricingAlert(newAlert);
    
    return newAlert;
  }

  // Check and trigger pricing alerts
  async checkPricingAlerts(): Promise<void> {
    const activeAlerts = await this.getActivePricingAlerts();
    
    for (const alert of activeAlerts) {
      const currentPricing = await this.getRealTimePricing(alert.materialType, 'national');
      const currentPrice = currentPricing[0]?.pricePerPound;
      
      if (this.shouldTriggerAlert(alert, currentPrice)) {
        await this.triggerAlert(alert, currentPrice);
      }
    }
  }

  // Integrate with company's purchasing history for better pricing
  async getCompanySpecificPricing(
    userId: number,
    materialType: string,
    quantity: number
  ): Promise<{
    marketPrice: number;
    suggestedPrice: number;
    discount: number;
    preferredSuppliers: string[];
    negotiationTips: string[];
  }> {
    const marketPricing = await this.getRealTimePricing(materialType, 'national');
    const marketPrice = marketPricing[0]?.pricePerPound || 0;
    
    const purchaseHistory = await this.getUserPurchaseHistory(userId, materialType);
    const volumeDiscount = this.calculateVolumeDiscount(quantity, purchaseHistory);
    const loyaltyDiscount = this.calculateLoyaltyDiscount(purchaseHistory);
    
    const totalDiscount = volumeDiscount + loyaltyDiscount;
    const suggestedPrice = marketPrice * (1 - totalDiscount);
    
    return {
      marketPrice,
      suggestedPrice,
      discount: totalDiscount,
      preferredSuppliers: this.getPreferredSuppliers(purchaseHistory),
      negotiationTips: this.generateNegotiationTips(marketPricing[0], quantity)
    };
  }

  // Private helper methods
  private async fetchFromSource(
    source: MarketDataSource,
    materialType: string,
    location: string
  ): Promise<RealTimePricing | null> {
    try {
      // This would integrate with actual APIs
      // For demonstration, returning mock data structure
      
      const response = await this.simulateAPICall(source, materialType);
      
      return {
        materialType,
        grade: response.grade || 'A36',
        pricePerPound: response.price,
        priceChange24h: response.change24h,
        marketTrend: response.trend,
        volatility: response.volatility,
        volume: response.volume,
        source: source.name,
        timestamp: new Date(),
        confidence: source.reliability
      };
    } catch (error) {
      console.error(`Failed to fetch from ${source.name}:`, error);
      return null;
    }
  }

  private async simulateAPICall(source: MarketDataSource, materialType: string): Promise<any> {
    // Simulate API response with realistic steel pricing
    const basePrice = materialType.toLowerCase().includes('stainless') ? 1.20 : 0.65;
    const volatility = Math.random() * 0.1 - 0.05; // ±5% volatility
    
    return {
      price: basePrice + volatility,
      change24h: Math.random() * 0.04 - 0.02, // ±2% daily change
      trend: Math.random() > 0.5 ? 'increasing' : 'decreasing',
      volatility: Math.random() * 0.3,
      volume: Math.floor(Math.random() * 1000000),
      grade: 'A36'
    };
  }

  private aggregatePricingData(prices: RealTimePricing[]): RealTimePricing[] {
    if (prices.length === 0) return [];

    // Group by material type and grade
    const grouped = prices.reduce((acc, price) => {
      const key = `${price.materialType}_${price.grade}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(price);
      return acc;
    }, {} as Record<string, RealTimePricing[]>);

    // Calculate weighted averages for each group
    return Object.values(grouped).map(group => {
      const totalWeight = group.reduce((sum, price) => sum + price.confidence, 0);
      const weightedPrice = group.reduce((sum, price) => 
        sum + (price.pricePerPound * price.confidence), 0) / totalWeight;
      
      return {
        ...group[0], // Use first item as template
        pricePerPound: weightedPrice,
        confidence: totalWeight / group.length, // Average confidence
        source: group.map(p => p.source).join(', ')
      };
    });
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private getCostPerMile(weight: number): number {
    // Base cost per mile for trucking, adjusted for weight
    const baseCost = 2.50; // $2.50 per mile base
    const weightFactor = Math.min(weight / 40000, 2); // Max 2x for overweight
    return baseCost * weightFactor;
  }

  private getCurrentFuelSurcharge(): number {
    // Fuel surcharge per mile (would be fetched from DOT or fuel APIs)
    return 0.35; // $0.35 per mile
  }

  private calculateTrend(prices: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (prices.length < 2) return 'stable';
    
    const recent = prices.slice(-7); // Last 7 data points
    const older = prices.slice(-14, -7); // Previous 7 data points
    
    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.02) return 'increasing';
    if (change < -0.02) return 'decreasing';
    return 'stable';
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private generateForecast(prices: number[], days: number): number[] {
    // Simple moving average forecast
    const windowSize = Math.min(7, prices.length);
    const recentPrices = prices.slice(-windowSize);
    const avgPrice = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    
    const trend = this.calculateTrend(prices);
    const trendFactor = trend === 'increasing' ? 1.001 : trend === 'decreasing' ? 0.999 : 1.0;
    
    const forecast = [];
    for (let i = 0; i < days; i++) {
      forecast.push(avgPrice * Math.pow(trendFactor, i + 1));
    }
    
    return forecast;
  }

  private shouldTriggerAlert(alert: PricingAlert, currentPrice: number): boolean {
    switch (alert.alertType) {
      case 'above':
        return currentPrice > alert.triggerPrice;
      case 'below':
        return currentPrice < alert.triggerPrice;
      case 'change':
        const changePercent = Math.abs(currentPrice - alert.currentPrice) / alert.currentPrice;
        return changePercent > (alert.triggerPrice / 100); // triggerPrice as percentage
      default:
        return false;
    }
  }

  private async triggerAlert(alert: PricingAlert, currentPrice: number): Promise<void> {
    // This would send notifications via email, SMS, or in-app
    console.log(`PRICE ALERT: ${alert.materialType} is now $${currentPrice.toFixed(3)}/lb`);
    
    // Deactivate alert if it's a one-time trigger
    await this.deactivateAlert(alert.id);
  }

  private calculateVolumeDiscount(quantity: number, history: any[]): number {
    // Volume discount based on quantity and purchase history
    let discount = 0;
    
    if (quantity > 10000) discount += 0.05; // 5% for large orders
    if (quantity > 50000) discount += 0.03; // Additional 3% for very large orders
    
    const totalHistoricalVolume = history.reduce((sum, purchase) => sum + purchase.quantity, 0);
    if (totalHistoricalVolume > 100000) discount += 0.02; // 2% loyalty volume discount
    
    return Math.min(discount, 0.15); // Cap at 15%
  }

  private calculateLoyaltyDiscount(history: any[]): number {
    // Loyalty discount based on purchase frequency and consistency
    if (history.length > 12) return 0.02; // 2% for frequent customers
    if (history.length > 6) return 0.01; // 1% for regular customers
    return 0;
  }

  private getPreferredSuppliers(history: any[]): string[] {
    // Extract frequently used suppliers from purchase history
    const supplierCounts = history.reduce((acc, purchase) => {
      acc[purchase.supplier] = (acc[purchase.supplier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(supplierCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([supplier]) => supplier);
  }

  private generateNegotiationTips(pricing: RealTimePricing, quantity: number): string[] {
    const tips = [];
    
    if (pricing.marketTrend === 'decreasing') {
      tips.push('Market is trending down - consider waiting for better prices');
    }
    
    if (quantity > 20000) {
      tips.push('Large order volume - negotiate for additional volume discounts');
    }
    
    if (pricing.volatility > 0.2) {
      tips.push('High market volatility - consider price locking mechanisms');
    }
    
    return tips;
  }

  // Database operations (simplified)
  private async getHistoricalPricing(materialType: string, days: number): Promise<RealTimePricing[]> {
    // Would fetch from historical pricing table
    return [];
  }

  private async storePricingAlert(alert: PricingAlert): Promise<void> {
    // Store in alerts table
    console.log('Storing pricing alert:', alert);
  }

  private async getActivePricingAlerts(): Promise<PricingAlert[]> {
    // Fetch from alerts table
    return [];
  }

  private async deactivateAlert(alertId: string): Promise<void> {
    // Update alert status in database
    console.log('Deactivating alert:', alertId);
  }

  private async getUserPurchaseHistory(userId: number, materialType: string): Promise<any[]> {
    // Fetch from purchase history / bookkeeping integration
    return [];
  }
}

export const materialPricingService = new MaterialPricingService();