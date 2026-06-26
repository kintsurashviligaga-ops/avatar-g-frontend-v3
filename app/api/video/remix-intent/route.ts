/**
 * POST /api/video/remix-intent — classify a free-text edit request (ka/en/ru) into
 * ONE remix operation for /api/video/remix. The user attaches a video and types
 * e.g. "სუბტიტრები დაამატე" or "make it vintage"; this returns { op, params }.
 *
 * Claude does the classification when ANTHROPIC_API_KEY is live; a deterministic
 * keyword matcher is the fallback (and the primary path in any env where the key
 * is absent), so intent detection NEVER hard-depends on the model.
 *
 * Request: { message: string }   Response: { op: string, params: object }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OPS = ['add_subtitles', 'color_grade', 'add_music', 'add_text_overlay', 'trim', 'speed_change', 'speed_ramp', 'stabilize', 'face_swap', 'background_remove'] as const;
type Op = (typeof OPS)[number];

/** Deterministic ka/en/ru keyword classifier — the reliable fallback. */
function keywordIntent(message: string): { op: Op; params: Record<string, unknown> } {
  const m = (message || '').toLowerCase();
  const grade: 'vintage' | 'cinematic' | 'neon' =
    /vintage|ვინტაჟ|ретро|винтаж/.test(m) ? 'vintage' : /neon|ნეონ|неон/.test(m) ? 'neon' : 'cinematic';
  if (/სუბტიტრ|subtitle|субтитр/.test(m)) return { op: 'add_subtitles', params: {} };
  if (/ფონ|background|бэкграунд|фон|rembg|remove\s*bg/.test(m)) return { op: 'background_remove', params: {} };
  if (/პერსონაჟ|character|face\s*swap|swap|лицо|персонаж/.test(m)) return { op: 'face_swap', params: {} };
  if (/მუსიკ|music|музык|track|ბიტ|beat/.test(m)) return { op: 'add_music', params: {} };
  if (/ფერ|color|grade|vintage|cinematic|neon|цвет|грейд/.test(m)) return { op: 'color_grade', params: { grade } };
  // Stabilization + speed-ramp checked BEFORE the generic speed cue so a "ramp" / "shaky"
  // request isn't swallowed by plain speed_change.
  if (/სტაბილ|stabil|стабил|shake|აქანავ|ანძრევ|gimbal|jitter/.test(m)) return { op: 'stabilize', params: {} };
  if (/რემპ|ramp|speed.?ramp|slow.?in|slow.?out/.test(m)) return { op: 'speed_ramp', params: { factor: 1.5 } };
  if (/სიჩქარ|speed|ნელ|სწრაფ|fast|slow|скорост|быстр|медлен|გაზარდე|შეანელე|2x|2х/.test(m)) {
    // "faster" cues win; "slower" cues fall through to 0.5×.
    const slow = /შეანელე|ნელ|slow|медлен|замедл/.test(m);
    return { op: 'speed_change', params: { speed: slow ? 0.5 : 2 } };
  }
  if (/მოჭ|trim|cut|შემოკლ|обрез|обрезать/.test(m)) return { op: 'trim', params: { startSec: 0, durationSec: 10 } };
  if (/ტექსტ|წარწერ|text|overlay|надпис|текст/.test(m)) return { op: 'add_text_overlay', params: {} };
  return { op: 'color_grade', params: { grade } }; // safe, always-succeeds default
}

async function claudeIntent(message: string): Promise<{ op: Op; params: Record<string, unknown> } | null> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_SCRIPT_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system:
        'You are a video-editing intent classifier. The user uploaded a video and described an edit. ' +
        `Pick exactly ONE operation from: ${OPS.join(', ')}. ` +
        'Return ONLY compact JSON: {"op": "<one>", "params": {}}. ' +
        'For color_grade include params.grade ∈ {vintage,cinematic,neon}. For speed_change include params.speed (e.g. 2 or 0.5).',
      messages: [{ role: 'user', content: message.slice(0, 500) }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? (b as { text: string }).text : '')).join('').trim();
    const json = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()) as { op?: string; params?: Record<string, unknown> };
    if (json.op && (OPS as readonly string[]).includes(json.op)) return { op: json.op as Op, params: json.params ?? {} };
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rl) return rl;
  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json(keywordIntent(''));
  const viaClaude = await claudeIntent(message);
  return NextResponse.json(viaClaude ?? keywordIntent(message));
}
