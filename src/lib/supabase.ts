import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;

export const getSupabase = async () => {
  if (supabaseInstance) return supabaseInstance;

  for (let i = 0; i < RETRY_ATTEMPTS; i++) {
    try {
      const client = createClient<Database>(supabaseUrl, supabaseKey, {
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
      await client.from('settings').select('*').limit(1);
      console.log('✅ Supabase connection successful');
      
      supabaseInstance = client;
      return client;
    } catch (error) {
      console.warn(`⚠️ Supabase connection attempt ${i + 1} failed:`, error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to connect to Supabase'),
        context: { attempt: i + 1 }
      });

      if (i === RETRY_ATTEMPTS - 1) throw error;
      await new Promise(r => setTimeout(r, RETRY_DELAY * (i + 1)));
    }
  }
  throw new Error('Failed to connect to Supabase after multiple attempts');
};