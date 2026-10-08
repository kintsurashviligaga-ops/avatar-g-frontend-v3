/** @jest-environment node */
/**
 * scripts/gcp/preview-inference-check.cjs — the one owner-approved Gemini generation from a Preview build.
 * Pinned: nothing is called outside a Preview build with GEMINI_TRANSPORT=vertex AND a valid request file; only the
 * allowlisted model; one generateContent on the Vertex endpoint with the impersonated token; the result carries
 * statuses, Google's status enum and token counts, never a token or Google's error text.
 * google-auth-library and fetch are injected fakes; nothing reaches the network.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the script under test is plain-node CommonJS
const { plan, runCheck, readRequest, line, writeResult } = require('./preview-inference-check.cjs');

const ENV = {
  VERCEL_ENV: 'preview',
  GEMINI_TRANSPORT: 'vertex',
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-oidc',
  VERCEL_OIDC_TOKEN: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig',
};
const REQUEST = { requestId: 'gg-2026-10-08-a', model: 'gemini-3.8-flash' };

const lib = (token: string | null = 'ya29.secret-token') => ({
  ExternalAccountClient: { fromJSON: jest.fn(() => ({ getAccessToken: async () => ({ token }) })) },
});
const ok = () =>
  jest.fn(async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 1, totalTokenCount: 8 },
        modelVersion: 'gemini-3.8-flash',
      }),
      { status: 200 },
    ),
  );
const now = () => new Date('2026-10-08T18:40:00Z');

describe('plan / gating', () => {
  it.each([
    [{ ...ENV, VERCEL_ENV: 'production' }, REQUEST, 'not a Vercel Preview build'],
    [{ ...ENV, VERCEL_ENV: undefined }, REQUEST, 'not a Vercel Preview build'],
    [{ ...ENV, GEMINI_TRANSPORT: 'gemini_api' }, REQUEST, 'GEMINI_TRANSPORT is not vertex'],
    [ENV, { none: true }, 'no request file'],
    [ENV, { invalid: 'model' }, 'invalid request (model)'],
    [{ ...ENV, GCP_PROJECT_ID: 'x/../y' }, REQUEST, 'missing or invalid GCP_PROJECT_ID'],
    [{ ...ENV, VERCEL_OIDC_TOKEN: '' }, REQUEST, 'VERCEL_OIDC_TOKEN is not set in this build'],
  ])('skips and calls nothing (%#)', async (env, request, skip) => {
    expect(plan(env, request)).toEqual({ skip });
    const fetchImpl = ok();
    const l = lib();
    const result = await runCheck(env, request, l, fetchImpl, now);
    expect(result.skipped).toBe(skip);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(l.ExternalAccountClient.fromJSON).not.toHaveBeenCalled();
  });
});

describe('readRequest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inference-req-'));
  const write = (name: string, body: unknown) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body));
    return f;
  };

  it('accepts the owner request for the allowlisted model, and refuses anything else', () => {
    expect(readRequest(path.join(dir, 'missing.json'))).toEqual({ none: true });
    expect(readRequest(write('a.json', { ...REQUEST, approvedBy: 'GG', approvedAt: '2026-10-08T18:30Z' }))).toEqual(REQUEST);
    expect(readRequest(write('b.json', { ...REQUEST, model: 'gemini-3.1-pro-preview', approvedBy: 'GG', approvedAt: 'x' }))).toEqual({ invalid: 'model' });
    expect(readRequest(write('c.json', { ...REQUEST }))).toEqual({ invalid: 'approval' });
    expect(readRequest(write('d.json', { ...REQUEST, requestId: 'A B', approvedBy: 'GG', approvedAt: 'x' }))).toEqual({ invalid: 'requestId' });
    expect(readRequest(write('e.json', '{nope'))).toEqual({ invalid: 'json' });
  });
});

describe('runCheck', () => {
  it('one generateContent on the global Vertex endpoint with the impersonated token; result without the token', async () => {
    const fetchImpl = ok();
    const l = lib();
    const result = await runCheck(ENV, REQUEST, l, fetchImpl, now);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.8-flash:generateContent',
    );
    expect(init.headers.Authorization).toBe('Bearer ya29.secret-token');
    expect(JSON.parse(String(init.body)).generationConfig.maxOutputTokens).toBe(64);
    const cfg = (l.ExternalAccountClient.fromJSON.mock.calls[0] as unknown[])[0] as Record<string, string>;
    expect(cfg.audience).toBe('//iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc');
    expect(cfg.service_account_impersonation_url).toContain('myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com:generateAccessToken');
    expect(result).toMatchObject({
      requestId: 'gg-2026-10-08-a',
      checkedAt: '2026-10-08T18:40:00.000Z',
      transport: 'vertex',
      location: 'global',
      model: 'gemini-3.8-flash',
      ok: true,
      status: 200,
      finishReason: 'STOP',
      reply: 'ok',
      usage: { prompt: 7, output: 1, total: 8 },
    });
    const text = JSON.stringify(result) + line(result);
    expect(text).not.toMatch(/ya29|eyJ/);
    expect(line(result)).toBe('[gcp-inference-check] ok=true model=gemini-3.8-flash location=global step=generate http=200 finish=STOP tokens=8');
  });

  it('a regional location uses the regional host', async () => {
    const fetchImpl = ok();
    await runCheck({ ...ENV, GCP_GEMINI_LOCATION: 'us-central1' }, REQUEST, lib(), fetchImpl, now);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toMatch(/^https:\/\/us-central1-aiplatform\.googleapis\.com\/v1\/projects\/[\w-]+\/locations\/us-central1\//);
  });

  it("a Google refusal keeps the status and enum, never Google's text", async () => {
    const fetchImpl = jest.fn(
      async () => new Response('{"error":{"status":"PERMISSION_DENIED","message":"denied for myavatar-veo@ ya29.leak"}}', { status: 403 }),
    );
    const result = await runCheck(ENV, REQUEST, lib(), fetchImpl, now);
    expect(result).toMatchObject({ ok: false, step: 'generate', status: 403, reason: 'PERMISSION_DENIED' });
    expect(JSON.stringify(result)).not.toMatch(/denied for|ya29/);
  });

  it('a token failure stops before any generation', async () => {
    const fetchImpl = ok();
    const result = await runCheck(ENV, REQUEST, lib(null), fetchImpl, now);
    expect(result).toMatchObject({ ok: false, step: 'token' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('writes the result file where the Preview serves it', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inference-out-')), 'preview-checks', 'google-inference.json');
    writeResult({ ok: true, requestId: 'x' }, f);
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ ok: true, requestId: 'x' });
  });
});
