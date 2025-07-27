import { bookkeepingService, type HistoricalProjectData, type LaborAnalysis, type MaterialCostAnalysis } from './bookkeeping-integration';
import { materialPricingService, type RealTimePricing } from './material-pricing-service';
import { geoLocationService, type GeoLocationResult } from './geo-location-service';
import { analyzeBlueprintWithAI, type BlueprintAnalysis } from './ai-service';
import { storage } from './storage';
import { db } from './db';
import { quotes, materialCosts, companies } from '../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface HistoricalMaterialPricing {
  materialType: string;
  grade: string;
  supplier: string;
  pricePerPound: number;
  purchaseDate: Date;
  quantity: number;
  projectId: string;
  invoiceNumber: string;
  accuracy: number; // How close predicted vs actual
}

export interface AIQuotingContext {
  companyId: string;
  companyLocation: GeoLocationResult;
  historicalData: {
    projects: HistoricalProjectData[];
    materialPricing: HistoricalMaterialPricing[];
    laborAnalysis: LaborAnalysis;
    materialCostAnalysis: MaterialCostAnalysis;
    averageAccuracy: number;
    totalProjectsAnalyzed: number;
  };
  currentMarketData: {
    realTimePricing: RealTimePricing[];
    marketTrends: Record<string, number>;
    volatility: Record<string, number>;
    regionalFactors: Record<string, number>;
  };
  blueprintAnalysis: BlueprintAnalysis;
}

export interface AIQuoteResult {
  materialCosts: {
    historical: {
      averagePrice: number;
      priceRange: { min: number; max: number };
      supplierRecommendations: string[];
      confidenceScore: number;
    };
    current: {
      marketPrice: number;
      geoAdjustedPrice: number;
      trendAdjustment: number;
      finalPrice: number;
    };
    prediction: {
      recommendedPrice: number;
      reasoning: string;
      riskFactors: string[];
      confidenceLevel: number;
    };
  };
  laborCosts: {
    historical: {
      averageHourlyRate: number;
      averageEfficiency: number;
      skillLevelDistribution: Record<string, number>;
      confidenceScore: number;
    };
    aiCalculated: {
      estimatedHours: number;
      skillLevelBreakdown: Record<string, number>;
      hourlyRates: Record<string, number>;
      totalLaborCost: number;
    };
    prediction: {
      recommendedHours: number;
      recommendedCost: number;
      reasoning: string;
      riskFactors: string[];
      confidenceLevel: number;
    };
  };
  totalQuote: {
    materialCost: number;
    laborCost: number;
    overheadCost: number;
    profitMargin: number;
    totalCost: number;
    accuracyPrediction: number;
    riskAssessment: {
      overall: number;
      material: number;
      labor: number;
      schedule: number;
      market: number;
    };
  };
  recommendations: {
    pricing: string[];
    materials: string[];
    labor: string[];
    scheduling: string[];
    riskMitigation: string[];
  };
}

export class AIQuotingService {
  
  async generateAIQuote(
    userId: string,
    blueprintAnalysis: BlueprintAnalysis,
    urgency: 'standard' | 'rush' | 'emergency' = 'standard'
  ): Promise<AIQuoteResult> {
    
    // 1. Get company information and geo-location
    const user = await storage.getUser(userId);
    if (!user) throw new Error('User not found');
    
    const [company] = await db.select().from(companies).where(eq(companies.userId, userId));
    if (!company) throw new Error('Company not found');
    
    const companyLocation = await geoLocationService.geocodeAddress(company.fullAddress);
    
    // 2. Get historical data from connected bookkeeping software
    const historicalData = await this.getHistoricalData(userId);
    
    // 3. Get current market data with geo-location adjustments
    const currentMarketData = await this.getCurrentMarketData(companyLocation);
    
    // 4. Build AI quoting context
    const context: AIQuotingContext = {
      companyId: company.id,
      companyLocation,
      historicalData,
      currentMarketData,
      blueprintAnalysis
    };
    
    // 5. Generate AI-powered quote
    const quote = await this.calculateAIQuote(context, urgency);
    
    return quote;
  }
  
  private async getHistoricalData(userId: string) {
    // Get historical projects from bookkeeping integration
    const projects = await bookkeepingService.getHistoricalProjects(userId);
    
    // Get historical material pricing from invoices
    const materialPricing = await this.extractHistoricalMaterialPricing(userId);
    
    // Get labor analysis from payroll data
    const laborAnalysis = await bookkeepingService.getLaborAnalysis(userId);
    
    // Get material cost analysis from invoice data
    const materialCostAnalysis = await bookkeepingService.getMaterialCostAnalysis(userId);
    
    // Calculate average accuracy of past quotes
    const averageAccuracy = await this.calculateHistoricalAccuracy(projects);
    
    return {
      projects,
      materialPricing,
      laborAnalysis,
      materialCostAnalysis,
      averageAccuracy,
      totalProjectsAnalyzed: projects.length
    };
  }
  
  private async extractHistoricalMaterialPricing(userId: string): Promise<HistoricalMaterialPricing[]> {
    // Extract material pricing from historical invoices
    const invoices = await bookkeepingService.getHistoricalInvoices(userId, 'material');
    
    return invoices.map(invoice => {
      // AI parsing of invoice data to extract material pricing
      const parsedData = this.parseInvoiceForMaterialData(invoice);
      
      return {
        materialType: parsedData.materialType,
        grade: parsedData.grade,
        supplier: parsedData.supplier,
        pricePerPound: parsedData.pricePerPound,
        purchaseDate: parsedData.purchaseDate,
        quantity: parsedData.quantity,
        projectId: parsedData.projectId,
        invoiceNumber: parsedData.invoiceNumber,
        accuracy: parsedData.accuracy
      };
    });
  }
  
  private parseInvoiceForMaterialData(invoice: any): HistoricalMaterialPricing {
    // AI-powered invoice parsing for material data
    // This would use ML/LLM to extract structured data from invoice text
    
    // Mock implementation for now - would integrate with actual AI parsing
    return {
      materialType: 'A36',
      grade: 'Structural Steel',
      supplier: 'ABC Steel Supply',
      pricePerPound: 0.68,
      purchaseDate: new Date(invoice.date),
      quantity: 1000,
      projectId: invoice.projectId || 'unknown',
      invoiceNumber: invoice.invoiceNumber,
      accuracy: 0.85
    };
  }
  
  private async getCurrentMarketData(location: GeoLocationResult) {
    // Get real-time pricing data
    const realTimePricing = await materialPricingService.getRealTimePricing(['A36', 'A992', 'A500']);
    
    // Get market trends for the region
    const marketTrends = await materialPricingService.getMarketTrends(location.regionalPricingZone);
    
    // Get volatility data
    const volatility = await materialPricingService.getVolatilityData(location.regionalPricingZone);
    
    // Get regional pricing factors
    const regionalFactors = await materialPricingService.getRegionalFactors(location);
    
    return {
      realTimePricing,
      marketTrends,
      volatility,
      regionalFactors
    };
  }
  
  private async calculateHistoricalAccuracy(projects: HistoricalProjectData[]): Promise<number> {
    if (projects.length === 0) return 0.5; // Default 50% accuracy for new companies
    
    const accuracyScores = projects.map(project => {
      const materialAccuracy = project.materialCosts.actual > 0 
        ? Math.min(project.materialCosts.budgeted / project.materialCosts.actual, 2.0)
        : 0.5;
      
      const laborAccuracy = project.laborHours.actual > 0
        ? Math.min(project.laborHours.budgeted / project.laborHours.actual, 2.0)
        : 0.5;
      
      return (materialAccuracy + laborAccuracy) / 2;
    });
    
    return accuracyScores.reduce((sum, score) => sum + score, 0) / accuracyScores.length;
  }
  
  private async calculateAIQuote(context: AIQuotingContext, urgency: string): Promise<AIQuoteResult> {
    // 1. Calculate AI-enhanced material costs
    const materialCosts = await this.calculateMaterialCosts(context, urgency);
    
    // 2. Calculate AI-enhanced labor costs
    const laborCosts = await this.calculateLaborCosts(context, urgency);
    
    // 3. Calculate overhead and profit margins
    const overheadCost = this.calculateOverheadCost(context);
    const profitMargin = this.calculateProfitMargin(context);
    
    // 4. Calculate total cost
    const totalCost = materialCosts.prediction.recommendedPrice + 
                     laborCosts.prediction.recommendedCost + 
                     overheadCost + 
                     profitMargin;
    
    // 5. Calculate risk assessment
    const riskAssessment = this.calculateRiskAssessment(context, materialCosts, laborCosts);
    
    // 6. Generate recommendations
    const recommendations = this.generateRecommendations(context, materialCosts, laborCosts, riskAssessment);
    
    return {
      materialCosts,
      laborCosts,
      totalQuote: {
        materialCost: materialCosts.prediction.recommendedPrice,
        laborCost: laborCosts.prediction.recommendedCost,
        overheadCost,
        profitMargin,
        totalCost,
        accuracyPrediction: context.historicalData.averageAccuracy,
        riskAssessment
      },
      recommendations
    };
  }
  
  private async calculateMaterialCosts(context: AIQuotingContext, urgency: string) {
    const { historicalData, currentMarketData, companyLocation } = context;
    
    // Historical analysis
    const historicalPricing = historicalData.materialPricing.filter(p => 
      p.materialType === context.blueprintAnalysis.materials[0]?.type
    );
    
    const averageHistoricalPrice = historicalPricing.length > 0
      ? historicalPricing.reduce((sum, p) => sum + p.pricePerPound, 0) / historicalPricing.length
      : 0.65; // Default A36 price
    
    const priceRange = {
      min: Math.min(...historicalPricing.map(p => p.pricePerPound)),
      max: Math.max(...historicalPricing.map(p => p.pricePerPound))
    };
    
    // Current market analysis
    const currentMarketPrice = currentMarketData.realTimePricing[0]?.pricePerPound || 0.65;
    const geoAdjustedPrice = currentMarketPrice * (companyLocation.steelHubDistances[0]?.transportCostMultiplier || 1.0);
    
    // Trend adjustment
    const trendMultiplier = currentMarketData.marketTrends[context.blueprintAnalysis.materials[0]?.type] || 1.0;
    const trendAdjustment = geoAdjustedPrice * trendMultiplier;
    
    // AI prediction combining historical and current data
    const historicalWeight = Math.min(historicalPricing.length / 10, 0.7); // More historical data = higher weight
    const marketWeight = 1 - historicalWeight;
    
    const recommendedPrice = (averageHistoricalPrice * historicalWeight) + (trendAdjustment * marketWeight);
    
    // Apply urgency multiplier
    const urgencyMultiplier = urgency === 'rush' ? 1.15 : urgency === 'emergency' ? 1.30 : 1.0;
    const finalRecommendedPrice = recommendedPrice * urgencyMultiplier;
    
    return {
      historical: {
        averagePrice: averageHistoricalPrice,
        priceRange,
        supplierRecommendations: [...new Set(historicalPricing.map(p => p.supplier))],
        confidenceScore: Math.min(historicalPricing.length / 5, 1.0)
      },
      current: {
        marketPrice: currentMarketPrice,
        geoAdjustedPrice,
        trendAdjustment,
        finalPrice: trendAdjustment
      },
      prediction: {
        recommendedPrice: finalRecommendedPrice,
        reasoning: `Combined historical average (${(historicalWeight * 100).toFixed(0)}% weight) with current market trends (${(marketWeight * 100).toFixed(0)}% weight). Location factor: ${companyLocation.steelHubDistances[0]?.transportCostMultiplier.toFixed(2)}x`,
        riskFactors: this.assessMaterialRiskFactors(context, currentMarketData),
        confidenceLevel: Math.min(historicalPricing.length / 10 + 0.5, 0.95)
      }
    };
  }
  
  private async calculateLaborCosts(context: AIQuotingContext, urgency: string) {
    const { historicalData, blueprintAnalysis } = context;
    
    // Historical labor analysis
    const historicalHourlyRate = historicalData.laborAnalysis.averageHourlyRate;
    const historicalEfficiency = historicalData.laborAnalysis.productivity.projectType['structural'] || 1.0;
    
    // AI-calculated labor hours from blueprint analysis
    const aiEstimatedHours = blueprintAnalysis.estimatedLaborHours;
    const skillLevelBreakdown = this.calculateSkillLevelBreakdown(blueprintAnalysis);
    
    // Calculate hourly rates by skill level
    const hourlyRates = {
      junior: historicalData.laborAnalysis.skillLevels.junior.rate,
      intermediate: historicalData.laborAnalysis.skillLevels.intermediate.rate,
      senior: historicalData.laborAnalysis.skillLevels.senior.rate,
      certified: historicalData.laborAnalysis.skillLevels.certified.rate
    };
    
    // Calculate total labor cost
    let totalLaborCost = 0;
    for (const [skill, hours] of Object.entries(skillLevelBreakdown)) {
      totalLaborCost += hours * (hourlyRates[skill as keyof typeof hourlyRates] || 25);
    }
    
    // Apply historical efficiency factor
    const efficiencyAdjustedCost = totalLaborCost / historicalEfficiency;
    
    // Apply urgency multiplier
    const urgencyMultiplier = urgency === 'rush' ? 1.20 : urgency === 'emergency' ? 1.40 : 1.0;
    const finalLaborCost = efficiencyAdjustedCost * urgencyMultiplier;
    
    // Historical comparison for recommended hours
    const historicalProjects = historicalData.projects.filter(p => 
      p.laborHours.actual > 0 && Math.abs(p.laborHours.budgeted - aiEstimatedHours) < aiEstimatedHours * 0.5
    );
    
    const averageHistoricalHours = historicalProjects.length > 0
      ? historicalProjects.reduce((sum, p) => sum + p.laborHours.actual, 0) / historicalProjects.length
      : aiEstimatedHours;
    
    const historicalWeight = Math.min(historicalProjects.length / 5, 0.6);
    const recommendedHours = (averageHistoricalHours * historicalWeight) + (aiEstimatedHours * (1 - historicalWeight));
    
    return {
      historical: {
        averageHourlyRate: historicalHourlyRate,
        averageEfficiency: historicalEfficiency,
        skillLevelDistribution: skillLevelBreakdown,
        confidenceScore: Math.min(historicalProjects.length / 3, 1.0)
      },
      aiCalculated: {
        estimatedHours: aiEstimatedHours,
        skillLevelBreakdown,
        hourlyRates,
        totalLaborCost: efficiencyAdjustedCost
      },
      prediction: {
        recommendedHours,
        recommendedCost: finalLaborCost,
        reasoning: `AI analysis suggests ${aiEstimatedHours.toFixed(1)} hours. Historical data shows ${historicalWeight > 0 ? `${averageHistoricalHours.toFixed(1)} hours for similar projects` : 'no similar projects'}. Efficiency factor: ${historicalEfficiency.toFixed(2)}x`,
        riskFactors: this.assessLaborRiskFactors(context, skillLevelBreakdown),
        confidenceLevel: Math.min((historicalProjects.length / 5) + 0.4, 0.90)
      }
    };
  }
  
  private calculateSkillLevelBreakdown(blueprintAnalysis: BlueprintAnalysis): Record<string, number> {
    const complexity = blueprintAnalysis.complexity;
    const totalHours = blueprintAnalysis.estimatedLaborHours;
    
    // Distribute hours based on project complexity
    switch (complexity) {
      case 'simple':
        return {
          junior: totalHours * 0.4,
          intermediate: totalHours * 0.4,
          senior: totalHours * 0.2,
          certified: totalHours * 0.0
        };
      case 'moderate':
        return {
          junior: totalHours * 0.2,
          intermediate: totalHours * 0.5,
          senior: totalHours * 0.25,
          certified: totalHours * 0.05
        };
      case 'complex':
        return {
          junior: totalHours * 0.1,
          intermediate: totalHours * 0.4,
          senior: totalHours * 0.4,
          certified: totalHours * 0.1
        };
      case 'very_complex':
        return {
          junior: totalHours * 0.05,
          intermediate: totalHours * 0.25,
          senior: totalHours * 0.5,
          certified: totalHours * 0.2
        };
      default:
        return {
          junior: totalHours * 0.3,
          intermediate: totalHours * 0.4,
          senior: totalHours * 0.25,
          certified: totalHours * 0.05
        };
    }
  }
  
  private calculateOverheadCost(context: AIQuotingContext): number {
    const { historicalData } = context;
    
    // Calculate overhead as percentage of total project cost
    const avgOverheadRate = historicalData.projects.length > 0
      ? historicalData.projects.reduce((sum, p) => sum + (p.overheadCosts / p.actualCost), 0) / historicalData.projects.length
      : 0.15; // Default 15% overhead
    
    const estimatedProjectCost = context.blueprintAnalysis.estimatedCost || 5000;
    return estimatedProjectCost * Math.max(avgOverheadRate, 0.10); // Minimum 10% overhead
  }
  
  private calculateProfitMargin(context: AIQuotingContext): number {
    const { historicalData } = context;
    
    // Calculate profit margin based on historical data
    const avgProfitMargin = historicalData.projects.length > 0
      ? historicalData.projects.reduce((sum, p) => sum + p.profitMargin, 0) / historicalData.projects.length
      : 0.20; // Default 20% profit margin
    
    const estimatedProjectCost = context.blueprintAnalysis.estimatedCost || 5000;
    return estimatedProjectCost * Math.max(avgProfitMargin, 0.12); // Minimum 12% profit margin
  }
  
  private assessMaterialRiskFactors(context: AIQuotingContext, marketData: any): string[] {
    const risks: string[] = [];
    
    // Market volatility risk
    if (marketData.volatility[context.blueprintAnalysis.materials[0]?.type] > 0.10) {
      risks.push('High market volatility - consider price locks');
    }
    
    // Supply chain risk
    if (context.companyLocation.steelHubDistances[0]?.distance > 500) {
      risks.push('Remote location increases supply chain risk');
    }
    
    // Historical accuracy risk
    if (context.historicalData.averageAccuracy < 0.75) {
      risks.push('Historical quoting accuracy below 75%');
    }
    
    return risks;
  }
  
  private assessLaborRiskFactors(context: AIQuotingContext, skillBreakdown: Record<string, number>): string[] {
    const risks: string[] = [];
    
    // Skill availability risk
    if (skillBreakdown.certified > 20) {
      risks.push('High demand for certified welders may affect availability');
    }
    
    // Historical efficiency risk
    if (context.historicalData.laborAnalysis.productivity.projectType['structural'] < 0.8) {
      risks.push('Below-average productivity on structural projects');
    }
    
    // Seasonal risk
    const currentMonth = new Date().getMonth();
    if (currentMonth >= 5 && currentMonth <= 8) { // Summer months
      risks.push('Summer season may impact labor productivity');
    }
    
    return risks;
  }
  
  private calculateRiskAssessment(context: AIQuotingContext, materialCosts: any, laborCosts: any) {
    const materialRisk = 1 - materialCosts.prediction.confidenceLevel;
    const laborRisk = 1 - laborCosts.prediction.confidenceLevel;
    const marketRisk = context.currentMarketData.volatility[context.blueprintAnalysis.materials[0]?.type] || 0.1;
    const scheduleRisk = context.blueprintAnalysis.complexity === 'very_complex' ? 0.3 : 0.15;
    
    const overallRisk = (materialRisk + laborRisk + marketRisk + scheduleRisk) / 4;
    
    return {
      overall: Math.min(overallRisk, 1.0),
      material: materialRisk,
      labor: laborRisk,
      schedule: scheduleRisk,
      market: marketRisk
    };
  }
  
  private generateRecommendations(context: AIQuotingContext, materialCosts: any, laborCosts: any, riskAssessment: any) {
    const recommendations: AIQuoteResult['recommendations'] = {
      pricing: [],
      materials: [],
      labor: [],
      scheduling: [],
      riskMitigation: []
    };
    
    // Pricing recommendations
    if (context.historicalData.averageAccuracy > 0.85) {
      recommendations.pricing.push('Strong historical accuracy - consider competitive pricing');
    }
    
    // Material recommendations
    if (materialCosts.historical.supplierRecommendations.length > 0) {
      recommendations.materials.push(`Consider preferred suppliers: ${materialCosts.historical.supplierRecommendations.slice(0, 2).join(', ')}`);
    }
    
    // Labor recommendations
    if (laborCosts.historical.confidenceScore > 0.8) {
      recommendations.labor.push('High confidence in labor estimates based on historical data');
    }
    
    // Risk mitigation
    if (riskAssessment.overall > 0.3) {
      recommendations.riskMitigation.push('Consider adding 10-15% contingency for high-risk project');
    }
    
    return recommendations;
  }
}

export const aiQuotingService = new AIQuotingService();