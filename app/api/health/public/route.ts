/**
 * GET /api/health/public
 *
 * Aggregate-only health snapshot safe to expose to the chat UI's right
 * drawer. Returns category-level counts and a single per-category bucket
 * (ok / degraded / down) without naming specific providers or leaking
 * env-var keys / latency details / error messages.
 *
 * Each category asks the engine that actually serves it under the Google-only boundary (docs/VEO_ENGINE.md), with free
 * calls only — nothing is generated or billed:
 *   chat, image — the selected Google transport answers countTokens for the chat and the image model
 *                 (lib/ai/google/transportCheck); music rides the same transport (Lyria);
 *   video       — the keyless Vertex chain Veo uses: token, bucket, signing (lib/veo/authCheck);
 *   voice       — ElevenLabs, and its plan: every Georgian voice is a cloned one (lib/elevenlabs/account);
 *   avatar      — Veo for the picture AND the voice for its Georgian line.
 * Until 2026-10-17 image / video / music asked Replicate and avatar asked HeyGen — engines the product no longer uses —
 * and voice only asked whether the ElevenLabs key opened /v1/user: it read "6/6 ok" while ElevenLabs refused every
 * Georgian line (`401 subscription_required / ivc_not_permitted`, the approved avatar test at 09:31Z).
 *
 * Cached for 60 s in-memory per server instance to avoid hammering the
 * upstream providers from a chat drawer that may open frequently.
 */

import { NextResponse } from 'next/server';
import { checkGoogleTransport, type TransportCheck } from '@/lib/ai/google/transportCheck';
import { checkVertexAuth, type VertexAuthCheck } from '@/lib/veo/authCheck';
import { elevenLabsVoiceState, readElevenLabsAccount } from '@/lib/elevenlabs/account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

type Category = 'chat' | 'image' | 'video' | 'music' | 'voice' | 'avatar';
type Bucket = 'ok' | 'degraded' | 'down' | 'unconfigured';

interface Snapshot {
  checkedAt: string;
  online: boolean;
  categories: Record<Category, Bucket>;
  totals: { ok: number; degraded: number; down: number; unconfigured: number };
}

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
let cached: { at: number; data: Snapshot } | null = null;

/** A check that does not answer in time reads as down — it never holds the drawer past the function's limit. */
function inTime<T>(p: Promise<T>, late: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((r) => { timer = setTimeout(() => r(late), TIMEOUT_MS); });
  return Promise.race([p.catch(() => late), deadline]).finally(() => clearTimeout(timer));
}

async function voiceBucket(): Promise<Bucket> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return 'unconfigured';
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return 'down';
    // The key opens the account; can its plan speak the cloned Georgian voices, and has it characters left?
    return elevenLabsVoiceState(readElevenLabsAccount(await r.json().catch(() => null))) === 'ok' ? 'ok' : 'degraded';
  } catch {
    return 'down';
  }
}

function transportBucket(t: TransportCheck, index: number): Bucket {
  if (!t.configured) return t.transport === 'invalid' ? 'down' : 'unconfigured';
  return t.steps[index]?.ok ? 'ok' : 'down';
}

function vertexBucket(v: VertexAuthCheck): Bucket {
  if (v.ok) return 'ok';
  return v.steps[0] === 'config:missing' ? 'unconfigured' : 'down';
}

/** The avatar is Veo's picture with ElevenLabs' Georgian line: no Veo, no avatar; no voice, a Georgian line cannot be made. */
function avatarBucket(video: Bucket, voice: Bucket): Bucket {
  if (video !== 'ok') return video;
  return voice === 'ok' ? 'ok' : 'degraded';
}

export async function GET() {
  // Cache hit — return immediately.
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const [transport, vertex, voice] = await Promise.all([
    inTime(checkGoogleTransport(), { transport: 'invalid', configured: true, ok: false, steps: [] } as TransportCheck),
    inTime(checkVertexAuth(), { ok: false, steps: ['timeout'] } as VertexAuthCheck),
    inTime(voiceBucket(), 'down' as Bucket),
  ]);
  const chat = transportBucket(transport, 0);
  const image = transportBucket(transport, 1);
  const music = !transport.configured ? chat : transport.ok ? 'ok' : 'down';
  const video = vertexBucket(vertex);
  const avatar = avatarBucket(video, voice);

  const categories: Record<Category, Bucket> = { chat, image, video, music, voice, avatar };
  const totals = { ok: 0, degraded: 0, down: 0, unconfigured: 0 };
  for (const v of Object.values(categories)) totals[v]++;

  const data: Snapshot = {
    checkedAt: new Date().toISOString(),
    online: totals.down === 0 && totals.ok > 0,
    categories,
    totals,
  };
  cached = { at: Date.now(), data };
  return NextResponse.json(data);
}
