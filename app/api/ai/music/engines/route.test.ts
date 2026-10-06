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

test('legacy keys cannot add music engines or enable reference paths', async () => {
  const s = await musicEnginesStatus(KEYS);
  expect(s.chain).toEqual(['lyria']);
  expect(s.references).toEqual({ cover: false, voice: false });
  for (const id of ['udio', 'elevenlabs-music', 'musicgen'] as const) expect(s.engines[id].configured).toBe(false);
  expect(isProviderTripped).toHaveBeenCalledTimes(1);
  expect(isProviderTripped).toHaveBeenCalledWith('lyria');
});
test('unconfigured or busy Lyria leaves no active engine', async () => {
  (hasLyriaProvider as jest.Mock).mockReturnValue(false);
  expect((await musicEnginesStatus(KEYS)).chain).toEqual([]);
  expect(isProviderTripped).not.toHaveBeenCalled();
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (isProviderTripped as jest.Mock).mockResolvedValue(true);
  expect((await musicEnginesStatus(KEYS)).chain).toEqual([]);
});
test('breaker lookup failure does not invent additional engines', async () => {
  (isProviderTripped as jest.Mock).mockRejectedValue(new Error('redis down'));
  expect((await musicEnginesStatus(ENV)).chain).toEqual(['lyria']);
});
test('public status is parseable and contains no credentials', async () => {
  Object.assign(process.env, KEYS);
  const res = await GET(req());
  expect(res.status).toBe(200);
  const text = await res.text();
  for (const secret of Object.values(KEYS)) expect(text).not.toContain(secret);
  expect(parseMusicEnginesStatus(JSON.parse(text))?.chain).toEqual(['lyria']);
});
test('rate limited callers cause no breaker reads', async () => {
  (checkRateLimit as jest.Mock).mockResolvedValue(new Response('slow down', { status: 429 }));
  expect((await GET(req())).status).toBe(429);
  expect(isProviderTripped).not.toHaveBeenCalled();
});
