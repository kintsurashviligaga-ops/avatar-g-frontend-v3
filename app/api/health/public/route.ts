/**
 * GET /api/health/public
 *
 * Aggregate-only health snapshot safe to expose to the chat UI's right
 * drawer. Returns category-level counts and a single per-category bucket
 * (ok / degraded / down) without naming specific providers or leaking
 * env-var keys / latency details / error messages.
 *
 * Cached for 60 s in-memory per server instance to avoid hammering the
 * upstream providers from a chat drawer that may open frequently.
 */

import { NextResponse } from 'next/server';

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

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;
let cached: { at: number; data: Snapshot } | null = null;

async function pingTimeout(url: string, init: RequestInit = {}): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function probe(category: Category, envValue: string | undefined, run: () => Promise<boolean>): Promise<Bucket> {
  if (!envValue?.trim()) return 'unconfigured';
  try { return (await run()) ? 'ok' : 'down'; } catch { return 'down'; }
}

export async function GET() {
  // Cache hit — return immediately.
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const [chat, image, video, music, voice, avatar] = await Promise.all([
    probe('chat', process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY,
      () => pingTimeout('https://generativelanguage.googleapis.com/v1beta/models?key=' + (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? ''))),
    probe('image', process.env.REPLICATE_API_TOKEN,
      () => pingTimeout('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
      })),
    probe('video', process.env.LTX_API_KEY ?? process.env.REPLICATE_API_TOKEN,
      () => pingTimeout('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN ?? ''}` },
      })),
    probe('music', process.env.UDIO_API_KEY ?? process.env.REPLICATE_API_TOKEN,
      () => pingTimeout('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN ?? ''}` },
      })),
    probe('voice', process.env.ELEVENLABS_API_KEY,
      () => pingTimeout('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' },
      })),
    probe('avatar', process.env.HEYGEN_API_KEY,
      () => pingTimeout('https://api.heygen.com/v2/voices', {
        headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY ?? '' },
      })),
  ]);

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
