/** @jest-environment node */
/** GET /api/genjutsu/capabilities — public, coarse (open | soon), never cached. */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/genjutsu/capabilities', () => ({
  publicOpStatuses: jest.fn(() => ({
    scene: { open: true, state: 'open' },
    motion: { open: false, state: 'soon' },
    swap: { open: false, state: 'soon' },
  })),
}));

import { GET } from './route';

test('answers the three ops with open | soon and no cache — and needs no session (guests see the studio)', async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({
    ops: { scene: { open: true, state: 'open' }, motion: { open: false, state: 'soon' }, swap: { open: false, state: 'soon' } },
  });
});
