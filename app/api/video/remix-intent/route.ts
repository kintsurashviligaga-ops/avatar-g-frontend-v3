/**
 * POST /api/video/remix-intent — classify a free-text edit request (ka/en/ru) into
 * ONE remix operation for /api/video/remix. The user attaches a video and types
 * e.g. "სუბტიტრები დაამატე" or "make it vintage"; this returns { op, params }.
 *
 * The model classifies for a SIGNED-IN caller: Gemini (REST, JSON mode) under AI_GOOGLE_ONLY — the
 * default — or Claude Haiku when the kill switch is off. A deterministic ka/en/ru keyword matcher is
 * the fallback for every miss (no key, budget refusal, timeout, unparseable or unknown op) and the
 * ONLY path for a guest, so intent detection NEVER hard-depends on a model and an anonymous POST
 * spends nothing. The studio never sends a guest here anyway (send() stops guests first).
 *
 * ⚠️ THE CLIENT SPREADS `params` INTO THE /api/video/remix BODY, AFTER op/videoUrl/text
 * (OmniStudio: `{ op, videoUrl, text, ...intent.params }`). Model-written params therefore could
 * overwrite the video URL or the caption. They are reduced to the per-op keys the remix route reads
 * (sanitizeParams), with bounded values, whichever model wrote them.
 *
 * Request: { message: string }   Response: { op: string, params: object }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate } from '@/lib/auth/generationGate';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { generateWithGemini } from '@/lib/gemini/client';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OPS = ['add_subtitles', 'color_grade', 'add_music', 'add_text_overlay', 'trim', 'speed_change', 'speed_ramp', 'stabilize', 'face_swap', 'background_remove'] as const;
type Op = (typeof OPS)[number];
type Intent = { op: Op; params: Record<string, unknown> };

/** The grades /api/video/remix accepts (anything else there becomes 'cinematic'). */
const GRADES = ['vintage', 'cinematic', 'neon', 'noir', 'dramatic'] as const;

const CLASSIFIER_SYSTEM =
  'You are a video-editing intent classifier. The user uploaded a video and described an edit (in Georgian, English or Russian). ' +
  `Pick exactly ONE operation from: ${OPS.join(', ')}. ` +
  'Return ONLY compact JSON: {"op": "<one>", "params": {}}. ' +
  `For color_grade include params.grade ∈ {${GRADES.join(',')}}. For speed_change include params.speed (e.g. 2 or 0.5). ` +
  'For speed_ramp you may include params.factor (1.2–4). For trim you may include params.startSec and params.durationSec (seconds).';

function num(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}

/**
 * Keep only the keys /api/video/remix reads for this op, bounded. Everything else — including any
 * `op` / `videoUrl` / `text` / `audioUrl` a model put in `params` — is dropped (see the header ⚠️).
 */
function sanitizeParams(op: Op, raw: unknown): Record<string, unknown> {
  const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (op) {
    case 'color_grade': {
      const g = typeof p.grade === 'string' ? p.grade.trim().toLowerCase() : '';
      return { grade: (GRADES as readonly string[]).includes(g) ? g : 'cinematic' };
    }
    case 'speed_change':
      return { speed: num(p.speed, 0.25, 4) ?? 2 };
    case 'speed_ramp':
      return { factor: num(p.factor, 1.1, 4) ?? 1.5 };
    case 'trim': {
      // Only the values the model actually gave — a missing one keeps the remix route's own default.
      const startSec = num(p.startSec, 0, 3600);
      const durationSec = num(p.durationSec, 1, 600);
      return {
        ...(startSec !== undefined ? { startSec } : {}),
        ...(durationSec !== undefined ? { durationSec } : {}),
      };
    }
    default:
      return {};
  }
}

/** Parse a model reply ({"op","params"}, possibly fenced) into a validated intent, or null. */
function parseIntent(text: string): Intent | null {
  try {
    const json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) as { op?: unknown; params?: unknown };
    const op = typeof json.op === 'string' ? json.op.trim() : '';
    if (!(OPS as readonly string[]).includes(op)) return null;
    return { op: op as Op, params: sanitizeParams(op as Op, json.params) };
  } catch {
    return null;
  }
}

/** Deterministic ka/en/ru keyword classifier — the reliable fallback. */
function keywordIntent(message: string): Intent {
  const m = (message || '').toLowerCase();
  const grade: 'vintage' | 'cinematic' | 'neon' =
    /vintage|ვინტაჟ|ретро|винтаж/.test(m) ? 'vintage' : /neon|ნეონ|неон/.test(m) ? 'neon' : 'cinematic';
  if (/სუბტიტრ|subtitle|субтитр/.test(m)) return { op: 'add_subtitles', params: {} };
  // Music BEFORE background: "add background music" / "ფონური მუსიკა" contains "background", so the
  // background_remove check below would otherwise hijack an add-music request into a PAID rembg on the
  // wrong op. A genuine background-removal ask carries no music word, so it still reaches rembg below.
  if (/მუსიკ|music|музык|track|ბიტ|beat/.test(m)) return { op: 'add_music', params: {} };
  if (/ფონ|background|бэкграунд|фон|rembg|remove\s*bg/.test(m)) return { op: 'background_remove', params: {} };
  if (/პერსონაჟ|character|face\s*swap|swap|лицо|персонаж/.test(m)) return { op: 'face_swap', params: {} };
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

/**
 * Gemini in JSON mode (responseMimeType application/json) on the flash tier with thinking OFF — the
 * same combination llmText's Gemini leg runs in production. Budget-checked before, booked after.
 */
async function geminiIntent(message: string, userId: string | null): Promise<Intent | null> {
  if (!resolveGeminiKey()) return null;
  const prompt = message.slice(0, 500);
  if (!(await chatBudgetAllows(`${CLASSIFIER_SYSTEM} ${prompt}`))) return null;
  try {
    const r = await generateWithGemini({
      prompt,
      systemPrompt: CLASSIFIER_SYSTEM,
      tier: 'flash',
      maxTokens: 200,
      temperature: 0,
      // ⚠️ Thinking OFF: with the model's default dynamic thinking a 200-token cap can be spent before any JSON is written.
      thinkingBudget: 0,
      responseMimeType: 'application/json',
      // The user is watching a "remix running" bubble; the keyword matcher answers instantly on a miss.
      timeoutMs: 8_000,
    });
    void bookChatUsage({
      model: r.model,
      inputTokens: r.tokensIn,
      outputTokens: r.tokensOut,
      inputChars: CLASSIFIER_SYSTEM.length + prompt.length,
      chars: r.text.length,
      userId,
    });
    return parseIntent(r.text);
  } catch (err) {
    // The client error text carries the provider body — log the head only.
    console.warn('[remix-intent] gemini classify failed:', (err instanceof Error ? err.message : String(err)).slice(0, 120));
    return null;
  }
}

/** The pre-Google-only classifier, kept for AI_GOOGLE_ONLY=0 (the kill switch). */
async function claudeIntent(message: string, userId: string | null): Promise<Intent | null> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return null;
  const prompt = message.slice(0, 500);
  if (!(await chatBudgetAllows(`${CLASSIFIER_SYSTEM} ${prompt}`))) return null;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 8_000 });
    const model = process.env.ANTHROPIC_SCRIPT_MODEL ?? 'claude-haiku-4-5-20251001';
    const msg = await client.messages.create({
      model,
      max_tokens: 120,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? (b as { text: string }).text : '')).join('').trim();
    void bookChatUsage({
      model,
      inputTokens: msg.usage?.input_tokens,
      outputTokens: msg.usage?.output_tokens,
      inputChars: CLASSIFIER_SYSTEM.length + prompt.length,
      chars: text.length,
      userId,
    });
    return parseIntent(text);
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
  const fallback = keywordIntent(message);

  // A guest gets the free deterministic matcher only — a model call is platform spend, and this route
  // used to answer anonymous POSTs on the Anthropic key.
  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (mustSignInToGenerate(userId)) return NextResponse.json(fallback);

  const viaModel = isAiGoogleOnly() ? await geminiIntent(message, userId) : await claudeIntent(message, userId);
  return NextResponse.json(viaModel ?? fallback);
}
