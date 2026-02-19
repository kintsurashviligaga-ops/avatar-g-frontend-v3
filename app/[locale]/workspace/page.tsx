import WorkspaceClient from '@/app/workspace/workspace-client';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface LocaleWorkspacePageProps {
  params: {
    locale: string;
  };
}

export default async function LocaleWorkspacePage({ params }: LocaleWorkspacePageProps) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <WorkspaceClient locale={params.locale} userEmail={user?.email ?? null} />;
}
