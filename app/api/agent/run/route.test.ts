/** @jest-environment node */
// POST /api/agent/run — signed-in only, bounded per user; an optional `budgetMs` sets the loop's deadline, clamped to
// [15 s, 100 s] (default 100 s), and `source: 'live'` (a voice call's ask_agent_g) only labels the run's error report.

jest.mock('server-only', () => ({}));
const mockRequireUser = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({ requireUser: () => mockRequireUser() }));
const mockRun = jest.fn();
jest.mock('../../../../lib/agent/react/bindLiveAgent', () => ({ runLiveAgent: (...a: unknown[]) => mockRun(...a) }));
const mockRate = jest.fn();
jest.mock('../../../../lib/orchestrator/rate-limit', () => ({
  checkProduceRate: (...a: unknown[]) => mockRate(...a),
  rateLimitedResponse: (r: { retryAfterSec?: number }) =>
    new Response(JSON.stringify({ error: 'rate_limited', retryAfter: r.retryAfterSec ?? 60 }), { status: 429 }),
}));
const mockOpen = jest.fn(() => false);
jest.mock('../../../../lib/agent/media/access', () => ({ agentMediaOpenTo: (...a: unknown[]) => (mockOpen as (...x: unknown[]) => boolean)(...a) }));
const mockReport = jest.fn();
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const NOW = 1_800_000_000_000;
const call = (body: unknown) => POST(new NextRequest('https://myavatar.ge/api/agent/run', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
/** The agent's context for a request with no files, media execution closed (the default here). */
const BASE_CTX = { userId: 'u-1', media: false, onAudioQuote: expect.any(Function) };
/** The opts runLiveAgent got on its last call. */
const runOpts = () => mockRun.mock.calls[mockRun.mock.calls.length - 1]![2] as { maxSteps?: number; deadlineMs: number };

let nowSpy: jest.SpyInstance;
beforeEach(() => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockRequireUser.mockReset().mockResolvedValue({ id: 'u-1' });
  mockRate.mockReset().mockResolvedValue({ ok: true });
  mockRun.mockReset().mockResolvedValue({ answer: 'done', steps: [{ final: 'done' }], stopReason: 'final' });
  mockReport.mockReset();
});
afterEach(() => {
  nowSpy.mockRestore();
});

it('still requires sign-in: a guest gets 401 and no agent runs, whatever budget it asks for', async () => {
  mockRequireUser.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
  const res = await call({ goal: 'research', budgetMs: 45_000, maxSteps: 4, source: 'live' });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'unauthenticated' });
  expect(mockRate).not.toHaveBeenCalled();
  expect(mockRun).not.toHaveBeenCalled();
});

it('still rate-limits per user under the agent namespace', async () => {
  mockRate.mockResolvedValueOnce({ ok: false, reason: 'rate_minute', retryAfterSec: 60 });
  const res = await call({ goal: 'research', budgetMs: 45_000, source: 'live' });
  expect(res.status).toBe(429);
  expect(mockRate).toHaveBeenCalledWith('u-1', NOW, 'agent');
  expect(mockRun).not.toHaveBeenCalled();
});

it('no budgetMs → the 100 s deadline it always had', async () => {
  const res = await call({ goal: 'research' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ answer: 'done', steps: [{ final: 'done' }], stopReason: 'final' });
  expect(mockRun).toHaveBeenCalledWith('research', BASE_CTX, { maxSteps: undefined, deadlineMs: NOW + 100_000 });
});

it.each([
  [45_000, 45_000],
  [45_000.9, 45_000],
  [15_000, 15_000],
  [1_000, 15_000],
  [0, 15_000],
  [-5_000, 15_000],
  [100_000, 100_000],
  [10_000_000, 100_000],
  ['45000', 100_000],
  [null, 100_000],
  [{ ms: 1 }, 100_000],
])('budgetMs %j → a deadline %i ms away', async (budgetMs, ms) => {
  await call({ goal: 'research', budgetMs });
  expect(runOpts().deadlineMs).toBe(NOW + ms);
});

it('a Live call (budgetMs 45 s, maxSteps 4, source live) runs the same agent, only shorter', async () => {
  const res = await call({ goal: '  Compare three flights  ', budgetMs: 45_000, maxSteps: 4, source: 'live' });
  expect(res.status).toBe(200);
  expect(mockRun).toHaveBeenCalledWith('Compare three flights', BASE_CTX, { maxSteps: 4, deadlineMs: NOW + 45_000 });
  // `source` changes nothing about the run: same arguments with or without it.
  await call({ goal: 'Compare three flights', budgetMs: 45_000, maxSteps: 4 });
  expect(mockRun.mock.calls[1]).toEqual(['Compare three flights', BASE_CTX, { maxSteps: 4, deadlineMs: NOW + 45_000 }]);
  expect(mockReport).not.toHaveBeenCalled();
});

it('maxSteps is still capped at 8', async () => {
  await call({ goal: 'research', maxSteps: 50 });
  expect(runOpts().maxSteps).toBe(8);
});

it('an llm_error is still a 502 and reported — with the Live label (and its budget) when the call came from one', async () => {
  mockRun.mockResolvedValue({ answer: null, steps: [], stopReason: 'llm_error' });
  const res = await call({ goal: 'research', budgetMs: 45_000, source: 'live' });
  expect(res.status).toBe(502);
  expect(mockReport).toHaveBeenLastCalledWith(expect.any(Error), { route: 'agent.run', userId: 'u-1', source: 'live', budgetMs: 45_000 });
  // Only 'live' is a label: anything else a client sends is not echoed into the report.
  await call({ goal: 'research', source: 'evil\nlog line' });
  expect(mockReport).toHaveBeenLastCalledWith(expect.any(Error), { route: 'agent.run', userId: 'u-1' });
});

it('the goal rules are unchanged: required, at most 2,000 characters', async () => {
  expect((await call({ budgetMs: 45_000 })).status).toBe(400);
  expect((await call({ goal: 'x'.repeat(2001), budgetMs: 45_000 })).status).toBe(413);
  expect(mockRun).not.toHaveBeenCalled();
});

// ── Agent G media execution: the request's files, and the signed quote for the confirm card ──────────────────────────
describe('files and the media quote', () => {
  const ctxOf = () => mockRun.mock.calls[mockRun.mock.calls.length - 1]![1] as { userId: string; files?: string[]; media?: boolean; onMediaQuote?: (q: unknown) => void; onAudioQuote?: (q: unknown) => void };

  it('no files: no montage files or montage quote, but whether media execution is open (the audio plan needs no file)', async () => {
    await call({ goal: 'research' });
    expect(ctxOf()).toEqual({ userId: 'u-1', media: false, onAudioQuote: expect.any(Function) });
    expect(ctxOf().onMediaQuote).toBeUndefined();
    expect(mockOpen).toHaveBeenCalledWith({ id: 'u-1' });
  });

  it('the audio plan the tool signed comes back as audioQuote; nothing is fetched or run here', async () => {
    mockOpen.mockReturnValueOnce(true);
    const q = { ok: true, quote: { jobId: 'a', credits: 0 }, request: {}, token: 't' };
    mockRun.mockImplementationOnce(async (_g: string, ctx: { onAudioQuote?: (x: unknown) => void }) => {
      ctx.onAudioQuote?.(q);
      return { answer: 'Here is the plan', steps: [], stopReason: 'final' };
    });
    const res = await call({ goal: 'take the mp3 out of https://media.example.com/a.mp4' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: 'Here is the plan', steps: [], stopReason: 'final', audioQuote: q });
  });

  it('files go to the agent with whether media execution is open to this user', async () => {
    mockOpen.mockReturnValueOnce(true);
    await call({ goal: 'cut these to the song', files: [' u-1/a.mp4 ', 'u-1/song.mp3'] });
    expect(ctxOf()).toMatchObject({ userId: 'u-1', files: ['u-1/a.mp4', 'u-1/song.mp3'], media: true });
    expect(mockOpen).toHaveBeenCalledWith({ id: 'u-1' });
  });

  it('the plan the tool signed comes back as mediaQuote; nothing about it is run here', async () => {
    mockOpen.mockReturnValueOnce(true);
    const q = { ok: true, quote: { jobId: 'j' }, request: {}, token: 't' };
    mockRun.mockImplementationOnce(async (_g: string, ctx: { onMediaQuote?: (x: unknown) => void }) => {
      ctx.onMediaQuote?.(q);
      return { answer: 'Here is the plan', steps: [], stopReason: 'final' };
    });
    const res = await call({ goal: 'cut', files: ['u-1/a.mp4', 'u-1/s.mp3'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: 'Here is the plan', steps: [], stopReason: 'final', mediaQuote: q });
  });

  it.each([[['x'].concat(Array(13).fill('y'))], ['u-1/a.mp4'], [[1, 2]], [['']]])('rejects files=%j', async (files) => {
    const res = await call({ goal: 'cut', files });
    expect(res.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
