/** @jest-environment node */
/** GET /api/admin/lifecycle — 404 for a non-admin; for an admin, the served models worst first. No network. */
let mockAdmin = true;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('../../../../lib/admin/guard', () => ({ assertAdminAccess: () => (mockAdmin ? { ok: true } : { ok: false, reason: 'x' }) }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const req = () => new NextRequest('https://myavatar.ge/api/admin/lifecycle');

beforeEach(() => {
  mockAdmin = true;
});

it('404 for a non-admin', async () => {
  mockAdmin = false;
  const res = await GET(req());
  expect(res.status).toBe(404);
});

it('lists every served model with a level, and never calls the network', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const res = await GET(req());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(body.rules.ciBlockDays).toBe(21);
  expect(Array.isArray(body.blockers)).toBe(true);
  expect(body.served.length).toBeGreaterThan(5);
  for (const row of body.served) expect(row).toEqual(expect.objectContaining({ id: expect.any(String), level: expect.any(String) }));
  expect(body.served.map((r: { id: string }) => r.id)).toContain('gemini-3.8-flash');
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
