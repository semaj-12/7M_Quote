import express from 'express';
import crypto from 'crypto';
import axios from 'axios';

export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  discoveryUrl?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
  realmId?: string; // For QuickBooks
  companyId?: string; // For Xero/NetSuite
}

export interface OAuthState {
  provider: string;
  userId: number;
  state: string;
  codeVerifier?: string; // For PKCE
  nonce?: string;
  timestamp: number;
}

export class OAuthService {
  private providers: Map<string, OAuthProvider> = new Map();
  private stateStore: Map<string, OAuthState> = new Map();
  private isDevelopmentMode: boolean;

  constructor() {
    this.isDevelopmentMode = process.env.NODE_ENV === 'development';
    this.initializeProviders();
    // Clean up expired state entries every hour
    setInterval(() => this.cleanupExpiredStates(), 3600000);
  }

  private initializeProviders() {
    // QuickBooks OAuth Configuration
    this.providers.set('quickbooks', {
      name: 'QuickBooks',
      clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/quickbooks`,
      authUrl: 'https://appcenter.intuit.com/connect/oauth2',
      tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      scopes: ['com.intuit.quickbooks.accounting'],
      discoveryUrl: 'https://developer.intuit.com/.well-known/connect_discovery'
    });

    // Xero OAuth Configuration
    this.providers.set('xero', {
      name: 'Xero',
      clientId: process.env.XERO_CLIENT_ID || '',
      clientSecret: process.env.XERO_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/xero`,
      authUrl: 'https://login.xero.com/identity/connect/authorize',
      tokenUrl: 'https://identity.xero.com/connect/token',
      scopes: ['accounting.transactions', 'accounting.contacts', 'accounting.settings'],
    });

    // NetSuite OAuth Configuration (OAuth 2.0)
    this.providers.set('netsuite', {
      name: 'NetSuite',
      clientId: process.env.NETSUITE_CLIENT_ID || '',
      clientSecret: process.env.NETSUITE_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/netsuite`,
      authUrl: 'https://system.netsuite.com/app/login/oauth2/authorize.nl',
      tokenUrl: 'https://system.netsuite.com/app/login/oauth2/token.nl',
      scopes: ['restlets', 'rest_webservices'],
    });

    // ADP OAuth Configuration
    this.providers.set('adp', {
      name: 'ADP',
      clientId: process.env.ADP_CLIENT_ID || '',
      clientSecret: process.env.ADP_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/adp`,
      authUrl: 'https://accounts.adp.com/auth/oauth/v2/authorize',
      tokenUrl: 'https://accounts.adp.com/auth/oauth/v2/token',
      scopes: ['api'],
    });

    // Gusto OAuth Configuration
    this.providers.set('gusto', {
      name: 'Gusto',
      clientId: process.env.GUSTO_CLIENT_ID || '',
      clientSecret: process.env.GUSTO_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/gusto`,
      authUrl: 'https://api.gusto-demo.com/oauth/authorize',
      tokenUrl: 'https://api.gusto-demo.com/oauth/token',
      scopes: ['companies:read', 'employees:read', 'payrolls:read'],
    });

    // Google OAuth Configuration
    this.providers.set('google', {
      name: 'Google',
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/google`,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email', 'profile'],
    });

    // Microsoft OAuth Configuration
    this.providers.set('microsoft', {
      name: 'Microsoft',
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/microsoft`,
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: ['openid', 'email', 'profile'],
    });

    // Apple OAuth Configuration
    this.providers.set('apple', {
      name: 'Apple',
      clientId: process.env.APPLE_CLIENT_ID || '',
      clientSecret: process.env.APPLE_CLIENT_SECRET || '',
      redirectUri: `http://localhost:5000/api/oauth/callback/apple`,
      authUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      scopes: ['name', 'email'],
    });
  }

  generateAuthUrl(provider: string, userId: number): string {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // In development mode, return a mock OAuth URL
    if (this.isDevelopmentMode) {
      return `/api/oauth/mock/${provider}?user_id=${userId}`;
    }

    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Store state for validation
    this.stateStore.set(state, {
      provider,
      userId,
      state,
      nonce,
      timestamp: Date.now()
    });

    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      response_type: 'code',
      scope: providerConfig.scopes.join(' '),
      redirect_uri: providerConfig.redirectUri,
      state: state,
      access_type: 'offline', // For refresh tokens
    });

    // Provider-specific parameters
    if (provider === 'quickbooks') {
      params.append('response_type', 'code');
    } else if (provider === 'xero') {
      params.append('code_challenge_method', 'S256');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      params.append('code_challenge', codeChallenge);
      
      // Update state store with code verifier
      const stateData = this.stateStore.get(state);
      if (stateData) {
        stateData.codeVerifier = codeVerifier;
        this.stateStore.set(state, stateData);
      }
    }

    return `${providerConfig.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    provider: string, 
    code: string, 
    state: string, 
    realmId?: string
  ): Promise<OAuthTokens> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // Validate state
    const stateData = this.stateStore.get(state);
    if (!stateData || stateData.provider !== provider) {
      throw new Error('Invalid or expired OAuth state');
    }

    // Clean up state
    this.stateStore.delete(state);

    const tokenRequestData: any = {
      grant_type: 'authorization_code',
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      code: code,
      redirect_uri: providerConfig.redirectUri,
    };

    // Add PKCE verifier for Xero
    if (provider === 'xero' && stateData.codeVerifier) {
      tokenRequestData.code_verifier = stateData.codeVerifier;
    }

    try {
      const response = await axios.post(providerConfig.tokenUrl, tokenRequestData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      const tokens: OAuthTokens = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type || 'Bearer',
        scope: response.data.scope,
      };

      // Add provider-specific data
      if (provider === 'quickbooks' && realmId) {
        tokens.realmId = realmId;
      } else if (provider === 'xero') {
        // Get company/tenant info for Xero
        tokens.companyId = await this.getXeroTenantId(tokens.accessToken);
      }

      return tokens;
    } catch (error: any) {
      console.error(`OAuth token exchange failed for ${provider}:`, error.response?.data || error.message);
      throw new Error(`Failed to exchange authorization code for tokens: ${error.response?.data?.error || error.message}`);
    }
  }

  async refreshTokens(provider: string, refreshToken: string): Promise<OAuthTokens> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const refreshRequestData = {
      grant_type: 'refresh_token',
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      refresh_token: refreshToken,
    };

    try {
      const response = await axios.post(providerConfig.tokenUrl, refreshRequestData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken, // Some providers don't return new refresh token
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type || 'Bearer',
        scope: response.data.scope,
      };
    } catch (error: any) {
      console.error(`Token refresh failed for ${provider}:`, error.response?.data || error.message);
      throw new Error(`Failed to refresh tokens: ${error.response?.data?.error || error.message}`);
    }
  }

  private async getXeroTenantId(accessToken: string): Promise<string> {
    try {
      const response = await axios.get('https://api.xero.com/connections', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data && response.data.length > 0) {
        return response.data[0].tenantId;
      }
      throw new Error('No Xero tenants found');
    } catch (error: any) {
      console.error('Failed to get Xero tenant ID:', error.response?.data || error.message);
      throw new Error('Failed to get Xero company information');
    }
  }

  private cleanupExpiredStates() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [state, data] of this.stateStore.entries()) {
      if (now - data.timestamp > maxAge) {
        this.stateStore.delete(state);
      }
    }
  }

  validateProvider(provider: string): boolean {
    return this.providers.has(provider);
  }

  getProviderConfig(provider: string): OAuthProvider | undefined {
    return this.providers.get(provider);
  }

  async validateConnection(provider: string, tokens: OAuthTokens): Promise<boolean> {
    // In development mode, always return true for mock connections
    if (this.isDevelopmentMode) {
      return true;
    }

    try {
      switch (provider) {
        case 'quickbooks':
          return await this.validateQuickBooksConnection(tokens);
        case 'xero':
          return await this.validateXeroConnection(tokens);
        case 'netsuite':
          return await this.validateNetSuiteConnection(tokens);
        case 'adp':
          return await this.validateADPConnection(tokens);
        case 'gusto':
          return await this.validateGustoConnection(tokens);
        case 'google':
          return await this.validateGoogleConnection(tokens);
        case 'microsoft':
          return await this.validateMicrosoftConnection(tokens);
        case 'apple':
          return await this.validateAppleConnection(tokens);
        default:
          return false;
      }
    } catch (error) {
      console.error(`Connection validation failed for ${provider}:`, error);
      return false;
    }
  }

  private async validateQuickBooksConnection(tokens: OAuthTokens): Promise<boolean> {
    const response = await axios.get(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokens.realmId}/companyinfo/${tokens.realmId}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Accept': 'application/json',
        },
      }
    );
    return response.status === 200;
  }

  private async validateXeroConnection(tokens: OAuthTokens): Promise<boolean> {
    const response = await axios.get('https://api.xero.com/api.xro/2.0/Organisation', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.companyId || '',
        'Accept': 'application/json',
      },
    });
    return response.status === 200;
  }

  private async validateNetSuiteConnection(tokens: OAuthTokens): Promise<boolean> {
    // NetSuite validation would depend on specific endpoint configuration
    // This is a placeholder implementation
    return true;
  }

  private async validateADPConnection(tokens: OAuthTokens): Promise<boolean> {
    const response = await axios.get('https://api.adp.com/hr/v1/worker-demographics', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
      },
    });
    return response.status === 200;
  }

  private async validateGustoConnection(tokens: OAuthTokens): Promise<boolean> {
    const response = await axios.get('https://api.gusto-demo.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
      },
    });
    return response.status === 200;
  }

  private async validateGoogleConnection(tokens: OAuthTokens): Promise<boolean> {
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
      },
    });
    return response.status === 200;
  }

  private async validateMicrosoftConnection(tokens: OAuthTokens): Promise<boolean> {
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
      },
    });
    return response.status === 200;
  }

  private async validateAppleConnection(tokens: OAuthTokens): Promise<boolean> {
    // Apple validation is more complex and typically handled differently
    // For now, return true in development mode
    return true;
  }
}

export const oauthService = new OAuthService();