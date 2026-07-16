import { redirect } from 'next/navigation';

// PHASE 39.5 (Master Contract V2) — the canonical refund policy now lives at /[locale]/refund (the
// bank-approval path). This legacy /refund-policy URL is preserved as a redirect so any existing link,
// bookmark, or previously-submitted URL keeps resolving to the single source-of-truth policy.
export default async function RefundPolicyRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/refund`);
}
