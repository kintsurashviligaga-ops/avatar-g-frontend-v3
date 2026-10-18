/** @jest-environment node */
/**
 * scripts/global-e2e/preview-media-check.cjs — the one owner-approved image + Veo test from a Preview build.
 * Pinned: Preview + vertex + valid, UNEXPIRED request only (a rebuild after `notAfter` never spends); worst-case reserve
 * per call against the cap; one submit per case, never re-sent; dependants skipped when their input is missing.
 * google-auth-library and fetch are fakes; nothing reaches the network.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the script under test is plain-node CommonJS
const { plan, readRequest, runCheck, CASES } = require('./preview-media-check.cjs');

const NOW = Date.parse('2026-10-14T18:00:00Z');
const ENV = {
  VERCEL_ENV: 'preview',
  GEMINI_TRANSPORT: 'vertex',
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  VERCEL_OIDC_TOKEN: 'oidc',
};

function req(over: Record<string, unknown> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  const file = path.join(dir, 'r.json');
  fs.writeFileSync(file, JSON.stringify({ approval: 'GG-20261014-GLOBAL-E2E-EXTRA-USD5', capUsd: 5, notAfter: '2026-10-14T20:00:00Z', ...over }));
  return readRequest(file);
}

const lib = { ExternalAccountClient: { fromJSON: () => ({ getAccessToken: async () => ({ token: 't' }) }) } };
const png = Buffer.from('fakepng').toString('base64');
const mp4 = Buffer.from('fakemp4').toString('base64');
const json = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body });

describe('plan', () => {
  it('skips outside Preview, without vertex, and without a request', () => {
    expect(plan({ ...ENV, VERCEL_ENV: 'production' }, req(), NOW).skip).toMatch(/Preview/);
    expect(plan({ ...ENV, GEMINI_TRANSPORT: '' }, req(), NOW).skip).toMatch(/vertex/);
    expect(plan(ENV, readRequest('/nonexistent'), NOW).skip).toBe('no request file');
  });
  it('a rebuild after notAfter never spends; a window over 6 h is refused; notAfter is required', () => {
    expect(plan(ENV, req(), Date.parse('2026-10-14T20:00:01Z')).skip).toMatch(/expired/);
    expect(plan(ENV, req({ notAfter: '2026-10-15T09:00:00Z' }), NOW).skip).toMatch(/6 h/);
    expect(req({ notAfter: undefined }).invalid).toBe('notAfter');
  });
  it('reserves worst case per call and drops cases (and dependants) that cross the cap', () => {
    const full = plan(ENV, req(), NOW);
    expect(full.cases.map((c: { name: string }) => c.name)).toEqual(CASES.map((c: { name: string }) => c.name));
    expect(full.reservedUsd).toBe(1.5);
    const tight = plan(ENV, req({ capUsd: 1, spentBeforeUsd: 0.2 }), NOW); // 0.8 left: 2 images (0.3) + 0 veo (0.6 > 0.5)
    expect(tight.cases.map((c: { kind: string }) => c.kind)).toEqual(['image', 'image']);
    expect(plan(ENV, req({ cases: ['VEO-2-i2v-16x9'] }), NOW).skip).toBe('cap reached'); // its input case is not planned
  });
});

describe('runCheck', () => {
  it('one call per case, polls Veo without re-submitting, writes outputs', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url.split(':').pop() as string);
      if (url.endsWith(':generateContent')) return json(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] });
      if (url.endsWith(':predictLongRunning')) return json(200, { name: 'projects/p/locations/us-central1/publishers/google/models/m/operations/op1' });
      return json(200, { done: true, response: { videos: [{ bytesBase64Encoded: mp4, mimeType: 'video/mp4' }] } });
    };
    const written: string[] = [];
    const out = await runCheck(ENV, req(), { lib, fetchImpl, sleep: async () => {}, write: (n: string) => written.push(n), now: NOW });
    expect(out.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(calls.filter((c) => c === 'generateContent')).toHaveLength(2);
    expect(calls.filter((c) => c === 'predictLongRunning')).toHaveLength(2);
    expect(written).toEqual(['IMG-1-generate.png', 'IMG-2-edit-background.png', 'VEO-1-t2v-9x16.mp4', 'VEO-2-i2v-16x9.mp4']);
    expect(out.reservedSpendUpperBoundUsd).toBe(1.5);
  });
  it('a failed image skips its dependants; an uncertain submit is never re-sent', async () => {
    let submits = 0;
    const fetchImpl = async (url: string) => {
      if (url.endsWith(':generateContent')) return json(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'secret detail' } });
      if (url.endsWith(':predictLongRunning')) {
        submits++;
        throw new Error('network');
      }
      return json(200, {});
    };
    const out = await runCheck(ENV, req(), { lib, fetchImpl, sleep: async () => {}, write: () => {}, now: NOW });
    expect(out.results[0]).toMatchObject({ ok: false, status: 429, reason: 'RESOURCE_EXHAUSTED' });
    expect(JSON.stringify(out)).not.toContain('secret detail');
    expect(out.results.filter((r: { skipped?: string }) => r.skipped)).toHaveLength(2);
    expect(submits).toBe(1);
    expect(out.results.find((r: { case: string }) => r.case === 'VEO-1-t2v-9x16')).toMatchObject({ uncertain: true });
  });
});
