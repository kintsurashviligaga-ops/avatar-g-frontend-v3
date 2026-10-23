/** @jest-environment node */
/**
 * GET /api/studio/catalogue — which catalogue models this deployment can run, for every picker. Pinned: ids, a boolean and a
 * reason word per row (never a key, an env value, an endpoint or a price); every Higgsfield row is google_only (a denied
 * vendor, MASTER TASK v3.1) whatever HF_ENABLED_MODELS, STUDIO_V2 or the keys say; the film rows follow the Veo transport;
 * music follows the engines' status; and the route answers with STUDIO_V2 off (the Image and Video panels exist without it).
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));
jest.mock('../../../../lib/veo/engine', () => ({ veoTransport: jest.fn(() => 'vertex') }));
jest.mock('../../../../lib/ai/musicEnginesStatus', () => ({
  musicEnginesStatus: jest.fn(async () => ({
    engines: { lyria: { configured: true, busy: false, controls: 'prompt' } },
    references: { cover: false, voice: false },
    chain: ['lyria'],
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

test.each([
  {},
  { STUDIO_V2: '1', HF_ENABLED_MODELS: 'hf/soul-2,hf/kling-3-std-t2v', HF_CREDENTIALS: `id:${SECRET}` },
  { STUDIO_V2: '1', HF_ENABLED_MODELS: 'hf/soul-2', HF_API_KEY_ID: 'id', HF_API_KEY_SECRET: SECRET, OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
])('every Higgsfield row answers google_only, and no key, flag or enabled list re-opens one (%o)', async (env) => {
  const approval = process.env.OUTSIDE_ENGINES_APPROVED;
  Object.assign(process.env, env);
  try {
    for (const service of ['image', 'video', 'motion']) {
      const r = await rows(service);
      const hf = Object.values(r).filter((row) => row.id.startsWith('hf/'));
      expect(hf.length).toBeGreaterThan(0);
      for (const row of hf) expect(row).toEqual({ id: row.id, available: false, reason: 'google_only' });
    }
    const v = await rows('video');
    expect(v['google/veo-3.1-fast']).toEqual({ id: 'google/veo-3.1-fast', available: true, reason: null });
    const image = await rows('image');
    expect(image['nb/auto']).toMatchObject({ available: true });
    expect(Object.keys(image).filter((id) => !id.startsWith('hf/'))).toEqual(['nb/auto']); // V2 / Pro retired (GG 2026-10-23)
    expect(musicEnginesStatus).not.toHaveBeenCalled(); // no music row asked → no breaker reads
  } finally {
    if (approval === undefined) delete process.env.OUTSIDE_ENGINES_APPROVED;
    else process.env.OUTSIDE_ENGINES_APPROVED = approval;
  }
});

test.each([
  {},
  { VIDEO_GOOGLE_ONLY: '0' },
  { VIDEO_GOOGLE_ONLY: 'off', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
])('no Veo transport closes the film rows, and no env value re-opens them (%o)', async (env) => {
  (veoTransport as jest.Mock).mockReturnValue(null);
  const approval = process.env.OUTSIDE_ENGINES_APPROVED;
  Object.assign(process.env, env);
  try {
    expect((await rows('video'))['google/veo-3.1-lite']).toMatchObject({ available: false, reason: 'not_configured' });
  } finally {
    if (approval === undefined) delete process.env.OUTSIDE_ENGINES_APPROVED;
    else process.env.OUTSIDE_ENGINES_APPROVED = approval;
  }
});

test('music follows Lyria\'s own status: not configured → not_configured, breaker open → busy; no retired engine row', async () => {
  const r = await rows('music');
  expect(Object.keys(r).sort()).toEqual(['music/auto', 'music/lyria']);
  expect(r['music/auto']).toMatchObject({ available: true });
  expect(r['music/lyria']).toMatchObject({ available: true });
  const status = (lyria: { configured: boolean; busy: boolean }) => ({
    engines: { lyria: { ...lyria, controls: 'prompt' } }, references: { cover: false, voice: false }, chain: [],
  });
  (musicEnginesStatus as jest.Mock).mockResolvedValueOnce(status({ configured: false, busy: false }));
  expect((await rows('music'))['music/lyria']).toMatchObject({ available: false, reason: 'not_configured' });
  (musicEnginesStatus as jest.Mock).mockResolvedValueOnce(status({ configured: true, busy: true }));
  expect((await rows('music'))['music/lyria']).toMatchObject({ available: false, reason: 'busy' });
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
