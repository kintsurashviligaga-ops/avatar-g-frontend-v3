/**
 * POST /api/agent-g/delegate
 *
 * Central dispatcher — maps agent_name → real internal API endpoint.
 * Accepts BOTH the old 5-agent set AND all new pipeline agents (image, voice,
 * music, video, avatar, chat, terminal, content-writer, etc.)
 *
 * Protected by x-agent-g-secret header.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';

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
  demoMode: boolean
): Promise<{ output: Record<string, unknown> }> {
  const goal = String(input.goal ?? input.prompt ?? input.text ?? '');
  const locale = String(input.language ?? input.locale ?? 'ka');

  // ── Image generation (Replicate → NanoBanana fallback built into endpoint) ──
  if (agent === 'image') {
    const res = await callJson(origin, headers, '/api/replicate/image', 'POST', {
      prompt: goal,
      quality: String(input.quality ?? 'standard'),
    });
    if (res.ok) {
      const d = res.json as { url?: string; imageUrl?: string; output?: string[] };
      const url = d?.url ?? d?.imageUrl ?? (d?.output as string[])?.[0] ?? null;
      return { output: { type: 'image', url, goal } };
    }
    throw new Error(`სურათის გენერაცია ვერ მოხდა (${res.status})`);
  }

  // ── Voice / TTS ──────────────────────────────────────────────────────────────
  if (agent === 'voice' || (agent === 'voice-lab' && action === 'synthesize_voice')) {
    const text = String(input.text ?? goal);
    const res = await callJson(origin, headers, '/api/elevenlabs/tts', 'POST', {
      text,
      locale,
    });
    if (res.ok) return { output: { type: 'audio', source: 'elevenlabs', text, locale } };

    // Fallback: voice-lab endpoint
    const fallback = await callJson(origin, headers, '/api/voice-lab/jobs', 'POST', {
      type: 'generate',
      input: { text, language: locale, title: 'Agent G TTS' },
    });
    if (fallback.ok) return { output: { type: 'audio', source: 'voice-lab', text, locale, data: fallback.json } };
    throw new Error(`ხმის სინთეზი ვერ მოხდა (ElevenLabs + voice-lab გაუმართავია)`);
  }

  // ── Music generation ─────────────────────────────────────────────────────────
  if (agent === 'music') {
    const res = await callJson(origin, headers, '/api/udio/generate', 'POST', {
      prompt: goal,
      make_instrumental: Boolean(input.instrumental ?? false),
    }, 120_000); // Udio needs up to 120s
    if (res.ok) {
      const d = res.json as { url?: string; audioUrl?: string };
      return { output: { type: 'audio', subtype: 'music', url: d?.url ?? d?.audioUrl, goal } };
    }
    throw new Error(`მუსიკის გენერაცია ვერ მოხდა (Udio ${res.status})`);
  }

  // ── Video generation ─────────────────────────────────────────────────────────
  if (agent === 'video') {
    const res = await callJson(origin, headers, '/api/ltx-video', 'POST', {
      prompt: goal,
      duration: Number(input.duration ?? 6),
      resolution: String(input.resolution ?? '1920x1080'),
    }, 120_000);
    if (res.ok) return { output: { type: 'video', goal, binary: true } };
    throw new Error(`ვიდეოს გენერაცია ვერ მოხდა (LTX ${res.status})`);
  }

  // ── Avatar (HeyGen talking avatar) ──────────────────────────────────────────
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
    // Full avatar video via HeyGen
    const startRes = await callJson(origin, headers, '/api/heygen/avatar', 'POST', {
      script: goal,
      locale,
    });
    if (!startRes.ok) throw new Error(`HeyGen ავატარი ვერ დაიწყო (${startRes.status})`);
    const videoId = (startRes.json as { videoId?: string })?.videoId;
    if (!videoId) throw new Error('HeyGen: videoId არ დაბრუნდა');
    return { output: { type: 'video', subtype: 'avatar', videoId, goal } };
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
    // Internal secret check
    const secret = process.env.AGENT_G_INTERNAL_SECRET;
    if (secret && request.headers.get('x-agent-g-secret') !== secret) {
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

    const result = await dispatchAgent(agent_name, action, input, origin, headers, Boolean(demo_mode));

    return apiSuccess(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'სერვისი დროებით მიუწვდომელია';
    return apiError(error, 502, msg);
  }
}
