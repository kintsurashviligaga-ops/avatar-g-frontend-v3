import { redirect } from 'next/navigation';
import MyAvatarChatV2 from '@/components/chat/MyAvatarChatV2';
import { createServerClient } from '@/lib/supabase/server';

// V2 = the minimalist Cyber-Black single-window shell.
// V1 (MyAvatarChat) is left intact at components/chat/MyAvatarChat.tsx
// so the rollback path is a one-line import swap.

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  let userName = 'Guest';
  let userEmail: string | undefined;
  let isAuthenticated = false;
  let shouldOnboard = false;

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      userName = user.user_metadata?.full_name || user.email || 'Authenticated User';
      userEmail = user.email ?? undefined;

      // First-login onboarding gate
      const { data: avatar } = await supabase
        .from('avatars')
        .select('id')
        .eq('user_id', user.id)
        .not('name', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!avatar) {
        shouldOnboard = true;
      }
    }
  } catch {
    // Guest fallback
  }

  if (shouldOnboard) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <MyAvatarChatV2
      locale={locale}
      userName={userName}
      userEmail={userEmail}
      isAuthenticated={isAuthenticated}
    />
  );
}
