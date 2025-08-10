import { apiRequest } from "./queryClient";

export interface OAuthConnectionStatus {
  provider: string;
  connected: boolean;
  lastSync: string | null;
  companyName: string | null;
}

export interface OAuthProvider {
  id: string;
  name: string;
  description: string;
  category: 'bookkeeping' | 'payroll';
  logoUrl?: string;
}

export const SUPPORTED_PROVIDERS: OAuthProvider[] = [
  // Bookkeeping Software
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    description: 'Connect to QuickBooks Online for accounting data',
    category: 'bookkeeping'
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Connect to Xero for accounting and financial data',
    category: 'bookkeeping'
  },
  {
    id: 'netsuite',
    name: 'NetSuite',
    description: 'Connect to NetSuite ERP for comprehensive business data',
    category: 'bookkeeping'
  },
  // Payroll Software
  {
    id: 'adp',
    name: 'ADP',
    description: 'Connect to ADP for payroll and HR data',
    category: 'payroll'
  },
  {
    id: 'gusto',
    name: 'Gusto',
    description: 'Connect to Gusto for payroll and benefits data',
    category: 'payroll'
  }
];

export const SOCIAL_PROVIDERS: OAuthProvider[] = [
  {
    id: 'google',
    name: 'Google',
    description: 'Sign in with your Google account',
    category: 'bookkeeping' // Using category for compatibility
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    description: 'Sign in with your Microsoft account',
    category: 'bookkeeping'
  },
  {
    id: 'apple',
    name: 'Apple',
    description: 'Sign in with your Apple ID',
    category: 'bookkeeping'
  }
];

export class OAuthClient {
  private static instance: OAuthClient;

  static getInstance(): OAuthClient {
    if (!OAuthClient.instance) {
      OAuthClient.instance = new OAuthClient();
    }
    return OAuthClient.instance;
  }

  private constructor() {
    // Listen for OAuth completion messages
    this.setupMessageListener();
  }

  private setupMessageListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'OAUTH_COMPLETE') {
          this.handleOAuthComplete(event.data.provider, event.data.success, event.data.error);
        }
      });
    }
  }

  async initiateOAuth(provider: string): Promise<void> {
    try {
      const response = await fetch(`/api/oauth/authorize/${provider}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate OAuth');
      }
      
      const { authUrl } = data;

      // Open OAuth flow in popup window
      const popup = window.open(
        authUrl,
        `oauth_${provider}`,
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Monitor popup for completion
      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            // Check if OAuth was successful by polling the connection status
            this.checkConnectionStatus(provider)
              .then((status) => {
                if (status.connected) {
                  resolve();
                } else {
                  reject(new Error('OAuth flow was cancelled or failed'));
                }
              })
              .catch(() => {
                reject(new Error('OAuth flow was cancelled or failed'));
              });
          }
        }, 1000);

        // Set timeout for OAuth flow
        setTimeout(() => {
          if (!popup.closed) {
            popup.close();
            clearInterval(checkClosed);
            reject(new Error('OAuth flow timed out'));
          }
        }, 300000); // 5 minutes timeout
      });
    } catch (error: any) {
      console.error(`OAuth initiation failed for ${provider}:`, error);
      throw new Error(`Failed to start OAuth flow: ${error.message}`);
    }
  }

  async checkConnectionStatus(provider: string): Promise<OAuthConnectionStatus> {
    try {
      const response = await fetch(`/api/oauth/status/${provider}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check status');
      }
      
      return data;
    } catch (error: any) {
      console.error(`Failed to check connection status for ${provider}:`, error);
      return {
        provider,
        connected: false,
        lastSync: null,
        companyName: null
      };
    }
  }

  async disconnectProvider(provider: string): Promise<void> {
    try {
      await apiRequest(`/api/oauth/disconnect/${provider}`, {
        method: 'DELETE'
      });
    } catch (error: any) {
      console.error(`Failed to disconnect ${provider}:`, error);
      throw new Error(`Failed to disconnect: ${error.message}`);
    }
  }

  async testConnection(provider: string): Promise<boolean> {
    try {
      const response = await apiRequest(`/api/oauth/test/${provider}`, {
        method: 'POST'
      });
      return response.connected;
    } catch (error: any) {
      console.error(`Connection test failed for ${provider}:`, error);
      return false;
    }
  }

  async refreshTokens(provider: string): Promise<void> {
    try {
      await apiRequest(`/api/oauth/refresh/${provider}`, {
        method: 'POST'
      });
    } catch (error: any) {
      console.error(`Token refresh failed for ${provider}:`, error);
      throw new Error(`Failed to refresh tokens: ${error.message}`);
    }
  }

  private handleOAuthComplete(provider: string, success: boolean, error?: string) {
    if (success) {
      console.log(`OAuth completed successfully for ${provider}`);
      // Trigger a re-fetch of connection status
      window.dispatchEvent(new CustomEvent('oauth-success', { detail: { provider } }));
    } else {
      console.error(`OAuth failed for ${provider}:`, error);
      window.dispatchEvent(new CustomEvent('oauth-error', { detail: { provider, error } }));
    }
  }

  getProviderInfo(providerId: string): OAuthProvider | undefined {
    return SUPPORTED_PROVIDERS.find(p => p.id === providerId);
  }

  getProvidersByCategory(category: 'bookkeeping' | 'payroll'): OAuthProvider[] {
    return SUPPORTED_PROVIDERS.filter(p => p.category === category);
  }
}

export const oauthClient = OAuthClient.getInstance();