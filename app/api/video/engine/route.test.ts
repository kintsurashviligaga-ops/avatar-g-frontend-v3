/** @jest-environment node */
/**
 * GET /api/video/engine — the studio's Veo controls per tier come from the Vertex row the tier renders on, and a tier
 * whose model is refused (no verified row, a -preview id, a region the row does not list) reads as unavailable.
 */
jest.mock('server-only', () => ({}));

import { GET, type VideoEngineInfo } from './route';

const VERTEX_ENV: Record<string, string> = {
  GCP_PROJECT_ID: 'myavatar-test',
  GCP_VEO_BUCKET: 'myavatar-veo-test',
  GCP_PROJECT_NUMBER: '123456789',
  GCP_SERVICE_ACCOUNT_EMAIL: 'veo@myavatar-test.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

const realEnv = process.env;
afterEach(() => { process.env = realEnv; });

async function engine(env: Record<string, string>): Promise<VideoEngineInfo> {
  process.env = { ...env } as NodeJS.ProcessEnv;
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as VideoEngineInfo;
}

describe('GET /api/video/engine', () => {
  it('on Vertex, every tier is open with its own row: Lite takes no references, 4K only on Standard', async () => {
    const info = await engine(VERTEX_ENV);
    expect(info.transport).toBe('vertex');
    expect(info.tiers.standard).toEqual({
      available: true, referenceImages: 3, lastFrame: true, audioToggle: true, resolutions: ['720p', '1080p', '4k'], durations: [4, 6, 8], preview: false,
    });
    expect(info.tiers.fast).toMatchObject({ available: true, referenceImages: 3, resolutions: ['720p', '1080p'], preview: false });
    expect(info.tiers.lite).toMatchObject({ available: true, referenceImages: 0, resolutions: ['720p', '1080p'], preview: true });
  });

  it('without Vertex no tier is available, and nothing names a model, project or bucket', async () => {
    const info = await engine({ GEMINI_API_KEY: 'AQ.key-that-must-not-select-anything' });
    expect(info.transport).toBeNull();
    for (const tier of ['lite', 'fast', 'standard'] as const) expect(info.tiers[tier].available).toBe(false);
    const body = JSON.stringify(await engine(VERTEX_ENV));
    expect(body).not.toMatch(/veo-3|myavatar-test|myavatar-veo-test|vercel-pool/);
  });

  it('a tier whose override has no verified Vertex row, or is a -preview id, is closed; the others stay open', async () => {
    const info = await engine({ ...VERTEX_ENV, VEO_MODEL_STANDARD: 'veo-3.2-generate-001', VEO_MODEL_LITE: 'veo-3.1-lite-generate-preview' });
    expect(info.tiers.standard.available).toBe(false);
    expect(info.tiers.lite.available).toBe(false);
    expect(info.tiers.fast.available).toBe(true);
  });

  it('a GCP_VEO_LOCATION no row lists closes every tier', async () => {
    const info = await engine({ ...VERTEX_ENV, GCP_VEO_LOCATION: 'europe-west4' });
    expect(info.transport).toBe('vertex');
    for (const tier of ['lite', 'fast', 'standard'] as const) expect(info.tiers[tier].available).toBe(false);
  });
});
