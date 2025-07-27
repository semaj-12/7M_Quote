import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve test files
app.use(express.static(path.join(__dirname, '..')));

// Serve uploaded PDF files with proper headers
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../uploads', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }
  
  // Set proper headers for PDF viewing
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src 'self' data:;");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  // Send the file
  res.sendFile(filePath);
});

// Fallback static serving for non-PDF files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Log API requests
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Try to create HTTPS server with self-signed certificate for PDF viewing
  try {
    const certsDir = path.resolve(__dirname, "../certs");
    const keyPath = path.join(certsDir, "dev.key");
    const certPath = path.join(certsDir, "dev.crt");

    // Generate self-signed cert if it doesn't exist
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      log("Generating self-signed certificate for HTTPS...");
      const { execSync } = await import("child_process");
      fs.mkdirSync(certsDir, { recursive: true });
      
      try {
        execSync(
          `openssl req -x509 -newkey rsa:2048 -nodes -out "${certPath}" -keyout "${keyPath}" -days 365 -subj "/CN=localhost"`,
          { stdio: 'pipe' }
        );
        log("Self-signed certificate generated successfully");
      } catch (opensslError) {
        log("OpenSSL not available, skipping HTTPS setup");
        throw opensslError;
      }
    }

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };

      const httpsServer = https.createServer(httpsOptions, app);
      const httpsPort = 5001;
      httpsServer.listen(httpsPort, "0.0.0.0", () => {
        log(`HTTPS server running at https://localhost:${httpsPort}`);
        log("Use HTTPS URL for viewing PDFs to avoid CORS issues");
      });
    }
  } catch (httpsError: any) {
    log("HTTPS setup failed, continuing with HTTP only");
    console.error("HTTPS Error:", httpsError.message);
  }

  // Start HTTP server on port 5000
  const httpPort = 5000;
  server.listen(httpPort, "0.0.0.0", () => {
    log(`HTTP server running at http://localhost:${httpPort}`);
    log("Upload directory: " + path.join(__dirname, '../uploads'));
  });
})();
