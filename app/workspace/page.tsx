import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import WorkspaceClient from './workspace-client';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth');
  }

  return <WorkspaceClient userEmail={user.email ?? 'signed-in-user'} />;
}
