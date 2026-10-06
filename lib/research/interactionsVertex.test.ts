/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => {
  const actual = jest.requireActual('../veo/vertexAuth');
  return { ...actual, getVertexAccessToken: jest.fn() };
});

import { getVertexAccessToken } from '../veo/vertexAuth';
import { createInteractionsClient, parseInteractionReference, INTERACTIONS_BASE } from './interactionsClient';
import { getResearchCapabilities, resetResearchSchemaProbe } from './capabilities';

const ENV = { ...process.env };
const TOKEN = 'vertex-test-oauth-token';
const ID = 'v1_background_research_123';
const REF = `research:v1:vertex:test-project:global:${ID}`;
const BASE = 'https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/interactions';
const request = { agent: 'deep-research-preview-04-2026', input: 'Research solar energy' };
const tokenMock = jest.mocked(getVertexAccessToken);
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GEMINI_TRANSPORT = 'vertex';
  process.env.GEMINI_API_KEY = 'developer-test-key';
  process.env.GCP_PROJECT_ID = 'test-project';
  process.env.GCP_GEMINI_LOCATION = 'us-central1'; // Research is always global.
  for (const key of ['GCP_PROJECT_NUMBER', 'GCP_SERVICE_ACCOUNT_EMAIL', 'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID']) delete process.env[key];
  process.env.GCP_SERVICE_ACCOUNT_KEY = JSON.stringify({ type: 'service_account', client_email: 'test@test-project.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----' });
  tokenMock.mockResolvedValue(TOKEN);
  fetchMock = jest.fn(async () => Response.json({ id: ID, status: 'in_progress' }));
  resetResearchSchemaProbe();
});
afterEach(() => { process.env = { ...ENV }; });

const client = () => createInteractionsClient({ fetch: fetchMock as typeof fetch });

test('Vertex starts once using the documented global contract and stores its transport/project in the private reference', async () => {
  expect(await client().start(request)).toEqual({ ok: true, id: REF });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(tokenMock).toHaveBeenCalledWith(false);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(BASE);
  expect(init.redirect).toBe('manual');
  expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` });
  expect(JSON.parse(init.body)).toEqual({
    ...request, background: true, stream: false, store: true,
    agent_config: { type: 'deep-research', thinking_summaries: 'auto' },
    tools: [{ type: 'google_search' }, { type: 'url_context' }],
  });
  expect(JSON.stringify([url, init.body])).not.toContain(TOKEN);
  expect(JSON.stringify(init)).not.toContain('developer-test-key');
});

test('persisted Vertex jobs keep OAuth/project/global for poll and cancel after the deployment switches to Developer API', async () => {
  const started = await client().start(request);
  if (!started.ok) throw new Error('start failed');
  process.env.GEMINI_TRANSPORT = 'gemini';
  fetchMock.mockClear();
  expect((await client().poll(started.id)).ok).toBe(true);
  expect((await client().cancel(started.id)).ok).toBe(true);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BASE}/${ID}`, `${BASE}/${ID}/cancel`]);
  for (const [, init] of fetchMock.mock.calls) {
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers['x-goog-api-key']).toBeUndefined();
    expect(init.redirect).toBe('manual');
  }
});

test.each([ID, `research:v1:gemini:${ID}`])('legacy and explicit Developer references never switch to Vertex: %s', async (ref) => {
  expect((await client().poll(ref)).ok).toBe(true);
  expect((await client().cancel(ref)).ok).toBe(true);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${INTERACTIONS_BASE}/${ID}`, `${INTERACTIONS_BASE}/${ID}/cancel`]);
  expect(tokenMock).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls[0]![1].headers).toEqual({ 'x-goog-api-key': 'developer-test-key' });
});

test('a different configured project cannot poll/cancel an existing Vertex job', async () => {
  process.env.GCP_PROJECT_ID = 'other-project';
  expect(await client().poll(REF)).toMatchObject({ ok: false, kind: 'auth' });
  expect(await client().cancel(REF)).toMatchObject({ ok: false, kind: 'transient' });
  expect(tokenMock).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(['missing-config', 'token-failure', 'invalid-selector'])('%s is definite, sends no start, and never falls back to the configured Developer key', async (fault) => {
  if (fault === 'missing-config') delete process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (fault === 'token-failure') tokenMock.mockRejectedValue(new Error('internal authentication failure'));
  if (fault === 'invalid-selector') process.env.GEMINI_TRANSPORT = 'auto';
  expect(await client().start(request)).toMatchObject({ ok: false, failure: 'not_configured', ambiguous: false });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('missing credentials never redirect a historical job to the other transport', async () => {
  delete process.env.GEMINI_API_KEY;
  expect(await client().poll(ID)).toMatchObject({ ok: false, kind: 'auth' });
  delete process.env.GCP_SERVICE_ACCOUNT_KEY;
  process.env.GEMINI_API_KEY = 'developer-test-key';
  expect(await client().poll(REF)).toMatchObject({ ok: false, kind: 'auth' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a lost Vertex start is ambiguous and never retried through either transport', async () => {
  fetchMock.mockRejectedValue(new TypeError(`network failed ${TOKEN}`));
  const out = await client().start(request);
  expect(out).toMatchObject({ ok: false, ambiguous: true });
  expect(JSON.stringify(out)).not.toContain(TOKEN);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a Vertex provider error redacts the OAuth bearer', async () => {
  fetchMock.mockResolvedValue(new Response(`bad credential ${TOKEN}`, { status: 403 }));
  const out = await client().start(request);
  expect(out).toMatchObject({ ok: false, ambiguous: false, status: 403 });
  expect(JSON.stringify(out)).not.toContain(TOKEN);
});

test.each([
  'research:v2:vertex:test-project:global:abcd',
  'research:v1:vertex:../other:global:abcd',
  'research:v1:vertex:test-project:us-central1:abcd',
  'research:v1:vertex:test-project:global:../x',
  'research:v1:gemini:abcd:extra',
  'https://attacker.example/abcd',
])('invalid private references never reach auth or network: %s', async (ref) => {
  expect(parseInteractionReference(ref)).toBeNull();
  expect(await client().poll(ref)).toMatchObject({ ok: false, kind: 'not_found' });
  expect(await client().cancel(ref)).toMatchObject({ ok: false, kind: 'not_found' });
  expect(tokenMock).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('research availability accepts configured Vertex without a Developer key, but fails closed without Vertex credentials', async () => {
  delete process.env.GEMINI_API_KEY;
  const db = { from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) };
  expect(await getResearchCapabilities(db)).toMatchObject({ available: true });
  delete process.env.GCP_SERVICE_ACCOUNT_KEY;
  expect(await getResearchCapabilities(db)).toMatchObject({ available: false, reason: 'no_key' });
  expect(tokenMock).not.toHaveBeenCalled();
});


test.each(['467145118875', 'example.com:project-123'])('project identity %s survives reference encoding and lifecycle URLs', async (project) => {
  process.env.GCP_PROJECT_ID = project;
  const out = await client().start(request);
  if (!out.ok) throw new Error('start failed');
  expect(parseInteractionReference(out.id)).toEqual({ transport: 'vertex', project, location: 'global', id: ID });
  await client().poll(out.id);
  expect(fetchMock.mock.calls[1]![0]).toBe(`https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(project)}/locations/global/interactions/${ID}`);
});

test('authentication consumes the start deadline; an expired request never submits a paid task', async () => {
  const abort = new AbortController();
  const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(abort.signal);
  tokenMock.mockImplementationOnce(async () => { abort.abort(); return TOKEN; });
  try {
    expect(await client().start(request)).toMatchObject({ ok: false, ambiguous: false, failure: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  } finally { timeout.mockRestore(); }
});
