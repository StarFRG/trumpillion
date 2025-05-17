import { createClient } from '@supabase/supabase-js';
import { monitoring } from '../../src/services/monitoring';
import type { Database } from '../../src/types';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;
let isInitializing = false;

async function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL as string;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  if (!supabaseUrl?.startsWith('https://') || !supabaseKey) {
    throw new Error('Missing or invalid Supabase environment variables');
  }

  // Schutz vor paralleler Initialisierung
  if (isInitializing || supabaseInstance) {
    console.log("Supabase is already initializing, waiting...");
    const waitTimeout = 5000;
    const start = Date.now();
    while (!supabaseInstance && (Date.now() - start < waitTimeout)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!supabaseInstance) {
      monitoring.logError({
        error: new Error('Supabase initialization timeout exceeded.'),
        context: { action: 'init_supabase', timeout: waitTimeout }
      });
      throw new Error('Supabase initialization timeout exceeded.');
    }
    return supabaseInstance;
  }

  isInitializing = true;
  let attempts = 0;
  let lastError: Error | null = null;

  try {
    while (attempts < RETRY_ATTEMPTS) {
      try {
        const client = createClient<Database>(
          supabaseUrl,
          supabaseKey,
          {
            auth: {
              autoRefreshToken: true,
              persistSession: false
            },
            db: {
              schema: 'public'
            }
          }
        );

        const { error } = await client
          .from('settings')
          .select('value')
          .eq('key', 'main_image')
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        monitoring.logInfo({
          message: 'Supabase connection established successfully',
          context: { action: 'init_supabase', url: supabaseUrl }
        });

        supabaseInstance = client;
        return client;
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempts === RETRY_ATTEMPTS) {
          monitoring.logError({
            error: lastError,
            context: { 
              action: 'init_supabase', 
              attempts,
              url: supabaseUrl
            }
          });
          throw lastError;
        }

        const delay = RETRY_DELAY * Math.pow(2, attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    isInitializing = false;
    if (!supabaseInstance) {
      monitoring.logError({
        error: new Error('Supabase instance is null after initialization'),
        context: { action: 'init_supabase' }
      });
    }
  }

  throw lastError ?? new Error('Failed to initialize Supabase after all retries');
}

/**
 * Asynchrone Methode zum Abrufen der Supabase-Instanz.
 */
export const getSupabase = async () => {
  if (!supabaseInstance) {
    await initSupabase();
  }
  return supabaseInstance;
};