import { monitoring } from '../services/monitoring';

export const getRpcEndpoint = async (): Promise<string> => {
  try {
    if (import.meta.env.DEV) {
      const local = import.meta.env.VITE_SOLANA_RPC_URL;
      if (!local?.startsWith('http')) {
        throw new Error('Local RPC endpoint is invalid or missing');
      }
      return local;
    }

    const response = await fetch('/.netlify/functions/get-config', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to load RPC endpoint: ${text}`);
    }

    const config = await response.json();
    const { SOLANA_RPC_URL } = config;

    if (!SOLANA_RPC_URL?.startsWith('http')) {
      throw new Error('RPC endpoint is missing or invalid');
    }

    return SOLANA_RPC_URL;
  } catch (error) {
    monitoring.logError({
      error: error instanceof Error ? error : new Error('Unknown error in getRpcEndpoint'),
      context: { source: 'getRpcEndpoint' }
    });
    throw error;
  }
};

export const getWsEndpoint = (endpoint: string): string => {
  if (!endpoint?.startsWith('http')) {
    throw new Error('Missing or invalid endpoint');
  }
  return endpoint.replace('https://', 'wss://');
};