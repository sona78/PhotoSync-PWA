import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

console.log('[Supabase] Initializing client...');
console.log('[Supabase] URL:', supabaseUrl);
console.log('[Supabase] Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : '✗ Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing environment variables!');
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Validate Supabase anon key format (should be a JWT starting with "eyJ")
if (!supabaseAnonKey.startsWith('eyJ')) {
  console.error('[Supabase] ❌ INVALID ANON KEY FORMAT!');
  console.error('[Supabase] The anon key should be a JWT token starting with "eyJ"');
  console.error('[Supabase] Current key starts with:', supabaseAnonKey.substring(0, 20));
  console.error('[Supabase]');
  console.error('[Supabase] To fix this:');
  console.error('[Supabase] 1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api');
  console.error('[Supabase] 2. Copy the "anon public" key');
  console.error('[Supabase] 3. Update REACT_APP_SUPABASE_ANON_KEY in your .env file');
  console.error('[Supabase] 4. Restart the dev server (npm start)');
  throw new Error('Invalid Supabase anon key format. Please check your .env file and use the correct anon/public key from your Supabase project settings.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': 'photosync-pwa'
    }
  }
});

console.log('[Supabase] ✓ Client created successfully');
