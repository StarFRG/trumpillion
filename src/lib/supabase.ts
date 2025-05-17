import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 60000;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;
let supabasePromise: Promise<ReturnType<typeof createClient<Database>>> | null = null;
let isInitializing = false;

export const getHeaders = (wallet?: string) => ({
  'x-application-name': 'trumpillion',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(wallet ? { 'wallet': wallet } : {})
});

export const getSupabase = async () => {
  if (supabaseInstance) return supabaseInstance;
  if (supabasePromise) return supabasePromise;

  supabasePromise = (async () => {
    if (isInitializing) {
      const waitTimeout = CONNECTION_TIMEOUT;
      const start = Date.now();
      while (isInitializing && (Date.now() - start < waitTimeout)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (isInitializing) {
        throw new Error('Supabase initialization timeout');
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
              throw new Error('Missing or invalid Supabase URL');
            }
            if (!anonKey) {
              throw new Error('Missing Supabase Anon Key');
            }
          } else {
            const response = await fetch('/.netlify/functions/get-supabase-config', {
              headers: getHeaders()
            });

            if (!response.ok) {
              throw new Error(`Failed to load Supabase config: ${await response.text()}`);
            }

            const config = await response.json();
            if (!config?.url?.startsWith('http') || !config?.anonKey) {
              throw new Error('Invalid Supabase config returned from server');
            }

            url = config.url;
            anonKey = config.anonKey;
          }

          // Create client with global headers
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
              headers: getHeaders()
            }
          });

          // Test connection with timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection test timeout')), CONNECTION_TIMEOUT);
          });

          const testQuery = client
            .from('settings')
            .select('value')
            .eq('key', 'main_image')
            .single();

          const { error } = await Promise.race([testQuery, timeoutPromise]) as any;

          if (error && error.code !== 'PGRST116') {
            throw error;
          }

          console.log('✅ Supabase connection successful');
          supabaseInstance = client;
          supabasePromise = null;
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

      throw new Error('Failed to initialize Supabase after all retry attempts');
    } finally {
      isInitializing = false;
      supabasePromise = null;
    }
  })();

  return supabasePromise;
};