require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const AWS = require("aws-sdk");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

let tokens = {
  quickbooks: null,
  xero: null,
};

// AWS Configuration
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const textract = new AWS.Textract();
const comprehend = new AWS.Comprehend();
const upload = multer({ dest: "uploads/" });

/* ------------------ TOKEN EXCHANGE + STORAGE ------------------ */

app.post("/api/exchange-token", async (req, res) => {
  const { code, provider } = req.body;

  try {
    let tokenResponse;
    if (provider === "quickbooks") {
      tokenResponse = await axios.post(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.REDIRECT_URI,
        }),
        {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
    } else if (provider === "xero") {
      tokenResponse = await axios.post(
        "https://identity.xero.com/connect/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.REDIRECT_URI,
        }),
        {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
    }

    tokens[provider] = tokenResponse.data;
    res.sendStatus(200);
  } catch (err) {
    console.error(`❌ Failed to exchange token:`, err.response?.data || err.message);
    res.status(500).send("Token exchange failed");
  }
});

/* ------------------ AI PARSING MODULE ------------------ */

const parseTextWithComprehend = async (text) => {
  const result = await comprehend.detectEntities({ LanguageCode: "en", Text: text }).promise();
  return result.Entities;
};

const extractTextFromPdfWithTextract = async (filePath) => {
  const fileBytes = fs.readFileSync(filePath);
  const params = {
    Document: { Bytes: fileBytes },
    FeatureTypes: ["TABLES", "FORMS"],
  };

  const response = await textract.analyzeDocument(params).promise();
  const blocks = response.Blocks.filter((b) => b.BlockType === "LINE").map((b) => b.Text);
  return blocks.join(" ");
};

/* ------------------ QUICKBOOKS / XERO AUTO FETCH ------------------ */

app.get("/api/auto-fetch", async (req, res) => {
  const results = {};

  if (tokens.quickbooks) {
    try {
      const realmId = process.env.QB_REALM_ID;
      const headers = {
        Authorization: `Bearer ${tokens.quickbooks.access_token}`,
        Accept: "application/json",
      };

      const endpoints = {
        invoices: `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from Invoice`,
        bills: `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from Bill`,
        purchaseOrders: `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from PurchaseOrder`,
        employees: `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from Employee`,
        timesheets: `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from TimeActivity`,
      };

      for (const [type, url] of Object.entries(endpoints)) {
        const res = await axios.get(url, { headers });
        results[type] = res.data;
      }
    } catch (err) {
      console.error("❌ Error fetching from QuickBooks:", err.response?.data || err.message);
    }
  }

  if (tokens.xero) {
    try {
      const headers = {
        Authorization: `Bearer ${tokens.xero.access_token}`,
        Accept: "application/json",
      };

      const org = await axios.get("https://api.xero.com/connections", { headers });
      const tenantId = org.data[0].tenantId;

      const endpoints = {
        invoices: "https://api.xero.com/api.xro/2.0/Invoices",
        bills: "https://api.xero.com/api.xro/2.0/Bills",
        purchaseOrders: "https://api.xero.com/api.xro/2.0/PurchaseOrders",
        employees: "https://api.xero.com/api.xro/2.0/Employees",
        payroll: "https://api.xero.com/payroll.xro/2.0/PayRuns",
      };

      for (const [type, url] of Object.entries(endpoints)) {
        const res = await axios.get(url, {
          headers: { ...headers, "Xero-Tenant-Id": tenantId },
        });
        results[type] = res.data;
      }
    } catch (err) {
      console.error("❌ Error fetching from Xero:", err.response?.data || err.message);
    }
  }

  res.json(results);
});

/* ------------------ FILE UPLOAD (MANUAL USER FILES) ------------------ */

app.post("/api/manual-upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;

  try {
    const rawText = await extractTextFromPdfWithTextract(filePath);
    const entities = await parseTextWithComprehend(rawText);
    fs.unlinkSync(filePath); // clean up

    res.json({ extractedText: rawText, entities });
  } catch (err) {
    console.error("❌ Parsing error:", err.message);
    res.status(500).send("Failed to process file");
  }
});

/* ------------------ START SERVER ------------------ */

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
