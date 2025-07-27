import { db } from './db';
import { quotes, materialCosts, drawings } from '../shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

export interface HistoricalQuoteData {
  id: number;
  projectComplexity: string;
  materialType: string;
  actualLaborHours: number;
  estimatedLaborHours: number;
  actualMaterialCost: number;
  estimatedMaterialCost: number;
  projectWeight: number;
  weldingType: string;
  accuracy: number;
  completionDate: Date;
}

export interface MLPrediction {
  predictedLaborHours: number;
  confidence: number;
  accuracyScore: number;
  factors: {
    complexity: number;
    material: number;
    welding: number;
    historical: number;
  };
  recommendations: string[];
}

export interface WeldingStandard {
  code: string;
  description: string;
  laborMultiplier: number;
  qualityRequirements: string[];
  applicableFor: string[];
}

export interface RegulatoryCompliance {
  buildingCode: string;
  seismicRequirements: boolean;
  windLoadRequirements: boolean;
  fireRating: string;
  inspectionRequirements: string[];
  additionalCosts: number;
}

// Welding standards database based on AWS D1.1 and other codes
const WELDING_STANDARDS: WeldingStandard[] = [
  {
    code: 'AWS D1.1',
    description: 'Structural Welding Code - Steel',
    laborMultiplier: 1.2,
    qualityRequirements: ['Visual inspection', 'UT testing for critical joints'],
    applicableFor: ['structural steel', 'buildings', 'bridges']
  },
  {
    code: 'AWS D1.3',
    description: 'Structural Welding Code - Sheet Steel',
    laborMultiplier: 1.15,
    qualityRequirements: ['Visual inspection', 'Bend tests'],
    applicableFor: ['sheet metal', 'light gauge steel']
  },
  {
    code: 'AWS D1.5',
    description: 'Bridge Welding Code',
    laborMultiplier: 1.5,
    qualityRequirements: ['RT/UT testing', 'Fracture critical inspections'],
    applicableFor: ['bridges', 'heavy structural']
  },
  {
    code: 'ASME IX',
    description: 'Boiler and Pressure Vessel Code',
    laborMultiplier: 1.8,
    qualityRequirements: ['RT testing', 'Pressure testing', 'PQR qualification'],
    applicableFor: ['pressure vessels', 'piping', 'boilers']
  }
];

export class MLQuoteService {
  // Train model based on historical company data
  async trainAccuracyModel(userId: number): Promise<void> {
    const historicalData = await this.getHistoricalQuoteData(userId);
    
    if (historicalData.length < 10) {
      throw new Error('Insufficient historical data for training (minimum 10 quotes required)');
    }

    // Simple ML algorithm: weighted moving average with feature extraction
    const model = this.calculateAccuracyWeights(historicalData);
    
    // Store model parameters in database or cache
    await this.storeModelParameters(userId, model);
  }

  // Predict labor hours using ML based on historical performance
  async predictLaborHours(
    userId: number,
    projectData: {
      complexity: string;
      materialType: string;
      weight: number;
      weldingType: string;
      dimensions: any[];
      location: string;
    }
  ): Promise<MLPrediction> {
    const historicalData = await this.getHistoricalQuoteData(userId);
    const modelParams = await this.getModelParameters(userId);
    
    // Feature extraction
    const features = this.extractFeatures(projectData);
    
    // Find similar historical projects
    const similarProjects = this.findSimilarProjects(historicalData, features);
    
    // Apply welding standards
    const weldingStandard = this.getWeldingStandard(projectData.weldingType, projectData.materialType);
    
    // Regulatory compliance adjustments
    const compliance = await this.getRegulatoryCodes(projectData.location);
    
    // Weighted prediction algorithm
    const basePrediction = this.calculateBasePrediction(similarProjects, features);
    const weldingAdjustment = basePrediction * weldingStandard.laborMultiplier;
    const complianceAdjustment = weldingAdjustment * (1 + compliance.additionalCosts);
    
    // Calculate confidence based on similarity and data quality
    const confidence = this.calculateConfidence(similarProjects, historicalData.length);
    
    // Generate accuracy score based on past performance
    const accuracyScore = this.calculateAccuracyScore(modelParams, features);
    
    return {
      predictedLaborHours: complianceAdjustment,
      confidence,
      accuracyScore,
      factors: {
        complexity: this.getComplexityFactor(projectData.complexity),
        material: this.getMaterialFactor(projectData.materialType),
        welding: weldingStandard.laborMultiplier,
        historical: modelParams?.historicalAccuracy || 0.85
      },
      recommendations: this.generateRecommendations(projectData, weldingStandard, compliance)
    };
  }

  // Get regulatory codes and compliance requirements based on location
  async getRegulatoryCodes(location: string): Promise<RegulatoryCompliance> {
    const locationData = this.parseLocation(location);
    
    // This would integrate with building code APIs
    // For now, using rule-based approach
    
    const compliance: RegulatoryCompliance = {
      buildingCode: this.getBuildingCode(locationData.state),
      seismicRequirements: this.requiresSeismic(locationData.state),
      windLoadRequirements: this.requiresWindLoad(locationData.state),
      fireRating: this.getFireRating(locationData.type),
      inspectionRequirements: [],
      additionalCosts: 0
    };

    // Calculate additional costs for compliance
    if (compliance.seismicRequirements) compliance.additionalCosts += 0.15;
    if (compliance.windLoadRequirements) compliance.additionalCosts += 0.10;
    
    compliance.inspectionRequirements = this.getInspectionRequirements(compliance);
    
    return compliance;
  }

  // Get appropriate welding standard based on project requirements
  private getWeldingStandard(weldingType: string, materialType: string): WeldingStandard {
    const applicable = WELDING_STANDARDS.filter(standard => 
      standard.applicableFor.some(app => 
        materialType.toLowerCase().includes(app) || 
        weldingType.toLowerCase().includes(app)
      )
    );
    
    return applicable[0] || WELDING_STANDARDS[0]; // Default to AWS D1.1
  }

  // Extract features for ML model
  private extractFeatures(projectData: any) {
    return {
      complexityScore: this.getComplexityScore(projectData.complexity),
      materialDensity: this.getMaterialDensity(projectData.materialType),
      weightCategory: this.categorizeWeight(projectData.weight),
      dimensionComplexity: this.calculateDimensionComplexity(projectData.dimensions),
      weldingComplexity: this.getWeldingComplexity(projectData.weldingType)
    };
  }

  // Find historically similar projects for training
  private findSimilarProjects(historicalData: HistoricalQuoteData[], features: any): HistoricalQuoteData[] {
    return historicalData
      .map(project => ({
        ...project,
        similarity: this.calculateSimilarity(project, features)
      }))
      .filter(project => project.similarity > 0.7)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  // Calculate similarity score between projects
  private calculateSimilarity(project: HistoricalQuoteData, features: any): number {
    const complexityMatch = this.getComplexityScore(project.projectComplexity) === features.complexityScore ? 1 : 0.5;
    const materialMatch = project.materialType === features.materialType ? 1 : 0.3;
    const weightMatch = this.categorizeWeight(project.projectWeight) === features.weightCategory ? 1 : 0.7;
    
    return (complexityMatch + materialMatch + weightMatch) / 3;
  }

  // Calculate base prediction from similar projects
  private calculateBasePrediction(similarProjects: any[], features: any): number {
    if (similarProjects.length === 0) {
      return this.getDefaultEstimate(features);
    }

    const weightedAverage = similarProjects.reduce((sum, project, index) => {
      const weight = 1 / (index + 1); // More weight to more similar projects
      return sum + (project.actualLaborHours * weight);
    }, 0);

    const totalWeight = similarProjects.reduce((sum, _, index) => sum + 1 / (index + 1), 0);
    
    return weightedAverage / totalWeight;
  }

  // Helper methods
  private getComplexityScore(complexity: string): number {
    const scores = { simple: 1, moderate: 2, complex: 3, very_complex: 4 };
    return scores[complexity] || 2;
  }

  private getComplexityFactor(complexity: string): number {
    const factors = { simple: 0.8, moderate: 1.0, complex: 1.4, very_complex: 1.8 };
    return factors[complexity] || 1.0;
  }

  private getMaterialDensity(materialType: string): number {
    const densities = { steel: 7.85, aluminum: 2.70, stainless: 8.0 };
    return densities[materialType.toLowerCase()] || 7.85;
  }

  private getMaterialFactor(materialType: string): number {
    const factors = { steel: 1.0, aluminum: 1.2, stainless: 1.5 };
    return factors[materialType.toLowerCase()] || 1.0;
  }

  private categorizeWeight(weight: number): string {
    if (weight < 100) return 'light';
    if (weight < 1000) return 'medium';
    if (weight < 5000) return 'heavy';
    return 'very_heavy';
  }

  private calculateDimensionComplexity(dimensions: any[]): number {
    if (!dimensions || dimensions.length === 0) return 1;
    
    const uniqueTypes = new Set(dimensions.map(d => d.type)).size;
    const avgConfidence = dimensions.reduce((sum, d) => sum + (d.confidence || 0.5), 0) / dimensions.length;
    
    return uniqueTypes * (2 - avgConfidence); // More types and lower confidence = higher complexity
  }

  private getWeldingComplexity(weldingType: string): number {
    const complexity = {
      fillet: 1.0,
      groove: 1.3,
      plug: 1.1,
      spot: 0.9,
      seam: 1.2,
      back: 1.4,
      surfacing: 1.6
    };
    return complexity[weldingType] || 1.0;
  }

  private calculateConfidence(similarProjects: any[], totalHistoricalData: number): number {
    const similarityScore = similarProjects.length > 0 ? 0.8 : 0.4;
    const dataQuantityScore = Math.min(totalHistoricalData / 50, 1) * 0.2;
    return similarityScore + dataQuantityScore;
  }

  private calculateAccuracyScore(modelParams: any, features: any): number {
    if (!modelParams) return 0.75; // Default accuracy
    
    return modelParams.baseAccuracy * modelParams.complexityWeight[features.complexityScore] || 0.75;
  }

  private generateRecommendations(projectData: any, weldingStandard: WeldingStandard, compliance: RegulatoryCompliance): string[] {
    const recommendations = [];
    
    if (weldingStandard.code === 'AWS D1.5') {
      recommendations.push('Bridge code requirements: Additional welding certifications required');
    }
    
    if (compliance.seismicRequirements) {
      recommendations.push('Seismic zone: Consider special moment frame connections');
    }
    
    if (projectData.complexity === 'very_complex') {
      recommendations.push('High complexity project: Add 20% contingency for unforeseen issues');
    }
    
    recommendations.push(...weldingStandard.qualityRequirements.map(req => `Quality: ${req}`));
    recommendations.push(...compliance.inspectionRequirements);
    
    return recommendations;
  }

  // Database operations
  private async getHistoricalQuoteData(userId: number): Promise<HistoricalQuoteData[]> {
    // This would fetch from quotes table with actual vs estimated data
    const historicalQuotes = await db
      .select()
      .from(quotes)
      .where(eq(quotes.userId, userId))
      .orderBy(desc(quotes.createdAt))
      .limit(100);

    return historicalQuotes.map(quote => ({
      id: quote.id,
      projectComplexity: quote.projectComplexity || 'moderate',
      materialType: quote.materialType || 'steel',
      actualLaborHours: quote.actualLaborHours || quote.laborHours,
      estimatedLaborHours: quote.laborHours,
      actualMaterialCost: quote.actualMaterialCost || quote.materialCost,
      estimatedMaterialCost: quote.materialCost,
      projectWeight: quote.totalWeight || 1000,
      weldingType: quote.weldingType || 'fillet',
      accuracy: this.calculateQuoteAccuracy(quote),
      completionDate: quote.updatedAt
    }));
  }

  private calculateQuoteAccuracy(quote: any): number {
    if (!quote.actualLaborHours || !quote.actualMaterialCost) return 0.85; // Default
    
    const laborAccuracy = 1 - Math.abs(quote.actualLaborHours - quote.laborHours) / quote.laborHours;
    const materialAccuracy = 1 - Math.abs(quote.actualMaterialCost - quote.materialCost) / quote.materialCost;
    
    return (laborAccuracy + materialAccuracy) / 2;
  }

  private calculateAccuracyWeights(historicalData: HistoricalQuoteData[]): any {
    const avgAccuracy = historicalData.reduce((sum, quote) => sum + quote.accuracy, 0) / historicalData.length;
    
    return {
      baseAccuracy: avgAccuracy,
      historicalAccuracy: avgAccuracy,
      complexityWeight: {
        1: avgAccuracy * 1.1, // Simple projects are usually more accurate
        2: avgAccuracy,
        3: avgAccuracy * 0.9,
        4: avgAccuracy * 0.8
      }
    };
  }

  private async storeModelParameters(userId: number, model: any): Promise<void> {
    // Store in database or cache - simplified for now
    console.log(`Storing model parameters for user ${userId}:`, model);
  }

  private async getModelParameters(userId: number): Promise<any> {
    // Retrieve from database or cache - simplified for now
    return {
      baseAccuracy: 0.85,
      historicalAccuracy: 0.85,
      complexityWeight: { 1: 0.9, 2: 0.85, 3: 0.8, 4: 0.75 }
    };
  }

  private getDefaultEstimate(features: any): number {
    // Fallback estimation when no historical data available
    const baseHours = features.complexityScore * features.weightCategory === 'light' ? 20 : 
                     features.weightCategory === 'medium' ? 40 :
                     features.weightCategory === 'heavy' ? 80 : 120;
    
    return baseHours * features.materialDensity / 7.85; // Normalize to steel baseline
  }

  // Location and regulatory helpers
  private parseLocation(location: string): any {
    // Parse location string into components
    return {
      state: location.split(',')[1]?.trim() || 'CA',
      type: 'commercial' // Would be determined from project data
    };
  }

  private getBuildingCode(state: string): string {
    const codes = {
      'CA': 'CBC (California Building Code)',
      'NY': 'NYC Building Code',
      'TX': 'TBC (Texas Building Code)',
      'FL': 'FBC (Florida Building Code)'
    };
    return codes[state] || 'IBC (International Building Code)';
  }

  private requiresSeismic(state: string): boolean {
    const seismicStates = ['CA', 'OR', 'WA', 'NV', 'AK'];
    return seismicStates.includes(state);
  }

  private requiresWindLoad(state: string): boolean {
    const windStates = ['FL', 'TX', 'LA', 'MS', 'AL', 'SC', 'NC'];
    return windStates.includes(state);
  }

  private getFireRating(projectType: string): string {
    const ratings = {
      commercial: '2-hour',
      industrial: '3-hour',
      residential: '1-hour'
    };
    return ratings[projectType] || '2-hour';
  }

  private getInspectionRequirements(compliance: RegulatoryCompliance): string[] {
    const requirements = ['Visual welding inspection'];
    
    if (compliance.seismicRequirements) {
      requirements.push('Special seismic inspection');
    }
    
    if (compliance.windLoadRequirements) {
      requirements.push('High-wind load certification');
    }
    
    return requirements;
  }
}

export const mlService = new MLQuoteService();