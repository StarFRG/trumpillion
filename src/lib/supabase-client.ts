import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { monitoring } from '../services/monitoring';
import { getSupabase, getSupabaseWithHeaders } from './supabase';

export { getSupabase, getSupabaseWithHeaders };

// Re-export for backwards compatibility
export default getSupabase;