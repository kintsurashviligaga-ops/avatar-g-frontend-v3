/**
 * POST /api/billing/bog/webhook — Bank of Georgia payment callback → idempotent GEL credit.
 *
 * AUTHENTICATION (spoof-resistant, layered):
 *   1. RSA-SHA256 signature over the RAW body, verified against BOG's published public key
 *      (asymmetric — cannot be forged without BOG's private key). This is the PRIMARY guard.
 *   2. Optional source-IP allowlist as defense-in-depth.
 * A callback is only trusted to move money when it passes the strongest guard available:
 *   - public key configured  → signature MUST verify, else 401 (IP is only supplementary);
 *   - no public key, IP list → IP MUST match, with a loud warning (weaker — signatures preferred);
 *   - neither configured     → 401 (we never credit on a fully-unauthenticated callback).
 *
 * CREDIT (absolute idempotency): on APPROVED we credit via `creditWalletGel(user, amount, bog:<orderId>)`.
 * The `wallet_topups.ref` PRIMARY KEY + `ON CONFLICT DO NOTHING` makes a re-delivered callback a
 * guaranteed no-op → zero double-crediting. This is the SAME hardened routine the Stripe top-up uses;
 * it is a CREDIT path, deliberately NOT the `remix:*` DEBIT ref used by deduct_credits.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { creditWalletGel } from '@/lib/billing/wallet-ledger';
import {
  bogConfig,
  parseBogCallback,
  verifyBogCallbackSignature,
  callbackSourceIp,
  isAllowedBogCallbackIp,
  bogCreditRef,
} from '@/lib/billing/bogClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface BogOrderRow {
  shop_order_id: string;
  user_id: string;
  amount_gel: number;
  status: string;
}

export async function POST(request: NextRequest) {
  const cfg = bogConfig();
  if (!cfg) {
    return NextResponse.json({ error: 'BOG gateway unconfigured', error_code: 'BOG_UNCONFIGURED' }, { status: 503 });
  }

  // Raw body — MUST be the exact bytes the signature was computed over (never re-serialize).
  const rawBody = await request.text();

  // ── Layered authentication ──────────────────────────────────────────────────────────────────
  const ip = callbackSourceIp(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip'));
  const signature = request.headers.get(cfg.callbackSignatureHeader) || request.headers.get(cfg.callbackSignatureHeader.toLowerCase());

  let authenticated = false;
  if (cfg.callbackPublicKey) {
    // Primary path: signature must verify. IP allowlist (if set) is an additional gate.
    const sigOk = verifyBogCallbackSignature(rawBody, signature, cfg.callbackPublicKey);
    const ipOk = isAllowedBogCallbackIp(ip, cfg.callbackIpAllowlist);
    authenticated = sigOk && ipOk;
    if (!authenticated) {
      return NextResponse.json({ error: 'unauthorized_callback', reason: sigOk ? 'ip' : 'signature' }, { status: 401 });
    }
  } else if (cfg.callbackIpAllowlist.length > 0) {
    // Fallback path: no signing key → allow only from allowlisted IPs, and warn (weaker guard).
    authenticated = isAllowedBogCallbackIp(ip, cfg.callbackIpAllowlist);
    if (!authenticated) {
      return NextResponse.json({ error: 'unauthorized_callback', reason: 'ip' }, { status: 401 });
    }
    // eslint-disable-next-line no-console
    console.warn('[BOG webhook] crediting via IP-allowlist only — configure BOG_CALLBACK_PUBLIC_KEY for signature verification.');
  } else {
    // Nothing to authenticate against → refuse to move money.
    return NextResponse.json(
      { error: 'callback_auth_not_configured', message: 'Set BOG_CALLBACK_PUBLIC_KEY or BOG_CALLBACK_IP_ALLOWLIST.' },
      { status: 401 },
    );
  }

  // ── Parse ───────────────────────────────────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: 'malformed_body' }, { status: 400 });
  }
  const data = parseBogCallback(payload);
  if (!data.orderId && !data.shopOrderId) {
    return NextResponse.json({ error: 'missing_order_reference' }, { status: 400 });
  }

  // REJECTED / PENDING / UNKNOWN → acknowledge without crediting (200 so BOG stops retrying).
  if (data.status !== 'APPROVED') {
    await updateOrderStatus(data, data.status.toLowerCase());
    return NextResponse.json({ received: true, status: data.status, credited: false });
  }

  // ── APPROVED → resolve the paying user from our pending mapping, then credit idempotently ─────
  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  const order = await lookupOrder(svc, data.shopOrderId, data.orderId);
  if (!order) {
    // Authenticated but we have no mapping — do NOT credit a wallet we can't attribute.
    return NextResponse.json({ error: 'order_not_found', credited: false }, { status: 404 });
  }

  // Credit the recorded amount (server-side source of truth — never trust the callback's amount to
  // set value; the mapping was written at initiate time from the validated tier).
  const orderId = data.orderId ?? order.shop_order_id;
  const newBalance = await creditWalletGel(order.user_id, order.amount_gel, bogCreditRef(orderId));

  await svc
    .from('bog_orders')
    .update({ status: 'paid', bog_order_id: data.orderId ?? order.shop_order_id, updated_at: new Date().toISOString() })
    .eq('shop_order_id', order.shop_order_id);

  // eslint-disable-next-line no-console
  console.info(`[BOG webhook] APPROVED order=${orderId} user=${order.user_id} amount=${order.amount_gel}₾ balance=${newBalance ?? 'n/a'}`);
  return NextResponse.json({ received: true, status: 'APPROVED', credited: true });
}

async function lookupOrder(
  svc: ReturnType<typeof createServiceRoleClient>,
  shopOrderId: string | null,
  bogOrderId: string | null,
): Promise<BogOrderRow | null> {
  try {
    if (shopOrderId) {
      const { data } = await svc.from('bog_orders').select('shop_order_id,user_id,amount_gel,status').eq('shop_order_id', shopOrderId).maybeSingle();
      if (data) return data as BogOrderRow;
    }
    if (bogOrderId) {
      const { data } = await svc.from('bog_orders').select('shop_order_id,user_id,amount_gel,status').eq('bog_order_id', bogOrderId).maybeSingle();
      if (data) return data as BogOrderRow;
    }
  } catch {
    /* table absent / transient → treat as not found (fail-safe: no credit) */
  }
  return null;
}

async function updateOrderStatus(data: { shopOrderId: string | null; orderId: string | null }, status: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    if (data.shopOrderId) {
      await svc.from('bog_orders').update({ status, updated_at: new Date().toISOString() }).eq('shop_order_id', data.shopOrderId);
    } else if (data.orderId) {
      await svc.from('bog_orders').update({ status, updated_at: new Date().toISOString() }).eq('bog_order_id', data.orderId);
    }
  } catch {
    /* best-effort */
  }
}
