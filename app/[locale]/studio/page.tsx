import type { Metadata } from 'next';
import { ChatChrome } from '@/components/studio/ChatChrome';
import LegacyStudioHub from '@/components/studio/legacy/LegacyStudioHub';
import { StudioV2 } from '@/components/studio/v2/StudioV2';
import { studioV2Enabled } from '@/lib/studio/flags';

/**
 * /[locale]/studio — the new studio (brief §6) where STUDIO_V2 is on (Preview first, then Production),
 * the legacy agent hub everywhere else. Decided per request on the server: the flag decides whether the
 * studio EXISTS, not merely whether a button shows (lib/studio/flags.ts).
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'en' ? 'Studio — MyAvatar.ge' : locale === 'ru' ? 'Студия — MyAvatar.ge' : 'სტუდია — MyAvatar.ge';
  return { title };
}

export default async function StudioPage({ params }: Props) {
  const { locale } = await params;
  if (!studioV2Enabled()) return <LegacyStudioHub />;
  return (
    <ChatChrome locale={locale}>
      <StudioV2 locale={locale} />
    </ChatChrome>
  );
}
