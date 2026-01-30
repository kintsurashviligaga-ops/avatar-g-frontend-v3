import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env/public'

export const supabase = createBrowserClient(
  getPublicEnv('NEXT_PUBLIC_SUPABASE_URL'),      // ✅ type-safe, throws if missing
  getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')  // ✅ type-safe, throws if missing
)
