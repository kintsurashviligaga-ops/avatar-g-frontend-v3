import MyAvatarChatV2 from '@/components/chat/MyAvatarChatV2';
import { createServerClient } from '@/lib/supabase/server';

// The full multimodal chat hub (chat / image / video / music / avatar /
// interior / voice). It used to be the `/dashboard` home; the home is now the
// Cinematic Film Studio, so the hub lives here and is linked from the studio's
// top bar. The legacy ChatInterface remains at components/chat/ChatInterface.tsx
// for rollback (this route previously rendered it).

export const dynamic = 'force-dynamic';

interface ChatPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { locale } = await params;

  let userName = 'Guest';
  let userEmail: string | undefined;
  let isAuthenticated = false;

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      userName = user.user_metadata?.full_name || user.email || 'Authenticated User';
      userEmail = user.email ?? undefined;
    }
  } catch {
    // Guest fallback — the hub renders fine unauthenticated.
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
