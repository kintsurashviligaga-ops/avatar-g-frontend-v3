import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

type UpdateSessionResult = {
  response: NextResponse;
  user: User | null;
};

export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { response, user: null };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
  let user: User | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    // transient auth-server error → keep navigation working with whatever cookies already exist
  }

  return { response, user };
}