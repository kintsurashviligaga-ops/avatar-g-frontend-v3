import { redirect } from 'next/navigation';

/**
 * /[locale]/account/payments — RETIRED: redirects to /[locale]/account/billing.
 *
 * ⚠️ THIS PAGE TOLD USERS THE WRONG THING. It listed Stripe as the active payment provider and Bank of Georgia as
 * "coming soon" — the opposite of the product, whose checkout is BOG (`/api/billing/bog/checkout`, `bog_orders`) — and let a
 * user "choose" a provider that nothing read: no checkout consults `payment_provider_configs`, a table Production does
 * not even have (docs/handoffs/2026-10-08-production-schema-drift.md). Its Georgian copy was garbled, and no page
 * linked to it. The URL stays as a redirect so an old bookmark lands on the real billing page.
 */
export default async function PaymentProvidersRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/account/billing`);
}
