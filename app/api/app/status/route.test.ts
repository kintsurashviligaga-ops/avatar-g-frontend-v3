/** @jest-environment node */
/**
 * GET /api/app/status — the Gemini row follows Vertex AI readiness (MASTER TASK v3.1), not an AI Studio key: production
 * holds no key, so the key check reported every Gemini-backed service as missing a provider.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

async function gemini(): Promise<boolean | undefined> {
  const body = (await (await GET(new NextRequest('https://myavatar.ge/api/app/status'))).json()) as {
    keys: { providers: Array<{ id: string; configured: boolean }> };
  };
  return body.keys.providers.find((p) => p.id === 'gemini')?.configured;
}

beforeEach(() => {
  for (const k of [...Object.keys(VERTEX_ENV), 'GEMINI_API_KEY', 'GEMINI_TRANSPORT']) delete process.env[k];
});

test('Vertex AI configured → Gemini is configured, with no AI Studio key', async () => {
  Object.assign(process.env, VERTEX_ENV);
  expect(await gemini()).toBe(true);
});

test('an AI Studio key alone does not make Gemini configured', async () => {
  process.env.GEMINI_API_KEY = 'AQ.test-key';
  expect(await gemini()).toBe(false);
});
