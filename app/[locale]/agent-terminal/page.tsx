import { redirect } from 'next/navigation';

// RETIRED (One Window): the STEP 3 agent + its live process now mount IN-PLACE inside the main
// /dashboard window (ServiceHub → ChatChrome, #agent) — never on a separate route. This standalone
// route is kept only as a redirect so any bookmark / old link lands on the in-place agent.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export default async function AgentTerminalRedirect({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard#agent`);
}
