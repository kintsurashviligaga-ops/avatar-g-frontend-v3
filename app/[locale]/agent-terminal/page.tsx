import { redirect } from 'next/navigation';

// RETIRED (One Window): the STEP 3 agent + its live process now mount IN-PLACE inside the main
// /dashboard window (ServiceHub → ChatChrome, #agent) — never on a separate route. This standalone
// route is kept only as a redirect so any bookmark / old link lands on the in-place agent.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ prompt?: string }> };

export default async function AgentTerminalRedirect({ params, searchParams }: Props) {
  const { locale } = await params;
  const { prompt } = await searchParams;
  const q = prompt && prompt.trim() ? `?prompt=${encodeURIComponent(prompt.trim().slice(0, 2000))}` : '';
  redirect(`/${locale}/dashboard${q}#agent`);
}
