import { Handler } from '@netlify/functions';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-application-name, wallet, Wallet'
};

export const handler: Handler = async (event) => {
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  // Validate request headers
  const appName = event.headers['x-application-name'];
  if (!appName || appName !== 'trumpillion') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Invalid or missing application name'
      })
    };
  }

  // Validate environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Missing Supabase environment variables'
      })
    };
  }

  // Validate URL format
  if (!process.env.SUPABASE_URL.startsWith('https://')) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Invalid Supabase URL format'
      })
    };
  }

  // Validate wallet header if present
  const walletHeader = event.headers['wallet'] || event.headers['Wallet'];
  if (walletHeader && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletHeader)) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Invalid wallet format'
      })
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY
    })
  };
};