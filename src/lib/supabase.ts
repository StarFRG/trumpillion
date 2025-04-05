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
    try {
      let url: string;
      let anonKey: string;

      // Unterschied zwischen Lokal und Production
      if (import.meta.env.DEV) {
        url = import.meta.env.VITE_SUPABASE_URL;
        anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      } else {
        const response = await fetch('/.netlify/functions/get-supabase-config');
        const rawText = await response.text();

        if (!response.ok) {
          throw new Error(`Failed to get Supabase configuration: ${rawText}`);
        }

        let config;
        try {
          config = JSON.parse(rawText);
        } catch {
          throw new Error(`Invalid JSON response from config endpoint: ${rawText}`);
        }

        url = config.url;
        anonKey = config.anonKey;
        
        if (!url || !anonKey) {
          throw new Error('Missing required Supabase configuration');
        }
      }

      if (!url || !url.startsWith('http')) {
        throw new Error('Missing or invalid endpoint');
      }
      const wsEndpoint = url.replace('https', 'wss');

      const client = createClient<Database>(url, anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'x-application-name': 'trumpillion'
          }
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      // Test connection
      const { error } = await client.from('settings').select('*').limit(1);
      if (error) throw error;

      console.log('✅ Supabase connection successful');
      
      supabaseInstance = client;
      return client;
    } catch (error) {
      supabasePromise = null; // Reset on failure
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to init Supabase'),
        context: { source: 'getSupabase' }
      });
      throw error;
    }
  })();

  return supabasePromise;
};