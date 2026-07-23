/**
 * POST /api/orchestrator/produce — one-call cinematic production (the fan-out).
 *
 * prompt → Agent A (Claude script, N×6s) → Agent I (LTX clips, generated +
 * uploaded to Storage in parallel) → Agent H (ElevenLabs voiceover, best-effort)
 * → Agent L (CPU/GPU assemble) → final signed 30s master URL.
 *
 * Returns a Server-Sent Events stream so the client watches real stage progress
 * directly (self-contained — no cross-instance hub needed):
 *   event payloads: { stage, pct, ... } then { stage:'completed', url } | { stage:'failed', error }
 *
 * Authenticated (charges flow through the underlying per-agent routes). Honest
 * degradation: clips that fail are skipped (need ≥2 to assemble); voiceover is
 * best-effort; if Claude/LTX are unavailable the stream emits a `failed` event.
 */
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { reserveProduce, refundProduce, idemRef, type Reservation } from '@/lib/orchestrator/produceBilling';
import { consumeFreeFilm, restoreFreeFilm } from '@/lib/billing/wallet-ledger';
import { createJob, recordJobEvent, recordJobReservation } from '@/lib/orchestrator/jobs';
import {
  buildScriptSystemPrompt, buildScriptUserPrompt, extractJson, normalizeBreakdown,
  type ScriptSegment,
} from '@/lib/orchestrator/script-breakdown';
import { videoFramingSuffix } from '@/lib/orchestrator/agents/profiles';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { assembleWithFfmpeg } from '@/lib/orchestrator/ffmpeg-assembly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SCRIPT_MODEL = process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

interface ProduceBody { prompt?: string; totalDurationSec?: number; withVoice?: boolean }

async function planScript(prompt: string, totalSec: number): Promise<ScriptSegment[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return normalizeBreakdown(null, prompt, totalSec); // deterministic fallback
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: SCRIPT_MODEL, max_tokens: 1500,
      system: buildScriptSystemPrompt(),
      messages: [{ role: 'user', content: buildScriptUserPrompt(prompt, totalSec) }],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    return normalizeBreakdown(extractJson(text), prompt, totalSec);
  } catch {
    return normalizeBreakdown(null, prompt, totalSec);
  }
}

/** Generate one 6s LTX clip and upload it to Storage; returns the signed URL or null. */
async function genClip(origin: string, pipelineId: string, idx: number, seg: ScriptSegment): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/api/ltx-video`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: seg.prompt + videoFramingSuffix(), aspect_ratio: '16:9', duration: 6, generate_audio: false, ...(seg.cameraMotion ? { camera_motion: seg.cameraMotion } : {}) }),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return null;
    return uploadAndSign('renders', `${pipelineId}/clip${idx}.mp4`, buf.toString('base64'), 'video/mp4');
  } catch { return null; }
}

async function genVoice(origin: string, pipelineId: string, segments: ScriptSegment[]): Promise<string | null> {
  try {
    const text = segments.map(s => s.prompt).join('. ').slice(0, 800);
    const r = await fetch(`${origin}/api/elevenlabs/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locale: 'en' }),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return null;
    return uploadAndSign('renders', `${pipelineId}/voice.mp3`, buf.toString('base64'), 'audio/mpeg');
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  // Auth required in production; bypassed ONLY under `next dev` (NODE_ENV==='development')
  // for local QA. Never a production-active header/cookie backdoor.
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  // Cost guardrail: per-user rate cap (fail-open without Upstash).
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let body: ProduceBody;
  try { body = (await req.json()) as ProduceBody; } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 });
  const totalSec = Number.isFinite(body.totalDurationSec) ? Number(body.totalDurationSec) : 30;
  const withVoice = body.withVoice !== false;
  const origin = new URL(req.url).origin;
  const pipelineId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Durable job row (#5) — persisted before streaming so an immediate reload recovers it.
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'film', params: { prompt, totalSec, withVoice } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ pipelineId, ...o })}\n\n`)); } catch { /* closed */ }
        recordJobEvent(jobId, o);
      };
      const ref = idemRef('film', pipelineId, body);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let useFreeSlot = false;
      let succeeded = false;
      try {
        // Reserve BEFORE render: atomically consume a FREE FILM if the user has one (restored on failure),
        // else debit credits up front and fail-fast if the balance is too low — never render for free.
        if (user) {
          const free = await consumeFreeFilm(user.id); // >=0 consumed, -1 none, null = RPC absent
          if (free !== null && free >= 0) {
            useFreeSlot = true;
          } else {
            reservation = await reserveProduce(user.id, PRODUCE_COST.film, ref);
            if (!reservation.proceed) { emit({ stage: 'failed', error: 'insufficient_credits', reason: reservation.reason, balance: reservation.balance }); return; }
            // Stamp the reserve onto the durable row so the cron drainer can refund it idempotently if this
            // render is abandoned (tab closed) and the in-route refund never fires. Credit path only — a
            // consumed free film carries no debit, so it is NEVER stamped (the drainer would else mint credits).
            if (jobId && reservation.charged) await recordJobReservation(jobId, { ref, credits: PRODUCE_COST.film });
          }
        }
        emit({ stage: 'initiated', pct: 5 });

        // ── Agent A: script ──
        emit({ stage: 'scripting', pct: 10 });
        const segments = await planScript(prompt, totalSec);
        emit({ stage: 'script.compiled', pct: 25, shots: segments.length });

        // ── Agent I: clips (parallel generate + upload) ──
        emit({ stage: 'generating_clips', pct: 30, total: segments.length });
        const clipUrls = (await Promise.all(segments.map((s, i) => genClip(origin, pipelineId, i, s))))
          .filter((u): u is string => Boolean(u));
        emit({ stage: 'video.segments.ready', pct: 65, ready: clipUrls.length, total: segments.length });
        if (clipUrls.length < 2) { emit({ stage: 'failed', error: `only ${clipUrls.length} clip(s) rendered (need ≥2)` }); return; }

        // ── Agent H: voiceover (best-effort) ──
        let voiceUrl: string | null = null;
        if (withVoice) { emit({ stage: 'voiceover', pct: 72 }); voiceUrl = await genVoice(origin, pipelineId, segments); }
        emit({ stage: 'audio.segments.ready', pct: 78, voice: Boolean(voiceUrl) });

        // ── Agent L: assemble ──
        emit({ stage: 'assembling', pct: 82 });
        const { url } = await assembleWithFfmpeg({
          segments: clipUrls.map(u => ({ url: u })),
          voiceoverUrl: voiceUrl,
          musicUrl: null,
          sfxUrl: null,
          globalRender: { transition: 'crossfade', vocal_ducking_pct: 30, fps: 24 },
          pipelineId,
        });
        // Free film / credits were already reserved up front — nothing to charge on success.
        emit({ stage: 'completed', pct: 100, url, shots: clipUrls.length });
        succeeded = true;
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 200) : 'production failed' });
      } finally {
        // Compensate any non-success: restore the consumed free film, else refund the debited credits.
        if (user && !succeeded) {
          if (useFreeSlot) await restoreFreeFilm(user.id).catch(() => undefined);
          else await refundProduce(user.id, PRODUCE_COST.film, ref, reservation.charged);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
