/** @jest-environment node */
/** VFX is removed (GG 2026-11-13): quote, generate and capabilities answer 410 before anything else; status stays shared. */
jest.mock('server-only', () => ({}));
import { POST as quote } from './quote/route';
import { POST as generate } from './generate/route';
import { GET as capabilities } from './capabilities/route';
import { VFX_REMOVED } from '../../../lib/genjutsu/removed';

test.each([
  ['quote', () => quote()],
  ['generate', () => generate()],
  ['capabilities', () => capabilities()],
])('%s answers 410 service_removed with Georgian copy and no-store', async (_name, call) => {
  const res = await call();
  expect(res.status).toBe(410);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const j = await res.json();
  expect(j).toMatchObject({ error: 'service_removed', tool: 'vfx', message: VFX_REMOVED.ka });
  expect(j.messages.en).toMatch(/not charged/);
});
