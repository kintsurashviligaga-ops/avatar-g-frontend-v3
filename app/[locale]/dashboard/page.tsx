import { redirect } from 'next/navigation';
import MyAvatarHome from '@/components/home/MyAvatarHome';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

interface AvatarRow {
  id: string;
  name: string | null;
  personality: string | null;
  voice_id: string | null;
  image_url: string | null;
}

interface ChatSessionRow {
  id: string;
  title?: string | null;
  created_at: string;
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  let userName = 'Guest';
  let isAuthenticated = false;
  let shouldOnboard = false;
  let avatar: AvatarRow | null = null;
  let recentConversations: Array<{
    id: string;
    title: string;
    last_message_at: string;
    last_message_snippet: string | null;
  }> = [];

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      userName = user.user_metadata?.full_name || user.email || 'Authenticated User';

      // First-login onboarding gate — only persona rows count (name IS NOT NULL)
      const { data: avatarRow } = await supabase
        .from('avatars')
        .select('id, name, personality, voice_id, image_url')
        .eq('user_id', user.id)
        .not('name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<AvatarRow>();

      if (!avatarRow) {
        shouldOnboard = true;
      } else {
        avatar = avatarRow;
      }

      // Last 3 chat sessions (production uses chat_sessions / chat_messages,
      // not the conversations/messages tables from the historic migration set)
      const { data: sessionRows } = await supabase
        .from('chat_sessions')
        .select('id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (sessionRows?.length) {
        const sessionIds = sessionRows.map((s: ChatSessionRow) => s.id);
        const { data: lastMsgs } = await supabase
          .from('chat_messages')
          .select('session_id, content, created_at')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false })
          .limit(60);

        const lastByConvo = new Map<string, { content: string; created_at: string }>();
        for (const m of lastMsgs ?? []) {
          if (!lastByConvo.has(m.session_id)) {
            lastByConvo.set(m.session_id, { content: m.content, created_at: m.created_at });
          }
        }

        recentConversations = sessionRows.map((s: ChatSessionRow) => {
          const last = lastByConvo.get(s.id);
          return {
            id: s.id,
            title: s.title || (last ? last.content.slice(0, 40) : 'Conversation'),
            last_message_at: last?.created_at ?? s.created_at,
            last_message_snippet: last ? last.content.slice(0, 80) : null,
          };
        });
      }
    }
  } catch {
    // Guest mode fallback when auth infrastructure is unavailable
  }

  if (shouldOnboard) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <MyAvatarHome
      locale={locale}
      userName={userName}
      isAuthenticated={isAuthenticated}
      avatar={avatar}
      recentConversations={recentConversations}
    />
  );
}
