/** @jest-environment node */
/**
 * GET /api/studio/catalogue — which catalogue models this deployment can run, for every picker. Pinned: ids, a boolean and a
 * reason word per row (never a key, an env value, an endpoint or a price); under MyAvatar v32 no Higgsfield row is offered
 * at all, whatever STUDIO_V2 / HF_ENABLED_MODELS / HF keys say; the image rows follow the Imagen transport; the film rows
 * follow the Veo transport; music follows Lyria's status; and the route answers with STUDIO_V2 off.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));
jest.mock('../../../../lib/veo/engine', () => ({ veoTransport: jest.fn(() => 'vertex') }));
// The image rows follow the Imagen transport — mocked so the answer never depends on this machine's GEMINI_* env.
jest.mock('../../../../lib/ai/geminiImagen', () => ({ hasGeminiImagenProvider: jest.fn(() => true) }));
const lyriaStatus = (lyria: { configured: boolean; busy: boolean }) => ({
  engines: { lyria: { ...lyria, controls: 'prompt' } },
  references: { cover: false, voice: false },
  chain: ['lyria'],
});
jest.mock('../../../../lib/ai/musicEnginesStatus', () => ({
  musicEnginesStatus: jest.fn(async () => lyriaStatus({ configured: true, busy: false })),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { veoTransport } from '../../../../lib/veo/engine';
import { hasGeminiImagenProvider } from '../../../../lib/ai/geminiImagen';
import { musicEnginesStatus } from '../../../../lib/ai/musicEnginesStatus';

const SECRET = 'sk-test-secret-value-1234567890';
const ENV_KEYS = ['STUDIO_V2', 'HF_ENABLED_MODELS', 'HF_API_KEY_ID', 'HF_API_KEY_SECRET', 'HF_CREDENTIALS', 'VIDEO_GOOGLE_ONLY'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  jest.clearAllMocks();
  (veoTransport as jest.Mock).mockReturnValue('vertex');
  (hasGeminiImagenProvider as jest.Mock).mockReturnValue(true);
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

type Row = { id: string; available: boolean; reason: string | null };
async function rows(service?: string): Promise<Record<string, Row>> {
  const res = await GET(new NextRequest(`https://myavatar.ge/api/studio/catalogue${service ? `?service=${service}` : ''}`));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { models: Row[] };
  for (const r of body.models) expect(Object.keys(r).sort()).toEqual(['available', 'id', 'reason']);
  return Object.fromEntries(body.models.map((r) => [r.id, r]));
}

test('STUDIO_V2 off: the route still answers; only the Veo rows are listed, and they are open', async () => {
  process.env.HF_API_KEY_ID = 'id';
  process.env.HF_API_KEY_SECRET = SECRET;
  const r = await rows('video');
  expect(r['google/veo-3.1-fast']).toEqual({ id: 'google/veo-3.1-fast', available: true, reason: null });
  expect(r['hf/kling-3-std-t2v']).toBeUndefined();
  expect(Object.keys(r).every((id) => id.startsWith('google/'))).toBe(true);
  expect(musicEnginesStatus).not.toHaveBeenCalled(); // no music row asked → no breaker reads
});

test('no env brings a Higgsfield row back (STUDIO_V2, HF_ENABLED_MODELS and keys all set); the image rows follow Imagen', async () => {
  process.env.STUDIO_V2 = '1';
  process.env.HF_ENABLED_MODELS = 'hf/soul-2,hf/kling-3-std-t2v';
  process.env.HF_CREDENTIALS = `id:${SECRET}`;
  const r = await rows('image');
  expect(Object.keys(r).sort()).toEqual(['nb/auto', 'nb/pro', 'nb/v2']);
  expect(r['nb/pro']).toMatchObject({ available: true, reason: null });
  expect(Object.keys(await rows('video')).some((id) => id.startsWith('hf/'))).toBe(false);
  expect(await rows('motion')).toEqual({});
  (hasGeminiImagenProvider as jest.Mock).mockReturnValue(false);
  expect((await rows('image'))['nb/auto']).toMatchObject({ available: false, reason: 'not_configured' });
});

test('no Veo transport: the film rows stay closed even with legacy flags', async () => {
  (veoTransport as jest.Mock).mockReturnValue(null);
  expect((await rows('video'))['google/veo-3.1-lite']).toMatchObject({ available: false, reason: 'not_configured' });
  process.env.VIDEO_GOOGLE_ONLY = '0';
  expect((await rows('video'))['google/veo-3.1-lite']).toMatchObject({ available: false, reason: 'not_configured' });
});

test('music follows Lyria\'s own status: no key → not_configured, breaker open → busy; no retired engine is listed', async () => {
  let r = await rows('music');
  expect(Object.keys(r).sort()).toEqual(['music/auto', 'music/lyria']);
  expect(r['music/auto']).toMatchObject({ available: true });
  expect(r['music/lyria']).toMatchObject({ available: true });
  (musicEnginesStatus as jest.Mock).mockResolvedValueOnce(lyriaStatus({ configured: true, busy: true }));
  r = await rows('music');
  expect(r['music/lyria']).toMatchObject({ available: false, reason: 'busy' });
  expect(r['music/auto']).toMatchObject({ available: false, reason: 'busy' });
  (musicEnginesStatus as jest.Mock).mockResolvedValueOnce(lyriaStatus({ configured: false, busy: false }));
  expect((await rows('music'))['music/lyria']).toMatchObject({ available: false, reason: 'not_configured' });
});

test('⚠️ nothing but ids and reasons leaves: no env value, no endpoint, no price', async () => {
  process.env.STUDIO_V2 = '1';
  process.env.HF_CREDENTIALS = `id:${SECRET}`;
  const res = await GET(new NextRequest('https://myavatar.ge/api/studio/catalogue'));
  const text = await res.text();
  expect(text).not.toContain(SECRET);
  expect(text).not.toMatch(/kling-video\/|higgsfield-ai\/|bytedance\/|v2-2k|pro-4k|veo-3\.1-generate/);
  expect(text).not.toMatch(/price|credits|usd|gel/i);
  expect(res.headers.get('cache-control')).toBe('private, max-age=30');
});

test('an unknown ?service is ignored (every row), never an error', async () => {
  const r = await rows('voice');
  expect(Object.keys(r)).toEqual(expect.arrayContaining(['nb/auto', 'google/veo-3.1-fast', 'music/auto']));
  expect(Object.keys(r).some((id) => id.startsWith('hf/'))).toBe(false);
});
