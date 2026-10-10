/**
 * POST /api/orchestrator/interior/produce — interior design pipeline (SSE).
 *
 * intake (≤3 photos OR 360° video + brief)
 *   → Agent N (Gemini)  : RoomGeometry
 *   → Agent K (Gemini)  : StyleGuide + walkthrough prompts
 *   → emits geometry+style for the inline Three.js RoomViewer.
 *
 * Streams professional telemetry tickers as it runs; ends with
 * { stage:'completed', geometry, style, walkthrough } or { stage:'failed', error }.
 * Authenticated. Fail-open at each hop (Gemini → deterministic geometry,
 * Gemini → deterministic style) so the viewer always has something to mount.
 *
 * THE PLAN IS FILED TO THE LIBRARY. The completed job row always held the plan (result: geometry, style, walkthrough),
 * but the Library lists a row only with a picture to show, and this one had none: a paid plan was gone once its tab
 * closed. The Interior designer now sends `coverUrl`, the render the plan was asked for, and the completed row carries it
 * as its picture. The cover is the caller's own: one of our objects only when callerMayRead allows it (lib/security/
 * callerMedia), since the Library re-signs a row's storage URL with the service role; another host only when it is a
 * public address. Anything else files the plan without a picture, as before. The cover is never fetched here.
 *
 * Room photos are `data:image/…` from the panel, or a public http(s) address. Anything else (an internal host, another
 * scheme) is dropped before Gemini's download sees it.
 */
import { NextRequest } from 'next/server';
import { llmText } from '@/lib/ai/llmText';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@/lib/ai/google/provider';
import { googleCallAttempts } from '@/lib/ai/google/transport';
import { geminiTierModel } from '@/lib/ai/google/models';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { reserveProduce, refundProduce, idemRef, reservationErrorCode, type Reservation } from '@/lib/orchestrator/produceBilling';
import { createJob, recordJobEvent, recordJobReservation } from '@/lib/orchestrator/jobs';
import { describeSupabaseObjectUrl, ownStorageHosts } from '@/lib/orchestrator/storage-adapter';
import { callerMayRead } from '@/lib/security/callerMedia';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import {
  normalizeIntake, intakeHasMedia, normalizeRoomGeometry, normalizeStyleGuide,
  buildGeometrySystemPrompt, buildStyleSystemPrompt, buildStyleUserPrompt,
  buildWalkthroughPrompts, DEFAULT_ROOM_GEOMETRY, DEFAULT_STYLE_GUIDE,
  type RoomGeometry,
} from '@/lib/orchestrator/interior';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? geminiTierModel('flash');

function geminiKeys(): string[] {
  const csv = (process.env.GEMINI_API_KEYS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const single = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '').trim();
  if (single) csv.push(single);
  return [...new Set(csv)];
}
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fenced?.[1] ?? text;
  const s = c.search(/[[{]/);
  if (s === -1) return null;
  try { return JSON.parse(c.slice(s)); } catch { /* trailing */ }
  const e = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
  if (e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch { /* nope */ } }
  return null;
}

async function analyzeGeometry(imageUrls: string[], brief: string): Promise<RoomGeometry | null> {
  // One attempt per pooled key on the Gemini API, one on Vertex AI (GEMINI_TRANSPORT).
  const attempts = googleCallAttempts(geminiKeys());
  if (attempts.length === 0 || imageUrls.length === 0) return null;
  const content = [
    { type: 'text' as const, text: `${brief ? `Brief: "${brief}". ` : ''}Estimate the empty-room geometry from these ${imageUrls.length} view(s).` },
    ...imageUrls.map(u => ({ type: 'image' as const, image: u })),
  ];
  for (const apiKey of attempts) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const { text } = await generateText({ model: google(VISION_MODEL), maxRetries: 4, system: buildGeometrySystemPrompt(), messages: [{ role: 'user', content }] });
      const parsed = extractJson(text);
      if (parsed) return normalizeRoomGeometry(parsed);
    } catch { /* rotate */ }
  }
  return null;
}

/** A room photo Gemini may be handed: the panel's inline picture, or a public address (never an internal host). */
function readablePhoto(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url) || isPublicHttpUrl(url);
}

/** The plan's Library picture: the caller's own render, or a public address. Null files the plan without one. */
async function planCover(value: unknown, userId: string): Promise<string | null> {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!/^https:\/\//i.test(url) || url.length > 4096) return null;
  const ref = describeSupabaseObjectUrl(url);
  if (!ref || !ownStorageHosts().has(ref.host)) return isPublicHttpUrl(url) ? url : null;
  if (ref.access === 'public') return url;
  return (await callerMayRead(url, ref, userId).catch(() => false)) ? url : null;
}

/** Agent K — the style guide from Gemini (lib/ai/llmText: Gemini only, no second provider); null → the caller's default. */
async function designStyle(geometry: RoomGeometry, brief: string) {
  const text = await llmText({ user: buildStyleUserPrompt(geometry, brief), system: buildStyleSystemPrompt(), maxTokens: 1200, json: true, timeoutMs: 30_000 });
  const parsed = text ? extractJson(text) : null;
  return parsed ? normalizeStyleGuide(parsed) : null;
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  // Auth required in production; bypassed ONLY under `next dev` for local QA.
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let intake;
  let rawBody: unknown = null;
  try { rawBody = await req.json(); intake = normalizeIntake(rawBody); } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  intake = { ...intake, imageUrls: intake.imageUrls.filter(readablePhoto), videoUrl: intake.videoUrl && isPublicHttpUrl(intake.videoUrl) ? intake.videoUrl : null };
  if (!intakeHasMedia(intake)) return new Response(JSON.stringify({ error: 'at least 1 photo or a video is required' }), { status: 400 });

  // Durable job row (#5).
  const pipelineId = `intr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'interior', params: { prompt: intake.brief || null, source: 'interior-plan', brief: intake.brief, photos: intake.imageUrls.length, hasVideo: Boolean(intake.videoUrl) } });
  const cover = user ? planCover((rawBody as { coverUrl?: unknown } | null)?.coverUrl, user.id).catch(() => null) : Promise.resolve(null);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } recordJobEvent(jobId, o); };
      const ref = idemRef('interior', pipelineId, rawBody);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let succeeded = false;
      try {
        if (user) {
          reservation = await reserveProduce(user.id, PRODUCE_COST.interior, ref, { refuseReplay: true });
          if (!reservation.proceed) { emit({ stage: 'failed', error: reservationErrorCode(reservation), reason: reservation.reason, balance: reservation.balance }); return; }
          // Stamp the reserve onto the durable row so the cron drainer can refund it idempotently if this
          // render is abandoned (tab closed) and the in-route refund below never fires. Only when charged.
          if (jobId && reservation.charged) await recordJobReservation(jobId, { ref, credits: PRODUCE_COST.interior });
        }
        emit({ stage: 'extracting', pct: 10, ticker: intake.videoUrl ? '[Extracting Spatial Matrix from Video Frames…]' : '[Extracting Spatial Matrix from Photos…]' });

        // Agent N. Video-only intake has no still frames for the VLM (frame
        // extraction is the GPU upgrade) → deterministic geometry, flagged.
        let geometry = await analyzeGeometry(intake.imageUrls, intake.brief);
        const degradedGeo = !geometry;
        if (!geometry) geometry = { ...DEFAULT_ROOM_GEOMETRY, notes: intake.videoUrl ? 'video-frame extraction pending GPU worker — estimated layout' : 'estimated layout' };
        emit({ stage: 'geometry', pct: 45, ticker: '[Agent N: Room Geometry JSON Compiled…]', geometryConfidence: geometry.confidence });

        // Agent K.
        emit({ stage: 'styling', pct: 60, ticker: '[Agent K: Generating High-End Material & Lighting Manifest…]' });
        const style = (await designStyle(geometry, intake.brief)) ?? DEFAULT_STYLE_GUIDE;

        emit({ stage: 'mounting', pct: 90, ticker: '[Agent L: Mounting 3D WebGL Three.js Container…]' });
        const walkthrough = buildWalkthroughPrompts(geometry, style);

        // `url` is the Library picture: recordJobEvent files it as the completed row's signed_url.
        const url = await cover;
        emit({ stage: 'completed', pct: 100, geometry, style, walkthrough, degradedGeometry: degradedGeo, ...(url ? { url } : {}) });
        succeeded = true;
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 200) : 'interior pipeline failed' });
      } finally {
        if (user && !succeeded) await refundProduce(user.id, PRODUCE_COST.interior, ref, reservation.charged);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
