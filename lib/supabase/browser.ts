import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

// Keep the public type identical to the previous bare supabase-js client so
// downstream call sites (query builders, onAuthStateChange callbacks) retain the
// exact same loose typing — only the underlying storage/flow changes to cookies.
type BrowserClient = SupabaseClient;

let browserClient: BrowserClient | null = null;

/**
 * Cookie-backed browser client (PKCE flow).
 *
 * We use @supabase/ssr's createBrowserClient — NOT the bare supabase-js
 * createClient — so the auth session and PKCE code-verifier live in cookies
 * (not localStorage). This keeps three things coherent that previously diverged:
 *
 *   1. The /auth/callback server route can run exchangeCodeForSession(), because
 *      the PKCE verifier cookie set here is readable server-side.
 *   2. middleware.ts / lib/supabase/server.ts see the same session cookies, so
 *      session refresh and server reads actually observe the logged-in user.
 *   3. OAuth and email magic-link both return a ?code= the server can exchange.
 */
function getOrCreateBrowserClient(): BrowserClient {
  if (!isConfigured) {
    return null as unknown as BrowserClient;
  }

  if (browserClient) {
    return browserClient;
  }

  if (typeof window !== 'undefined') {
    const globalKey = '__avatarg_supabase_browser_client__' as const;
    const globalWithClient = window as typeof window & {
      [globalKey]?: BrowserClient;
    };

    if (!globalWithClient[globalKey]) {
      globalWithClient[globalKey] = (createSsrBrowserClient(supabaseUrl!, supabaseAnonKey!) as unknown as BrowserClient);
    }

    browserClient = globalWithClient[globalKey]!;
    return browserClient;
  }

  browserClient = (createSsrBrowserClient(supabaseUrl!, supabaseAnonKey!) as unknown as BrowserClient);
  return browserClient;
}

export const supabase = getOrCreateBrowserClient();

export function isSupabaseConfigured(): boolean {
  return isConfigured;
}

/**
 * Returns the cookie-backed Supabase client for browser usage.
 * Returns null when Supabase is not configured (demo mode).
 */
export function createBrowserClient() {
  return getOrCreateBrowserClient();
}
