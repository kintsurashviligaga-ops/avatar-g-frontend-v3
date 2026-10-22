/**
 * POST /api/ai/edit-audio — the AI Audio Studio.
 *
 * 'vocal_isolation' and 'splitter' (stem separation) ran on Replicate Demucs and have no Google engine: refused before
 * any charge (lib/music/studio/boundary).
 * DETERMINISTIC (ffmpeg-static): 'process' (pitch / speed / trim / fades) — FREE, auth-only.
 *
 * SECURITY: valid Supabase session required (401 anon). The output is written to the user's library.
 */
import { NextRequest, NextResponse } from 'next/server';
import { musicUnsupportedResponse } from '@/lib/music/studio/boundary';
import { guardGeneration } from '@/lib/api/generationGuard';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { audioProcess } from '@/lib/audio/audioOps';
import { saveEditorOutput } from '@/lib/orchestrator/saveEditorOutput';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

type AudioAction = 'vocal_isolation' | 'splitter' | 'process';

/** Own storage only (SSRF), and only the caller's own object (lib/security/callerMedia). */
async function resolveMedia(v: unknown, userId: string): Promise<string | null> {
  const r = await resolveCallerMedia(v, userId, 3600);
  return r.ok && r.own ? r.url : null;
}
// AWAITED at every call site, not fire-and-forget: a serverless function can be frozen the moment it
// responds, dropping an un-awaited write. The op itself is an ffmpeg render, so one small insert is
// noise next to it — and a result the user cannot find later is worse than a slightly slower response.
async function saveCreation(userId: string, url: string, action: AudioAction): Promise<void> {
  // media:'audio' maps to service_type 'music', never 'voice' — the Library filters 'voice' out.
  // See the note in app/api/ai/edit/route.ts — the `creations` insert that used to follow targeted a
  // table that does not exist in the database (404, verified live), so it failed on every call.
  await saveEditorOutput({ userId, url, media: 'audio', action });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    action?: string; mediaUrl?: string;
    semitones?: number; speed?: number; trimStart?: number; trimEnd?: number; fadeInSec?: number; fadeOutSec?: number; volume?: number; durationSec?: number;
  } | null;
  const action = String(body?.action || '').trim() as AudioAction;
  if (!['vocal_isolation', 'splitter', 'process'].includes(action)) {
    return NextResponse.json({ url: null, error: 'unknown action' }, { status: 400 });
  }

  // Stem separation / vocal removal ran on Replicate Demucs — outside the approved provider boundary (Music Studio v1,
  // Phase 2). Refused always, before any charge; the free deterministic `process` op (ffmpeg) is unaffected.
  if (action === 'vocal_isolation' || action === 'splitter') return musicUnsupportedResponse(req);

  // Auth only (401 anon). The real per-action cost is enforced at the deduct below, NOT the guard floor.
  const guard = await guardGeneration(req, 'music', { gate: false });
  if (!guard.ok) return guard.response;

  const src = await resolveMedia(body?.mediaUrl, guard.userId);
  if (!src) return NextResponse.json({ url: null, error: 'could not resolve audio (upload it first)' }, { status: 400 });

  // ── DETERMINISTIC: pitch / speed / trim / fades — FREE (no provider call). ──────────────────────────────
  if (action === 'process') {
    try {
      const url = await audioProcess(src, {
        semitones: Number(body?.semitones) || 0, speed: Number(body?.speed) || 1,
        trimStart: Number(body?.trimStart) || 0, trimEnd: Number(body?.trimEnd) || 0,
        fadeInSec: Number(body?.fadeInSec) || 0, fadeOutSec: Number(body?.fadeOutSec) || 0,
        volume: body?.volume === undefined ? 1 : Number(body.volume),
        durationSec: Number(body?.durationSec) || 0,
      });
      if (url) await saveCreation(guard.userId, url, action);
      return NextResponse.json({ url, path: null, error: url ? undefined : 'process failed' });
    } catch (e) {
      return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : 'process failed' }, { status: 502 });
    }
  }

  // Unreachable: every action is handled above. Kept as the same refusal so a new action never reaches a provider.
  return musicUnsupportedResponse(req);
}
