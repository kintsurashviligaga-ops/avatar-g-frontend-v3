/** @jest-environment node */
/**
 * POST /api/video/director-workflow/plan — free storyboard draft. Pins: 404 while the flag is off (or admin-only and not
 * an admin), sign-in, input checks before any Gemini call, and the reader's output (board + problems + quote).
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string; app_metadata?: Record<string, unknown> } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));
jest.mock('../../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
let mockAdmin = false;
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: jest.fn(() => mockAdmin) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { llmText } from '../../../../../lib/ai/llmText';
import { GET } from '../route';

const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/video/director-workflow/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ANSWER = JSON.stringify({
  title: 'კაფე',
  characters: [{ id: 'c1', name: 'ნინო', look: 'woman, 30, red coat', voice: 'female' }],
  scenes: [
    { title: 'შესვლა', action: 'ნინო შედის კაფეში', seconds: 8, characterIds: ['c1'], lines: [{ characterId: 'c1', text: 'გამარჯობა!' }], firstFrame: 'none' },
    { title: 'ფანჯარასთან', action: 'ნინო ჯდება ფანჯარასთან', seconds: 6, characterIds: ['c1'], firstFrame: 'previous' },
  ],
});

const ENV = process.env.DIRECTORS_WORKFLOW;
beforeEach(() => { jest.clearAllMocks(); mockUser = { id: 'u1' }; mockAdmin = false; process.env.DIRECTORS_WORKFLOW = 'everyone'; });
afterAll(() => { process.env.DIRECTORS_WORKFLOW = ENV; });

it('404 while the flag is off, and for a non-admin when admin-only — before Gemini', async () => {
  process.env.DIRECTORS_WORKFLOW = '';
  expect((await POST(post({ idea: 'x' }))).status).toBe(404);
  process.env.DIRECTORS_WORKFLOW = 'admin';
  expect((await POST(post({ idea: 'x' }))).status).toBe(404);
  mockAdmin = true;
  (llmText as jest.Mock).mockResolvedValueOnce(ANSWER);
  expect((await POST(post({ idea: 'x' }))).status).toBe(200);
  expect(llmText).toHaveBeenCalledTimes(1);
});

it('404 for a guest', async () => {
  mockUser = null;
  expect((await POST(post({ idea: 'x' }))).status).toBe(404);
  expect(llmText).not.toHaveBeenCalled();
});

it('refuses a blank idea and a bad scene count without calling Gemini', async () => {
  expect((await POST(post({ idea: '  ' }))).status).toBe(400);
  expect((await POST(post({ idea: 'x', scenes: 11 }))).status).toBe(400);
  expect((await POST(post({ idea: 'x', scenes: 0 }))).status).toBe(400);
  expect(llmText).not.toHaveBeenCalled();
});

it('returns the board, its problems and the price per scene; nothing is charged', async () => {
  (llmText as jest.Mock).mockResolvedValueOnce(ANSWER);
  const res = await POST(post({ idea: 'ორი სცენა კაფეში', scenes: 2, aspect: '9:16', resolution: '1080p', locale: 'ka' }));
  expect(res.status).toBe(200);
  const j = await res.json();
  expect(j.project.scenes).toHaveLength(2);
  expect(j.project.resolution).toBe('1080p');
  expect(j.problems).toEqual([]);
  expect(j.quote.scenes.map((s: { clip: { engine: string } }) => s.clip.engine)).toEqual(['omni', 'omni']);
  expect(j.quote.totalSeconds).toBe(14);
  expect((llmText as jest.Mock).mock.calls[0][0].user).toContain('exactly 2 scenes');
});

it('503 when Gemini misses, 502 when it answers nonsense', async () => {
  expect((await POST(post({ idea: 'x' }))).status).toBe(503);
  (llmText as jest.Mock).mockResolvedValueOnce('no json here');
  expect((await POST(post({ idea: 'x' }))).status).toBe(502);
});

it('GET says enabled only when the flag is open to this user', async () => {
  const get = () => GET(new NextRequest('https://myavatar.ge/api/video/director-workflow'));
  expect(await (await get()).json()).toEqual({ enabled: true });
  process.env.DIRECTORS_WORKFLOW = 'admin';
  expect(await (await get()).json()).toEqual({ enabled: false });
  process.env.DIRECTORS_WORKFLOW = 'off';
  expect(await (await get()).json()).toEqual({ enabled: false });
});
