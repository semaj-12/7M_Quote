// backend/routes/auth.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/callback", async (req, res) => {
  const { code, provider } = req.body;

  if (!code || !provider) {
    return res.status(400).json({ error: "Missing code or provider" });
  }

  try {
    if (provider === "quickbooks") {
      const tokenRes = await axios.post(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI,
        }),
        {
          auth: {
            username: process.env.QUICKBOOKS_CLIENT_ID,
            password: process.env.QUICKBOOKS_CLIENT_SECRET,
          },
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      return res.json({ provider, tokens: tokenRes.data });
    }

    if (provider === "xero") {
      const tokenRes = await axios.post(
        "https://identity.xero.com/connect/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.XERO_REDIRECT_URI,
          client_id: process.env.XERO_CLIENT_ID,
          client_secret: process.env.XERO_CLIENT_SECRET,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      return res.json({ provider, tokens: tokenRes.data });
    }

    res.status(400).json({ error: "Unsupported provider" });
  } catch (error) {
    console.error("OAuth error:", error?.response?.data || error.message);
    res.status(500).json({ error: "Token exchange failed" });
  }
});

module.exports = router;
