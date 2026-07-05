/**
 * POST /api/checkout/bog/initiate — start a native Bank of Georgia (GEL) wallet top-up.
 *
 * Body: { amountGel: <one of REFILL_TIERS_GEL> }. Authenticates the user, mints a BOG order
 * settled strictly in GEL, records a pending mapping row (shop_order_id → user_id, amount) so the
 * webhook can credit the right wallet, and returns the hosted redirect URL for the client to open.
 *
 * Fail-safe: returns 503 when BOG merchant credentials are absent (nothing half-charges). The
 * pending-order write goes through the service-role client (above RLS) and is best-effort — if the
 * mapping cannot be persisted we refuse to start the order rather than accept an un-creditable payment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getActiveTiers } from '@/lib/billing/pricingConfig.db';
import { bogConfig, getBogAccessToken, createBogOrder } from '@/lib/billing/bogClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const cfg = bogConfig();
    if (!cfg) {
      return NextResponse.json(
        {
          error: 'BOG payment gateway unavailable',
          error_code: 'BOG_UNCONFIGURED',
          message: 'Set BOG_CLIENT_ID and BOG_SECRET_KEY to enable native GEL checkout.',
        },
        { status: 503 },
      );
    }

    const user = await requireAuthenticatedUser(request);

    const body = (await request.json().catch(() => ({}))) as { amountGel?: number };
    const amountGel = Number(body.amountGel);
    // v358 #2 — runtime-editable tier store, fail-open to REFILL_TIERS_GEL (identical pre-migration).
    const tiers = await getActiveTiers();
    if (!tiers.some((t) => t.gelAmount === amountGel)) {
      return NextResponse.json(
        { error: `amountGel must be one of ${tiers.map((t) => t.gelAmount).join(', ')}` },
        { status: 400 },
      );
    }

    // Service-role client so we can write the pending mapping above RLS (route has a user session,
    // but bog_orders is service-write only). Refuse the order if we can't map it back to the user.
    let svc: ReturnType<typeof createServiceRoleClient>;
    try {
      svc = createServiceRoleClient();
    } catch {
      return NextResponse.json({ error: 'server_misconfigured', error_code: 'NO_SERVICE_ROLE' }, { status: 503 });
    }

    const shopOrderId = randomUUID();
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const callbackUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/$/, '')}/api/billing/bog/webhook`;

    // Persist the pending order FIRST (fail-safe: no mapping → no order → no un-creditable payment).
    const { error: insertErr } = await svc.from('bog_orders').insert({
      shop_order_id: shopOrderId,
      user_id: user.id,
      amount_gel: amountGel,
      status: 'pending',
    });
    if (insertErr) {
      return NextResponse.json(
        { error: 'order_mapping_unavailable', message: 'Could not record the pending order (migration applied?).' },
        { status: 503 },
      );
    }

    const markInitFailed = async () => {
      // Don't leave a stale 'pending' row masquerading as a live order when init fails downstream.
      await svc.from('bog_orders').update({ status: 'init_failed', updated_at: new Date().toISOString() }).eq('shop_order_id', shopOrderId).then(
        () => undefined,
        () => undefined,
      );
    };

    const token = await getBogAccessToken(cfg, { fetch });
    if (!token) {
      await markInitFailed();
      return NextResponse.json({ error: 'bog_auth_failed', error_code: 'BOG_OAUTH' }, { status: 502 });
    }

    const order = await createBogOrder(
      cfg,
      token.accessToken,
      {
        amountGel,
        shopOrderId,
        redirectSuccessUrl: `${origin}/dashboard?topup=success`,
        redirectFailUrl: `${origin}/dashboard?topup=failed`,
        callbackUrl,
        description: 'wallet_topup',
      },
      { fetch },
    );
    if (!order) {
      await markInitFailed();
      return NextResponse.json({ error: 'bog_order_failed', error_code: 'BOG_ORDER' }, { status: 502 });
    }

    // Attach the BOG order id to the mapping so the webhook (which may carry only order_id) resolves.
    await svc.from('bog_orders').update({ bog_order_id: order.orderId, updated_at: new Date().toISOString() }).eq('shop_order_id', shopOrderId);

    return NextResponse.json({ orderId: order.orderId, redirectUrl: order.redirectUrl });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'bog_initiate_failed', message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      { status: 500 },
    );
  }
}
