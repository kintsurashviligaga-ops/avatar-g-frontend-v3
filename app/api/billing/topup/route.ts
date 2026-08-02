import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/topup — RETIRED. Returns 410 Gone.
 *
 * ⚠️ THIS ROUTE GRANTED CREDITS WITH NO PAYMENT VERIFICATION OF ANY KIND. It took a `packId` from the
 * REQUEST BODY, looked it up in CREDIT_PACKS, and added that many credits to the caller's balance using
 * the service-role client. No Stripe session, no webhook signature, no `wallet_topups` row, no
 * idempotency key — nothing tying the grant to money actually changing hands. Any signed-in account
 * could have minted up to 2800 credits (≈280 ₾) per request, repeatedly.
 *
 * ⚠️ AND IT WAS SAFE ONLY BY ACCIDENT — A TYPO WAS THE ENTIRE CONTROL. The zod schema accepted
 * `'starter' | 'pro' | 'agency'` while the CREDIT_PACKS ids are `pack_300 | pack_1200 | pack_2800`, so
 * `.find()` always returned undefined and every call fell out at the 404. That is not a security
 * boundary; it is a bug standing in for one. Aligning the enum — exactly the kind of cleanup that looks
 * obviously correct in review — would have armed the faucet in a single line.
 *
 * It also wrote to `user_credits` / `credits_ledger` (PLURAL), neither of which is the live money path:
 * balances live in `profiles.credits_balance`, maintained by the AFTER INSERT trigger on `credit_ledger`
 * (SINGULAR). So it was writing to a different schema than the rest of the product reads — a grant here
 * would not even have shown up in the ledger anyone audits.
 *
 * Nothing calls it (grep across app/, components/ and lib/ finds no caller). The real, verified rails:
 *   · /api/billing/wallet-topup  → Stripe Checkout → webhook → credit_wallet_gel()
 *   · /api/billing/tier-checkout → Stripe Checkout → webhook
 *   · Bank of Georgia            → RSA-signed webhook
 *   · /api/admin/credits/adjust  → email-allowlist gated, ledger-attributed
 *
 * Kept as an explicit 410 rather than deleted so the shape of the hole stays on the record, and so any
 * client still posting here gets a loud refusal instead of a 404 that reads like a routing slip.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'route_retired',
      message: 'Credit top-ups must go through a verified payment rail (/api/billing/wallet-topup).',
    },
    { status: 410 },
  );
}
