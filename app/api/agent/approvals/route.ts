/**
 * POST /api/agent/approvals — the server's record of a spoken yes to a studio generation a Live call is about to start
 * (start_generation: video, image, music, avatar). Agent G's own runs (montage, MP3, edit) carry their approval in
 * their `run` request instead (lib/agent/approval); a studio render goes through the studio's existing paid path, so its
 * voice yes is recorded here first, and the call starts nothing when this answers anything but ok.
 *
 *   POST { channel: 'voice-transcript', said, tool, credits? }
 *     → 200 { ok: true }                                   recorded: one audit row (studio_run · approve)
 *     → 400 { ok: false, error: 'approval_unclear' | 'bad_approval' | 'bad_request' }   nothing recorded as approved
 *
 * The words are judged again here (lib/voice/spokenYes), so no record says "voice yes" about words that are not one; a
 * refusal is audited too. The user id is the session's. Nothing is charged or started by this route: it only records.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { approvalNote, parseRunApproval } from '@/lib/agent/approval';
import { audit } from '@/lib/agent/media/montageLive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The studios start_generation runs (lib/voice/liveTools LIVE_GEN_TOOLS), as the capability each one is. */
const STUDIO_CAPABILITY: Readonly<Record<string, string>> = {
  video: 'video.generate', image: 'image.generate', music: 'music.generate', avatar: 'avatar.talking',
};
const MAX_CREDITS = 100_000;

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const tool = typeof body?.tool === 'string' ? body.tool : '';
  const toolId = STUDIO_CAPABILITY[tool];
  const credits = body?.credits;
  const creditsOk = credits === undefined || (typeof credits === 'number' && Number.isInteger(credits) && credits >= 0 && credits <= MAX_CREDITS);
  if (!body || !toolId || !creditsOk) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  if (body.channel !== 'voice-transcript') {
    // A tap is the panel's own Generate (recorded by the studio's own confirm event); only a spoken yes is recorded here.
    return NextResponse.json({ ok: false, error: 'bad_approval', message: 'Only a voice approval is recorded here.' }, { status: 400 });
  }

  const yes = parseRunApproval({ channel: body.channel, said: body.said });
  if (!yes.ok) {
    await audit({ userId: user.id, op: 'studio_run', phase: 'approve', outcome: 'refused', toolId, detail: yes.error });
    return NextResponse.json(yes, { status: 400 });
  }
  await audit({
    userId: user.id, op: 'studio_run', phase: 'approve', outcome: 'ok', toolId, approval: yes.approval.channel,
    ...(typeof credits === 'number' ? { credits } : {}), detail: `${tool}; approved by ${approvalNote(yes.approval)}`,
  });
  return NextResponse.json({ ok: true });
}
