import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertQuoteSchema,
  insertCompanySchema,
} from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { analyzeBlueprintWithAI, validateAWSCredentials } from "./ai-service";
import { comprehensiveMLService } from "./comprehensive-ml-service";
import { oauthRoutes } from "./oauth-routes";
import { materialPricingService } from "./material-pricing-service";
import { mlService } from "./ml-service";
import { bookkeepingService } from "./bookkeeping-integration";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Register OAuth routes
  app.use("/api", oauthRoutes);

  // Serve files from uploads safely
  app.get("/uploads/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(uploadDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
      }

      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        res.setHeader("Access-Control-Allow-Origin", "*");
      }

      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).send("Error serving file");
    }
  });
  // --- Company routes ---
  app.get("/api/company/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const company = await storage.getCompanyByUserId(userId);
      if (!company) return res.status(404).json({ message: "Company not found" });
      res.json(company);
    } catch {
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  app.post("/api/company", async (req, res) => {
    try {
      const validatedData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(validatedData);
      res.status(201).json(company);
    } catch {
      res.status(400).json({ message: "Invalid company data" });
    }
  });

  // --- Drawing routes ---
  app.get("/api/drawings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const drawings = await storage.getDrawingsByUserId(userId);
      res.json(drawings);
    } catch {
      res.status(500).json({ message: "Failed to fetch drawings" });
    }
  });

  app.post("/api/drawings/upload", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const userId = parseInt(req.body.userId);
      if (!userId) return res.status(400).json({ message: "User ID is required" });

      // Try to upload to S3 first, fallback to local storage
      let s3Key: string | undefined;
      let s3Url: string | undefined;
      let storageType: "s3" | "local" = "local";

      try {
        const { uploadPdfToS3, validateS3Configuration } = await import('./s3-service');
        
        // Validate S3 configuration before attempting upload
        const s3Config = await validateS3Configuration();
        if (!s3Config.valid) {
          console.warn('S3 not configured properly:', s3Config.message);
          throw new Error('S3 configuration invalid');
        }
        
        const s3Result = await uploadPdfToS3(req.file.path, req.file.originalname, userId);
        s3Key = s3Result.key;
        s3Url = s3Result.signedUrl;
        storageType = "s3";
        console.log(`PDF successfully uploaded to S3: ${s3Key}`);
      } catch (s3Error: any) {
        console.warn('S3 upload failed, using local storage:', s3Error?.message);
        // Continue with local storage as fallback
      }

      const drawingData = {
        userId,
        name: req.body.name || req.file.originalname,
        originalName: req.file.originalname,
        filePath: req.file.filename,
        fileSize: req.file.size,
        status: "uploaded" as const,
        s3Key,
        s3Url,
        storageType,
      };

      const drawing = await storage.createDrawing(drawingData);

      // Mock AI processing
      setTimeout(async () => {
        await storage.updateDrawing(drawing.id, {
          ...drawingData,
          status: "processed",
          extractedData: {
            dimensions: [
              { type: "length", value: "24'-6\"", x: 100, y: 200 },
              { type: "height", value: "8'-0\"", x: 300, y: 150 },
              { type: "beam", value: "W12x26", x: 200, y: 250 },
            ],
          },
        });
      }, 3000);

      res.status(201).json(drawing);
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to upload drawing" });
    }
  });
  app.get("/api/drawings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const drawing = await storage.getDrawing(id);
      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }
      res.json(drawing);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch drawing" });
    }
  });

  // AI Analysis routes
  app.post("/api/drawings/:drawingId/analyze", async (req, res) => {
    try {
      const drawingId = parseInt(req.params.drawingId);
      const drawing = await storage.getDrawing(drawingId);

      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }

      // Validate AWS credentials first
      const credentialsValid = await validateAWSCredentials();
      if (!credentialsValid) {
        return res.status(500).json({
          message:
            "AWS credentials not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables.",
        });
      }

      // Analyze the drawing with AI
      const analysis = await analyzeBlueprintWithAI(drawing.filePath);

      // Update drawing with analysis results
      await storage.updateDrawing(drawingId, {
        extractedData: analysis,
        status: "analyzed",
      });

      res.json({ success: true, analysis });
    } catch (error) {
      console.error("Error analyzing drawing:", error);
      res.status(500).json({ message: "Failed to analyze drawing with AI" });
    }
  });

  // Get analysis results
  app.get("/api/drawings/:drawingId/analysis", async (req, res) => {
    try {
      const drawingId = parseInt(req.params.drawingId);
      const drawing = await storage.getDrawing(drawingId);

      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }

      if (!drawing.extractedData) {
        return res
          .status(404)
          .json({
            message: "No analysis data found. Please run AI analysis first.",
          });
      }

      res.json(drawing.extractedData);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ message: "Failed to fetch analysis data" });
    }
  });

  // Get PDF URL for viewing (S3 pre-signed URL or local proxy)
  app.get("/api/drawings/:id/url", async (req, res) => {
    try {
      const drawingId = parseInt(req.params.id);
      const drawing = await storage.getDrawing(drawingId);
      
      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }

      console.log(`Drawing ${drawingId} - storageType: ${drawing.storageType}, s3Key: ${drawing.s3Key ? 'present' : 'missing'}`);
      
      // If stored in S3, generate a fresh pre-signed URL for direct access
      if (drawing.storageType === 's3' && drawing.s3Key) {
        try {
          console.log(`Attempting to generate S3 pre-signed URL for drawing ${drawingId} with key: ${drawing.s3Key}`);
          const { generateSignedUrl } = await import('./s3-service');
          const signedUrl = await generateSignedUrl(drawing.s3Key, 3600); // 1 hour expiry
          console.log(`Successfully generated S3 pre-signed URL for drawing ${drawingId}: ${signedUrl.substring(0, 100)}...`);
          res.json({
            url: signedUrl,
            storageType: 's3',
            direct: true,
            expiresIn: 3600
          });
          return;
        } catch (s3Error: any) {
          console.error(`Failed to generate S3 pre-signed URL for drawing ${drawingId}:`, s3Error);
          console.error('S3 Error details:', s3Error.message);
          // Fall back to proxy method
        }
      }

      // Use proxy URL for local files or S3 fallback
      const proxyUrl = `http://localhost:5000/api/drawings/${drawingId}/view`;
      res.json({
        url: proxyUrl,
        storageType: drawing.storageType || 'local',
        direct: false
      });
    } catch (error: any) {
      console.error("Error getting PDF URL:", error);
      res.status(500).json({ message: "Failed to get PDF URL" });
    }
  });

  // PDF proxy endpoint - serves content through local server to avoid browser blocks
  app.get("/api/drawings/:id/view", async (req, res) => {
    try {
      const drawingId = parseInt(req.params.id);
      const drawing = await storage.getDrawing(drawingId);
      
      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }

      // Set proper headers for PDF viewing
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (drawing.storageType === 's3' && drawing.s3Key) {
        try {
          // Stream from S3 through our server
          const { getFileStream } = await import('./s3-service');
          const stream = await getFileStream(drawing.s3Key);
          stream.pipe(res);
          console.log(`Serving PDF from S3: ${drawing.s3Key}`);
        } catch (s3Error: any) {
          console.error('S3 streaming failed, falling back to local:', s3Error);
          // Fallback to local file
          const filePath = path.join(process.cwd(), 'uploads', drawing.filePath);
          if (fs.existsSync(filePath)) {
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
          } else {
            res.status(404).json({ message: 'File not found' });
          }
        }
      } else {
        // Serve local file
        const filePath = path.join(process.cwd(), 'uploads', drawing.filePath);
        console.log(`Serving local PDF: ${filePath}`);
        if (fs.existsSync(filePath)) {
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
        } else {
          res.status(404).json({ message: 'File not found locally' });
        }
      }
    } catch (error: any) {
      console.error('PDF proxy error:', error);
      res.status(500).json({ message: 'Failed to serve PDF' });
    }
  });

  // S3 credentials validation endpoint
  app.get("/api/s3/validate-credentials", async (req, res) => {
    try {
      const { validateS3Configuration } = await import('./s3-service');
      const validation = await validateS3Configuration();
      res.json(validation);
    } catch (error: any) {
      console.error("Error validating S3 credentials:", error);
      res.status(500).json({ 
        valid: false, 
        message: "Failed to validate S3 credentials" 
      });
    }
  });

  // Refresh S3 pre-signed URL for a drawing
  app.post("/api/drawings/:id/refresh-url", async (req, res) => {
    try {
      const drawingId = parseInt(req.params.id);
      const drawing = await storage.getDrawing(drawingId);
      
      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }

      if (drawing.storageType !== 's3' || !drawing.s3Key) {
        return res.status(400).json({ 
          message: "Drawing is not stored in S3" 
        });
      }

      const { generateSignedUrl } = await import('./s3-service');
      const signedUrl = await generateSignedUrl(drawing.s3Key, 3600);
      
      res.json({
        url: signedUrl,
        storageType: 's3',
        direct: true,
        expiresIn: 3600,
        refreshed: true
      });
    } catch (error: any) {
      console.error("Error refreshing S3 pre-signed URL:", error);
      res.status(500).json({ message: "Failed to refresh S3 URL" });
    }
  });

  // Test S3 URL accessibility
  app.get("/api/drawings/:id/test-access", async (req, res) => {
    try {
      const drawingId = parseInt(req.params.id);
      const drawing = await storage.getDrawing(drawingId);
      
      if (!drawing) {
        return res.status(404).json({ message: "Drawing not found" });
      }

      if (drawing.storageType === 's3' && drawing.s3Key) {
        const { generateSignedUrl } = await import('./s3-service');
        const signedUrl = await generateSignedUrl(drawing.s3Key, 3600);
        
        // Test if the URL is accessible
        try {
          const testResponse = await fetch(signedUrl, { method: 'HEAD' });
          res.json({
            accessible: testResponse.ok,
            status: testResponse.status,
            statusText: testResponse.statusText,
            url: signedUrl,
            headers: Object.fromEntries(testResponse.headers.entries())
          });
        } catch (fetchError: any) {
          res.json({
            accessible: false,
            error: fetchError.message,
            url: signedUrl
          });
        }
      } else {
        res.json({
          accessible: false,
          message: "Not stored in S3"
        });
      }
    } catch (error: any) {
      console.error("Error testing S3 URL access:", error);
      res.status(500).json({ message: "Failed to test S3 URL access" });
    }
  });

  // AWS credentials validation endpoint
  app.get("/api/ai/validate-credentials", async (req, res) => {
    try {
      const isValid = await validateAWSCredentials();
      res.json({
        valid: isValid,
        message: isValid
          ? "AWS credentials are valid"
          : "AWS credentials are invalid or not configured",
      });
    } catch (error: any) {
      console.error("Error validating AWS credentials:", error);
      res.status(500).json({ message: "Failed to validate AWS credentials" });
    }
  });

  // Quote routes
  app.get("/api/quotes/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const quotes = await storage.getQuotesByUserId(userId);
      res.json(quotes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  app.post("/api/quotes", async (req, res) => {
    try {
      // Generate quote number
      const quoteNumber = `QF-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      const quoteData = {
        ...req.body,
        quoteNumber,
      };

      const validatedData = insertQuoteSchema.parse(quoteData);

      // Calculate costs based on material prices and company settings
      const company = await storage.getCompanyByUserId(validatedData.userId);
      if (!company) {
        return res.status(400).json({ message: "Company profile required" });
      }

      // Get current material costs
      const materialCosts = await storage.getMaterialCosts();
      const materialPrice =
        materialCosts.find((m) =>
          m.materialType
            .toLowerCase()
            .includes(validatedData.materialGrade.toLowerCase()),
        )?.pricePerPound || 0.75; // Default fallback

      // Calculate estimated material weight and cost
      const estimatedWeight = 1000; // TODO: Calculate from drawing dimensions
      const materialCost =
        estimatedWeight * parseFloat(materialPrice.toString());

      // Calculate labor cost
      const laborCost =
        parseFloat(validatedData.laborHours.toString()) *
        parseFloat(company.laborRate.toString());

      // Calculate overhead and profit
      const subtotal = materialCost + laborCost;
      const overheadCost =
        subtotal * (parseFloat(company.overheadRate.toString()) / 100);
      const profitAmount =
        (subtotal + overheadCost) *
        (parseFloat(company.profitMargin.toString()) / 100);
      const totalCost = subtotal + overheadCost + profitAmount;

      const finalQuoteData = {
        ...validatedData,
        materialCost: materialCost.toString(),
        laborCost: laborCost.toString(),
        overheadCost: overheadCost.toString(),
        profitAmount: profitAmount.toString(),
        totalCost: totalCost.toString(),
      };

      const quote = await storage.createQuote(finalQuoteData);
      res.status(201).json(quote);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid quote data" });
    }
  });

  app.get("/api/quotes/recent/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const quotes = await storage.getRecentQuotes(userId, 5);
      res.json(quotes);
    } catch (error: any) {
      console.error("Recent quotes error:", error);
      res.status(500).json({ message: "Failed to fetch recent quotes" });
    }
  });

  app.put("/api/quotes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertQuoteSchema.parse(req.body);
      const quote = await storage.updateQuote(id, validatedData);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid quote data" });
    }
  });

  // Dashboard stats route
  app.get("/api/dashboard/stats/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Machine Learning endpoints
  app.post("/api/ml/train-model/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { mlService } = await import("./ml-service");
      await mlService.trainAccuracyModel(userId);
      res.json({ message: "Model training completed successfully" });
    } catch (error: any) {
      console.error("Error training ML model:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to train ML model" });
    }
  });

  app.post("/api/ml/predict-labor", async (req, res) => {
    try {
      const { userId, projectData } = req.body;
      const { mlService } = await import("./ml-service");
      const prediction = await mlService.predictLaborHours(userId, projectData);
      res.json(prediction);
    } catch (error: any) {
      console.error("Error predicting labor hours:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to predict labor hours" });
    }
  });

  app.get("/api/ml/regulatory-codes/:location", async (req, res) => {
    try {
      const location = req.params.location;
      const { mlService } = await import("./ml-service");
      const compliance = await mlService.getRegulatoryCodes(location);
      res.json(compliance);
    } catch (error: any) {
      console.error("Error fetching regulatory codes:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to fetch regulatory codes" });
    }
  });

  // Real-time material pricing endpoints
  app.get("/api/pricing/realtime/:materialType/:location", async (req, res) => {
    try {
      const { materialType, location } = req.params;
      const { materialPricingService } = await import(
        "./material-pricing-service"
      );
      const pricing = await materialPricingService.getRealTimePricing(
        materialType,
        location,
      );
      res.json(pricing);
    } catch (error: any) {
      console.error("Error fetching real-time pricing:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to fetch real-time pricing",
        });
    }
  });

  app.post("/api/pricing/transportation", async (req, res) => {
    try {
      const { destination, materialWeight } = req.body;
      const { materialPricingService } = await import(
        "./material-pricing-service"
      );
      const costs = await materialPricingService.calculateTransportationCosts(
        destination,
        materialWeight,
      );
      res.json(costs);
    } catch (error: any) {
      console.error("Error calculating transportation costs:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to calculate transportation costs",
        });
    }
  });

  app.get("/api/pricing/trends/:materialType/:days", async (req, res) => {
    try {
      const { materialType, days } = req.params;
      const { materialPricingService } = await import(
        "./material-pricing-service"
      );
      const trends = await materialPricingService.analyzeMarketTrends(
        materialType,
        parseInt(days),
      );
      res.json(trends);
    } catch (error: any) {
      console.error("Error analyzing market trends:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to analyze market trends" });
    }
  });

  app.post("/api/pricing/alert", async (req, res) => {
    try {
      const alertData = req.body;
      const { materialPricingService } = await import(
        "./material-pricing-service"
      );
      const alert = await materialPricingService.createPricingAlert(alertData);
      res.json(alert);
    } catch (error: any) {
      console.error("Error creating pricing alert:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to create pricing alert" });
    }
  });

  // Comprehensive ML Analysis Routes
  app.post("/api/ml/comprehensive-analysis", async (req, res) => {
    try {
      const { userId, pdfPath, projectLocation, urgency } = req.body;

      if (!userId || !pdfPath || !projectLocation) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      const analysis =
        await comprehensiveMLService.analyzeProjectComprehensively(
          userId,
          pdfPath,
          projectLocation,
          urgency || "standard",
        );

      res.json(analysis);
    } catch (error: any) {
      console.error("Error in comprehensive ML analysis:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to perform comprehensive analysis",
        });
    }
  });

  app.get("/api/ml/labor-variability/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      // This would typically get labor variability data from comprehensive ML service
      const laborVariability = {
        averageEfficiency: 0.85,
        skillLevelDistribution: {
          junior: { percentage: 0.3, efficiency: 0.7, hourlyRate: 25 },
          intermediate: { percentage: 0.4, efficiency: 1.0, hourlyRate: 35 },
          senior: { percentage: 0.2, efficiency: 1.3, hourlyRate: 50 },
          certified: { percentage: 0.1, efficiency: 1.5, hourlyRate: 65 },
        },
        qualityVariation: {
          averageReworkRate: 0.08,
          inspectionFailureRate: 0.05,
          materialWasteRate: 0.03,
        },
      };

      res.json(laborVariability);
    } catch (error: any) {
      console.error("Error fetching labor variability:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to fetch labor variability data",
        });
    }
  });

  app.post("/api/ml/multi-material-analysis", async (req, res) => {
    try {
      const { materials, projectLocation } = req.body;

      if (!materials || !Array.isArray(materials)) {
        return res.status(400).json({ message: "Materials array is required" });
      }

      // Analyze multiple materials and their interactions
      const multiMaterialAnalysis = {
        primaryMaterial: materials[0] || null,
        secondaryMaterials: materials.slice(1),
        materialTransitions:
          materials.length > 1
            ? [
                {
                  from: materials[0]?.type || "unknown",
                  to: materials[1]?.type || "unknown",
                  jointType: "butt joint",
                  weldingRequirements: ["AWS D1.1", "Visual inspection"],
                },
              ]
            : [],
        compatibilityIssues:
          materials.length > 1 ? ["Thermal expansion mismatch"] : [],
        costImplications: {
          materialCost: materials.reduce(
            (sum, m) => sum + (m.estimatedCost || 0),
            0,
          ),
          laborMultiplier: 1.2,
          additionalProcessing: ["Pre-heat treatment", "Post-weld inspection"],
        },
      };

      res.json(multiMaterialAnalysis);
    } catch (error: any) {
      console.error("Error in multi-material analysis:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to perform multi-material analysis",
        });
    }
  });

  app.get("/api/ml/fabrication-standards/:location", async (req, res) => {
    try {
      const { location } = req.params;

      // Get fabrication standards based on location
      const standards = {
        weldingStandards: ["AWS D1.1", "AISC 360"],
        buildingCodes: ["IBC 2021", "ASCE 7-16"],
        inspectionRequirements: [
          "Visual inspection",
          "Magnetic particle testing",
        ],
        certificationNeeded: ["CWI certification", "AISC certification"],
        additionalCosts: 2500,
        complianceNotes: [
          "Seismic design requirements for Zone 4",
          "Wind load calculations required",
          "Third-party inspection mandatory",
        ],
      };

      res.json(standards);
    } catch (error: any) {
      console.error("Error fetching fabrication standards:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to fetch fabrication standards",
        });
    }
  });

  // Bookkeeping integration endpoints
  app.post("/api/bookkeeping/connect/quickbooks", async (req, res) => {
    try {
      const credentials = req.body;
      const { bookkeepingService } = await import("./bookkeeping-integration");
      const connection =
        await bookkeepingService.connectQuickBooks(credentials);
      res.json(connection);
    } catch (error: any) {
      console.error("Error connecting to QuickBooks:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to connect to QuickBooks" });
    }
  });

  app.post("/api/bookkeeping/historical-data", async (req, res) => {
    try {
      const { software, dateRange } = req.body;
      const { bookkeepingService } = await import("./bookkeeping-integration");
      const data = await bookkeepingService.getHistoricalProjectData(
        software,
        dateRange,
      );
      res.json(data);
    } catch (error: any) {
      console.error("Error fetching historical project data:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to fetch historical project data",
        });
    }
  });

  app.post("/api/bookkeeping/labor-analysis", async (req, res) => {
    try {
      const { software, projectIds } = req.body;
      const { bookkeepingService } = await import("./bookkeeping-integration");
      const analysis = await bookkeepingService.analyzeLaborCosts(
        software,
        projectIds,
      );
      res.json(analysis);
    } catch (error: any) {
      console.error("Error analyzing labor costs:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to analyze labor costs" });
    }
  });

  // Geo-location routes
  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      const { geoLocationService } = await import("./geo-location-service");
      const result = await geoLocationService.geocodeAddress(address);

      res.json(result);
    } catch (error: any) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/geocode/validate-keys", async (req, res) => {
    try {
      const { geoLocationService } = await import("./geo-location-service");
      const status = await geoLocationService.validateApiKeys();

      res.json(status);
    } catch (error: any) {
      console.error("API key validation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
