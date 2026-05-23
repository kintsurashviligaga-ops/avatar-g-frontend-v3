/**
 * POST /api/billing/founder-verify — Founder Production Verification Gate.
 *
 * Admin-ONLY (ADMIN_EMAILS). Creates a single one-off GEL Checkout Session for
 * the fixed founder-verification amount (~100 USD) carrying differentiating
 * metadata, so the webhook can hydrate the founder's GEL ledger and arm the full
 * MCP pipeline. Any non-admin caller is hard-rejected 403 (TASK 3.1).
 *
 * SECURITY: live vs test is governed solely by the configured STRIPE_SECRET_KEY
 * (you set the live key in Vercel to transact for real). This route deliberately
 * does NOT embed/force live keys or bypass env safety — that control stays in the
 * console where it is auditable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createWalletTopupSession, getOrCreateCustomer } from '@/lib/billing/stripe';
import { getBillingProvider, BillingProviderUnavailableError } from '@/lib/monetization/provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 100 USD mapped to GEL at a fixed verification rate (~2.75). Settlement is the
// actual GEL amount Stripe charges; this is the presented/credited figure.
const FOUNDER_VERIFICATION_GEL = 275;

export async function POST(request: NextRequest) {
  try {
    // Hard role boundary FIRST — a non-admin pinging this URL is forbidden.
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const provider = getBillingProvider();
    if (provider.kind === 'none') {
      return NextResponse.json(
        { error: 'Billing provider unavailable', error_code: 'BILLING_PROVIDER_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const user = await requireAuthenticatedUser(request);
    const supabase = createRouteHandlerClient();

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = subscription?.stripe_customer_id as string | undefined;
    if (!customerId || customerId.startsWith('temp_')) {
      customerId = await getOrCreateCustomer({ userId: user.id, email: user.email || '', name: user.user_metadata?.full_name });
      await supabase.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customerId, plan: 'FREE', status: 'active' });
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';
    try {
      const url = await createWalletTopupSession({
        customerId,
        amountGel: FOUNDER_VERIFICATION_GEL,
        successUrl: `${origin}/dashboard?founder_verify=success`,
        cancelUrl: `${origin}/dashboard?founder_verify=canceled`,
        metadata: { is_founder_verification: 'true', target_ledger: 'fiat_gel' },
      });
      return NextResponse.json({ url, amountGel: FOUNDER_VERIFICATION_GEL });
    } catch (e) {
      return NextResponse.json(
        { error: 'gel_unsupported', message: e instanceof Error ? e.message.slice(0, 200) : 'founder verification failed' },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof BillingProviderUnavailableError) {
      return NextResponse.json({ error: 'Billing provider unavailable', error_code: error.code }, { status: 503 });
    }
    return NextResponse.json({ error: 'founder verification failed', message: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}
