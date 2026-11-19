import type { Metadata } from 'next';
import WorkspacePanel from '@/components/library/WorkspacePanel';
import { ChatChrome } from '@/components/studio/ChatChrome';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'en' ? 'Workspace — MyAvatar' : locale === 'ru' ? 'Рабочая папка — MyAvatar' : 'სამუშაო სივრცე — MyAvatar';
  return { title };
}

/**
 * Agent G's Execution Workspace (GG's 2026-11-06 audit, ACTION 2), under the Library and in its shell. Not
 * /{lang}/workspace: that URL is the retired app shell and redirects to the studio (next.config.js,
 * lib/routing/shellRedirects.test).
 */
export default async function WorkspacePage({ params }: Props) {
  const { locale } = await params;
  return (
    <ChatChrome locale={locale} scrollBody>
      <WorkspacePanel locale={locale} />
    </ChatChrome>
  );
}
