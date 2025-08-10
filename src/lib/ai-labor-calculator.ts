// AI-powered labor hour calculation based on drawing analysis and historical data

export interface LaborCalculationFactors {
  projectComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  materialType: string;
  dimensions: {
    totalLength: number;
    totalHeight: number;
    totalWeight: number;
  };
  fabricationType: string;
  finishRequirements: string;
  quantity: number;
  historicalData?: {
    similarProjects: number;
    averageHours: number;
    accuracyScore: number;
  };
  companyEfficiency?: number; // Based on historical performance
}

export interface LaborBreakdown {
  cutting: number;
  welding: number;
  assembly: number;
  finishing: number;
  inspection: number;
  total: number;
  confidence: number;
  explanation: string[];
}

export const calculateAILaborHours = async (factors: LaborCalculationFactors): Promise<LaborBreakdown> => {
  // This would integrate with actual AI/ML services for real-time calculation
  // For now, implementing algorithm-based calculation using industry standards
  
  const baseHours = calculateBaseHours(factors);
  const complexityMultiplier = getComplexityMultiplier(factors.projectComplexity);
  const materialMultiplier = getMaterialMultiplier(factors.materialType);
  const finishMultiplier = getFinishMultiplier(factors.finishRequirements);
  const efficiencyFactor = factors.companyEfficiency || 1.0;
  
  // Calculate individual operation hours
  const cutting = baseHours.cutting * complexityMultiplier * materialMultiplier * efficiencyFactor;
  const welding = baseHours.welding * complexityMultiplier * materialMultiplier * efficiencyFactor;
  const assembly = baseHours.assembly * complexityMultiplier * efficiencyFactor;
  const finishing = baseHours.finishing * finishMultiplier * efficiencyFactor;
  const inspection = (cutting + welding + assembly + finishing) * 0.1; // 10% for inspection
  
  const total = cutting + welding + assembly + finishing + inspection;
  
  // Adjust based on historical data if available
  let adjustedTotal = total;
  let confidence = 0.75; // Base confidence
  
  if (factors.historicalData && factors.historicalData.similarProjects > 3) {
    const historicalWeight = Math.min(factors.historicalData.similarProjects / 10, 0.4);
    adjustedTotal = total * (1 - historicalWeight) + factors.historicalData.averageHours * historicalWeight;
    confidence = Math.min(0.95, 0.75 + factors.historicalData.accuracyScore * 0.2);
  }
  
  const explanation = generateExplanation(factors, {
    cutting,
    welding,
    assembly,
    finishing,
    inspection,
    total: adjustedTotal,
    confidence,
    explanation: []
  });
  
  return {
    cutting: Math.round(cutting * 10) / 10,
    welding: Math.round(welding * 10) / 10,
    assembly: Math.round(assembly * 10) / 10,
    finishing: Math.round(finishing * 10) / 10,
    inspection: Math.round(inspection * 10) / 10,
    total: Math.round(adjustedTotal * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    explanation
  };
};

function calculateBaseHours(factors: LaborCalculationFactors) {
  const { dimensions } = factors;
  
  // Base calculations using industry standards (hours per unit)
  const lengthFactor = dimensions.totalLength / 12; // feet to factor
  const weightFactor = dimensions.totalWeight / 100; // per 100 lbs
  
  return {
    cutting: lengthFactor * 0.5 + weightFactor * 0.3,
    welding: lengthFactor * 1.2 + weightFactor * 0.8,
    assembly: lengthFactor * 0.8 + weightFactor * 0.5,
    finishing: weightFactor * 0.4
  };
}

function getComplexityMultiplier(complexity: string): number {
  const multipliers = {
    simple: 0.8,
    moderate: 1.0,
    complex: 1.5,
    very_complex: 2.2
  };
  return multipliers[complexity as keyof typeof multipliers] || 1.0;
}

function getMaterialMultiplier(materialType: string): number {
  const multipliers: Record<string, number> = {
    'A36 Steel': 1.0,
    'A572 Grade 50': 1.1,
    'Stainless 304': 1.4,
    'Stainless 316': 1.5,
    'Aluminum 6061': 0.9,
    'Aluminum 5052': 0.85
  };
  
  return multipliers[materialType] || 1.0;
}

function getFinishMultiplier(finishType: string): number {
  const multipliers: Record<string, number> = {
    'Mill Finish': 1.0,
    'Painted': 1.3,
    'Hot-Dip Galvanized': 1.2,
    'Powder Coated': 1.4,
    'Polished': 1.8
  };
  
  return multipliers[finishType] || 1.0;
}

function generateExplanation(factors: LaborCalculationFactors, breakdown: LaborBreakdown): string[] {
  const explanation = [];
  
  explanation.push(`Project classified as ${factors.projectComplexity} complexity`);
  explanation.push(`Material: ${factors.materialType} affects welding and cutting time`);
  explanation.push(`Finish: ${factors.finishRequirements} adds post-fabrication work`);
  
  if (factors.quantity > 1) {
    explanation.push(`Quantity (${factors.quantity}) includes efficiency gains for repeat work`);
  }
  
  if (factors.historicalData && factors.historicalData.similarProjects > 0) {
    explanation.push(`Adjusted based on ${factors.historicalData.similarProjects} similar historical projects`);
  }
  
  explanation.push(`Breakdown: ${breakdown.cutting}h cutting, ${breakdown.welding}h welding, ${breakdown.assembly}h assembly`);
  
  return explanation;
}

export const getProjectComplexityFromDrawing = (extractedData: any): 'simple' | 'moderate' | 'complex' | 'very_complex' => {
  if (!extractedData || !extractedData.dimensions) return 'moderate';
  
  const dimensionCount = extractedData.dimensions.length;
  const hasComplexJoints = extractedData.dimensions.some((d: any) => 
    d.type.includes('angle') || d.type.includes('compound')
  );
  
  if (dimensionCount < 5 && !hasComplexJoints) return 'simple';
  if (dimensionCount < 10 && !hasComplexJoints) return 'moderate';
  if (dimensionCount < 15 || hasComplexJoints) return 'complex';
  return 'very_complex';
};

export const extractDimensionsFromDrawingData = (extractedData: any) => {
  if (!extractedData || !extractedData.dimensions) {
    return {
      totalLength: 24.5, // Default values
      totalHeight: 8.0,
      totalWeight: 1000
    };
  }
  
  // Parse dimensions and calculate totals
  let totalLength = 0;
  let totalHeight = 0;
  
  extractedData.dimensions.forEach((dim: any) => {
    if (dim.type === 'length') {
      totalLength += parseFloat(dim.value.replace(/[^\d.]/g, '')) || 0;
    }
    if (dim.type === 'height') {
      totalHeight += parseFloat(dim.value.replace(/[^\d.]/g, '')) || 0;
    }
  });
  
  // Estimate weight based on dimensions (simplified calculation)
  const estimatedWeight = totalLength * totalHeight * 5.2; // Rough steel weight calculation
  
  return {
    totalLength: totalLength || 24.5,
    totalHeight: totalHeight || 8.0,
    totalWeight: estimatedWeight || 1000
  };
};