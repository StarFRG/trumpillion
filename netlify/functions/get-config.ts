import { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  try {
    if (!process.env.SOLANA_RPC_URL?.startsWith('http')) {
      throw new Error('Ungültiger oder fehlender SOLANA_RPC_URL in Umgebungsvariablen');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        SOLANA_RPC_URL: process.env.SOLANA_RPC_URL
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: `Fehler beim Laden der Konfiguration: ${message}` 
      })
    };
  }
};