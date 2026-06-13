import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { creditWalletGel } from '@/lib/billing/wallet-ledger';
import { lookupAppleProduct } from '@/lib/iap/appleProducts';

/**
 * POST /api/iap/apple/verify — StoreKit purchase verification + wallet credit.
 *
 * The iOS app (StoreKit 2, via a Capacitor IAP plugin) completes a purchase
 * NATIVELY through Apple, then POSTs the app receipt here. We verify it WITH APPLE
 * server-side (never trust the client), map the product → a GEL amount, and credit
 * the wallet idempotently (ref = `apple:<transactionId>`), mirroring the proven
 * Stripe top-up path (creditWalletGel).
 *
 * INERT until configured — returns 503 unless BOTH:
 *   - IAP_APPLE_ENABLED === 'true'
 *   - APPLE_IAP_SHARED_SECRET is set (App Store Connect → App-Specific Shared Secret)
 * so it ships safely while the native half is still being built. Full setup:
 * docs/IAP_STOREKIT_SETUP.md.
 *
 * Verification uses Apple's `verifyReceipt` with the shared secret (production
 * first, sandbox fallback on 21007 per Apple's guidance). You may later migrate to
 * the App Store Server API (JWS) — the product mapping + crediting are unchanged.
 *
 * IDEMPOTENCY: credit_wallet_gel must dedupe on `p_ref` (unique ledger ref). With
 * that in place a replayed/duplicate receipt for the same transaction can never
 * double-credit. (See the doc — ensure your RPC enforces this.)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface VerifyBody {
  /** base64 app receipt (StoreKit). */
  receipt?: string;
  /** Purchased product identifier (cross-check). */
  productId?: string;
  /** StoreKit transaction id — the idempotency key. */
  transactionId?: string;
}

interface AppleTxn {
  product_id: string;
  transaction_id: string;
  original_transaction_id?: string;
}

interface AppleReceiptResponse {
  status: number;
  receipt?: { in_app?: AppleTxn[] };
  latest_receipt_info?: AppleTxn[];
}

async function postVerify(host: string, body: string): Promise<AppleReceiptResponse | null> {
  try {
    const r = await fetch(`https://${host}/verifyReceipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return (await r.json()) as AppleReceiptResponse;
  } catch {
    return null;
  }
}

async function verifyWithApple(receipt: string, secret: string): Promise<AppleReceiptResponse | null> {
  const body = JSON.stringify({ 'receipt-data': receipt, password: secret, 'exclude-old-transactions': true });
  // Apple's rule: always hit PRODUCTION first; on 21007 ("sandbox receipt sent to
  // production") retry the SANDBOX host. This makes one binary work in both.
  const prod = await postVerify('buy.itunes.apple.com', body);
  if (prod && prod.status === 21007) {
    return postVerify('sandbox.itunes.apple.com', body);
  }
  return prod;
}

export async function POST(req: Request) {
  const enabled = process.env.IAP_APPLE_ENABLED === 'true';
  const secret = process.env.APPLE_IAP_SHARED_SECRET;
  if (!enabled || !secret) {
    return NextResponse.json({ success: false, error: 'iap_not_configured' }, { status: 503 });
  }

  const { user } = await authedClientFromRequest(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as VerifyBody;
  const receipt = typeof body.receipt === 'string' ? body.receipt.trim() : '';
  if (!receipt) {
    return NextResponse.json({ success: false, error: 'receipt_required' }, { status: 400 });
  }

  const apple = await verifyWithApple(receipt, secret);
  if (!apple) {
    return NextResponse.json({ success: false, error: 'apple_unreachable' }, { status: 502 });
  }
  if (apple.status !== 0) {
    // 21007 already handled; any other non-zero status is an invalid receipt.
    return NextResponse.json({ success: false, error: `apple_status_${apple.status}` }, { status: 402 });
  }

  // Choose the transaction: prefer latest_receipt_info, else in_app. If the client
  // named a transaction id, honour exactly that; else take the most recent.
  const txns = (apple.latest_receipt_info?.length ? apple.latest_receipt_info : apple.receipt?.in_app) ?? [];
  const txn = body.transactionId
    ? txns.find((tx) => tx.transaction_id === body.transactionId)
    : txns[txns.length - 1];
  if (!txn) {
    return NextResponse.json({ success: false, error: 'no_transaction' }, { status: 422 });
  }

  const product = lookupAppleProduct(txn.product_id);
  if (!product) {
    return NextResponse.json({ success: false, error: 'unknown_product' }, { status: 422 });
  }

  // Credit idempotently — the ref pins this exact transaction so a replay no-ops.
  const newBalance = await creditWalletGel(user.id, product.creditsGel, `apple:${txn.transaction_id}`);
  if (newBalance === null) {
    return NextResponse.json({ success: false, error: 'credit_failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, creditedGel: product.creditsGel, balanceGel: newBalance });
}
