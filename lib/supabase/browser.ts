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
/**
 * NO-OP client used when Supabase is not configured.
 *
 * WHY THIS EXISTS: this function used to `return null as unknown as BrowserClient` — a lie to the type
 * system that every caller then dereferenced. `ChatChrome` calls `supabase.auth.getUser()` on mount, so a
 * missing NEXT_PUBLIC_SUPABASE_URL threw a TypeError during render and dropped the ENTIRE `/[locale]`
 * segment into the error boundary. The whole app went blank — sidebar, personas, everything — over an
 * absent env var. That made local UI inspection impossible and would do the same in production if the
 * Preview environment were ever missing the vars.
 *
 * Degrading to "permanently signed out" is the correct behaviour: the UI renders, auth-gated actions do
 * nothing, and nothing crashes. Every method resolves to the shape its caller destructures.
 */
function makeUnconfiguredClient(): BrowserClient {
  const noSession = { data: { session: null }, error: null };
  const noUser = { data: { user: null }, error: null };
  const auth = {
    getUser: async () => noUser,
    getSession: async () => noSession,
    // Callers destructure `data.subscription.unsubscribe()` in a cleanup — it must exist.
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
    signUp: async () => noUser,
    signInWithPassword: async () => noUser,
    signInWithOtp: async () => ({ data: { user: null, session: null }, error: null }),
    signInWithOAuth: async () => ({ data: { provider: null, url: null }, error: null }),
    verifyOtp: async () => noUser,
    resend: async () => ({ data: {}, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async () => noUser,
  };
  // A chainable query stub: every builder method returns itself, and awaiting yields an empty result.
  const query: Record<string, unknown> = {};
  const chain = new Proxy(query, {
    get: (_t, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return () => chain;
    },
  });
  return {
    auth,
    from: () => chain,
    channel: () => ({ on: () => chain, subscribe: () => chain, unsubscribe: () => {} }),
    removeChannel: () => {},
  } as unknown as BrowserClient;
}

function getOrCreateBrowserClient(): BrowserClient {
  if (!isConfigured) {
    // Cached so repeated calls do not allocate a new proxy on every render.
    browserClient = browserClient ?? makeUnconfiguredClient();
    return browserClient;
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
