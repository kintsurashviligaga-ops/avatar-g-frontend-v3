/** @jest-environment node */
/**
 * The owner's one paid Veo test: Vertex only (never the Gemini key), exactly one submit, the cheapest clip, and a poll
 * that only accepts this project's Vertex operations. No network: the engine and the Vertex config are mocked.
 */
jest.mock('server-only', () => ({}));

const mockCreate = jest.fn();
const mockPoll = jest.fn();
const mockDeliver = jest.fn();
const mockTransport = jest.fn();
jest.mock('./engine', () => {
  const actual = jest.requireActual('./engine');
  return {
    ...actual,
    createVeoClip: (i: unknown) => mockCreate(i),
    pollVeoClip: (op: string) => mockPoll(op),
    deliverableUrl: (v: unknown, ttl?: number) => mockDeliver(v, ttl),
    veoTransport: () => mockTransport(),
  };
});
const mockVertexConfig = jest.fn();
jest.mock('./vertexAuth', () => {
  const actual = jest.requireActual('./vertexAuth');
  return { ...actual, vertexConfig: () => mockVertexConfig() };
});

import { pollVeoSmoke, submitVeoSmoke, veoSmokeQuote, veoSmokeReady } from './smoke';

const OP = 'projects/gen-lang-client-0671348730/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/1234567890';
const config = {
  projectId: 'gen-lang-client-0671348730',
  location: 'us-central1',
  bucket: 'gs://myavatar-veo-outputs',
  auth: { mode: 'wif', projectNumber: '467145118875', serviceAccountEmail: 'sa@p.iam.gserviceaccount.com', poolId: 'vercel', providerId: 'vercel-oidc' },
};
const ENV = process.env;

beforeEach(() => {
  process.env = { ...ENV, VEO_TRANSPORT: 'vertex' };
  delete process.env.VEO_MODEL_FAST;
  mockCreate.mockReset();
  mockPoll.mockReset();
  mockDeliver.mockReset();
  mockTransport.mockReset().mockReturnValue('vertex');
  mockVertexConfig.mockReset().mockReturnValue(config);
});
afterAll(() => {
  process.env = ENV;
});

describe('veoSmokeQuote', () => {
  it('is Veo 3.1 Fast on Vertex, 4 s at 720p with audio: $0.40', () => {
    expect(veoSmokeQuote()).toEqual({ model: 'veo-3.1-fast-generate-001', durationSec: 4, resolution: '720p', audio: true, estimateUsd: 0.4 });
  });
});

describe('submitVeoSmoke', () => {
  it('refuses without VEO_TRANSPORT=vertex, even when auto mode would pick Vertex', async () => {
    delete process.env.VEO_TRANSPORT;
    expect(veoSmokeReady()).toBe(false);
    expect(await submitVeoSmoke()).toEqual({ ok: false, error: 'vertex_not_pinned' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses when the pinned Vertex chain is not ready', async () => {
    mockTransport.mockReturnValue(null);
    expect(await submitVeoSmoke()).toEqual({ ok: false, error: 'vertex_not_pinned' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('submits exactly one 4 s Fast clip with audio and returns the operation', async () => {
    mockCreate.mockResolvedValue({
      outcome: { ok: true, operation: { transport: 'vertex', name: OP, model: 'veo-3.1-fast-generate-001' } },
      model: 'veo-3.1-fast-generate-001',
      transport: 'vertex',
    });
    const r = await submitVeoSmoke();
    expect(r).toMatchObject({ ok: true, operation: OP, model: 'veo-3.1-fast-generate-001', durationSec: 4, estimateUsd: 0.4 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const input = mockCreate.mock.calls[0][0];
    expect(input.tier).toBe('fast');
    expect(input.request).toMatchObject({ aspect: '16:9', durationSec: 4, generateAudio: true });
  });

  it('reports a failed submit with redacted detail and does not retry', async () => {
    mockCreate.mockResolvedValue({
      outcome: { ok: false, reason: 'quota', retryable: true, detail: 'HTTP 429 token ya29.a0-secret-value exhausted' },
      model: 'veo-3.1-fast-generate-001',
      transport: 'vertex',
    });
    const r = await submitVeoSmoke();
    expect(r).toMatchObject({ ok: false, error: 'submit_failed', reason: 'quota', retryable: true });
    expect(JSON.stringify(r)).not.toContain('secret-value');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('pollVeoSmoke', () => {
  it('rejects a Gemini API operation and another project’s operation without polling', async () => {
    expect(await pollVeoSmoke('models/veo-3.1-fast-generate-preview/operations/abc')).toEqual({ state: 'invalid' });
    expect(await pollVeoSmoke(OP.replace('gen-lang-client-0671348730', 'someone-else'))).toEqual({ state: 'invalid' });
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it('accepts the project number form of the operation name', async () => {
    mockPoll.mockResolvedValue({ state: 'processing' });
    expect(await pollVeoSmoke(OP.replace('gen-lang-client-0671348730', '467145118875'))).toEqual({ state: 'processing' });
  });

  it('returns a 15-minute signed URL for a finished clip', async () => {
    const video = { kind: 'gcs', gcsUri: 'gs://myavatar-veo-outputs/veo/x/sample_0.mp4', mimeType: 'video/mp4' };
    mockPoll.mockResolvedValue({ state: 'succeeded', videos: [video] });
    mockDeliver.mockResolvedValue('https://storage.googleapis.com/signed');
    expect(await pollVeoSmoke(OP)).toEqual({ state: 'succeeded', gcsUri: video.gcsUri, url: 'https://storage.googleapis.com/signed' });
    expect(mockDeliver).toHaveBeenCalledWith(video, 900);
  });

  it('passes a safety refusal through', async () => {
    mockPoll.mockResolvedValue({ state: 'filtered', reason: 'Responsible AI', supportCodes: ['29310472'] });
    expect(await pollVeoSmoke(OP)).toEqual({ state: 'filtered', reason: 'Responsible AI' });
  });
});
