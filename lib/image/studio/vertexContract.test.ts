/** @jest-environment node */
/**
 * Image Studio's lifecycle on Vertex AI against a synthetic fixture (MASTER TASK v3.1, Phase 1 PR 8): quote → confirm →
 * worker → the one `:generateContent` POST → QC → saved, through the deployment's own provider call
 * (liveImageDeps().generate → invokeGoogleImage → lib/ai/google/transport). Only the Workload Identity token mint and
 * the network are faked; the response is __fixtures__/vertex-generateContent-image.json, written from the Vertex
 * reference, never recorded (no billed probe).
 */
jest.mock('server-only', () => ({}));
jest.mock('../../veo/vertexAuth', () => ({
  ...jest.requireActual('../../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('../../orchestrator/ledger', () => ({ deductCreditsOnce: jest.fn(), netDebitedForRef: jest.fn(), refundCredits: jest.fn() }));
jest.mock('../../observability/report-error', () => ({ reportError: jest.fn() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { getVertexAccessToken } from '../../veo/vertexAuth';
import { imageStatus, quoteImage, startImage, workImage } from './engine';
import { liveImageDeps } from './live';
import { fakeImage, imageRequest } from './testing';

const USER = 'user-a';
const WIF = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = ['GEMINI_TRANSPORT', 'GEMINI_IMAGE_TRANSPORT', 'GCP_GEMINI_LOCATION', 'GEMINI_API_KEY', ...Object.keys(WIF)];
const KEY = 'AQ.test-image-key-0123456789abcdef';
const URL = 'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent';

const png = (size: number, background: string) =>
  sharp({ create: { width: size, height: size, channels: 3, background } }).png().toBuffer();

async function fixtureResponse(): Promise<string> {
  const final = await png(1024, '#1f3a8a');
  const thought = await png(64, '#ff0000');
  return readFileSync(join(__dirname, '__fixtures__', 'vertex-generateContent-image.json'), 'utf8')
    .replace('__THOUGHT_PNG__', thought.toString('base64'))
    .replace('__FINAL_PNG__', final.toString('base64'));
}

const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, WIF);
  process.env.GEMINI_API_KEY = KEY; // present, and never used
  fetchMock.mockReset();
  (getVertexAccessToken as jest.Mock).mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

/** The fake deps (memory store, ledger, storage), with the deployment's own provider call. */
async function onVertex() {
  const f = await fakeImage();
  const live = liveImageDeps();
  expect(live.transport).toBe('vertex');
  f.deps.generate = jest.fn(live.generate);
  return f;
}

test('gemini-3.1-flash-image: one Vertex POST with the approved payload, a bearer token and no key; the final image is saved', async () => {
  const body = await fixtureResponse();
  fetchMock.mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const f = await onVertex();

  const q = await quoteImage(f.deps, USER, imageRequest());
  expect(q.plan.transport).toBe('vertex');
  expect(fetchMock).not.toHaveBeenCalled(); // a quote calls nothing
  await startImage(f.deps, USER, q.plan, q.token, true);
  const r = await workImage(f.deps, q.jobId, 'w');
  expect(r).toEqual({ ran: true, outcome: 'completed' });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
  expect(url).toBe(URL);
  expect(init.method).toBe('POST');
  expect(init.redirect).toBe('manual');
  expect(init.headers.Authorization).toBe('Bearer vertex-token');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.headers['x-goog-api-key']).toBeUndefined();
  expect(JSON.stringify([url, init.headers, init.body])).not.toContain(KEY);
  // Exactly the payload the worker stored before dispatch, with the prompt unchanged as its first part.
  const sent = JSON.parse(String(init.body));
  const stored = (f.deps.persistPayload as jest.Mock).mock.calls[0]![2];
  expect(sent).toEqual(JSON.parse(JSON.stringify(stored)));
  expect(sent).toEqual({
    contents: [{ role: 'user', parts: [{ text: imageRequest().originalPrompt }, { text: 'Requested image operation: generate.' }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '1K' } },
  });

  // The final image, not the thought image; the response id and the numeric usage are kept.
  const savedImage = (f.deps.save as jest.Mock).mock.calls[0]![2] as { width: number; height: number; data: Buffer };
  expect(savedImage).toMatchObject({ width: 1024, height: 1024 });
  const pixel = await sharp(savedImage.data).extract({ left: 512, top: 512, width: 1, height: 1 }).raw().toBuffer();
  expect([...pixel]).toEqual([0x1f, 0x3a, 0x8a]); // the final image's colour, not the red thought image
  const s = await imageStatus(f.deps, USER, q.jobId);
  expect(s.view).toMatchObject({ status: 'completed', result: {
    modelId: 'gemini-3.1-flash-image', transport: 'vertex', providerRequestId: 'synthetic-vertex-response-0001',
    usage: { promptTokenCount: 14, candidatesTokenCount: 1290, thoughtsTokenCount: 96, totalTokenCount: 1400 },
  } });
  expect(f.net()).toBe(q.credits); // charged once
});

test.each([
  [429, 'provider_rate_limit'],
  [404, 'not_configured'],
  [500, 'provider_failed'],
])('a Vertex %s is one POST, the job fails as %s and is refunded', async (status, code) => {
  fetchMock.mockResolvedValueOnce(new Response('{"error":{}}', { status }));
  const f = await onVertex();
  const q = await quoteImage(f.deps, USER, imageRequest());
  await startImage(f.deps, USER, q.plan, q.token, true);
  expect(await workImage(f.deps, q.jobId, 'w')).toMatchObject({ outcome: 'failed', error: code });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(f.deps.save).not.toHaveBeenCalled();
  expect(f.net()).toBe(0);
});

test('Imagen 3 never reaches Vertex: lifecycle_blocked at the quote, no token, no POST', async () => {
  const f = await onVertex();
  await expect(quoteImage(f.deps, USER, { ...imageRequest(), modelId: 'imagen-3.0-generate-002' }))
    .rejects.toMatchObject({ code: 'lifecycle_blocked', status: 410 });
  expect(getVertexAccessToken).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(f.deps.reserve).not.toHaveBeenCalled();
});
