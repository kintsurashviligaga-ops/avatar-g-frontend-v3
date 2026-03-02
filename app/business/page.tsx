import { createServerClient } from '@/lib/supabase/server'
import { BusinessHub } from '@/components/business/BusinessHub'

export const dynamic = 'force-dynamic'

export default async function BusinessPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Auth bypass for testing — no redirect
  return <BusinessHub userId={user?.id ?? 'anonymous'} />
}
