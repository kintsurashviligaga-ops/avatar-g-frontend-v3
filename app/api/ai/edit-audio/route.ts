/**
 * POST /api/ai/edit-audio — the AI Audio Studio.
 *
 * GENERATIVE (Replicate Demucs): 'vocal_isolation' (3cr) · 'splitter' → acapella + instrumental (4cr).
 * DETERMINISTIC (ffmpeg-static): 'process' (pitch / speed / trim / fades) — FREE, auth-only.
 *
 * SECURITY + BILLING: valid Supabase session required (401 anon). For paid ops the exact cost is DEBITED up front
 * (reserve-before-render) — insufficient balance → 402, never reaches the provider — and REFUNDED on any failure.
 * Outputs are RE-HOSTED into our storage (Replicate URLs expire) and written to the user's library.
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardGeneration, insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { reSignIfInternal, createSignedAssetUrl, parseSupabaseObjectUrl, uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { audioProcess } from '@/lib/audio/audioOps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
// Demucs music source-separation (vocals / instrumental). Bare slug → latest version; env-overridable.
const DEMUCS_MODEL = process.env.REPLICATE_DEMUCS_MODEL || 'ryan5453/demucs';
const AI_COST = { vocal_isolation: 3, splitter: 4 } as const;

type AudioAction = 'vocal_isolation' | 'splitter' | 'process';

async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return parseSupabaseObjectUrl(s) ? reSignIfInternal(s) : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600);
}
function pick(o: unknown, ...keys: string[]): string | null {
  const rec = o as Record<string, unknown> | null;
  for (const k of keys) if (rec && typeof rec[k] === 'string') return rec[k] as string;
  return null;
}
/** Re-host an ephemeral Replicate audio URL into our storage → { url, path } (path = chainable own-storage ref). */
async function rehost(srcUrl: string): Promise<{ url: string; path: string } | null> {
  try {
    const res = await fetch(srcUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'audio/mpeg';
    const ext = /wav/.test(ct) ? 'wav' : /mp4|m4a|aac/.test(ct) ? 'm4a' : 'mp3';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 128) return null;
    const path = `audio-studio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const signed = await uploadAndSign(UPLOAD_BUCKET, path, buf.toString('base64'), ct, 604_800);
    return signed ? { url: signed, path } : null;
  } catch { return null; }
}
async function saveCreation(req: NextRequest, userId: string, url: string, action: AudioAction, cost: number): Promise<void> {
  try {
    const { supabase } = await authedClientFromRequest(req);
    await supabase.from('creations').insert({
      user_id: userId, kind: 'audio', service: 'audio-studio',
      prompt: `audio:${action}`, url, thumbnail_url: url, credits_used: cost,
    });
  } catch { /* fail-open */ }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    action?: string; mediaUrl?: string;
    semitones?: number; speed?: number; trimStart?: number; trimEnd?: number; fadeInSec?: number; fadeOutSec?: number; durationSec?: number;
  } | null;
  const action = String(body?.action || '').trim() as AudioAction;
  if (!['vocal_isolation', 'splitter', 'process'].includes(action)) {
    return NextResponse.json({ url: null, error: 'unknown action' }, { status: 400 });
  }

  // Auth only (401 anon). The real per-action cost is enforced at the deduct below, NOT the guard floor.
  const guard = await guardGeneration(req, 'music', { gate: false });
  if (!guard.ok) return guard.response;

  const src = await resolveMedia(body?.mediaUrl);
  if (!src) return NextResponse.json({ url: null, error: 'could not resolve audio (upload it first)' }, { status: 400 });

  // ── DETERMINISTIC: pitch / speed / trim / fades — FREE (no provider call). ──────────────────────────────
  if (action === 'process') {
    try {
      const url = await audioProcess(src, {
        semitones: Number(body?.semitones) || 0, speed: Number(body?.speed) || 1,
        trimStart: Number(body?.trimStart) || 0, trimEnd: Number(body?.trimEnd) || 0,
        fadeInSec: Number(body?.fadeInSec) || 0, fadeOutSec: Number(body?.fadeOutSec) || 0,
        durationSec: Number(body?.durationSec) || 0,
      });
      if (url) void saveCreation(req, guard.userId, url, action, 0);
      return NextResponse.json({ url, path: null, error: url ? undefined : 'process failed' });
    } catch (e) {
      return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : 'process failed' }, { status: 502 });
    }
  }

  // ── GENERATIVE: Demucs source separation — reserve-before-render + refund. ──────────────────────────────
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ url: null, error: 'audio_studio_unconfigured', message: 'Audio Studio needs REPLICATE_API_TOKEN.' }, { status: 503 });
  }
  const cost = AI_COST[action];
  const ref = `audio:${action}:${guard.userId}:${Date.now()}`;
  const debit = await deductCredits(guard.userId, cost, ref);
  if (!debit.ok && debit.reason === 'insufficient') {
    return NextResponse.json({ url: null, error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) }, { status: 402 });
  }

  try {
    const created = await createPrediction(DEMUCS_MODEL, { audio: src });
    let out = created;
    if (created.status !== 'succeeded' && created.status !== 'failed') out = await pollPrediction(created.id);
    if (out.status !== 'succeeded') {
      if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {});
      return NextResponse.json({ url: null, error: 'separation failed' }, { status: 502 });
    }
    const vocalsRaw = pick(out.output, 'vocals');
    const instRaw = pick(out.output, 'no_vocals', 'other', 'accompaniment', 'instrumental');
    // Both actions surface vocals as the primary stem; splitter additionally returns the instrumental.
    const primary = vocalsRaw;
    const secondary = action === 'splitter' ? instRaw : null;
    if (!primary) {
      if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {});
      return NextResponse.json({ url: null, error: 'no stem produced' }, { status: 502 });
    }
    const hostedPrimary = await rehost(primary);
    const hostedSecondary = secondary ? await rehost(secondary) : null;
    const url = hostedPrimary?.url ?? primary;
    void saveCreation(req, guard.userId, url, action, cost);
    if (hostedSecondary?.url) void saveCreation(req, guard.userId, hostedSecondary.url, action, 0);
    return NextResponse.json({ url, path: hostedPrimary?.path, secondaryUrl: hostedSecondary?.url ?? secondary ?? undefined });
  } catch (e) {
    if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {});
    return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : `${action} failed` }, { status: 502 });
  }
}
