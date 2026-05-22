/**
 * POST /api/orchestrator/music/produce — Music Generation Swarm (SSE).
 *
 * brief → Agent S (Claude) designs song metrics (style, BPM, instrumental,
 * lyrics) → dispatch to the music worker (Udio) → signed audio URL.
 * Streams: [Agent S: Architecting Lyric/Vibe Matrix…] →
 *          [Synthesizing Audio Frequency Spectrum…] → completed | failed.
 * Authenticated (dev-bypass under `next dev`). Fail-open: Claude miss →
 * deterministic metrics.
 */
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { deductCredits } from '@/lib/orchestrator/ledger';
import {
  buildSongArchitectSystemPrompt, normalizeSongMetrics, deterministicSongMetrics, songGenerationPrompt,
} from '@/lib/orchestrator/media-directors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;

const MODEL = process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fenced?.[1] ?? text; const s = c.search(/[[{]/);
  if (s === -1) return null;
  try { return JSON.parse(c.slice(s)); } catch { /* trailing */ }
  const e = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
  if (e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch { /* nope */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let body: { prompt?: string };
  try { body = (await req.json()) as { prompt?: string }; } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 });
  const origin = new URL(req.url).origin;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } };
      try {
        emit({ stage: 'architecting', pct: 12, ticker: '[Agent S: Architecting Lyric/Vibe Matrix…]' });

        // Agent S — Claude metrics, fail-open to deterministic.
        let metrics = deterministicSongMetrics(prompt);
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          try {
            const client = new Anthropic({ apiKey });
            const msg = await client.messages.create({
              model: MODEL, max_tokens: 1200,
              system: buildSongArchitectSystemPrompt(),
              messages: [{ role: 'user', content: `Brief: "${prompt}". Return the JSON now.` }],
            });
            const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
            const parsed = extractJson(text);
            if (parsed) metrics = normalizeSongMetrics(parsed, prompt);
          } catch { /* keep deterministic */ }
        }

        emit({ stage: 'synthesizing', pct: 45, ticker: '[Synthesizing Audio Frequency Spectrum…]', style: metrics.style, bpm: metrics.bpm, instrumental: metrics.instrumental });

        const res = await fetch(`${origin}/api/udio/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: songGenerationPrompt(metrics), make_instrumental: metrics.instrumental }),
        });
        if (!res.ok) { emit({ stage: 'failed', error: `worker_${res.status}` }); controller.close(); return; }
        const data = await res.json() as { url?: string; audioUrl?: string; error?: string };
        const url = data.url || data.audioUrl || null;
        if (!url) { emit({ stage: 'failed', error: data.error ?? 'no_audio' }); controller.close(); return; }

        if (user) await deductCredits(user.id, PRODUCE_COST.music, `music:${Date.now()}`).catch(() => null);
        emit({ stage: 'completed', pct: 100, url, title: metrics.title, style: metrics.style, bpm: metrics.bpm });
        controller.close();
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'music pipeline failed' });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
