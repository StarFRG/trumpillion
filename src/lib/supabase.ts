import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;
let supabasePromise: Promise<ReturnType<typeof createClient<Database>>> | null = null;

export const getSupabase = async () => {
  if (supabaseInstance) return supabaseInstance;
  if (supabasePromise) return supabasePromise;

  supabasePromise = (async () => {
    let attempts = 0;

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
            headers: { 'Accept': 'application/json' }
          });

          if (!response.ok) {
            throw new Error(`Failed to load Supabase configuration: ${await response.text()}`);
          }

          const config = await response.json();

          if (!config || typeof config.url !== 'string' || typeof config.anonKey !== 'string') {
            throw new Error('Invalid Supabase config returned from server');
          }

          if (!config.url.startsWith('http')) {
            throw new Error('Invalid Supabase URL from server');
          }

          url = config.url;
          anonKey = config.anonKey;
        }

        // Clean header initialization
        const globalHeaders: Record<string, string> = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-application-name': 'trumpillion'
        };

        // Optional wallet header (browser only)
        if (typeof window !== 'undefined') {
          const wallet = localStorage.getItem('wallet');
          if (wallet) {
            globalHeaders['wallet'] = wallet;
          }
        }

        const client = createClient<Database>(url, anonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          },
          db: { schema: 'public' },
          realtime: { params: { eventsPerSecond: 10 } }
        });

        // Test connection
        const { error } = await client
          .from('settings')
          .select('value')
          .eq('key', 'main_image')
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        console.log('✅ Supabase connection successful');

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