// ვარიანტი A: თუ @supabase/ssr არ გინდა
import { createClient } from '@supabase/supabase-js'
import { getPublicEnv } from '@/lib/env/public'

export const supabase = createClient(
  getPublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)
