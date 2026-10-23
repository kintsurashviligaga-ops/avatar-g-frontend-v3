/**
 * POST /api/agent-g/delegate
 *
 * Central dispatcher — maps agent_name → real internal API endpoint.
 * Accepts BOTH the old 5-agent set AND all new pipeline agents (image, voice,
 * music, video, avatar, chat, terminal, content-writer, etc.)
 *
 * Protected by x-agent-g-secret header.
 *
 * ⚠️ NO FALLBACK BETWEEN ENGINES (PROJECT_MASTER R7, MASTER TASK v3.1). A voice line that /api/tts/gemini cannot read is
 * this route's error; it is never sent on to another engine. Image, music and video sub-tasks used to post to the
 * Replicate, Udio and LTX routes, which only answer 503 `google_only` since PR 5c; they now refuse here, before any
 * call, with the same message (lib/providers/mediaPolicy).
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { customAvatarText } from '@/lib/avatar/curated';
import { googleOnlyMessage } from '@/lib/providers/mediaPolicy';
import { secretMatches } from '@/lib/security/secretMatch';

/** A sub-task whose tool has no Google engine in this route. Answered 503 with the studio's google_only text. */
class PausedTool extends Error {}

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALL_AGENTS = [
  // Original 5
  'business-agent', 'social-media', 'voice-lab', 'avatar-builder', 'marketplace',
  // New pipeline agents
  'image', 'voice', 'music', 'video', 'avatar', 'chat',
  'terminal', 'content-writer', 'prompt-builder', 'game', 'interior',
  'podcast', 'character', 'event', 'tourism',
] as const;

type AgentName = typeof ALL_AGENTS[number];

const schema = z.object({
  agent_name: z.enum(ALL_AGENTS),
  action: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  demo_mode: z.boolean().optional(),
});

function authHeaders(request: NextRequest): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  const secret = request.headers.get('x-agent-g-secret');
  if (secret) headers['x-agent-g-secret'] = secret;
  return headers;
}

async function callJson(
  origin: string,
  headers: HeadersInit,
  endpoint: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  timeoutMs = 90_000
): Promise<{ ok: boolean; status: number; json: unknown }> {
  try {
    const response = await fetch(`${origin}${endpoint}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, json };
  } catch (err) {
    return { ok: false, status: 0, json: { error: err instanceof Error ? err.message : 'Network error' } };
  }
}

async function dispatchAgent(
  agent: AgentName,
  action: string,
  input: Record<string, unknown>,
  origin: string,
  headers: HeadersInit,
): Promise<{ output: Record<string, unknown> }> {
  const goal = String(input.goal ?? input.prompt ?? input.text ?? '');
  const locale = String(input.language ?? input.locale ?? 'ka');

  // ── Image, music and video ───────────────────────────────────────────────────
  // Their only legs here were Replicate, Udio and LTX, whose routes refuse every call (google_only). Refuse before the
  // hop; the Image, Music and Video tools render on Google's engines.
  if (agent === 'image' || agent === 'music' || agent === 'video') {
    throw new PausedTool(googleOnlyMessage(locale));
  }

  // ── Voice / TTS ──────────────────────────────────────────────────────────────
  // One engine: Gemini's own voice. A miss is this sub-task's error, never a second engine (R7).
  if (agent === 'voice' || (agent === 'voice-lab' && action === 'synthesize_voice')) {
    const text = String(input.text ?? goal);
    const res = await callJson(origin, headers, '/api/tts/gemini', 'POST', {
      text,
      locale,
    });
    if (res.ok) return { output: { type: 'audio', source: 'gemini-native', text, locale } };
    throw new Error(`ხმის სინთეზი ვერ მოხდა (${res.status})`);
  }

  // ── Avatar ──────────────────────────────────────────────────────────────────
  // The full video went to HeyGen (refused by the Google-only boundary). Built-in avatars only (GG, 2026-10-22; MASTER
  // TASK v3.1 PR 9): the talking avatar is rendered in the Avatar tool (/api/avatar/veo), so a sub-task names the gap.
  if (agent === 'avatar' || agent === 'avatar-builder') {
    if (action === 'generate_avatar_brief') {
      // Just return a brief description without hitting HeyGen
      return {
        output: {
          type: 'avatar_brief',
          brief: `ავატარი: ${goal}`,
          recommended_voice: locale,
          style: 'photorealistic',
        },
      };
    }
    throw new Error(customAvatarText(locale));
  }

  // ── Chat / AI reply ──────────────────────────────────────────────────────────
  if (agent === 'chat') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: goal,
      locale,
    });
    if (res.ok) {
      const d = res.json as { reply?: string; data?: { reply?: string } };
      return { output: { type: 'text', subtype: 'chat', text: d?.reply ?? (d?.data as { reply?: string })?.reply ?? '' } };
    }
    throw new Error(`ჩატის პასუხი ვერ მოხდა (${res.status})`);
  }

  // ── Content writer ────────────────────────────────────────────────────────────
  if (agent === 'content-writer') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: `დაწერე კონტენტი: ${goal}`,
      locale,
    });
    if (res.ok) {
      const d = res.json as { reply?: string };
      return { output: { type: 'text', subtype: 'content', text: d?.reply ?? '' } };
    }
    throw new Error(`კონტენტის გენერაცია ვერ მოხდა`);
  }

  // ── Terminal / Code ───────────────────────────────────────────────────────────
  if (agent === 'terminal') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: `დაწერე კოდი: ${goal}`,
      locale: 'en',
    });
    if (res.ok) {
      const d = res.json as { reply?: string };
      return { output: { type: 'code', text: d?.reply ?? '' } };
    }
    throw new Error(`კოდის გენერაცია ვერ მოხდა`);
  }

  // ── Social media ──────────────────────────────────────────────────────────────
  if (agent === 'social-media') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: `შექმენი სოციალური მედიის კონტენტი (${Number(input.count ?? 5)} პოსტი): ${goal}`,
      locale,
    });
    if (res.ok) {
      const d = res.json as { reply?: string };
      return { output: { type: 'text', subtype: 'social', text: d?.reply ?? '' } };
    }
    throw new Error(`სოციალური კონტენტის გენერაცია ვერ მოხდა`);
  }

  // ── Business agent ────────────────────────────────────────────────────────────
  if (agent === 'business-agent') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: `შექმენი ბიზნეს გეგმა: ${goal}`,
      locale,
    });
    if (res.ok) {
      const d = res.json as { reply?: string };
      return { output: { type: 'text', subtype: 'business', text: d?.reply ?? '' } };
    }
    throw new Error(`ბიზნეს გეგმის შექმნა ვერ მოხდა`);
  }

  // ── Prompt builder ────────────────────────────────────────────────────────────
  if (agent === 'prompt-builder') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: `შექმენი ოპტიმიზებული AI prompt: ${goal}`,
      locale,
    });
    if (res.ok) {
      const d = res.json as { reply?: string };
      return { output: { type: 'text', subtype: 'prompt', text: d?.reply ?? '' } };
    }
    throw new Error(`Prompt-ის შექმნა ვერ მოხდა`);
  }

  // ── Voice-lab (explicit generate_voice) ───────────────────────────────────────
  if (agent === 'voice-lab') {
    const res = await callJson(origin, headers, '/api/voice-lab/jobs', 'POST', {
      type: 'generate',
      input: { text: goal, language: locale, title: 'Agent G Voice' },
    });
    if (res.ok) return { output: { type: 'audio', source: 'voice-lab', data: res.json } };
    throw new Error(`Voice Lab გაუმართავია (${res.status})`);
  }

  // ── Marketplace ───────────────────────────────────────────────────────────────
  if (agent === 'marketplace') {
    const res = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
      message: `მოამზადე Marketplace listing: ${goal}`,
      locale,
    });
    if (res.ok) {
      const d = res.json as { reply?: string };
      return { output: { type: 'text', subtype: 'listing', text: d?.reply ?? '' } };
    }
    throw new Error(`Listing-ის შექმნა ვერ მოხდა`);
  }

  // ── Generic fallback for remaining agents ─────────────────────────────────────
  const fallbackRes = await callJson(origin, headers, '/api/agent-g/chat', 'POST', {
    message: goal,
    locale,
  });
  if (fallbackRes.ok) {
    const d = fallbackRes.json as { reply?: string };
    return { output: { type: 'text', agent, text: d?.reply ?? '' } };
  }
  throw new Error(`${agent} სერვისი ვერ შესრულდა`);
}

export async function POST(request: NextRequest) {
  try {
    // Internal secret check.
    // ⚠️ FAIL CLOSED. This read `if (secret && header !== secret)` — so with AGENT_G_INTERNAL_SECRET unset the check was
    // SKIPPED and anyone could make the server dispatch Agent G sub-tasks (each one an LLM call on the platform key, or a
    // forwarded media call). No secret now means no access, never "no check" (the lib/api/cronAuth reading).
    if (!secretMatches(request.headers.get('x-agent-g-secret'), process.env.AGENT_G_INTERNAL_SECRET)) {
      return apiError(new Error('Forbidden'), 403, 'წვდომა აკრძალულია');
    }

    const body = await request.json();
    const payload = schema.safeParse(body);
    if (!payload.success) {
      return apiError(payload.error, 400, `არასწორი payload: ${payload.error.issues.map(i => i.message).join(', ')}`);
    }

    const { agent_name, action, input, demo_mode } = payload.data;
    const origin = request.nextUrl.origin;
    const headers = authHeaders(request);

    void demo_mode;
    const result = await dispatchAgent(agent_name, action, input, origin, headers);

    return apiSuccess(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'სერვისი დროებით მიუწვდომელია';
    return apiError(error, error instanceof PausedTool ? 503 : 502, msg);
  }
}
