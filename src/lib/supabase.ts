import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;
let supabasePromise: Promise<ReturnType<typeof createClient<Database>>> | null = null;

export const getHeaders = (wallet?: string) => ({
  'x-application-name': 'trumpillion',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(wallet ? { 'request.headers.wallet': wallet } : {}) // <- Hier korrekt gesetzt
});

export const getSupabase = async () => {
  if (supabaseInstance) return supabaseInstance;
  if (supabasePromise) return supabasePromise;

  supabasePromise = (async () => {
    let attempts = 0;

    // Wallet frühzeitig abrufen
    const wallet: string | null = typeof window !== 'undefined'
      ? sessionStorage.getItem('wallet') || localStorage.getItem('wallet')
      : null;

    while (attempts < RETRY_ATTEMPTS) {
      try {
        let url: string;
        let anonKey: string;

        if (import.meta.env.DEV) {
          url = import.meta.env.VITE_SUPABASE_URL;
          anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          if (!url || !url.startsWith('http')) {
            throw new Error('Missing or invalid Supabase URL');
          }
          if (!anonKey) {
            throw new Error('Missing Supabase Anon Key');
          }
        } else {
          const response = await fetch(`${typeof window !== 'undefined' ? window.location.origin : ''}/.netlify/functions/get-supabase-config`, {
            headers: getHeaders(wallet)
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`❌ Failed to load Supabase config: ${errorText}`);
            throw new Error(`Failed to load Supabase config: ${errorText}`);
          }

          const config = await response.json();

          if (!config || typeof config.url !== 'string' || typeof config.anonKey !== 'string') {
            throw new Error('Invalid Supabase config returned from server');
          }

          url = config.url;
          anonKey = config.anonKey;
        }

        // Create client with proper headers
        const client = createClient<Database>(url, anonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          },
          db: { schema: 'public' },
          realtime: { params: { eventsPerSecond: 10 } },
          global: {
            headers: getHeaders(wallet) // <- Hier wird der Header sauber übergeben
          }
        });

        // Test connection (mit Retry)
        const { data, error } = await client
          .from('settings')
          .select('value')
          .eq('key', 'main_image')
          .single();

        if (error) {
          console.warn(`⚠️ Supabase connection test failed, retrying... (${attempts + 1})`, error.message);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          attempts++;
          continue;
        }

        console.log('✅ Supabase connection successful', data);

        supabaseInstance = client;
        supabasePromise = null;
        return client;
      } catch (error) {
        attempts++;

        if (attempts === RETRY_ATTEMPTS) {
          supabasePromise = null;
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

        console.warn(`Supabase connection attempt ${attempts} failed...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }

    supabasePromise = null;
    throw new Error('Failed to initialize Supabase after all retry attempts');
  })();

  return supabasePromise;
};