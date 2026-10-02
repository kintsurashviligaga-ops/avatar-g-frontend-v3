/**
 * GET /api/checkout/capabilities — which payment rails are LIVE on this deployment.
 *
 * Returns booleans only (zero secret material) so the wallet UI can decide which "Pay" affordance to
 * render WITHOUT probing a checkout route or leaking config. Derived server-side from env:
 *
 *   stripe → the Stripe billing provider is configured (getBillingProvider().kind === 'stripe').
 *   bog    → Bank of Georgia can take AND credit a payment: merchant creds present (bogFullyConfigured).
 *            The callback key is BOG's published one, built in (lib/billing/bogClient), so creds are the
 *            whole condition — there is no "creds set, key missing → money in, never credited" state any
 *            more — plus the billing migration being present (bogSchemaReady), so credentials set before
 *            20261002a is applied never show a button that cannot record an order. Checkout's 503 backstops.
 *
 * Public + fail-open: never throws, defaults every rail to false on any error so the UI degrades to
 * "no rail available" rather than showing a button that can't complete.
 */
import { NextResponse } from 'next/server';
import { getBillingProvider } from '@/lib/monetization/provider';
import { bogFullyConfigured } from '@/lib/billing/bogClient';
import { bogSchemaReady } from '@/lib/billing/bogSettlement';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  let stripe = false;
  let bog = false;
  try {
    stripe = getBillingProvider().kind === 'stripe';
  } catch {
    /* fail-open: rail stays false */
  }
  try {
    // Creds AND the billing migration (20261002a) — never offer a rail whose checkout cannot record the order.
    bog = bogFullyConfigured() && (await bogSchemaReady(createServiceRoleClient()));
  } catch {
    /* fail-open: rail stays false */
  }
  return NextResponse.json({ stripe, bog }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
