import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

let browserClient: ReturnType<typeof createClient> | null = null;

function getOrCreateBrowserClient() {
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

/**
 * Returns a new Supabase client instance for browser usage
 * Matches legacy createBrowserClient API for compatibility
 */
export function createBrowserClient() {
  return getOrCreateBrowserClient();
}