import { redirect } from 'next/navigation';

/**
 * /[locale]/studio — RETIRED (the owner, 2026-10-09 18:25Z: the „Studio Beta" page was „too confusing"). It was a second
 * studio (Video / Image / Avatar / Music tabs) beside the studio's own tools. next.config.js sends it home with a real 307
 * before this page runs; this redirect is the same rule for anything that reaches the page anyway.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export default async function StudioPage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
