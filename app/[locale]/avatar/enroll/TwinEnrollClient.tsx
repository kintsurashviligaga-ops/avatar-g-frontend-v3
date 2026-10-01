'use client';

import { useRouter } from 'next/navigation';

import TwinCapture from '@/components/twin/TwinCapture';

/**
 * The PHONE side of the desktop→phone handoff with NEXT_PUBLIC_TWIN_ENABLED: the Digital Twin capture, authorized by the
 * signed handoff link (no session on this device). The link is spent when the twin commits. `account` is the MASKED
 * account the link saves to (page.tsx resolves it) — the consent screen shows it before anything is captured.
 */
export default function TwinEnrollClient({ locale, token, account }: { locale: 'ka' | 'en' | 'ru'; token: string; account: string }) {
  const router = useRouter();
  return <TwinCapture locale={locale} handoffToken={token} handoffAccount={account} onClose={() => router.push(`/${locale}`)} />;
}
