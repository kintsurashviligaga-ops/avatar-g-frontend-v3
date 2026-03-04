import { createServerClient } from '@/lib/supabase/server';
import ExecutiveDashboard from '@/components/executive/ExecutiveDashboard';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LocalizedExecutivePage({ params }: Props) {
  await params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ExecutiveDashboard userId={user?.id ?? 'anonymous'} />;
}
