import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 60000;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;
let isInitializing = false;

export const getHeaders = (wallet?: string) => ({
  'x-application-name': 'trumpillion',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(wallet ? { 'wallet': wallet } : {})
});

export const getSupabase = async () => {
  if (supabaseInstance) return supabaseInstance;

  if (isInitializing) {
    const waitTimeout = CONNECTION_TIMEOUT;
    const start = Date.now();
    while (!supabaseInstance && (Date.now() - start < waitTimeout)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!supabaseInstance) {
      throw new Error('SUPABASE_INIT_TIMEOUT');
    }
    return supabaseInstance;
  }

  isInitializing = true;
  let attempts = 0;

  try {
    while (attempts < RETRY_ATTEMPTS) {
      try {
        let url: string;
        let anonKey: string;

        if (import.meta.env.DEV) {
          url = import.meta.env.VITE_SUPABASE_URL;
          anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          if (!url?.startsWith('http')) {
            throw new Error('INVALID_SUPABASE_URL');
          }
          if (!anonKey) {
            throw new Error('MISSING_SUPABASE_KEY');
          }
        } else {
          const response = await fetch('/.netlify/functions/get-supabase-config', {
            headers: getHeaders()
          });

          if (!response.ok) {
            throw new Error('SUPABASE_CONFIG_FAILED');
          }

          const config = await response.json();
          if (!config?.url?.startsWith('http') || !config?.anonKey) {
            throw new Error('INVALID_SUPABASE_CONFIG');
          }

          url = config.url;
          anonKey = config.anonKey;
        }

        const client = createClient<Database>(url, anonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          },
          db: { schema: 'public' }
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('CONNECTION_TEST_TIMEOUT')), CONNECTION_TIMEOUT);
        });

        // Test connection by checking if we can query the database at all
        const testQuery = client
          .from('settings')
          .select('*')
          .limit(1);

        const result = await Promise.race([testQuery, timeoutPromise]);

        if (result instanceof Error) {
          throw result;
        }

        // Connection test successful even if no data was found
        console.log('✅ Supabase connection successful');
        supabaseInstance = client;
        return client;
      } catch (error) {
        attempts++;
        const delay = RETRY_DELAY * Math.pow(2, attempts - 1);

        if (attempts === RETRY_ATTEMPTS) {
          monitoring.logError({
            error: error instanceof Error ? error : new Error('Failed to init Supabase'),
            context: {
              source: 'getSupabase',
              attempts,
              retryExhausted: true
            }
          });
          throw error;
        }

        console.warn(`Supabase connection attempt ${attempts} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('SUPABASE_INIT_FAILED');
  } finally {
    isInitializing = false;
  }
};

export const getSupabaseWithHeaders = async () => {
  const wallet = sessionStorage.getItem('wallet') || localStorage.getItem('wallet');
  if (!wallet) {
    throw new Error('WALLET_NOT_FOUND');
  }

  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_INITIALIZED');
  }

  return {
    supabase,
    headers: getHeaders(wallet)
  };
};