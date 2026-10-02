/**
 * POST /api/billing/bog/webhook — Bank of Georgia's payment callback → credits, exactly once.
 *
 * 1. AUTHENTICITY. The SHA256withRSA signature in `Callback-Signature`, over the RAW body, against BOG's published
 *    key (bogConfig: the live or sandbox key per BOG_ENV, overridable). Unsigned / bad signature → 401, nothing read.
 *    BOG_CALLBACK_IP_ALLOWLIST, when set, is an extra AND-gate only — X-Forwarded-For is client-controlled.
 * 2. SETTLEMENT. lib/billing/bogSettlement: the receipt in the callback body is matched to OUR order row (our id,
 *    BOG's id, amount, currency) and fulfilled through the bog_fulfill_order RPC — idempotent on our order id, so a
 *    redelivery, the return page and the cron settling the same order credit once.
 *
 * ⚠️ BOG DOCUMENTS NO CALLBACK RETRY. A failed delivery is not re-sent; the cron (/api/cron/bog-billing) and the
 * return page (/api/billing/bog/orders/[id]) reconcile from GET /receipt instead. So a 5xx here is for our logs, and
 * every authenticated callback about an order we do not know is acknowledged (200) rather than bounced.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import {
  bogConfig,
  callbackSourceIp,
  isAllowedBogCallbackIp,
  parseBogCallback,
  verifyBogCallbackSignature,
} from '@/lib/billing/bogClient';
import { loadBogOrder, settleBogOrder } from '@/lib/billing/bogSettlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const cfg = bogConfig();
  if (!cfg) return NextResponse.json({ error: 'BOG gateway unconfigured', error_code: 'BOG_UNCONFIGURED' }, { status: 503 });

  // The exact bytes BOG signed — never re-serialise before verifying (BOG: field order matters).
  const rawBody = await request.text();
  if (!verifyBogCallbackSignature(rawBody, request.headers.get('callback-signature'), cfg.callbackPublicKey)) {
    return NextResponse.json({ error: 'unauthorized_callback', reason: 'signature' }, { status: 401 });
  }
  if (cfg.callbackIpAllowlist.length > 0) {
    const ip = callbackSourceIp(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip'));
    if (!isAllowedBogCallbackIp(ip, cfg.callbackIpAllowlist)) {
      return NextResponse.json({ error: 'unauthorized_callback', reason: 'ip' }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'malformed_body' }, { status: 400 });
  }
  const { event, receipt } = parseBogCallback(payload);
  if (!receipt) return NextResponse.json({ error: 'missing_order' }, { status: 400 });
  if (event && event !== 'order_payment') return NextResponse.json({ received: true, ignored: 'event' });

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  const order = await loadBogOrder(svc, { shopOrderId: receipt.externalOrderId, bogOrderId: receipt.orderId });
  if (!order) {
    // eslint-disable-next-line no-console
    console.warn(`[BOG webhook] signed callback for an unknown order (bog=${receipt.orderId} ext=${receipt.externalOrderId ?? '-'} status=${receipt.statusKey ?? '-'})`);
    return NextResponse.json({ received: true, ignored: 'unknown_order' });
  }

  try {
    const outcome = await settleBogOrder(svc, order, receipt, { cfg, deps: { fetch } });
    if (outcome.status === 'error') {
      // eslint-disable-next-line no-console
      console.error(`[BOG webhook] ${order.shop_order_id} paid=${receipt.state} but settlement failed (${outcome.reason}) — the cron will reconcile`);
      return NextResponse.json({ received: true, status: 'error' }, { status: 500 });
    }
    // eslint-disable-next-line no-console
    console.info(`[BOG webhook] ${order.shop_order_id} (${order.kind}) → ${outcome.status}${outcome.status === 'completed' ? ` granted=${outcome.granted}` : ''}`);
    return NextResponse.json({ received: true, status: outcome.status });
  } catch (e) {
    reportError(e, { route: 'bog.webhook', stage: 'settle' });
    return NextResponse.json({ received: true, status: 'error' }, { status: 500 });
  }
}
