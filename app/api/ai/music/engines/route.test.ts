/** @jest-environment node */
/**
 * GET /api/ai/music/engines — the picker's source of truth. Lyria is the only engine reported (MASTER TASK v3.1): its
 * `configured` follows the SAME gate the music route runs on (LYRIA_ENABLED off drops it), `busy` is its circuit breaker,
 * `chain` is what Auto would try — Lyria ALONE, the route no longer fails over (R7) — and nothing secret is ever in the
 * body. Udio, ElevenLabs Music and MusicGen used to be listed as rows that were always off; they are not listed at all.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn() }));
jest.mock('../../../../../lib/orchestrator/idempotency', () => ({ isProviderTripped: jest.fn(async () => false) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000, keyPrefix: 'rl:read' } },
  checkRateLimit: jest.fn(async () => null),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { musicEnginesStatus } from '../../../../../lib/ai/musicEnginesStatus';
import { hasLyriaProvider } from '../../../../../lib/ai/lyriaMusic';
import { isProviderTripped } from '../../../../../lib/orchestrator/idempotency';
import { checkRateLimit } from '../../../../../lib/api/rate-limit';
import { parseMusicEnginesStatus } from '../../../../../lib/studio/musicEngines';

const req = () => new NextRequest('https://myavatar.ge/api/ai/music/engines');
const ENV: NodeJS.ProcessEnv = { MEDIA_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-test-approval' }; // explicit opt-out: an empty env is fail-closed ON
const KEYS = { MEDIA_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-test-approval', UDIO_API_KEY: 'udio-secret-key', ELEVENLABS_API_KEY: 'el-secret-key', REPLICATE_API_TOKEN: 'r8-secret-token' };

beforeEach(() => {
  jest.clearAllMocks();
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (isProviderTripped as jest.Mock).mockResolvedValue(false);
  (checkRateLimit as jest.Mock).mockResolvedValue(null);
  for (const k of Object.keys(process.env)) if (/^(UDIO|ELEVEN|REPLICATE|MUSIC_)/.test(k)) delete process.env[k];
});

test('no keys at all: Lyria (Vertex is its gate) is the only engine, and no reference path is open', async () => {
  const s = await musicEnginesStatus(ENV);
  expect(Object.keys(s.engines)).toEqual(['lyria']);
  expect(s.engines.lyria.configured).toBe(true);
  expect(s.references).toEqual({ cover: false, voice: false });
  expect(s.chain).toEqual(['lyria']);
});

test('every outside key present: still ONLY Lyria is listed — Udio, ElevenLabs Music and MusicGen are not even rows', async () => {
  for (const env of [{ ...KEYS }, { ...KEYS, MUSIC_PROVIDER: 'elevenlabs' }, { ...KEYS, MUSIC_SUNO_PARAMS: '1' }]) {
    const s = await musicEnginesStatus(env);
    expect(Object.keys(s.engines)).toEqual(['lyria']);
    expect(s.engines.lyria).toMatchObject({ configured: true, busy: false });
    expect(s.chain).toEqual(['lyria']);
    expect(s.references).toEqual({ cover: false, voice: false });
    expect(JSON.stringify(s)).not.toMatch(/udio|elevenlabs|musicgen|replicate/i);
  }
});

test('Lyria switched off (no key / LYRIA_ENABLED=0): Auto has NOTHING to run — the others are not promoted into it', async () => {
  (hasLyriaProvider as jest.Mock).mockReturnValue(false);
  const s = await musicEnginesStatus({ ...KEYS });
  expect(s.engines.lyria.configured).toBe(false);
  expect(Object.keys(s.engines)).toEqual(['lyria']); // nothing else is promoted into the list
  expect(s.chain).toEqual([]);
});

test('an engine whose breaker is open is busy — present, but not pickable; Lyria busy leaves Auto empty, not rerouted', async () => {
  (isProviderTripped as jest.Mock).mockImplementation(async (p: string) => p === 'udio');
  const s = await musicEnginesStatus({ ...KEYS });
  expect(isProviderTripped).not.toHaveBeenCalledWith('udio'); // a retired engine's breaker is not even read
  expect(s.chain).toEqual(['lyria']);
  (isProviderTripped as jest.Mock).mockImplementation(async (p: string) => p === 'lyria');
  const t = await musicEnginesStatus({ ...KEYS });
  expect(t.engines.lyria).toMatchObject({ configured: true, busy: true });
  expect(t.chain).toEqual([]);
});

test('the breaker is never read for an engine that is not configured, and a failing read counts as not busy', async () => {
  (isProviderTripped as jest.Mock).mockRejectedValue(new Error('redis down'));
  const s = await musicEnginesStatus({ ...KEYS });
  expect(s.engines.lyria.busy).toBe(false);
  (isProviderTripped as jest.Mock).mockClear();
  await musicEnginesStatus(ENV);
  expect(isProviderTripped).toHaveBeenCalledTimes(1); // only Lyria is configured with an empty env
  expect(isProviderTripped).toHaveBeenCalledWith('lyria');
});

test('vocals: a sung song is offered only once MUSIC_LYRIA_VOCALS_VERIFIED is set — the gate the route refuses by', async () => {
  expect((await musicEnginesStatus(ENV)).vocals).toBe(false);
  expect((await musicEnginesStatus({ ...ENV, MUSIC_LYRIA_VOCALS_VERIFIED: '0' })).vocals).toBe(false);
  expect((await musicEnginesStatus({ ...ENV, MUSIC_LYRIA_VOCALS_VERIFIED: '1' })).vocals).toBe(true);
});

test('controls: Lyria takes one text brief, so the sliders only approximate — whatever MUSIC_SUNO_PARAMS says', async () => {
  expect((await musicEnginesStatus({ ...KEYS })).engines.lyria.controls).toBe('prompt');
  expect((await musicEnginesStatus({ ...KEYS, MUSIC_SUNO_PARAMS: '1' })).engines.lyria.controls).toBe('prompt');
});

test('the route answers 200 with a body the client parser accepts — and no key, token or secret in it', async () => {
  Object.assign(process.env, KEYS);
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toMatch(/private/);
  const text = await res.text();
  // (A one-character flag value such as '0' is no secret, and appears in the `lengths` list.)
  for (const secret of Object.values(KEYS).filter((v) => v.length > 3)) expect(text).not.toContain(secret);
  const parsed = parseMusicEnginesStatus(JSON.parse(text));
  expect(parsed?.chain).toEqual(['lyria']);
});

test('a rate-limited caller gets the limiter\'s answer and the breakers are not read', async () => {
  (checkRateLimit as jest.Mock).mockResolvedValue(new Response('slow down', { status: 429 }));
  const res = await GET(req());
  expect(res.status).toBe(429);
  expect(isProviderTripped).not.toHaveBeenCalled();
});
