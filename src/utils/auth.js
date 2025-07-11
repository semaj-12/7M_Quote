// src/utils/auth.js

const REDIRECT_URI = "http://localhost:5173/callback";

// Construct state string encoding the provider (and optionally more info)
function generateState(provider) {
  return encodeURIComponent(JSON.stringify({ provider }));
}

export function generateQuickBooksAuthUrl(clientId) {
  const state = generateState("quickbooks");
  const url = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=com.intuit.quickbooks.accounting&state=${state}`;
  return url;
}

export function generateXeroAuthUrl(clientId) {
  const state = generateState("xero");
  const url = `https://login.xero.com/identity/connect/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=openid profile email accounting.transactions accounting.settings offline_access&state=${state}`;
  return url;
}

export function parseState(state) {
  try {
    return JSON.parse(decodeURIComponent(state));
  } catch (error) {
    return {};
  }
}
