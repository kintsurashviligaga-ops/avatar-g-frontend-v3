/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'), getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));
jest.mock('../services/billing/BillingGuard', () => ({ canProceed: jest.fn(async () => ({ allowed: true })), recordUsage: jest.fn(async () => undefined) }));
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));
import { generateLyriaTrack, hasLyriaProvider } from './lyriaMusic';
import { getVertexAccessToken } from '../veo/vertexAuth';
const env = { ...process.env };
const fetchOriginal = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  process.env = { ...env, GEMINI_TRANSPORT: 'vertex', GEMINI_API_KEY: 'never-on-vertex', GCP_PROJECT_ID: 'test-project', GCP_PROJECT_NUMBER: '123', GCP_SERVICE_ACCOUNT_EMAIL: 'runner@test-project.iam.gserviceaccount.com', GCP_WORKLOAD_IDENTITY_POOL_ID: 'pool', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'provider' };
  delete process.env.LYRIA_ENABLED; delete process.env.LYRIA_MODEL; delete process.env.GCP_SERVICE_ACCOUNT_KEY;
  global.fetch = fetchMock; fetchMock.mockReset();
  (getVertexAccessToken as jest.Mock).mockReset().mockResolvedValue('vertex-token');
});
afterEach(() => { process.env = { ...env }; global.fetch = fetchOriginal; });
test('Vertex Lyria sends project OAuth and the documented interactions payload', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'completed', outputs: [{ type: 'audio', mime_type: 'audio/mpeg', data: 'YXVkaW8=' }] })));
  expect(hasLyriaProvider()).toBe(true);
  expect(await generateLyriaTrack({ prompt: 'Jazz', lyrics: 'A song' })).toEqual({ base64: 'YXVkaW8=', mime: 'audio/mpeg' });
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/interactions');
  expect(request.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer vertex-token' });
  expect(JSON.parse(request.body)).toEqual({ model: 'lyria-3-clip-preview', input: [{ type: 'text', text: 'Jazz\n\nLyrics:\nA song' }] });
  expect(request.redirect).toBe('manual');
});
test('failed OAuth never falls through to an API-key transport', async () => {
  (getVertexAccessToken as jest.Mock).mockRejectedValueOnce(new Error('auth failed'));
  expect(await generateLyriaTrack({ prompt: 'Jazz' })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
test('non-audio payloads and incomplete interactions are never returned as tracks', async () => {
  for (const body of [{ status: 'completed', outputs: [{ mime_type: 'image/png', data: 'a'.repeat(4000) }] }, { status: 'in_progress', outputs: [{ mime_type: 'audio/mpeg', data: 'YXVkaW8=' }] }]) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    expect(await generateLyriaTrack({ prompt: 'Jazz' })).toBeNull();
  }
});
test('explicit Developer transport uses only its own canonical key', async () => {
  process.env.GEMINI_TRANSPORT = 'gemini';
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'completed', steps: [{ content: [{ type: 'audio', mime_type: 'audio/mpeg', data: 'YXVkaW8=' }] }] })));
  await generateLyriaTrack({ prompt: 'Jazz', instrumental: true });
  expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
  expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'never-on-vertex' });
  expect(getVertexAccessToken).not.toHaveBeenCalled();
});
