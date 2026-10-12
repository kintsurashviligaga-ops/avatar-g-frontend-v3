/** @jest-environment node */
/**
 * POST /api/chat/orchestrate — Video Core v1.0 §5: a render started from a storyboard carries the approval of the board's
 * revision (number + fingerprint + the board). The route re-fingerprints the board and checks the render's frames, scripts,
 * count and grid against it BEFORE the orchestrator is called: the approved board is forwarded (its approval riding in the
 * metadata), anything else is a 400 `revision_mismatch` and the orchestrator is never called — no clip, no charge. The
 * orchestrator is mocked: this pins the boundary, not the render.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: { maxRequests: 60, windowMs: 60_000 }, WRITE: { maxRequests: 30, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' }, supabase: {} })),
  createRouteHandlerClient: jest.fn(),
}));
jest.mock('../../../../lib/chat/providerRouter', () => ({
  orchestrate: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'queued' })),
  pollOrchestrationTask: jest.fn(),
}));
jest.mock('../../../../lib/chat/userMemory', () => ({
  getUserProfileFacts: jest.fn(async () => []),
  buildProfilePreamble: jest.fn(() => ''),
  extractProfileFacts: jest.fn(() => []),
  saveUserProfileFacts: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/rag/retrieve', () => ({ retrieveContext: jest.fn(async () => '') }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { orchestrate } from '../../../../lib/chat/providerRouter';
import { approvalForRender, renderScriptsFor, snapshotRevision, type BoardLike } from '../../../../lib/video/storyboard/revision';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/chat/orchestrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const board: BoardLike = {
  seed: 4242,
  clipSec: 8,
  scenes: [
    { ordinal: 1, beat: 'arrival', prompt: 'a detective on a rain-soaked pier', frameUrl: 'https://cdn/f1.jpg' },
    { ordinal: 2, beat: 'the wait', prompt: 'the informant is late', frameUrl: 'https://cdn/f2.jpg', edited: true },
    { ordinal: 3, beat: 'the turn', prompt: 'headlights on the water', frameUrl: 'https://cdn/f3.jpg' },
  ],
  sceneScripts: ['Wide, rain, neon.', 'He checks his watch.', 'A car arrives.'],
};
const rev = snapshotRevision(board, 'plan', null, Date.UTC(2026, 9, 12, 9, 0, 0));
const approval = approvalForRender(rev, board, Date.UTC(2026, 9, 12, 9, 1, 0));
const RENDER = {
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video',
  locale: 'ka',
  orientation: 'landscape',
  sceneFrames: board.scenes.map((s) => s.frameUrl),
  sceneScripts: renderScriptsFor(board),
  sceneCount: 3,
  clipSec: 8,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('the approved board renders: the orchestrator gets its frames and scripts, and the approval (number + fingerprint) in the metadata', async () => {
  const res = await POST(post({ ...RENDER, storyboardApproval: approval }));
  expect(res.status).toBe(200);
  expect(orchestrate).toHaveBeenCalledTimes(1);
  const md = (orchestrate as jest.Mock).mock.calls[0][0].metadata as Record<string, unknown>;
  expect(md.sceneScripts).toEqual(['Wide, rain, neon.', 'the informant is late', 'A car arrives.']);
  expect(md.storyboardApproval).toEqual({ revision: 1, fingerprint: rev.fingerprint, sceneCount: 3, nativeSec: 24, approvedAt: '2026-10-12T09:01:00.000Z' });
  expect(JSON.stringify(md.storyboardApproval)).not.toMatch(/board/); // the board was checked, not carried
});

test('a render with no storyboard carries no approval and is untouched', async () => {
  const res = await POST(post({ ...RENDER, sceneFrames: undefined, sceneScripts: undefined }));
  expect(res.status).toBe(200);
  const md = (orchestrate as jest.Mock).mock.calls[0][0].metadata as Record<string, unknown>;
  expect(md.storyboardApproval).toBeUndefined();
});

test('the board edited after the approval → 400 revision_mismatch (board_changed), in Georgian, and the orchestrator is never called', async () => {
  const edited = { ...approval, board: { ...approval.board, scenes: approval.board.scenes.map((s, i) => (i === 2 ? { ...s, prompt: 'the car drives past', edited: true } : s)) } };
  const res = await POST(post({ ...RENDER, storyboardApproval: edited }));
  expect(res.status).toBe(400);
  const j = await res.json();
  expect(j).toMatchObject({ success: false, error: 'revision_mismatch', reason: 'board_changed', revision: 1, fingerprint: rev.fingerprint });
  expect(j.message).toMatch(/^სთორიბორდი დადასტურების შემდეგ შეიცვალა \(რევიზია 1 · [0-9a-f]{16}\. არაფერი არ დარენდერდა და არ ჩამოიჭრა/);
  expect(orchestrate).not.toHaveBeenCalled();
});

test('scripts that are not the approved board’s → 400 scripts_differ; frames that are not → frames_differ; another grid → clip_sec', async () => {
  const r1 = await POST(post({ ...RENDER, storyboardApproval: approval, sceneScripts: ['Wide, rain, neon.', 'the informant is late', 'A DIFFERENT ENDING.'] }));
  expect(r1.status).toBe(400);
  expect((await r1.json()).reason).toBe('scripts_differ');
  const r2 = await POST(post({ ...RENDER, storyboardApproval: approval, sceneFrames: ['https://cdn/f1.jpg', 'https://cdn/other.jpg', 'https://cdn/f3.jpg'] }));
  expect((await r2.json()).reason).toBe('frames_differ');
  const r3 = await POST(post({ ...RENDER, storyboardApproval: approval, clipSec: 6 }));
  expect((await r3.json()).reason).toBe('clip_sec');
  expect(orchestrate).not.toHaveBeenCalled();
});

test('a malformed approval (no fingerprint shape) is a schema 400, not a render', async () => {
  const res = await POST(post({ ...RENDER, storyboardApproval: { ...approval, fingerprint: 'nope' } }));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe('Invalid request');
  expect(orchestrate).not.toHaveBeenCalled();
});

test('the refusal is said in English when the studio runs in English', async () => {
  const res = await POST(post({ ...RENDER, locale: 'en', storyboardApproval: { ...approval, fingerprint: '0123456789abcdef' } }));
  expect(res.status).toBe(400);
  expect((await res.json()).message).toMatch(/^the storyboard changed after it was approved \(revision 1 · 0123456789abcdef\. Nothing was rendered or charged/);
});
