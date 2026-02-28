import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { BusinessHub } from '@/components/business/BusinessHub'

export const dynamic = 'force-dynamic'

export default async function BusinessPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/business')
  return <BusinessHub userId={user.id} />
}
