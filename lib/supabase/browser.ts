import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

function createFallbackClient(): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => undefined,
          },
        },
      }),
    },
  } as unknown as SupabaseClient;
}

export function createBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  try {
    browserClient = createClientComponentClient();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(
        `Failed to initialize Supabase browser client. ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    console.error('[supabase/browser] Failed to initialize browser client. Falling back to noop client.');
    browserClient = createFallbackClient();
  }

  return browserClient;
}

export const supabase = createBrowserClient();