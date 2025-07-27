import { bookkeepingService, type HistoricalProjectData } from './bookkeeping-integration';
import { mlService, type MLPrediction } from './ml-service';
import { materialPricingService, type RealTimePricing } from './material-pricing-service';
import { analyzeBlueprintWithAI, type BlueprintAnalysis, type FabricationSpecification } from './ai-service';
import { storage } from './storage';

// Enhanced interfaces for comprehensive ML processing
export interface HumanLaborVariability {
  averageEfficiency: number; // 0.5 to 2.0 (50% to 200% of baseline)
  skillLevelDistribution: {
    junior: { percentage: number; efficiency: number; hourlyRate: number };
    intermediate: { percentage: number; efficiency: number; hourlyRate: number };
    senior: { percentage: number; efficiency: number; hourlyRate: number };
    certified: { percentage: number; efficiency: number; hourlyRate: number };
  };
  qualityVariation: {
    averageReworkRate: number; // 0.02 to 0.15 (2% to 15% rework)
    inspectionFailureRate: number;
    materialWasteRate: number;
  };
  productivityFactors: {
    timeOfDay: Record<string, number>;
    seasonality: Record<string, number>;
    projectType: Record<string, number>;
    teamSize: Record<string, number>;
  };
}

export interface MultiMaterialQuoteAnalysis {
  materialBreakdown: {
    primary: {
      type: string;
      grade: string;
      quantity: number;
      pricePerUnit: number;
      totalCost: number;
    };
    secondary: Array<{
      type: string;
      grade: string;
      quantity: number;
      pricePerUnit: number;
      totalCost: number;
      compatibility: string;
    }>;
    transitions: Array<{
      from: string;
      to: string;
      process: string;
      additionalCost: number;
      laborMultiplier: number;
    }>;
  };
  fabricationComplexity: {
    totalProcesses: number;
    criticalProcesses: string[];
    regulatoryRequirements: string[];
    inspectionPoints: number;
    skillLevelsRequired: string[];
  };
  laborAnalysis: {
    baseHours: number;
    adjustedHours: number;
    humanVariabilityFactor: number;
    skillLevelBreakdown: Record<string, number>;
    contingencyHours: number;
  };
  riskAssessment: {
    technicalRisk: number;
    materialRisk: number;
    laborRisk: number;
    scheduleRisk: number;
    overallRisk: number;
  };
}

export interface ComprehensiveQuoteEstimate {
  projectId: string;
  materialCosts: {
    breakdown: MultiMaterialQuoteAnalysis['materialBreakdown'];
    totalCost: number;
    contingency: number;
  };
  laborCosts: {
    breakdown: MultiMaterialQuoteAnalysis['laborAnalysis'];
    totalHours: number;
    totalCost: number;
    contingency: number;
  };
  regulatoryCosts: {
    permits: number;
    inspections: number;
    certifications: number;
    compliance: number;
  };
  overheadCosts: {
    equipment: number;
    utilities: number;
    insurance: number;
    administrative: number;
  };
  totalEstimate: number;
  confidenceScore: number;
  riskAdjustment: number;
  deliveryTimeline: {
    fabrication: number;
    inspection: number;
    delivery: number;
    total: number;
  };
}

export class ComprehensiveMLService {
  private historicalDataCache: Map<number, HistoricalProjectData[]> = new Map();
  private laborVariabilityCache: Map<number, HumanLaborVariability> = new Map();

  // Main comprehensive analysis function
  async analyzeProjectComprehensively(
    userId: number,
    pdfPath: string,
    projectLocation: string,
    urgency: 'standard' | 'expedited' | 'emergency' = 'standard'
  ): Promise<ComprehensiveQuoteEstimate> {
    try {
      // Step 1: AI analysis of PDF drawing
      const blueprintAnalysis = await analyzeBlueprintWithAI(pdfPath);
      
      // Step 2: Get historical data from bookkeeping systems
      const historicalData = await this.getHistoricalData(userId);
      
      // Step 3: Analyze human labor variability
      const laborVariability = await this.analyzeLaborVariability(userId, historicalData);
      
      // Step 4: Multi-material analysis
      const materialAnalysis = await this.analyzeMultiMaterialRequirements(
        blueprintAnalysis, projectLocation
      );
      
      // Step 5: Fabrication specification analysis
      const fabricationAnalysis = await this.analyzeFabricationSpecifications(
        blueprintAnalysis, projectLocation
      );
      
      // Step 6: Generate comprehensive quote
      const quoteEstimate = await this.generateComprehensiveQuote(
        blueprintAnalysis,
        materialAnalysis,
        fabricationAnalysis,
        laborVariability,
        urgency
      );
      
      return quoteEstimate;
      
    } catch (error) {
      console.error('Comprehensive project analysis failed:', error);
      throw new Error('Failed to analyze project comprehensively');
    }
  }

  // Analyze multiple materials and their interactions
  private async analyzeMultiMaterialRequirements(
    blueprint: BlueprintAnalysis,
    location: string
  ): Promise<MultiMaterialQuoteAnalysis['materialBreakdown']> {
    const materialBreakdown = {
      primary: { type: '', grade: '', quantity: 0, pricePerUnit: 0, totalCost: 0 },
      secondary: [] as any[],
      transitions: [] as any[]
    };

    // Analyze each material specification
    for (const material of blueprint.materials) {
      const pricing = await materialPricingService.getRealTimePricing(material.type, location);
      
      if (materialBreakdown.primary.type === '') {
        // Set as primary material
        materialBreakdown.primary = {
          type: material.type,
          grade: material.grade,
          quantity: this.calculateMaterialQuantity(material, blueprint),
          pricePerUnit: pricing[0]?.pricePerPound || 0,
          totalCost: 0
        };
      } else {
        // Add as secondary material
        materialBreakdown.secondary.push({
          type: material.type,
          grade: material.grade,
          quantity: this.calculateMaterialQuantity(material, blueprint),
          pricePerUnit: pricing[0]?.pricePerPound || 0,
          totalCost: 0,
          compatibility: this.assessMaterialCompatibility(materialBreakdown.primary.type, material.type)
        });
      }
    }

    // Analyze material transitions
    if (blueprint.multiMaterialAnalysis) {
      for (const multiMaterial of blueprint.multiMaterialAnalysis) {
        for (const transition of multiMaterial.materialTransitions) {
          materialBreakdown.transitions.push({
            from: transition.from,
            to: transition.to,
            process: transition.jointType,
            additionalCost: this.calculateTransitionCost(transition),
            laborMultiplier: this.getTransitionLaborMultiplier(transition)
          });
        }
      }
    }

    // Calculate total costs
    materialBreakdown.primary.totalCost = 
      materialBreakdown.primary.quantity * materialBreakdown.primary.pricePerUnit;
    
    materialBreakdown.secondary.forEach(material => {
      material.totalCost = material.quantity * material.pricePerUnit;
    });

    return materialBreakdown;
  }

  // Analyze fabrication specifications from blueprint
  private async analyzeFabricationSpecifications(
    blueprint: BlueprintAnalysis,
    location: string
  ): Promise<MultiMaterialQuoteAnalysis['fabricationComplexity']> {
    const fabricationComplexity = {
      totalProcesses: 0,
      criticalProcesses: [] as string[],
      regulatoryRequirements: [] as string[],
      inspectionPoints: 0,
      skillLevelsRequired: [] as string[]
    };

    // Analyze each fabrication specification
    if (blueprint.fabricationSpecs) {
      for (const spec of blueprint.fabricationSpecs) {
        fabricationComplexity.totalProcesses++;
        
        // Check if this is a critical process
        if (spec.quality === 'critical' || spec.quality === 'aerospace') {
          fabricationComplexity.criticalProcesses.push(spec.type);
        }
        
        // Add regulatory requirements
        if (spec.standard && !fabricationComplexity.regulatoryRequirements.includes(spec.standard)) {
          fabricationComplexity.regulatoryRequirements.push(spec.standard);
        }
        
        // Count inspection points
        fabricationComplexity.inspectionPoints += spec.inspectionRequirements.length;
        
        // Track skill levels required
        if (!fabricationComplexity.skillLevelsRequired.includes(spec.skillLevel)) {
          fabricationComplexity.skillLevelsRequired.push(spec.skillLevel);
        }
      }
    }

    // Add regulatory compliance from blueprint
    if (blueprint.regulatoryCompliance) {
      fabricationComplexity.regulatoryRequirements.push(...blueprint.regulatoryCompliance.codes);
    }

    return fabricationComplexity;
  }

  // Analyze human labor variability from historical data
  private async analyzeLaborVariability(
    userId: number,
    historicalData: HistoricalProjectData[]
  ): Promise<HumanLaborVariability> {
    if (this.laborVariabilityCache.has(userId)) {
      return this.laborVariabilityCache.get(userId)!;
    }

    const laborVariability: HumanLaborVariability = {
      averageEfficiency: 1.0,
      skillLevelDistribution: {
        junior: { percentage: 0.3, efficiency: 0.7, hourlyRate: 25 },
        intermediate: { percentage: 0.4, efficiency: 1.0, hourlyRate: 35 },
        senior: { percentage: 0.2, efficiency: 1.3, hourlyRate: 50 },
        certified: { percentage: 0.1, efficiency: 1.5, hourlyRate: 65 }
      },
      qualityVariation: {
        averageReworkRate: 0.08,
        inspectionFailureRate: 0.05,
        materialWasteRate: 0.03
      },
      productivityFactors: {
        timeOfDay: { morning: 1.1, afternoon: 1.0, evening: 0.9 },
        seasonality: { spring: 1.0, summer: 0.95, fall: 1.05, winter: 0.9 },
        projectType: { simple: 1.1, moderate: 1.0, complex: 0.85, very_complex: 0.7 },
        teamSize: { small: 1.0, medium: 1.1, large: 0.95 }
      }
    };

    // Analyze historical data to refine labor variability
    if (historicalData.length > 0) {
      const accuracyScores = historicalData.map(project => project.accuracy);
      const avgAccuracy = accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length;
      
      // Adjust efficiency based on historical accuracy
      laborVariability.averageEfficiency = Math.max(0.5, Math.min(2.0, avgAccuracy));
      
      // Calculate rework rates from historical data
      const actualVsBudgeted = historicalData.map(project => 
        project.actualCost / project.budgetedCost
      );
      const avgOverrun = actualVsBudgeted.reduce((a, b) => a + b, 0) / actualVsBudgeted.length;
      
      laborVariability.qualityVariation.averageReworkRate = Math.max(0.02, Math.min(0.15, avgOverrun - 1));
    }

    this.laborVariabilityCache.set(userId, laborVariability);
    return laborVariability;
  }

  // Generate comprehensive quote estimate
  private async generateComprehensiveQuote(
    blueprint: BlueprintAnalysis,
    materialAnalysis: MultiMaterialQuoteAnalysis['materialBreakdown'],
    fabricationAnalysis: MultiMaterialQuoteAnalysis['fabricationComplexity'],
    laborVariability: HumanLaborVariability,
    urgency: 'standard' | 'expedited' | 'emergency'
  ): Promise<ComprehensiveQuoteEstimate> {
    
    // Calculate material costs
    const materialCosts = this.calculateMaterialCosts(materialAnalysis);
    
    // Calculate labor costs with human variability
    const laborCosts = this.calculateLaborCosts(
      blueprint, fabricationAnalysis, laborVariability
    );
    
    // Calculate regulatory costs
    const regulatoryCosts = this.calculateRegulatoryCosts(fabricationAnalysis);
    
    // Calculate overhead costs
    const overheadCosts = this.calculateOverheadCosts(materialCosts.totalCost, laborCosts.totalCost);
    
    // Apply urgency multiplier
    const urgencyMultiplier = urgency === 'emergency' ? 1.5 : urgency === 'expedited' ? 1.25 : 1.0;
    
    const totalEstimate = (
      materialCosts.totalCost + 
      laborCosts.totalCost + 
      regulatoryCosts.permits + regulatoryCosts.inspections + regulatoryCosts.certifications + regulatoryCosts.compliance +
      overheadCosts.equipment + overheadCosts.utilities + overheadCosts.insurance + overheadCosts.administrative
    ) * urgencyMultiplier;

    return {
      projectId: `QF-${Date.now()}`,
      materialCosts,
      laborCosts,
      regulatoryCosts,
      overheadCosts,
      totalEstimate,
      confidenceScore: this.calculateConfidenceScore(blueprint, laborVariability),
      riskAdjustment: this.calculateRiskAdjustment(fabricationAnalysis, laborVariability),
      deliveryTimeline: this.calculateDeliveryTimeline(blueprint, fabricationAnalysis, urgency)
    };
  }

  // Helper methods for calculations
  private calculateMaterialQuantity(material: any, blueprint: BlueprintAnalysis): number {
    // Simplified calculation - would be more sophisticated in production
    return blueprint.estimatedWeight * 0.1; // Placeholder calculation
  }

  private assessMaterialCompatibility(material1: string, material2: string): string {
    const compatibilityMatrix: Record<string, Record<string, string>> = {
      steel: { aluminum: 'incompatible', stainless: 'compatible', carbon: 'compatible' },
      aluminum: { steel: 'incompatible', stainless: 'incompatible', carbon: 'incompatible' },
      stainless: { steel: 'compatible', aluminum: 'incompatible', carbon: 'compatible' }
    };
    
    return compatibilityMatrix[material1]?.[material2] || 'unknown';
  }

  private calculateTransitionCost(transition: any): number {
    // Simplified calculation based on transition complexity
    return 150; // Base cost for material transitions
  }

  private getTransitionLaborMultiplier(transition: any): number {
    // Different transitions require different labor multipliers
    const multipliers: Record<string, number> = {
      'butt joint': 1.2,
      'lap joint': 1.1,
      'corner joint': 1.3,
      'T-joint': 1.4
    };
    
    return multipliers[transition.jointType] || 1.2;
  }

  private calculateMaterialCosts(materialAnalysis: MultiMaterialQuoteAnalysis['materialBreakdown']) {
    const totalCost = materialAnalysis.primary.totalCost + 
      materialAnalysis.secondary.reduce((sum, mat) => sum + mat.totalCost, 0) +
      materialAnalysis.transitions.reduce((sum, trans) => sum + trans.additionalCost, 0);
    
    return {
      breakdown: materialAnalysis,
      totalCost,
      contingency: totalCost * 0.15 // 15% contingency
    };
  }

  private calculateLaborCosts(
    blueprint: BlueprintAnalysis,
    fabricationAnalysis: MultiMaterialQuoteAnalysis['fabricationComplexity'],
    laborVariability: HumanLaborVariability
  ) {
    const baseHours = blueprint.estimatedLaborHours;
    const complexityMultiplier = fabricationAnalysis.criticalProcesses.length * 0.2 + 1.0;
    const variabilityMultiplier = laborVariability.averageEfficiency;
    
    const adjustedHours = baseHours * complexityMultiplier * variabilityMultiplier;
    const contingencyHours = adjustedHours * laborVariability.qualityVariation.averageReworkRate;
    
    // Calculate cost by skill level
    const skillLevelBreakdown: Record<string, number> = {};
    let totalCost = 0;
    
    Object.entries(laborVariability.skillLevelDistribution).forEach(([level, data]) => {
      const hours = adjustedHours * data.percentage;
      const cost = hours * data.hourlyRate;
      skillLevelBreakdown[level] = cost;
      totalCost += cost;
    });
    
    return {
      breakdown: {
        baseHours,
        adjustedHours,
        humanVariabilityFactor: variabilityMultiplier,
        skillLevelBreakdown,
        contingencyHours
      },
      totalHours: adjustedHours + contingencyHours,
      totalCost,
      contingency: totalCost * 0.20 // 20% labor contingency
    };
  }

  private calculateRegulatoryCosts(fabricationAnalysis: MultiMaterialQuoteAnalysis['fabricationComplexity']) {
    const baseCost = fabricationAnalysis.regulatoryRequirements.length * 500;
    
    return {
      permits: baseCost * 0.3,
      inspections: fabricationAnalysis.inspectionPoints * 200,
      certifications: fabricationAnalysis.criticalProcesses.length * 800,
      compliance: baseCost * 0.2
    };
  }

  private calculateOverheadCosts(materialCost: number, laborCost: number) {
    const totalDirectCost = materialCost + laborCost;
    
    return {
      equipment: totalDirectCost * 0.15,
      utilities: totalDirectCost * 0.08,
      insurance: totalDirectCost * 0.05,
      administrative: totalDirectCost * 0.12
    };
  }

  private calculateConfidenceScore(blueprint: BlueprintAnalysis, laborVariability: HumanLaborVariability): number {
    const blueprintConfidence = blueprint.confidenceScore;
    const historicalConfidence = Math.min(1.0, laborVariability.averageEfficiency);
    
    return (blueprintConfidence + historicalConfidence) / 2;
  }

  private calculateRiskAdjustment(
    fabricationAnalysis: MultiMaterialQuoteAnalysis['fabricationComplexity'],
    laborVariability: HumanLaborVariability
  ): number {
    const technicalRisk = fabricationAnalysis.criticalProcesses.length * 0.1;
    const laborRisk = laborVariability.qualityVariation.averageReworkRate;
    
    return Math.min(0.5, technicalRisk + laborRisk);
  }

  private calculateDeliveryTimeline(
    blueprint: BlueprintAnalysis,
    fabricationAnalysis: MultiMaterialQuoteAnalysis['fabricationComplexity'],
    urgency: 'standard' | 'expedited' | 'emergency'
  ) {
    const baseFabrication = blueprint.estimatedLaborHours / 8; // Convert to days
    const inspectionTime = fabricationAnalysis.inspectionPoints * 0.5;
    const deliveryTime = 2; // Standard delivery time
    
    const urgencyMultiplier = urgency === 'emergency' ? 0.6 : urgency === 'expedited' ? 0.8 : 1.0;
    
    return {
      fabrication: baseFabrication * urgencyMultiplier,
      inspection: inspectionTime,
      delivery: deliveryTime,
      total: (baseFabrication + inspectionTime + deliveryTime) * urgencyMultiplier
    };
  }

  // Get historical data from bookkeeping integration
  private async getHistoricalData(userId: number): Promise<HistoricalProjectData[]> {
    if (this.historicalDataCache.has(userId)) {
      return this.historicalDataCache.get(userId)!;
    }

    try {
      const company = await storage.getCompanyByUserId(userId);
      if (!company) {
        return [];
      }

      // This would typically connect to the user's bookkeeping software
      // For now, return empty array as placeholder
      const historicalData: HistoricalProjectData[] = [];
      
      this.historicalDataCache.set(userId, historicalData);
      return historicalData;
    } catch (error) {
      console.error('Failed to get historical data:', error);
      return [];
    }
  }
}

export const comprehensiveMLService = new ComprehensiveMLService();