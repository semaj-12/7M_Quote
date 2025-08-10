import { apiRequest } from "./queryClient";

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: string;
}

export interface AddressComponents {
  streetNumber?: string;
  streetName?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  county?: string;
  formattedAddress: string;
}

export interface SteelHubDistance {
  hubName: string;
  city: string;
  state: string;
  distance: number;
  transportCostMultiplier: number;
}

export interface GeoLocationResult {
  coordinates: GeoCoordinates;
  address: AddressComponents;
  timezone: string;
  steelHubDistances: SteelHubDistance[];
  regionalPricingZone: string;
}

export interface GeocodeValidationResult {
  [provider: string]: boolean;
}

export class GeoClient {
  async geocodeAddress(address: string): Promise<GeoLocationResult> {
    const result = await apiRequest('/api/geocode', {
      method: 'POST',
      body: JSON.stringify({ address }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return result;
  }

  async validateApiKeys(): Promise<GeocodeValidationResult> {
    const result = await apiRequest('/api/geocode/validate-keys', {
      method: 'GET'
    });
    
    return result;
  }

  formatAddress(components: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  }): string {
    const { street, city, state, zipCode, country = 'US' } = components;
    return `${street}, ${city}, ${state} ${zipCode}, ${country}`;
  }

  calculateAccuracyScore(result: GeoLocationResult): {
    score: number;
    level: 'excellent' | 'good' | 'fair' | 'poor';
    description: string;
  } {
    const accuracy = result.coordinates.accuracy;
    
    if (accuracy >= 0.95) {
      return {
        score: Math.round(accuracy * 100),
        level: 'excellent',
        description: 'Highly accurate GPS coordinates - suitable for precise material pricing'
      };
    } else if (accuracy >= 0.90) {
      return {
        score: Math.round(accuracy * 100),
        level: 'good',
        description: 'Good accuracy - reliable for material pricing calculations'
      };
    } else if (accuracy >= 0.80) {
      return {
        score: Math.round(accuracy * 100),
        level: 'fair',
        description: 'Fair accuracy - may affect precision of material pricing'
      };
    } else {
      return {
        score: Math.round(accuracy * 100),
        level: 'poor',
        description: 'Low accuracy - recommend manual verification for critical pricing'
      };
    }
  }

  getClosestSteelHub(result: GeoLocationResult): SteelHubDistance {
    return result.steelHubDistances[0];
  }

  getRegionalPricingImpact(result: GeoLocationResult): {
    zone: string;
    closestHub: string;
    transportImpact: 'minimal' | 'moderate' | 'significant' | 'high';
    costMultiplier: number;
  } {
    const closestHub = this.getClosestSteelHub(result);
    const distance = closestHub.distance;
    const multiplier = closestHub.transportCostMultiplier;
    
    let impact: 'minimal' | 'moderate' | 'significant' | 'high';
    
    if (distance <= 100) {
      impact = 'minimal';
    } else if (distance <= 300) {
      impact = 'moderate';
    } else if (distance <= 600) {
      impact = 'significant';
    } else {
      impact = 'high';
    }
    
    return {
      zone: result.regionalPricingZone,
      closestHub: `${closestHub.hubName} (${distance} miles)`,
      transportImpact: impact,
      costMultiplier: multiplier
    };
  }

  estimateDeliveryTime(result: GeoLocationResult, urgency: 'standard' | 'rush' | 'emergency'): {
    days: number;
    description: string;
  } {
    const closestHub = this.getClosestSteelHub(result);
    const distance = closestHub.distance;
    
    let baseDays: number;
    
    if (distance <= 150) {
      baseDays = 2;
    } else if (distance <= 400) {
      baseDays = 3;
    } else if (distance <= 800) {
      baseDays = 5;
    } else {
      baseDays = 7;
    }
    
    const urgencyMultiplier = {
      'standard': 1.0,
      'rush': 0.7,
      'emergency': 0.5
    };
    
    const deliveryDays = Math.max(1, Math.round(baseDays * urgencyMultiplier[urgency]));
    
    return {
      days: deliveryDays,
      description: `${deliveryDays} business days from ${closestHub.hubName} (${urgency} delivery)`
    };
  }
}

export const geoClient = new GeoClient();