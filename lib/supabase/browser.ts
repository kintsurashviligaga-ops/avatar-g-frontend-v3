import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env/public';

let browserClient: SupabaseClient | null = null;

function getPublicSupabaseConfig() {
  const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
  browserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}