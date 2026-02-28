/**
 * Supabase Browser Client
 * Re-exports from lib/supabase/browser.ts for compatibility.
 * Use this import path for hooks/components that need a browser Supabase client.
 */
export {
  supabase,
  createBrowserClient,
  createBrowserClient as getSupabaseBrowserClient,
} from './browser'
