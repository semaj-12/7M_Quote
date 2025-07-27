import axios from 'axios';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number; // confidence score 0-1
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

export interface GeoLocationResult {
  coordinates: GeoCoordinates;
  address: AddressComponents;
  timezone: string;
  steelHubDistances: SteelHubDistance[];
  regionalPricingZone: string;
}

export interface SteelHubDistance {
  hubName: string;
  city: string;
  state: string;
  distance: number; // miles
  transportCostMultiplier: number;
}

export interface GeocodeProvider {
  name: string;
  apiKey?: string;
  endpoint: string;
  rateLimit: number; // requests per minute
  accuracy: number; // typical accuracy score
}

export class GeoLocationService {
  private providers: GeocodeProvider[] = [
    {
      name: 'google',
      apiKey: process.env.GOOGLE_MAPS_API_KEY,
      endpoint: 'https://maps.googleapis.com/maps/api/geocode/json',
      rateLimit: 50,
      accuracy: 0.98
    },
    {
      name: 'mapbox',
      apiKey: process.env.MAPBOX_API_KEY,
      endpoint: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
      rateLimit: 600,
      accuracy: 0.95
    },
    {
      name: 'opencage',
      apiKey: process.env.OPENCAGE_API_KEY,
      endpoint: 'https://api.opencagedata.com/geocode/v1/json',
      rateLimit: 2500,
      accuracy: 0.92
    },
    {
      name: 'positionstack',
      apiKey: process.env.POSITIONSTACK_API_KEY,
      endpoint: 'http://api.positionstack.com/v1/forward',
      rateLimit: 25000,
      accuracy: 0.90
    }
  ];

  private majorSteelHubs: SteelHubDistance[] = [
    { hubName: 'Chicago Hub', city: 'Chicago', state: 'IL', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Pittsburgh Hub', city: 'Pittsburgh', state: 'PA', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Detroit Hub', city: 'Detroit', state: 'MI', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Houston Hub', city: 'Houston', state: 'TX', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Los Angeles Hub', city: 'Los Angeles', state: 'CA', distance: 0, transportCostMultiplier: 1.1 },
    { hubName: 'Atlanta Hub', city: 'Atlanta', state: 'GA', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Cleveland Hub', city: 'Cleveland', state: 'OH', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Birmingham Hub', city: 'Birmingham', state: 'AL', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Buffalo Hub', city: 'Buffalo', state: 'NY', distance: 0, transportCostMultiplier: 1.0 },
    { hubName: 'Seattle Hub', city: 'Seattle', state: 'WA', distance: 0, transportCostMultiplier: 1.15 }
  ];

  async geocodeAddress(address: string): Promise<GeoLocationResult> {
    console.log(`Geocoding address: ${address}`);
    
    const results: GeoCoordinates[] = [];
    
    // Try multiple providers for maximum accuracy
    for (const provider of this.providers) {
      if (!provider.apiKey) continue;
      
      try {
        const result = await this.geocodeWithProvider(provider, address);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`Geocoding failed with ${provider.name}:`, error);
      }
    }
    
    if (results.length === 0) {
      // Fallback to mock geocoding for development
      return this.getMockGeoLocation(address);
    }
    
    // Use weighted average of all results for maximum accuracy
    const bestResult = this.getBestGeoResult(results);
    const addressComponents = await this.reverseGeocode(bestResult);
    const timezone = await this.getTimezone(bestResult);
    const steelHubDistances = this.calculateSteelHubDistances(bestResult);
    const regionalPricingZone = this.determineRegionalPricingZone(addressComponents, steelHubDistances);
    
    return {
      coordinates: bestResult,
      address: addressComponents,
      timezone,
      steelHubDistances,
      regionalPricingZone
    };
  }

  private async geocodeWithProvider(provider: GeocodeProvider, address: string): Promise<GeoCoordinates | null> {
    let response;
    
    switch (provider.name) {
      case 'google':
        response = await axios.get(provider.endpoint, {
          params: {
            address: address,
            key: provider.apiKey
          }
        });
        
        if (response.data.status === 'OK' && response.data.results.length > 0) {
          const result = response.data.results[0];
          return {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng,
            accuracy: provider.accuracy * (result.geometry.location_type === 'ROOFTOP' ? 1.0 : 0.9),
            source: provider.name
          };
        }
        break;
        
      case 'mapbox':
        response = await axios.get(`${provider.endpoint}/${encodeURIComponent(address)}.json`, {
          params: {
            access_token: provider.apiKey,
            limit: 1
          }
        });
        
        if (response.data.features && response.data.features.length > 0) {
          const feature = response.data.features[0];
          return {
            latitude: feature.center[1],
            longitude: feature.center[0],
            accuracy: provider.accuracy * feature.relevance,
            source: provider.name
          };
        }
        break;
        
      case 'opencage':
        response = await axios.get(provider.endpoint, {
          params: {
            q: address,
            key: provider.apiKey,
            limit: 1
          }
        });
        
        if (response.data.results && response.data.results.length > 0) {
          const result = response.data.results[0];
          return {
            latitude: result.geometry.lat,
            longitude: result.geometry.lng,
            accuracy: provider.accuracy * result.confidence / 10,
            source: provider.name
          };
        }
        break;
        
      case 'positionstack':
        response = await axios.get(provider.endpoint, {
          params: {
            access_key: provider.apiKey,
            query: address,
            limit: 1
          }
        });
        
        if (response.data.data && response.data.data.length > 0) {
          const result = response.data.data[0];
          return {
            latitude: result.latitude,
            longitude: result.longitude,
            accuracy: provider.accuracy * result.confidence / 10,
            source: provider.name
          };
        }
        break;
    }
    
    return null;
  }

  private getBestGeoResult(results: GeoCoordinates[]): GeoCoordinates {
    if (results.length === 1) return results[0];
    
    // Weight by accuracy and calculate average
    const totalWeight = results.reduce((sum, r) => sum + r.accuracy, 0);
    const weightedLat = results.reduce((sum, r) => sum + (r.latitude * r.accuracy), 0) / totalWeight;
    const weightedLng = results.reduce((sum, r) => sum + (r.longitude * r.accuracy), 0) / totalWeight;
    const avgAccuracy = totalWeight / results.length;
    
    return {
      latitude: weightedLat,
      longitude: weightedLng,
      accuracy: Math.min(avgAccuracy, 0.99), // Cap at 99%
      source: 'composite'
    };
  }

  private async reverseGeocode(coordinates: GeoCoordinates): Promise<AddressComponents> {
    // Use Google Maps for reverse geocoding if available
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            latlng: `${coordinates.latitude},${coordinates.longitude}`,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        if (response.data.status === 'OK' && response.data.results.length > 0) {
          return this.parseGoogleAddressComponents(response.data.results[0]);
        }
      } catch (error) {
        console.warn('Reverse geocoding failed:', error);
      }
    }
    
    // Fallback mock address
    return {
      city: 'Unknown City',
      state: 'Unknown State',
      zipCode: '00000',
      country: 'US',
      formattedAddress: 'Address coordinates processed'
    };
  }

  private parseGoogleAddressComponents(result: any): AddressComponents {
    const components: any = {};
    
    result.address_components.forEach((component: any) => {
      const types = component.types;
      
      if (types.includes('street_number')) {
        components.streetNumber = component.long_name;
      } else if (types.includes('route')) {
        components.streetName = component.long_name;
      } else if (types.includes('locality')) {
        components.city = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        components.state = component.short_name;
      } else if (types.includes('postal_code')) {
        components.zipCode = component.long_name;
      } else if (types.includes('country')) {
        components.country = component.short_name;
      } else if (types.includes('administrative_area_level_2')) {
        components.county = component.long_name;
      }
    });
    
    return {
      streetNumber: components.streetNumber,
      streetName: components.streetName,
      city: components.city || 'Unknown City',
      state: components.state || 'Unknown State',
      zipCode: components.zipCode || '00000',
      country: components.country || 'US',
      county: components.county,
      formattedAddress: result.formatted_address
    };
  }

  private async getTimezone(coordinates: GeoCoordinates): Promise<string> {
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const response = await axios.get('https://maps.googleapis.com/maps/api/timezone/json', {
          params: {
            location: `${coordinates.latitude},${coordinates.longitude}`,
            timestamp: timestamp,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        if (response.data.status === 'OK') {
          return response.data.timeZoneId;
        }
      } catch (error) {
        console.warn('Timezone lookup failed:', error);
      }
    }
    
    // Fallback to basic US timezone estimation
    if (coordinates.longitude > -87) return 'America/New_York';
    if (coordinates.longitude > -101) return 'America/Chicago';
    if (coordinates.longitude > -115) return 'America/Denver';
    return 'America/Los_Angeles';
  }

  private calculateSteelHubDistances(coordinates: GeoCoordinates): SteelHubDistance[] {
    return this.majorSteelHubs.map(hub => {
      // Get hub coordinates (these would be stored in a database in production)
      const hubCoords = this.getHubCoordinates(hub.city, hub.state);
      const distance = this.calculateDistance(
        coordinates.latitude, coordinates.longitude,
        hubCoords.lat, hubCoords.lng
      );
      
      return {
        ...hub,
        distance: Math.round(distance),
        transportCostMultiplier: this.calculateTransportMultiplier(distance, hub.transportCostMultiplier)
      };
    }).sort((a, b) => a.distance - b.distance);
  }

  private getHubCoordinates(city: string, state: string): { lat: number; lng: number } {
    // Major steel hub coordinates
    const hubCoords: Record<string, { lat: number; lng: number }> = {
      'Chicago, IL': { lat: 41.8781, lng: -87.6298 },
      'Pittsburgh, PA': { lat: 40.4406, lng: -79.9959 },
      'Detroit, MI': { lat: 42.3314, lng: -83.0458 },
      'Houston, TX': { lat: 29.7604, lng: -95.3698 },
      'Los Angeles, CA': { lat: 34.0522, lng: -118.2437 },
      'Atlanta, GA': { lat: 33.7490, lng: -84.3880 },
      'Cleveland, OH': { lat: 41.4993, lng: -81.6944 },
      'Birmingham, AL': { lat: 33.5186, lng: -86.8104 },
      'Buffalo, NY': { lat: 42.8864, lng: -78.8784 },
      'Seattle, WA': { lat: 47.6062, lng: -122.3321 }
    };
    
    return hubCoords[`${city}, ${state}`] || { lat: 39.8283, lng: -98.5795 }; // Geographic center of US
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

  private calculateTransportMultiplier(distance: number, baseMultiplier: number): number {
    if (distance <= 50) return baseMultiplier;
    if (distance <= 150) return baseMultiplier + 0.02;
    if (distance <= 300) return baseMultiplier + 0.05;
    if (distance <= 500) return baseMultiplier + 0.08;
    if (distance <= 1000) return baseMultiplier + 0.12;
    return baseMultiplier + 0.20;
  }

  private determineRegionalPricingZone(address: AddressComponents, steelHubs: SteelHubDistance[]): string {
    const closestHub = steelHubs[0];
    const state = address.state;
    
    // Define regional pricing zones based on steel production regions
    const zones: Record<string, string> = {
      'IL': 'Great Lakes',
      'IN': 'Great Lakes', 
      'OH': 'Great Lakes',
      'MI': 'Great Lakes',
      'PA': 'Northeast',
      'NY': 'Northeast',
      'NJ': 'Northeast',
      'CT': 'Northeast',
      'MA': 'Northeast',
      'TX': 'South Central',
      'OK': 'South Central',
      'LA': 'South Central',
      'AR': 'South Central',
      'CA': 'West Coast',
      'OR': 'West Coast',
      'WA': 'West Coast',
      'AL': 'Southeast',
      'GA': 'Southeast',
      'FL': 'Southeast',
      'SC': 'Southeast',
      'NC': 'Southeast'
    };
    
    const zone = zones[state] || 'Mountain/Plains';
    
    // Adjust zone based on distance to nearest hub
    if (closestHub.distance > 300) {
      return `${zone} - Remote`;
    } else if (closestHub.distance < 100) {
      return `${zone} - Hub Adjacent`;
    }
    
    return zone;
  }

  private getMockGeoLocation(address: string): GeoLocationResult {
    // Mock coordinates for development (Chicago area)
    const mockCoordinates: GeoCoordinates = {
      latitude: 41.8781,
      longitude: -87.6298,
      accuracy: 0.85,
      source: 'mock_development'
    };
    
    const mockAddress: AddressComponents = {
      streetNumber: '123',
      streetName: 'Main St',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'US',
      county: 'Cook County',
      formattedAddress: '123 Main St, Chicago, IL 60601, USA'
    };
    
    return {
      coordinates: mockCoordinates,
      address: mockAddress,
      timezone: 'America/Chicago',
      steelHubDistances: this.calculateSteelHubDistances(mockCoordinates),
      regionalPricingZone: 'Great Lakes - Hub Adjacent'
    };
  }

  async validateApiKeys(): Promise<{ [provider: string]: boolean }> {
    const status: { [provider: string]: boolean } = {};
    
    for (const provider of this.providers) {
      if (!provider.apiKey) {
        status[provider.name] = false;
        continue;
      }
      
      try {
        // Test with a known address
        const result = await this.geocodeWithProvider(provider, '1600 Amphitheatre Parkway, Mountain View, CA');
        status[provider.name] = result !== null;
      } catch (error) {
        status[provider.name] = false;
      }
    }
    
    return status;
  }
}

export const geoLocationService = new GeoLocationService();