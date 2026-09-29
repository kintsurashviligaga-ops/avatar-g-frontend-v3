import { redirect } from 'next/navigation';

// SSR fallback for the bare root. Middleware normally decides first (lib/routing/landing.ts): guests go to the
// landing at /{lang}, signed-in visitors to /{lang}/dashboard. If middleware is bypassed, the landing is the
// safe default — it links to the studio in one tap, and a signed-in visitor is sent on from there.
export default function RootPage() {
  redirect('/ka');
}
