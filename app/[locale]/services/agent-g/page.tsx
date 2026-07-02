import { redirect } from 'next/navigation'

// RETIRED (One Window): the agent + its live process now render IN-PLACE inside the main
// /dashboard window (ServiceHub → ChatChrome, #agent), not on this /services/agent-g surface
// (the "unused services surface" the product moved away from). Kept as a redirect so the old
// nav target / bookmarks land on the in-place agent. The old client is preserved in /_graveyard.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string }> }

export default async function AgentGRedirect({ params }: Props) {
  const { locale } = await params
  redirect(`/${locale}/dashboard#agent`)
}
