/** @jest-environment node */
/**
 * GET /api/system/film-selftest (operators and the scheduled monitor) scores the film on Google's engines: Gemini and
 * Veo critical, Lyria, Cloud TTS and the GPU stitch optional. A Google-only deploy is not DEGRADED for lacking a vendor
 * key, and the self-test calls no outside vendor (the `?udio=1` credit probe is gone).
 */
jest.mock('server-only', () => ({}));

let mockOps = true;
jest.mock('../../../../lib/security/opsAccess', () => ({
  opsCallerAllowed: async () => mockOps,
  opsNotFound: () => new Response(null, { status: 404 }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const VERTEX_ENV: Record<string, string> = {
  GCP_PROJECT_ID: 'myavatar-test',
  GCP_VEO_BUCKET: 'myavatar-veo-test',
  GCP_PROJECT_NUMBER: '123456789',
  GCP_SERVICE_ACCOUNT_EMAIL: 'veo@myavatar-test.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const SUPABASE_ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-should-not-leak' };
const OLD_VENDOR_KEYS: Record<string, string> = {
  LTX_VIDEO_API_KEY: 'ltx-should-not-leak',
  UDIO_API_KEY: 'udio-should-not-leak',
  ELEVENLABS_API_KEY: 'sk-should-not-leak',
  NANOBANANA_API_KEY: 'nb-should-not-leak',
  REPLICATE_API_TOKEN: 'r8_should-not-leak',
  HEYGEN_API_KEY: 'heygen-should-not-leak',
  ANTHROPIC_API_KEY: 'sk-ant-should-not-leak',
  RUNPOD_API_TOKEN: 'runpod-should-not-leak',
};

const ORIGIN = 'https://myavatar.ge';
let fetchMock: jest.Mock;
const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;
beforeEach(() => {
  // The two contract probes hit the deploy's own routes; both answer as a healthy deploy does.
  fetchMock = jest.fn(async (url: string) => {
    if (String(url).endsWith('/api/chat/orchestrate')) return new Response(JSON.stringify({ error: 'film task not found' }), { status: 404 });
    if (String(url).endsWith('/api/video/assemble')) return new Response(JSON.stringify({ error: 'at least 2 ready segments required' }), { status: 400 });
    return new Response('{}', { status: 599 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => { process.env = ORIGINAL_ENV; global.fetch = ORIGINAL_FETCH; mockOps = true; });

async function selftest(env: Record<string, string>, query = '') {
  process.env = { ...env } as NodeJS.ProcessEnv;
  const res = await GET(new NextRequest(`${ORIGIN}/api/system/film-selftest${query}`));
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('a Google-only deploy is healthy: the map is Gemini, Veo, Lyria, Cloud TTS and the optional GPU stitch', async () => {
  const { status, body } = await selftest({ ...VERTEX_ENV, ...SUPABASE_ENV });
  expect(status).toBe(200);
  expect(body.providers.map((p: { key: string; critical: boolean; present: boolean }) => [p.key, p.critical, p.present])).toEqual([
    ['gemini', true, true],
    ['veo', true, true],
    ['lyria', false, true],
    ['cloud-tts', false, true],
    ['runpod', false, false],
  ]);
  expect(body.healthy).toBe(true);
  expect(body.verdict).toMatch(/^(OPTIMAL|HEALTHY)/);
  expect(body.recommendations).toEqual(['Provision RUNPOD — GPU stitch + 60fps interpolation (the bundled CPU FFmpeg delivers without it).']);
});

test('the old vendor keys raise nothing: without Vertex it is DEGRADED on Gemini and Veo, told the Vertex names', async () => {
  const { body } = await selftest({ ...OLD_VENDOR_KEYS, ...SUPABASE_ENV });
  expect(body.verdict).toMatch(/^DEGRADED/);
  expect(body.recommendations.filter((r: string) => r.startsWith('[CRITICAL]')).map((r: string) => r.split(' — ')[0])).toEqual([
    '[CRITICAL] Provision GEMINI',
    '[CRITICAL] Provision VEO',
  ]);
  expect(body.recommendations.find((r: string) => r.startsWith('[CONFIG]'))).toMatch(/GCP_PROJECT_ID.*never an API key/);
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/should-not-leak|LTX|Udio|ElevenLabs|NanoBanana|Nano Banana|Replicate|HeyGen|Anthropic|MusicGen|InsightFace/i);
  // A RunPod API token alone is not the GPU stitch (that needs the render webhook): the row stays off.
  expect(body.providers.find((p: { key: string }) => p.key === 'runpod').present).toBe(false);
});

test('?udio=1 calls no outside vendor: only the two contract probes reach the network, both on the deploy itself', async () => {
  const { body } = await selftest({ ...VERTEX_ENV, ...SUPABASE_ENV, UDIO_API_KEY: 'udio-should-not-leak' }, '?udio=1');
  expect(body).not.toHaveProperty('udioLive');
  expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
    `${ORIGIN}/api/chat/orchestrate`,
    `${ORIGIN}/api/video/assemble`,
  ]);
});

test('a broken contract still reads DEGRADED with the probe named', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).endsWith('/api/video/assemble')
      ? new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
      : new Response(JSON.stringify({ error: 'film task not found' }), { status: 404 }));
  const { body } = await selftest({ ...VERTEX_ENV, ...SUPABASE_ENV });
  expect(body.verdict).toMatch(/^DEGRADED/);
  expect(body.recommendations).toContain('[CONTRACT] stitch-contract: REGRESSION: assemble 401 for anonymous (final cut dead-end)');
});

test('a caller who is neither an operator nor the monitor gets a 404 and nothing is probed', async () => {
  mockOps = false;
  const { status } = await selftest({ ...VERTEX_ENV, ...SUPABASE_ENV });
  expect(status).toBe(404);
  expect(fetchMock).not.toHaveBeenCalled();
});
