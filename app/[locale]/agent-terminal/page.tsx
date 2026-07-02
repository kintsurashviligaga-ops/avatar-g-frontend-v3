import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import AgentTerminal from '@/components/agent/AgentTerminal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agent Terminal · MyAvatar' };

type Props = { params: Promise<{ locale: string }> };

export default async function AgentTerminalPage({ params }: Props) {
  const { locale } = await params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return <AgentTerminal locale={locale} />;
}
