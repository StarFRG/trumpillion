import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase Umgebungsvariablen fehlen! Bitte .env-Datei überprüfen.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
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
  }
});

// Globaler Error Handler für Netzwerkfehler
supabase.handleNetworkError = (error: Error) => {
  console.error('Supabase Netzwerkfehler:', error);
  // Hier könnte zusätzliche Fehlerbehandlung implementiert werden
};

// Verbindungstest beim Start
supabase.from('pixels').select('count').single()
  .then(() => console.log('✅ Supabase-Verbindung erfolgreich'))
  .catch(error => {
    console.error('❌ Supabase-Verbindungsfehler:', error);
    throw new Error('Supabase-Verbindung fehlgeschlagen');
  });