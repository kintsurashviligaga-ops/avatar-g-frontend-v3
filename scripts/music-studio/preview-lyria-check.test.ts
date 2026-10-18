/** @jest-environment node */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { plan, readRequest, runCheck, CASES } = require('./preview-lyria-check.cjs');
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ENV = {
  VERCEL_ENV: 'preview',
  GEMINI_TRANSPORT: 'vertex',
  GCP_PROJECT_ID: 'myavatar-test',
  GCP_PROJECT_NUMBER: '123456',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-oidc',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@myavatar-test.iam.gserviceaccount.com',
  VERCEL_OIDC_TOKEN: 'subject',
};
const REQ = { approval: 'GG-20261014-MUSIC-LYRIA-E2E-USD5', cap: 5, spentBefore: 0, cases: CASES };

function requestFile(body: unknown): string {
  const f = join(mkdtempSync(join(tmpdir(), 'lyria-')), 'r.json');
  writeFileSync(f, JSON.stringify(body));
  return f;
}

describe('preview-lyria-check gating', () => {
  it('skips outside a Preview build, without vertex, or without the request file', () => {
    expect(plan({ ...ENV, VERCEL_ENV: 'production' }, REQ)).toEqual({ skip: 'not a Vercel Preview build' });
    expect(plan({ ...ENV, GEMINI_TRANSPORT: 'gemini_api' }, REQ).skip).toMatch(/vertex/);
    expect(plan(ENV, { none: true }).skip).toBe('no request file');
    expect(plan({ ...ENV, VERCEL_OIDC_TOKEN: '' }, REQ).skip).toMatch(/OIDC/);
  });

  it('refuses a request without a valid approval or with a cap above $5', () => {
    expect(readRequest(requestFile({ capUsd: 5 }))).toEqual({ invalid: 'approval' });
    expect(readRequest(requestFile({ approval: REQ.approval, capUsd: 6 }))).toEqual({ invalid: 'capUsd' });
    expect(readRequest(requestFile({ approval: REQ.approval, capUsd: 5, cases: ['other'] }))).toEqual({ invalid: 'cases' });
  });

  it('never plans a call that could cross the cap', () => {
    expect(plan(ENV, { ...REQ, cap: 0.08 }).cases).toHaveLength(2);
    expect(plan(ENV, { ...REQ, cap: 5, spentBefore: 4.97 }).skip).toBe('cap reached');
  });

  it('makes exactly one call per case and never retries a failure or an uncertain call', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout');
      return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
    };
    const lib = { ExternalAccountClient: { fromJSON: () => ({ getAccessToken: async () => ({ token: 't' }) }) } };
    const out = await runCheck(ENV, { ...REQ, cases: CASES.slice(0, 2) }, { lib, fetchImpl, write: () => undefined });
    expect(calls).toBe(2);
    expect(out.results[0]).toMatchObject({ uncertain: true, ok: false });
    expect(out.results[1]).toMatchObject({ status: 429, reason: 'RESOURCE_EXHAUSTED', ok: false });
    expect(out.plannedSpendUpperBoundUsd).toBe(0.08);
  });

  it('stores the returned audio and its digest', async () => {
    const audio = Buffer.from('ID3fake');
    const fetchImpl = async () =>
      new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'caption' }, { inlineData: { mimeType: 'audio/mpeg', data: audio.toString('base64') } }] } }] }), { status: 200 });
    const lib = { ExternalAccountClient: { fromJSON: () => ({ getAccessToken: async () => ({ token: 't' }) }) } };
    const written: string[] = [];
    const out = await runCheck(ENV, { ...REQ, cases: CASES.slice(0, 1) }, { lib, fetchImpl, write: (n: string) => written.push(n) });
    expect(written).toEqual(['A-instrumental.mp3']);
    expect(out.results[0]).toMatchObject({ ok: true, mime: 'audio/mpeg', bytes: audio.byteLength, textPart: 'caption' });
  });
});
