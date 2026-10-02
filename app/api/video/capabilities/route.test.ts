/** @jest-environment node */
/**
 * GET /api/video/capabilities — long-form is "open" only when it is enabled AND priced, and the answer carries nothing
 * but a boolean and a length (no env value, no margin, no price).
 */
jest.mock('server-only', () => ({}));

import { GET } from './route';

const env = process.env as Record<string, string | undefined>;
const KEYS = ['LONGFORM_VIDEO_ENABLED', 'LONGFORM_MARGIN'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of KEYS) { saved[k] = env[k]; delete env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; } });

const read = async () => { const r = await GET(); return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }; };

test('nothing configured (production today): closed, and the film pipeline’s 96 s is the longest film', async () => {
  const r = await read();
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ longform: false, maxSeconds: 96 });
});

test('enabled but NOT priced: still closed — the create route would answer 503 pricing_unconfigured', async () => {
  env.LONGFORM_VIDEO_ENABLED = '1';
  expect((await read()).body).toEqual({ longform: false, maxSeconds: 96 });
});

test('priced but NOT enabled: still closed — the create route answers 404', async () => {
  env.LONGFORM_MARGIN = '1.5';
  expect((await read()).body).toEqual({ longform: false, maxSeconds: 96 });
});

test('enabled AND priced: open, up to 4 minutes', async () => {
  env.LONGFORM_VIDEO_ENABLED = '1';
  env.LONGFORM_MARGIN = '1.5';
  expect((await read()).body).toEqual({ longform: true, maxSeconds: 240 });
});

test('a margin outside 1…10 is a typo, not a price: closed (the same rule the order route applies)', async () => {
  env.LONGFORM_VIDEO_ENABLED = 'true';
  for (const bad of ['0.5', '150', 'abc', '']) {
    env.LONGFORM_MARGIN = bad;
    expect((await read()).body).toEqual({ longform: false, maxSeconds: 96 });
  }
});

test('the answer never contains an env value, the margin or a price — only the two fields', async () => {
  env.LONGFORM_VIDEO_ENABLED = '1';
  env.LONGFORM_MARGIN = '2.345';
  const { body, cache } = await read();
  expect(Object.keys(body).sort()).toEqual(['longform', 'maxSeconds']);
  expect(JSON.stringify(body)).not.toMatch(/2\.345|margin|credit|price/i);
  expect(cache).toBe('private, max-age=30');
});
