/**
 * GET /api/checkout/capabilities — which payment rails are LIVE on this deployment.
 *
 * Returns booleans only (zero secret material) so the wallet UI can decide which "Pay" affordance to
 * render WITHOUT probing a checkout route or leaking config. Derived server-side from env:
 *
 *   stripe → the Stripe billing provider is configured (getBillingProvider().kind === 'stripe').
 *   bog    → the FULL native GEL credit path is live: BOG merchant creds present AND the callback
 *            public key is present. This second clause is load-bearing: bogConfig() is non-null with
 *            only client_id + secret, but the webhook (app/api/billing/bog/webhook) REQUIRES the RSA
 *            public key and 401s every callback without it. Gating the BOG button on client creds
 *            alone would let a half-configured deployment take a payment that is never credited
 *            ("money in, no credit"). So we advertise bog:true only when initiate AND crediting can
 *            both succeed. bog/initiate's 503 (no creds) remains the backstop for the no-keys case.
 *
 * Public + fail-open: never throws, defaults every rail to false on any error so the UI degrades to
 * "no rail available" rather than showing a button that can't complete.
 */
import { NextResponse } from 'next/server';
import { getBillingProvider } from '@/lib/monetization/provider';
import { bogFullyConfigured } from '@/lib/billing/bogClient';

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
    // Requires BOTH merchant creds AND the callback public key — never advertise a rail that can take a
    // payment it cannot credit (see bogFullyConfigured). bog/initiate's 503 backstops the no-creds case.
    bog = bogFullyConfigured();
  } catch {
    /* fail-open: rail stays false */
  }
  return NextResponse.json({ stripe, bog }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
