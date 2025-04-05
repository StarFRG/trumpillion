import { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  try {
    return {
      statusCode: 200,
      body: JSON.stringify({
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get Supabase configuration' })
    };
  }
};