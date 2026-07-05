/**
 * POST /api/orchestrator/interior/produce — interior design pipeline (SSE).
 *
 * intake (≤3 photos OR 360° video + brief)
 *   → Agent N (Gemini)  : RoomGeometry
 *   → Agent K (Claude)  : StyleGuide + walkthrough prompts
 *   → emits geometry+style for the inline Three.js RoomViewer.
 *
 * Streams professional telemetry tickers as it runs; ends with
 * { stage:'completed', geometry, style, walkthrough } or { stage:'failed', error }.
 * Authenticated. Fail-open at each hop (Gemini → deterministic geometry,
 * Claude → deterministic style) so the viewer always has something to mount.
 */
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { reserveProduce, refundProduce, idemRef, type Reservation } from '@/lib/orchestrator/produceBilling';
import { createJob, recordJobEvent } from '@/lib/orchestrator/jobs';
import {
  normalizeIntake, intakeHasMedia, normalizeRoomGeometry, normalizeStyleGuide,
  buildGeometrySystemPrompt, buildStyleSystemPrompt, buildStyleUserPrompt,
  buildWalkthroughPrompts, DEFAULT_ROOM_GEOMETRY, DEFAULT_STYLE_GUIDE,
  type RoomGeometry,
} from '@/lib/orchestrator/interior';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const CLAUDE_MODEL = process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

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
  const keys = geminiKeys();
  if (keys.length === 0 || imageUrls.length === 0) return null;
  const content = [
    { type: 'text' as const, text: `${brief ? `Brief: "${brief}". ` : ''}Estimate the empty-room geometry from these ${imageUrls.length} view(s).` },
    ...imageUrls.map(u => ({ type: 'image' as const, image: u })),
  ];
  for (const apiKey of keys) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const { text } = await generateText({ model: google(VISION_MODEL), maxRetries: 4, system: buildGeometrySystemPrompt(), messages: [{ role: 'user', content }] });
      const parsed = extractJson(text);
      if (parsed) return normalizeRoomGeometry(parsed);
    } catch { /* rotate */ }
  }
  return null;
}

async function designStyle(geometry: RoomGeometry, brief: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({ model: CLAUDE_MODEL, max_tokens: 1200, system: buildStyleSystemPrompt(), messages: [{ role: 'user', content: buildStyleUserPrompt(geometry, brief) }] });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(text);
    return parsed ? normalizeStyleGuide(parsed) : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  // Auth required in production; bypassed ONLY under `next dev` for local QA.
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let intake;
  let rawBody: unknown = null;
  try { rawBody = await req.json(); intake = normalizeIntake(rawBody); } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  if (!intakeHasMedia(intake)) return new Response(JSON.stringify({ error: 'at least 1 photo or a video is required' }), { status: 400 });

  // Durable job row (#5).
  const pipelineId = `intr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'interior', params: { brief: intake.brief, photos: intake.imageUrls.length, hasVideo: Boolean(intake.videoUrl) } });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } recordJobEvent(jobId, o); };
      const ref = idemRef('interior', pipelineId, rawBody);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let succeeded = false;
      try {
        if (user) {
          reservation = await reserveProduce(user.id, PRODUCE_COST.interior, ref);
          if (!reservation.proceed) { emit({ stage: 'failed', error: 'insufficient_credits', reason: reservation.reason, balance: reservation.balance }); return; }
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

        emit({ stage: 'completed', pct: 100, geometry, style, walkthrough, degradedGeometry: degradedGeo });
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
