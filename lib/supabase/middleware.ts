import { NextResponse, type NextRequest } from 'next/server';
import { localClaimsEnabled, userFromClaims } from './localClaims';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { hasSessionCookie } from '@/lib/routing/landing';

/** Hard cap on the middleware's session refresh; the page renders without it if Supabase is slow. */
const MIDDLEWARE_AUTH_TIMEOUT_MS = 2500;

type UpdateSessionResult = {
  response: NextResponse;
  user: User | null;
  /**
   * True when the visitor has a session cookie but the Auth server could not be reached (network error or
   * timeout). Pages behind it would hang on their own Supabase calls, so the root middleware answers page
   * navigations with a fast "temporarily unavailable" page instead.
   */
  authUnavailable: boolean;
};

function isNetworkAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; status?: number };
  return e.name === 'AuthRetryableFetchError' || e.status === 0;
}

export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { response, user: null, authUnavailable: false };
  }

  // No Supabase auth cookie → nobody to refresh; skip the network round-trip entirely.
  if (!hasSessionCookie(request.cookies.getAll())) {
    return { response, user: null, authUnavailable: false };
  }

  const controller = new AbortController();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: controller.signal }),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options: _options }) => request.cookies.set(name, value));

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh + validate the session. getUser() hits the Auth server over the network; if that call
  // errors (transient outage, timeout, DNS blip) we MUST fail-open — return the response with a null
  // user — rather than let the rejection bubble up through middleware and 500 EVERY matched page
  // navigation at once. A single missed refresh just means the downstream RSC reads the existing
  // (unrefreshed) cookies for this one request; the next navigation refreshes normally. Fail-open is
  // the app-wide convention (see wallet-ledger, ledger, pipeline health, etc.).
  //
  // getUser() also retries internally on network errors (AuthRetryableFetchError), so a dead or paused
  // Supabase project makes it hang until Vercel kills the middleware at 25 s (504
  // MIDDLEWARE_INVOCATION_TIMEOUT, 2026-11-12). Cap it hard: after MIDDLEWARE_AUTH_TIMEOUT_MS we stop
  // waiting and fail open exactly as for an error.
  let user: User | null = null;
  let authUnavailable = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, MIDDLEWARE_AUTH_TIMEOUT_MS);
    });
    // AUTH_LOCAL_CLAIMS (lib/supabase/localClaims): getClaims() still refreshes an expired session (that is a network
    // call, under the same cap), but a valid token is checked here, with no round trip to Supabase Auth.
    const check = localClaimsEnabled()
      ? supabase.auth.getClaims().then(({ data, error }) => ({ data: { user: data?.claims ? userFromClaims(data.claims) : null }, error }))
      : supabase.auth.getUser();
    const result = await Promise.race([check, timeout]);
    if (result === null) {
      authUnavailable = true;
    } else {
      user = result.data.user ?? null;
      authUnavailable = isNetworkAuthError((result as { error?: unknown }).error);
    }
  } catch (error) {
    // auth-server error → keep navigation working with whatever cookies already exist
    authUnavailable = isNetworkAuthError(error) || error instanceof TypeError;
  } finally {
    if (timer) clearTimeout(timer);
  }

  return { response, user, authUnavailable };
}