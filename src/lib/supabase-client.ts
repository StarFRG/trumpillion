import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';
import { getHeaders } from './supabase';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 60000;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;
let supabasePromise: Promise<ReturnType<typeof createClient<Database>>> | null = null;
let isInitializing = false;

export const getSupabaseClient = async () => {
  if (supabaseInstance) return supabaseInstance;
  if (supabasePromise) return supabasePromise;

  if (isInitializing) {
    const waitTimeout = CONNECTION_TIMEOUT;
    const start = Date.now();
    while (isInitializing && (Date.now() - start < waitTimeout)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isInitializing) {
      throw new Error('SUPABASE_INIT_TIMEOUT');
    }
    return supabaseInstance!;
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

        const wallet = sessionStorage.getItem('wallet') || localStorage.getItem('wallet');
        const headers = getHeaders(wallet);

        const client = createClient<Database>(url, anonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          },
          db: { schema: 'public' },
          realtime: { 
            params: { 
              eventsPerSecond: 10 
            } 
          },
          global: {
            headers
          }
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('CONNECTION_TEST_TIMEOUT')), CONNECTION_TIMEOUT);
        });

        const testQuery = client
          .from('settings')
          .select('value', { headers })
          .eq('key', 'main_image')
          .single();

        const result = await Promise.race([testQuery, timeoutPromise]);

        if (result instanceof Error) {
          throw result;
        }

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
              source: 'getSupabaseClient',
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
    supabasePromise = null;
  }
};

export default getSupabaseClient;