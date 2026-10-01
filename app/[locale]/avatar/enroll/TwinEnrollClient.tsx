'use client';

import { useRouter } from 'next/navigation';

import TwinCapture from '@/components/twin/TwinCapture';

/**
 * The PHONE side of the desktop→phone handoff with NEXT_PUBLIC_TWIN_ENABLED: the Digital Twin capture, authorized by the
 * signed handoff link (no session on this device). The link is spent when the twin commits.
 */
export default function TwinEnrollClient({ locale, token }: { locale: 'ka' | 'en' | 'ru'; token: string }) {
  const router = useRouter();
  return <TwinCapture locale={locale} handoffToken={token} onClose={() => router.push(`/${locale}`)} />;
}
