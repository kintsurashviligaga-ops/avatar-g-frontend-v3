/** @jest-environment node */
/**
 * GET /api/studio/catalogue — which catalogue models this deployment can run, for every picker. Pinned: ids, a boolean and a
 * reason word per row (never a key, an env value, an endpoint or a price); the Higgsfield gate is the registry's own
 * (HF_ENABLED_MODELS → STUDIO_V2 → keys); the film rows follow the Veo transport; music follows the engines' status; and the
 * route answers with STUDIO_V2 off (the Image and Video panels exist without it).
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));
jest.mock('../../../../lib/veo/engine', () => ({ veoTransport: jest.fn(() => 'vertex') }));
jest.mock('../../../../lib/ai/musicEnginesStatus', () => ({
  musicEnginesStatus: jest.fn(async () => ({
    engines: {
      lyria: { configured: true, busy: false, controls: 'prompt' },
      udio: { configured: false, busy: false, controls: 'prompt' },
      'elevenlabs-music': { configured: true, busy: true, controls: 'prompt' },
      musicgen: { configured: true, busy: false, controls: 'native' },
    },
    references: { cover: true, voice: true },
    chain: ['lyria', 'musicgen'],
  })),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { veoTransport } from '../../../../lib/veo/engine';
import { musicEnginesStatus } from '../../../../lib/ai/musicEnginesStatus';

const SECRET = 'sk-test-secret-value-1234567890';
const ENV_KEYS = ['STUDIO_V2', 'HF_ENABLED_MODELS', 'HF_API_KEY_ID', 'HF_API_KEY_SECRET', 'HF_CREDENTIALS', 'VIDEO_GOOGLE_ONLY'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  jest.clearAllMocks();
  (veoTransport as jest.Mock).mockReturnValue('vertex');
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

test('STUDIO_V2 off: the route still answers; the Higgsfield rows say studio_off, the panel\'s own rows are open', async () => {
  process.env.HF_API_KEY_ID = 'id';
  process.env.HF_API_KEY_SECRET = SECRET;
  const r = await rows('video');
  expect(r['google/veo-3.1-fast']).toEqual({ id: 'google/veo-3.1-fast', available: true, reason: null });
  expect(r['hf/kling-3-std-t2v']).toMatchObject({ available: false, reason: 'studio_off' });
  expect(Object.keys(r).every((id) => id.startsWith('google/') || id.startsWith('hf/'))).toBe(true);
  expect(musicEnginesStatus).not.toHaveBeenCalled(); // no music row asked → no breaker reads
});

test('HF_ENABLED_MODELS decides first; then the keys', async () => {
  process.env.STUDIO_V2 = '1';
  process.env.HF_ENABLED_MODELS = 'hf/soul-2';
  let r = await rows('image');
  expect(r['hf/soul-2']).toMatchObject({ available: false, reason: 'not_configured' }); // enabled, but no keys
  process.env.HF_CREDENTIALS = `id:${SECRET}`;
  r = await rows('image');
  expect(r['hf/soul-2']).toMatchObject({ available: true, reason: null });
  const v = await rows('video');
  expect(v['hf/kling-3-std-t2v']).toMatchObject({ available: false, reason: 'not_enabled' });
  expect(r['nb/pro']).toMatchObject({ available: true });
});

test('no Veo transport under VIDEO_GOOGLE_ONLY: the film rows close; with the fallbacks allowed they stay open', async () => {
  (veoTransport as jest.Mock).mockReturnValue(null);
  expect((await rows('video'))['google/veo-3.1-lite']).toMatchObject({ available: false, reason: 'not_configured' });
  process.env.VIDEO_GOOGLE_ONLY = '0';
  expect((await rows('video'))['google/veo-3.1-lite']).toMatchObject({ available: true });
});

test('music follows the engines\' own status: no key → not_configured, breaker open → busy', async () => {
  const r = await rows('music');
  expect(r['music/auto']).toMatchObject({ available: true });
  expect(r['music/lyria']).toMatchObject({ available: true });
  expect(r['music/udio']).toMatchObject({ available: false, reason: 'not_configured' });
  expect(r['music/elevenlabs-music']).toMatchObject({ available: false, reason: 'busy' });
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
  expect(Object.keys(r)).toEqual(expect.arrayContaining(['nb/auto', 'google/veo-3.1-fast', 'hf/genjutsu-motion', 'music/auto']));
});
