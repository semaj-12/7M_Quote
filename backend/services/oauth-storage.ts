// OAuth Token Storage Service
// This file handles secure storage and retrieval of OAuth tokens

export interface StoredOAuthTokens {
  userId: number;
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
  realmId?: string; // For QuickBooks
  companyId?: string; // For Xero/NetSuite
  companyName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class OAuthStorageService {
  // TODO: Implement database storage for OAuth tokens
  // For now, using in-memory storage for development
  private tokens: Map<string, StoredOAuthTokens> = new Map();

  private getTokenKey(userId: number, provider: string): string {
    return `${userId}:${provider}`;
  }

  async storeTokens(
    userId: number,
    provider: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      tokenType: string;
      scope?: string;
      realmId?: string;
      companyId?: string;
    }
  ): Promise<void> {
    const key = this.getTokenKey(userId, provider);
    const now = new Date();
    
    const storedTokens: StoredOAuthTokens = {
      userId,
      provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(now.getTime() + tokens.expiresIn * 1000) : undefined,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      realmId: tokens.realmId,
      companyId: tokens.companyId,
      companyName: this.getCompanyName(provider),
      createdAt: this.tokens.get(key)?.createdAt || now,
      updatedAt: now,
    };

    this.tokens.set(key, storedTokens);
    console.log(`Stored OAuth tokens for user ${userId}, provider ${provider}`);
  }

  async getTokens(userId: number, provider: string): Promise<StoredOAuthTokens | null> {
    const key = this.getTokenKey(userId, provider);
    return this.tokens.get(key) || null;
  }

  async removeTokens(userId: number, provider: string): Promise<void> {
    const key = this.getTokenKey(userId, provider);
    this.tokens.delete(key);
    console.log(`Removed OAuth tokens for user ${userId}, provider ${provider}`);
  }

  async updateTokens(
    userId: number,
    provider: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
    }
  ): Promise<void> {
    const existingTokens = await this.getTokens(userId, provider);
    if (!existingTokens) {
      throw new Error(`No existing tokens found for user ${userId}, provider ${provider}`);
    }

    const now = new Date();
    existingTokens.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      existingTokens.refreshToken = tokens.refreshToken;
    }
    if (tokens.expiresIn) {
      existingTokens.expiresAt = new Date(now.getTime() + tokens.expiresIn * 1000);
    }
    existingTokens.updatedAt = now;

    const key = this.getTokenKey(userId, provider);
    this.tokens.set(key, existingTokens);
    console.log(`Updated OAuth tokens for user ${userId}, provider ${provider}`);
  }

  async isTokenExpired(userId: number, provider: string): Promise<boolean> {
    const tokens = await this.getTokens(userId, provider);
    if (!tokens || !tokens.expiresAt) {
      return false; // No expiration info, assume valid
    }
    return new Date() >= tokens.expiresAt;
  }

  async getUserConnections(userId: number): Promise<string[]> {
    const connections: string[] = [];
    for (const [key, tokens] of this.tokens.entries()) {
      if (tokens.userId === userId) {
        connections.push(tokens.provider);
      }
    }
    return connections;
  }

  private getCompanyName(provider: string): string {
    // Mock company names for development
    const companyNames: Record<string, string> = {
      quickbooks: 'Mock QuickBooks Company',
      xero: 'Mock Xero Company',
      netsuite: 'Mock NetSuite Company',
      adp: 'Mock ADP Company',
      gusto: 'Mock Gusto Company',
      google: 'Google Account',
      microsoft: 'Microsoft Account',
      apple: 'Apple ID',
    };
    return companyNames[provider] || `Mock ${provider} Company`;
  }

  // Development helper methods
  async clearAllTokens(): Promise<void> {
    this.tokens.clear();
    console.log('Cleared all OAuth tokens (development mode)');
  }

  async getTokensForTesting(): Promise<Map<string, StoredOAuthTokens>> {
    return new Map(this.tokens);
  }
}

export const oauthStorage = new OAuthStorageService();

/*
 * PRODUCTION SETUP INSTRUCTIONS:
 * 
 * To use real OAuth credentials in production:
 * 
 * 1. Add your OAuth credentials to the Replit Secrets:
 *    - QUICKBOOKS_CLIENT_ID
 *    - QUICKBOOKS_CLIENT_SECRET
 *    - XERO_CLIENT_ID
 *    - XERO_CLIENT_SECRET
 *    - NETSUITE_CLIENT_ID
 *    - NETSUITE_CLIENT_SECRET
 *    - ADP_CLIENT_ID
 *    - ADP_CLIENT_SECRET
 *    - GUSTO_CLIENT_ID
 *    - GUSTO_CLIENT_SECRET
 * 
 * 2. Replace the in-memory storage in this file with database storage:
 *    - Add OAuth tokens table to shared/schema.ts
 *    - Implement database CRUD operations
 *    - Use proper encryption for token storage
 * 
 * 3. Register your OAuth applications with each provider:
 *    - QuickBooks: https://developer.intuit.com/app/developer/myapps
 *    - Xero: https://developer.xero.com/app/manage
 *    - NetSuite: https://system.netsuite.com/app/developer/integrations/integrations.nl
 *    - ADP: https://developers.adp.com/
 *    - Gusto: https://dev.gusto.com/
 * 
 * 4. Configure redirect URIs in each OAuth application:
 *    - Development: http://localhost:5000/api/oauth/callback/{provider}
 *    - Production: https://your-domain.com/api/oauth/callback/{provider}
 * 
 * 5. Update server/oauth-service.ts to use production URLs instead of localhost
 */