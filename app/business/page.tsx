import { requireUser } from '@/lib/supabase/server'
import { BusinessHub } from '@/components/business/BusinessHub'

export default async function BusinessPage() {
  const user = await requireUser()
  return <BusinessHub userId={user.id} />
}
