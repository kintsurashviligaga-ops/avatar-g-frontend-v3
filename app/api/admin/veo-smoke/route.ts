import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { pollVeoSmoke, submitVeoSmoke, VEO_SMOKE_CONFIRM, veoSmokeQuote, veoSmokeReady } from '@/lib/veo/smoke';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The owner's one paid Veo test on this deployment's Vertex chain (GCP Part 0 "INFERENCE VERIFIED").
 *
 *   POST { confirm: "paid-test" } → submits ONE Veo 3.1 Fast clip (4 s, 720p, audio ≈ $0.40) and returns its operation.
 *        Without the confirm word it only quotes the price. Refuses (409) unless VEO_TRANSPORT pins vertex.
 *   GET  ?op=<operation>          → polls it; a finished clip comes back as a 15-minute signed read URL.
 *
 * ADMIN ONLY (404 otherwise). POST, never GET, starts a render: a prefetched or reloaded URL must not bill.
 */
async function admin(req: NextRequest): Promise<boolean> {
  const { user } = await authedClientFromRequest(req);
  return (await assertAdminAccess(req, user)).ok;
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await admin(req))) return notFound();
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== VEO_SMOKE_CONFIRM) {
    return NextResponse.json(
      { error: 'confirm_required', confirm: VEO_SMOKE_CONFIRM, ready: veoSmokeReady(), ...veoSmokeQuote() },
      { status: 400, headers: noStore },
    );
  }
  const result = await submitVeoSmoke();
  const status = result.ok ? 200 : result.error === 'vertex_not_pinned' ? 409 : 502;
  return NextResponse.json(result, { status, headers: noStore });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await admin(req))) return notFound();
  const op = req.nextUrl.searchParams.get('op') ?? '';
  if (!op) return NextResponse.json({ ready: veoSmokeReady(), ...veoSmokeQuote() }, { headers: noStore });
  const result = await pollVeoSmoke(op);
  return NextResponse.json(result, { status: result.state === 'invalid' ? 400 : 200, headers: noStore });
}
