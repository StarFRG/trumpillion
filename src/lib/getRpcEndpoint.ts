import { monitoring } from '../services/monitoring';

export const getRpcEndpoint = async (): Promise<string> => {
  try {
    if (import.meta.env.DEV) {
      const local = import.meta.env.VITE_SOLANA_RPC_URL;
      if (!local?.startsWith('http')) {
        throw new Error('Lokaler RPC-Endpoint ist ungültig oder fehlt');
      }
      return local;
    }

    const response = await fetch('/.netlify/functions/get-config');
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RPC-Endpoint konnte nicht geladen werden: ${text}`);
    }

    const config = await response.json();
    const { SOLANA_RPC_URL } = config;

    if (!SOLANA_RPC_URL?.startsWith('http')) {
      throw new Error('RPC Endpoint fehlt oder ist ungültig');
    }

    return SOLANA_RPC_URL;
  } catch (error) {
    monitoring.logError({
      error: error instanceof Error ? error : new Error('Unbekannter Fehler bei getRpcEndpoint'),
      context: { source: 'getRpcEndpoint' }
    });
    throw error;
  }
};

export const getWsEndpoint = (endpoint: string): string => {
  if (!endpoint?.startsWith('http')) {
    throw new Error('Fehlender oder ungültiger Endpoint');
  }
  return endpoint.replace('https://', 'wss://');
};