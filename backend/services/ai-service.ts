import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import pdf2pic from 'pdf2pic';
import sharp from 'sharp';

// AWS Bedrock client configuration
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Claude model configuration
const MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

export interface DimensionExtraction {
  id: string;
  type: 'length' | 'width' | 'height' | 'diameter' | 'radius' | 'angle' | 'thickness';
  value: string;
  unit: string;
  confidence: number;
  x: number;
  y: number;
  description: string;
}

export interface MaterialSpecification {
  id: string;
  type: 'steel' | 'aluminum' | 'stainless' | 'carbon' | 'alloy';
  grade: string;
  specification: string;
  confidence: number;
  location: string;
}

export interface WeldSymbol {
  id: string;
  type: 'fillet' | 'groove' | 'plug' | 'spot' | 'seam' | 'back' | 'surfacing';
  size: string;
  length: string;
  confidence: number;
  x: number;
  y: number;
  description: string;
}

export interface PartComponent {
  id: string;
  name: string;
  type: 'beam' | 'column' | 'plate' | 'angle' | 'channel' | 'tube' | 'pipe' | 'bolt' | 'weld';
  dimensions: DimensionExtraction[];
  material: MaterialSpecification | null;
  quantity: number;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FabricationSpecification {
  id: string;
  type: 'welding' | 'cutting' | 'drilling' | 'bending' | 'machining' | 'finishing' | 'assembly';
  standard: string; // e.g., "AWS D1.1", "AISC 360", "ASCE 7", "IBC 2021"
  process: string; // e.g., "SMAW", "GMAW", "FCAW", "SAW" for welding
  quality: 'standard' | 'high' | 'critical' | 'aerospace';
  laborMultiplier: number;
  skillLevel: 'junior' | 'intermediate' | 'senior' | 'certified';
  estimatedHours: number;
  equipmentRequired: string[];
  inspectionRequirements: string[];
  confidence: number;
  location: string;
  notes: string[];
}

export interface MultiMaterialAnalysis {
  primaryMaterial: MaterialSpecification;
  secondaryMaterials: MaterialSpecification[];
  materialTransitions: {
    from: string;
    to: string;
    jointType: string;
    weldingRequirements: string[];
  }[];
  compatibilityIssues: string[];
  costImplications: {
    materialCost: number;
    laborMultiplier: number;
    additionalProcessing: string[];
  };
}

export interface BlueprintAnalysis {
  dimensions: DimensionExtraction[];
  materials: MaterialSpecification[];
  multiMaterialAnalysis: MultiMaterialAnalysis[];
  weldSymbols: WeldSymbol[];
  fabricationSpecs: FabricationSpecification[];
  parts: PartComponent[];
  projectComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  estimatedWeight: number;
  estimatedLaborHours: number;
  regulatoryCompliance: {
    codes: string[];
    requirements: string[];
    additionalCosts: number;
  };
  confidenceScore: number;
  analysisNotes: string[];
}

// Convert PDF to images for AI analysis
export async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  const convert = pdf2pic.fromPath(pdfPath, {
    density: 300,
    saveFilename: "page",
    savePath: path.dirname(pdfPath),
    format: "png",
    width: 2000,
    height: 2000
  });

  try {
    const results = await convert.bulk(-1);
    return results.map(result => result.path);
  } catch (error) {
    console.error('PDF to image conversion failed:', error);
    throw new Error('Failed to convert PDF to images');
  }
}

// Convert image to base64 for AI analysis
export async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const optimizedBuffer = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 80 })
      .toBuffer();
    
    return optimizedBuffer.toString('base64');
  } catch (error) {
    console.error('Image to base64 conversion failed:', error);
    throw new Error('Failed to convert image to base64');
  }
}

// Main AI analysis function
export async function analyzeBlueprintWithAI(pdfPath: string): Promise<BlueprintAnalysis> {
  try {
    // Convert PDF to images
    const imagePaths = await convertPdfToImages(pdfPath);
    
    // Analyze each page
    const pageAnalyses: BlueprintAnalysis[] = [];
    
    for (const imagePath of imagePaths) {
      const base64Image = await imageToBase64(imagePath);
      const analysis = await analyzePageWithClaude(base64Image);
      pageAnalyses.push(analysis);
      
      // Clean up temporary image file
      await fs.unlink(imagePath).catch(console.error);
    }
    
    // Combine analyses from all pages
    return combinePageAnalyses(pageAnalyses);
    
  } catch (error) {
    console.error('Blueprint analysis failed:', error);
    throw new Error('Failed to analyze blueprint with AI');
  }
}

// Analyze single page with Claude
async function analyzePageWithClaude(base64Image: string): Promise<BlueprintAnalysis> {
  const prompt = `You are an expert structural engineer and fabrication estimator. Analyze this engineering drawing/blueprint and extract the following information:

1. DIMENSIONS: Find all dimensional callouts including lengths, widths, heights, diameters, radii, angles, and thicknesses. Note their exact values and units.

2. MATERIALS: Identify material specifications like steel grades (A36, A572, etc.), aluminum alloys, stainless steel grades, etc.

3. WELD SYMBOLS: Locate and identify all welding symbols including fillet welds, groove welds, plug welds, etc. Note sizes and lengths.

4. STRUCTURAL COMPONENTS: Identify beams (W-shapes, I-beams), columns, plates, angles, channels, tubes, pipes, bolts, and other fabricated parts.

5. PROJECT COMPLEXITY: Assess the overall complexity based on:
   - Number of different parts and assemblies
   - Complexity of joints and connections
   - Precision requirements
   - Material variety

6. WEIGHT ESTIMATION: Estimate the total weight of steel/metal based on visible components.

7. LABOR ESTIMATION: Estimate fabrication hours based on cutting, welding, assembly, and finishing requirements.

Please provide your analysis in the following JSON format:
{
  "dimensions": [
    {
      "id": "unique_id",
      "type": "length|width|height|diameter|radius|angle|thickness",
      "value": "24",
      "unit": "in",
      "confidence": 0.95,
      "x": 100,
      "y": 200,
      "description": "Overall beam length"
    }
  ],
  "materials": [
    {
      "id": "unique_id",
      "type": "steel|aluminum|stainless|carbon|alloy",
      "grade": "A36",
      "specification": "ASTM A36 Steel",
      "confidence": 0.90,
      "location": "main structural members"
    }
  ],
  "weldSymbols": [
    {
      "id": "unique_id",
      "type": "fillet|groove|plug|spot|seam|back|surfacing",
      "size": "1/4",
      "length": "6",
      "confidence": 0.85,
      "x": 300,
      "y": 400,
      "description": "1/4 inch fillet weld, 6 inches long"
    }
  ],
  "parts": [
    {
      "id": "unique_id",
      "name": "Main Beam",
      "type": "beam|column|plate|angle|channel|tube|pipe|bolt|weld",
      "dimensions": [dimension_ids],
      "material": material_id,
      "quantity": 2,
      "confidence": 0.92,
      "boundingBox": {"x": 50, "y": 100, "width": 200, "height": 50}
    }
  ],
  "projectComplexity": "simple|moderate|complex|very_complex",
  "estimatedWeight": 2500,
  "estimatedLaborHours": 48,
  "confidenceScore": 0.88,
  "analysisNotes": ["Notes about assumptions", "Potential issues identified"]
}

Focus on accuracy and provide realistic estimates. If you cannot clearly identify something, indicate lower confidence scores.`;

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Image
            }
          }
        ]
      }
    ]
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    body: JSON.stringify(requestBody)
  });

  try {
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Extract and parse the AI response
    const aiResponse = responseBody.content[0].text;
    
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysisData = JSON.parse(jsonMatch[0]);
      return parseAnalysisResponse(analysisData);
    } else {
      throw new Error('Could not parse AI response as JSON');
    }
    
  } catch (error) {
    console.error('Claude analysis failed:', error);
    
    // Return fallback analysis if AI fails
    return {
      dimensions: [],
      materials: [],
      weldSymbols: [],
      parts: [],
      projectComplexity: 'moderate',
      estimatedWeight: 0,
      estimatedLaborHours: 0,
      confidenceScore: 0,
      analysisNotes: ['AI analysis failed, manual review required']
    };
  }
}

// Parse and validate AI response
function parseAnalysisResponse(data: any): BlueprintAnalysis {
  return {
    dimensions: data.dimensions || [],
    materials: data.materials || [],
    weldSymbols: data.weldSymbols || [],
    parts: data.parts || [],
    projectComplexity: data.projectComplexity || 'moderate',
    estimatedWeight: data.estimatedWeight || 0,
    estimatedLaborHours: data.estimatedLaborHours || 0,
    confidenceScore: data.confidenceScore || 0,
    analysisNotes: data.analysisNotes || []
  };
}

// Combine analyses from multiple pages
function combinePageAnalyses(analyses: BlueprintAnalysis[]): BlueprintAnalysis {
  if (analyses.length === 0) {
    return {
      dimensions: [],
      materials: [],
      weldSymbols: [],
      parts: [],
      projectComplexity: 'moderate',
      estimatedWeight: 0,
      estimatedLaborHours: 0,
      confidenceScore: 0,
      analysisNotes: ['No pages analyzed']
    };
  }

  if (analyses.length === 1) {
    return analyses[0];
  }

  // Combine data from multiple pages
  const combined: BlueprintAnalysis = {
    dimensions: [],
    materials: [],
    weldSymbols: [],
    parts: [],
    projectComplexity: 'moderate',
    estimatedWeight: 0,
    estimatedLaborHours: 0,
    confidenceScore: 0,
    analysisNotes: []
  };

  // Merge all arrays
  analyses.forEach(analysis => {
    combined.dimensions.push(...analysis.dimensions);
    combined.materials.push(...analysis.materials);
    combined.weldSymbols.push(...analysis.weldSymbols);
    combined.parts.push(...analysis.parts);
    combined.analysisNotes.push(...analysis.analysisNotes);
  });

  // Calculate combined metrics
  combined.estimatedWeight = analyses.reduce((sum, a) => sum + a.estimatedWeight, 0);
  combined.estimatedLaborHours = analyses.reduce((sum, a) => sum + a.estimatedLaborHours, 0);
  combined.confidenceScore = analyses.reduce((sum, a) => sum + a.confidenceScore, 0) / analyses.length;

  // Determine overall complexity
  const complexityLevels = ['simple', 'moderate', 'complex', 'very_complex'];
  const maxComplexity = Math.max(...analyses.map(a => complexityLevels.indexOf(a.projectComplexity)));
  combined.projectComplexity = complexityLevels[maxComplexity] as any;

  return combined;
}

// Validate AWS credentials
export async function validateAWSCredentials(): Promise<boolean> {
  try {
    // Simple test call to validate credentials
    const testCommand = new InvokeModelCommand({
      modelId: MODEL_ID,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 10,
        messages: [{ role: "user", content: [{ type: "text", text: "test" }] }]
      })
    });
    
    await bedrockClient.send(testCommand);
    return true;
  } catch (error) {
    console.error('AWS credentials validation failed:', error);
    return false;
  }
}