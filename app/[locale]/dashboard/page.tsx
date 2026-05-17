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

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  let userName = 'Guest';
  let isAuthenticated = false;
  let shouldOnboard = false;
  let avatar: AvatarRow | null = null;
  let recentConversations: Array<{ id: string; title: string; last_message_at: string; last_message_snippet: string | null }> = [];

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

      // Last 3 conversations
      const { data: convoRows } = await supabase
        .from('conversations')
        .select('id, title, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(3);

      if (convoRows?.length) {
        // Pull the last message of each conversation for the snippet
        const convoIds = convoRows.map((c: ConversationRow) => c.id);
        const { data: lastMsgs } = await supabase
          .from('messages')
          .select('conversation_id, content, created_at')
          .in('conversation_id', convoIds)
          .order('created_at', { ascending: false })
          .limit(20);

        const lastByConvo = new Map<string, { content: string; created_at: string }>();
        for (const m of lastMsgs ?? []) {
          if (!lastByConvo.has(m.conversation_id)) {
            lastByConvo.set(m.conversation_id, { content: m.content, created_at: m.created_at });
          }
        }

        recentConversations = convoRows.map((c: ConversationRow) => {
          const last = lastByConvo.get(c.id);
          return {
            id: c.id,
            title: c.title,
            last_message_at: last?.created_at ?? c.updated_at,
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
