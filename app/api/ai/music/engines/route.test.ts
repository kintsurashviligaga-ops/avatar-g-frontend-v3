/** @jest-environment node */
/**
 * GET /api/ai/music/engines — the picker's source of truth. Each engine's `configured` follows the SAME gate the music
 * route builds its chain with (a key; MUSIC_PROVIDER=elevenlabs drops Udio; LYRIA_ENABLED off drops Lyria), `busy` is
 * its circuit breaker, `chain` is what Auto would try, and nothing secret is ever in the body.
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
const ENV: NodeJS.ProcessEnv = {};
const KEYS = { UDIO_API_KEY: 'udio-secret-key', ELEVENLABS_API_KEY: 'el-secret-key', REPLICATE_API_TOKEN: 'r8-secret-token' };

beforeEach(() => {
  jest.clearAllMocks();
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (isProviderTripped as jest.Mock).mockResolvedValue(false);
  (checkRateLimit as jest.Mock).mockResolvedValue(null);
  for (const k of Object.keys(process.env)) if (/^(UDIO|ELEVEN|REPLICATE|MUSIC_)/.test(k)) delete process.env[k];
});

test('no keys at all: Lyria (a Gemini key is its gate) is the only engine, and no reference path is open', async () => {
  const s = await musicEnginesStatus(ENV);
  expect(s.engines.lyria.configured).toBe(true);
  expect(s.engines.udio.configured).toBe(false);
  expect(s.engines['elevenlabs-music'].configured).toBe(false);
  expect(s.engines.musicgen.configured).toBe(false);
  expect(s.references).toEqual({ cover: false, voice: false });
  expect(s.chain).toEqual(['lyria']);
});

test('every key present: the whole chain in the route\'s order, and the reference paths (Replicate) are open', async () => {
  const s = await musicEnginesStatus({ ...KEYS });
  expect(s.chain).toEqual(['lyria', 'udio', 'elevenlabs-music', 'musicgen']);
  expect(s.references).toEqual({ cover: true, voice: true });
});

test('MUSIC_PROVIDER=elevenlabs drops Udio from the chain, exactly as the route does', async () => {
  const s = await musicEnginesStatus({ ...KEYS, MUSIC_PROVIDER: 'elevenlabs' });
  expect(s.engines.udio.configured).toBe(false);
  expect(s.chain).not.toContain('udio');
});

test('Lyria switched off (no key / LYRIA_ENABLED=0) leaves it out of the chain', async () => {
  (hasLyriaProvider as jest.Mock).mockReturnValue(false);
  const s = await musicEnginesStatus({ ...KEYS });
  expect(s.engines.lyria.configured).toBe(false);
  expect(s.chain).toEqual(['udio', 'elevenlabs-music', 'musicgen']);
});

test('an engine whose breaker is open is busy — present, but not in Auto\'s chain', async () => {
  (isProviderTripped as jest.Mock).mockImplementation(async (p: string) => p === 'udio');
  const s = await musicEnginesStatus({ ...KEYS });
  expect(s.engines.udio).toMatchObject({ configured: true, busy: true });
  expect(s.chain).toEqual(['lyria', 'elevenlabs-music', 'musicgen']);
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

test('controls: MusicGen takes the sliders natively; the text-brief engines only approximate', async () => {
  const s = await musicEnginesStatus({ ...KEYS });
  expect(s.engines.musicgen.controls).toBe('native');
  expect(s.engines.lyria.controls).toBe('prompt');
  expect(s.engines['elevenlabs-music'].controls).toBe('prompt');
  expect(s.engines.udio.controls).toBe('prompt'); // native only behind MUSIC_SUNO_PARAMS
  expect((await musicEnginesStatus({ ...KEYS, MUSIC_SUNO_PARAMS: '1' })).engines.udio.controls).toBe('native');
});

test('the route answers 200 with a body the client parser accepts — and no key, token or secret in it', async () => {
  Object.assign(process.env, KEYS);
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toMatch(/private/);
  const text = await res.text();
  for (const secret of Object.values(KEYS)) expect(text).not.toContain(secret);
  const parsed = parseMusicEnginesStatus(JSON.parse(text));
  expect(parsed?.chain).toEqual(['lyria', 'udio', 'elevenlabs-music', 'musicgen']);
});

test('a rate-limited caller gets the limiter\'s answer and the breakers are not read', async () => {
  (checkRateLimit as jest.Mock).mockResolvedValue(new Response('slow down', { status: 429 }));
  const res = await GET(req());
  expect(res.status).toBe(429);
  expect(isProviderTripped).not.toHaveBeenCalled();
});
