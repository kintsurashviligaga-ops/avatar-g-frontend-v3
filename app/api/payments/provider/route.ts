/**
 * GET, PUT /api/payments/provider — RETIRED (410 Gone).
 *
 * This stored a per-user "active payment provider" (Stripe / TBC / BOG / Payze) in `payment_provider_configs` for the
 * /account/payments page. Nothing ever read that choice — the studio's checkout is BOG (`/api/billing/bog/checkout`)
 * whatever the row said — and Production has no such table, so both verbs answered 500 there. The page now redirects
 * to /account/billing; a 410 tells a stale client the endpoint is gone for good.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const gone = () =>
  NextResponse.json(
    { error: 'gone', message: 'Payment provider settings were retired. Checkout uses Bank of Georgia.' },
    { status: 410 },
  );

export function GET() {
  return gone();
}

export function PUT() {
  return gone();
}
