import { Router } from 'express';
import { oauthService } from './oauth-service';
import { storage } from './storage';
import { oauthStorage } from './oauth-storage';

const router = Router();

// Mock OAuth flow for development
router.get('/oauth/mock/:provider', (req, res) => {
  const { provider } = req.params;
  const { user_id } = req.query;
  
  // Mock OAuth authorization page
  res.send(`
    <html>
      <head>
        <title>Mock ${provider} Authorization</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 500px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
          }
          .provider {
            color: #2563eb;
            font-size: 24px;
            margin-bottom: 20px;
            text-transform: capitalize;
          }
          .description {
            margin-bottom: 30px;
            color: #666;
          }
          button {
            background: #2563eb;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin: 0 10px;
          }
          button:hover {
            background: #1d4ed8;
          }
          .cancel {
            background: #6b7280;
          }
          .cancel:hover {
            background: #4b5563;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="provider">${provider}</h2>
          <p class="description">
            7M Quote is requesting access to your ${provider} account to import historical data for more accurate quote generation.
          </p>
          <p><strong>This is a development mock - no real connection will be made.</strong></p>
          <button onclick="authorize()">Authorize</button>
          <button class="cancel" onclick="cancel()">Cancel</button>
        </div>
        
        <script>
          function authorize() {
            fetch('/api/oauth/callback/${provider}?code=mock_code&state=mock_state&realmId=mock_realm')
              .then(() => {
                window.opener.postMessage({
                  type: 'OAUTH_COMPLETE',
                  provider: '${provider}',
                  success: true
                }, window.location.origin);
                window.close();
              });
          }
          
          function cancel() {
            window.opener.postMessage({
              type: 'OAUTH_COMPLETE',
              provider: '${provider}',
              success: false,
              error: 'User cancelled authorization'
            }, window.location.origin);
            window.close();
          }
        </script>
      </body>
    </html>
  `);
});

// Start OAuth flow
router.get('/oauth/authorize/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = 1; // TODO: Get from authenticated user session
    
    if (!oauthService.validateProvider(provider)) {
      return res.status(400).json({ error: 'Unsupported OAuth provider' });
    }

    const authUrl = oauthService.generateAuthUrl(provider, userId);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('OAuth authorization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
router.get('/oauth/callback/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, realmId, error } = req.query;

    // Handle mock OAuth flow in development
    if (process.env.NODE_ENV === 'development' && code === 'mock_code') {
      console.log(`Mock OAuth connection successful for ${provider}`);
      return res.send(`
        <html>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_COMPLETE',
              provider: '${provider}',
              success: true
            }, window.location.origin);
            window.close();
          </script>
        </html>
      `);
    }

    if (error) {
      console.error(`OAuth error for ${provider}:`, error);
      return res.send(`
        <html>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_COMPLETE',
              provider: '${provider}',
              success: false,
              error: '${error}'
            }, window.location.origin);
            window.close();
          </script>
        </html>
      `);
    }

    if (!code || !state) {
      return res.send(`
        <html>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_COMPLETE',
              provider: '${provider}',
              success: false,
              error: 'missing_parameters'
            }, window.location.origin);
            window.close();
          </script>
        </html>
      `);
    }

    const tokens = await oauthService.exchangeCodeForTokens(
      provider,
      code as string,
      state as string,
      realmId as string
    );

    // Validate the connection
    const isValid = await oauthService.validateConnection(provider, tokens);
    if (!isValid) {
      return res.redirect(`${process.env.CLIENT_URL}/?oauth_error=connection_invalid`);
    }

    // Store tokens securely
    await oauthStorage.storeTokens(1, provider, tokens); // TODO: Get real userId from session

    console.log(`OAuth connection successful for ${provider}`);
    res.send(`
      <html>
        <script>
          window.opener.postMessage({
            type: 'OAUTH_COMPLETE',
            provider: '${provider}',
            success: true
          }, window.location.origin);
          window.close();
        </script>
      </html>
    `);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.CLIENT_URL}/?oauth_error=${encodeURIComponent(error.message)}`);
  }
});

// Check connection status
router.get('/oauth/status/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = 1; // TODO: Get from authenticated user session

    // Get stored tokens from storage
    const storedTokens = await oauthStorage.getTokens(userId, provider);
    const isConnected = !!storedTokens;
    
    res.json({
      provider,
      connected: isConnected,
      lastSync: storedTokens?.updatedAt?.toISOString() || null,
      companyName: storedTokens?.companyName || null
    });
    

  } catch (error: any) {
    console.error('OAuth status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect OAuth connection
router.delete('/oauth/disconnect/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = 1; // TODO: Get from authenticated user session

    // Remove stored tokens
    await oauthStorage.removeTokens(userId, provider);

    console.log(`OAuth disconnection for ${provider}`);
    res.json({ message: `Disconnected from ${provider}` });
  } catch (error: any) {
    console.error('OAuth disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Refresh tokens
router.post('/oauth/refresh/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = 1; // TODO: Get from authenticated user session

    // TODO: Get stored refresh token from database
    // const storedTokens = await storage.getOAuthTokens(userId, provider);
    
    // For now, return error
    res.status(404).json({ error: 'No stored tokens found' });
    
    // const newTokens = await oauthService.refreshTokens(provider, storedTokens.refreshToken);
    // await storage.updateOAuthTokens(userId, provider, newTokens);
    // res.json({ message: 'Tokens refreshed successfully' });
  } catch (error: any) {
    console.error('OAuth token refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test connection
router.post('/oauth/test/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = 1; // TODO: Get from authenticated user session

    // TODO: Get stored tokens and test connection
    // const tokens = await storage.getOAuthTokens(userId, provider);
    // const isValid = await oauthService.validateConnection(provider, tokens);
    
    res.json({ 
      connected: false, // For now
      message: 'Connection test completed' 
    });
  } catch (error: any) {
    console.error('OAuth connection test error:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as oauthRoutes };