/** @jest-environment node */
/**
 * GET /api/system/film-readiness (operators only) reports the film's Google legs — Gemini storyboard, Veo clips, Lyria
 * score, Cloud TTS voice — names-only, and never reads or advises an outside vendor's key.
 */
jest.mock('server-only', () => ({}));

let mockOps = true;
jest.mock('../../../../lib/security/opsAccess', () => ({
  opsCallerAllowed: async () => mockOps,
  opsNotFound: () => new Response(null, { status: 404 }),
}));

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
};

const ORIGINAL_ENV = process.env;
afterEach(() => { process.env = ORIGINAL_ENV; mockOps = true; });

async function report(env: Record<string, string>) {
  process.env = { ...env } as NodeJS.ProcessEnv;
  const res = await GET(new Request('https://myavatar.ge/api/system/film-readiness'));
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('a complete Vertex config with Storage is READY on the four Google legs', async () => {
  const { status, body } = await report({ ...VERTEX_ENV, ...SUPABASE_ENV });
  expect(status).toBe(200);
  expect(body.summary).toMatchObject({ canRenderClips: true, canScore: true, canVoice: true, canDeliverMaster: true, fullyAutonomous: true });
  expect(body.summary.verdict).toMatch(/^READY/);
  expect(body.providers.map((p: { agent: string; engine: string }) => `${p.agent}: ${p.engine}`)).toEqual([
    'storyboard: Gemini gemini-3.1-flash-image on Vertex AI',
    'director: Veo on Vertex AI',
    'score: Lyria on Vertex AI',
    'voice: Google Cloud TTS (Gemini-TTS for Georgian)',
  ]);
  // Only the optional GPU stitch is left to suggest.
  expect(body.syncInstructions.map((s: { role: string }) => s.role)).toEqual(['gpu-stitch']);
});

test('the old vendor keys serve nothing: no Vertex means BLOCKED on Veo, and the fix names Vertex variables only', async () => {
  const { body } = await report({ ...OLD_VENDOR_KEYS, ...SUPABASE_ENV });
  expect(body.summary.canRenderClips).toBe(false);
  expect(body.summary.verdict).toBe('BLOCKED — Veo on Vertex AI is not configured; no clips can render');
  const director = body.syncInstructions.find((s: { provider: string }) => s.provider === 'director');
  expect(director.action).toMatch(/GCP_PROJECT_ID/);
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/should-not-leak|LTX|Udio|ElevenLabs|NanoBanana|Nano Banana|Replicate|MusicGen/i);
  // The editor leg offers no failover either (PR 24): its only mention is that there is none.
  expect(body.editor.checkedEnv).toEqual({ gpu: expect.any(Array), masterHosting: expect.any(Array) });
  expect(body.syncInstructions.map((s: { role: string }) => s.role)).not.toContain('failover-and-score');
});

test('Lyria switched off is the score leg alone: clips, voice and delivery stay ready, and the fix names the flag', async () => {
  const { body } = await report({ ...VERTEX_ENV, LYRIA_ENABLED: '0', ...SUPABASE_ENV });
  expect(body.summary).toMatchObject({ canRenderClips: true, canScore: false, canVoice: true, canDeliverMaster: true });
  const score = body.syncInstructions.find((s: { provider: string }) => s.provider === 'score');
  expect(score.action).toMatch(/^Lyria on Vertex AI cannot serve: set or fix LYRIA_ENABLED \(off\)/);
});

test('a caller who is not an operator gets a 404', async () => {
  mockOps = false;
  const { status } = await report({ ...VERTEX_ENV, ...SUPABASE_ENV });
  expect(status).toBe(404);
});
