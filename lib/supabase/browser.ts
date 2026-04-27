import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

let browserClient: ReturnType<typeof createClient> | null = null;

function getOrCreateBrowserClient() {
  if (!isConfigured) {
    return null as unknown as ReturnType<typeof createClient>;
  }

  if (browserClient) {
    return browserClient;
  }

  if (typeof window !== 'undefined') {
    const globalKey = '__avatarg_supabase_browser_client__' as const;
    const globalWithClient = window as typeof window & {
      [globalKey]?: ReturnType<typeof createClient>;
    };

    if (!globalWithClient[globalKey]) {
      globalWithClient[globalKey] = createClient(supabaseUrl!, supabaseAnonKey!);
    }

    browserClient = globalWithClient[globalKey]!;
    return browserClient;
  }

  browserClient = createClient(supabaseUrl!, supabaseAnonKey!);
  return browserClient;
}

export const supabase = getOrCreateBrowserClient();

export function isSupabaseConfigured(): boolean {
  return isConfigured;
}

/**
 * Returns a new Supabase client instance for browser usage.
 * Returns null when Supabase is not configured (demo mode).
 */
export function createBrowserClient() {
  return getOrCreateBrowserClient();
}
