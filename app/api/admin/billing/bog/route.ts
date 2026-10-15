/**
 * /api/admin/billing/bog — Bank of Georgia readiness, for the owner (isAdmin: email allowlist, Supabase session).
 *
 *   GET  → bogReadiness(): configured?, environment, client-id tail, callback URL + key kind, schema probe, cron
 *          secret set?, orders by status and the 20 latest outcomes with their reject reasons. No secret, no user id.
 *   POST { action: 'oauth' } → probeBogOAuth(): ONE OAuth token request to BOG — no order, no money, free — and the
 *          verdict + BOG's answer + what to do next. This names the cause of `init_failed` without starting a checkout.
 *          When BOG accepts the pair, also bogMerchantSeen(): the merchant name on the receipt of the latest paid
 *          order (one GET) — the check the bank asked for after renaming the merchant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { bogMerchantSeen, bogReadiness, probeBogOAuth } from '@/lib/billing/bogDiagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, bog: await bogReadiness(svc) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== 'oauth') return NextResponse.json({ error: "action must be 'oauth'" }, { status: 400 });
  const probe = await probeBogOAuth({ fetch });
  let merchant = null;
  if (probe.verdict === 'ok') {
    try {
      merchant = await bogMerchantSeen(createServiceRoleClient(), { fetch });
    } catch {
      merchant = null; // no service role: the OAuth verdict still stands on its own
    }
  }
  return NextResponse.json({ ok: true, probe, merchant }, { headers: noStore });
}
