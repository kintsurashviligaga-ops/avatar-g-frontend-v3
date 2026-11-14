/** @jest-environment node */
/**
 * POST /api/video/director-workflow/approve — the whole-film balance check before the first scene. Charges nothing.
 */
jest.mock('server-only', () => ({}));
let mockUser: { id: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: jest.fn(() => false) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));
jest.mock('../../../../../lib/server/serviceSwitches', () => ({ serviceOffResponse: jest.fn(async () => null) }));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({ hasSufficientBalance: jest.fn(async () => true), deductCredits: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits, hasSufficientBalance } from '../../../../../lib/orchestrator/ledger';
import { emptyScene, quoteProject, type DwProject } from '../../../../../lib/video/directorsWorkflow';

const ENV = { ...process.env };
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/video/director-workflow/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const board = (): DwProject => ({
  id: 'dw_1', title: 'T', logline: 'L', aspect: '16:9', resolution: '1080p', characters: [],
  scenes: [{ ...emptyScene('a'), order: 1, action: 'A fox in snow.', firstFrame: 'none' }, { ...emptyScene('b'), order: 2, action: 'The fox runs.', seconds: 4 }],
  status: 'draft', version: 2,
});

beforeEach(() => { jest.clearAllMocks(); mockUser = { id: 'u1' }; process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 's', DIRECTORS_WORKFLOW: 'everyone' }; });
afterAll(() => { process.env = ENV; });

it('checks the balance for the whole film and returns the version and quote; charges nothing', async () => {
  const p = board();
  const q = quoteProject(p);
  const res = await POST(post({ project: p, expectedCredits: q.totalCredits }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, version: 2, quote: { totalCredits: q.totalCredits } });
  expect(hasSufficientBalance).toHaveBeenCalledWith('u1', q.totalCredits);
  expect(deductCredits).not.toHaveBeenCalled();
});

it('402 when the balance is short of the whole film, 409 on a changed price, 422 on a board with problems, 404 when off', async () => {
  const p = board();
  const q = quoteProject(p);
  (hasSufficientBalance as jest.Mock).mockResolvedValueOnce(false);
  expect((await POST(post({ project: p, expectedCredits: q.totalCredits }))).status).toBe(402);
  expect((await POST(post({ project: p, expectedCredits: q.totalCredits + 1 }))).status).toBe(409);
  expect((await POST(post({ project: { ...p, scenes: [] }, expectedCredits: 0 }))).status).toBe(422);
  process.env.DIRECTORS_WORKFLOW = 'off';
  expect((await POST(post({ project: p }))).status).toBe(404);
});
