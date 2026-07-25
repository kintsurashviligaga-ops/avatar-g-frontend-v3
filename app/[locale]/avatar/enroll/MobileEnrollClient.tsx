'use client';

import { useRouter } from 'next/navigation';

import LiveAvatarEnroll from '@/components/voice/LiveAvatarEnroll';

/**
 * The PHONE side of the desktop→phone avatar handoff. Renders the enrollment UI in handoff mode (posts the
 * selfie/voice to /api/avatar/handoff/complete with the signed token — no session needed on this device).
 */
export default function MobileEnrollClient({ locale, token }: { locale: 'ka' | 'en' | 'ru'; token: string }) {
  const router = useRouter();
  return <LiveAvatarEnroll locale={locale} handoffToken={token} onClose={() => router.push(`/${locale}`)} />;
}
