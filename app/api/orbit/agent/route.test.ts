/** @jest-environment node */
/**
 * POST /api/orbit/agent — retired: 404 with no provider code behind it (MASTER TASK v3.1, audit F-04).
 *
 * Before (2026-10-09): the route streamed chatEngine (OpenRouter / OpenAI) to any signed-in user, with no credit charged,
 * though no screen calls it. Then it was 404 unless AI_GOOGLE_ONLY=0 brought the old stream back. No env value does now.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST } from './route';

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

test.each([{}, { AI_GOOGLE_ONLY: '0' }, { AI_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-openai' }])(
  'env %p: 404, whoever asks',
  async (env) => {
    Object.assign(process.env, env);
    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  },
);

test('the route imports no engine', () => {
  expect(readFileSync(join(__dirname, 'route.ts'), 'utf8')).not.toMatch(/^import /m);
});
