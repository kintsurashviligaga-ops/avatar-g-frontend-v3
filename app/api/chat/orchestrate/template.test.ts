/** @jest-environment node */
/**
 * POST /api/chat/orchestrate — the film render's `templateId` reaches filmComposite through `metadata`, as an id.
 *
 * The studio's render dispatch (lib/chat/filmStudioClient) sends the picked video card's id at the top level; the
 * route must forward it in the metadata filmComposite reads (`metadata.templateId`), and a malformed id must be DROPPED
 * rather than fail the whole paid render with a 400 (`.catch(undefined)` on the zod field). The orchestrator itself
 * is mocked: this pins the boundary, not the render.
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

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/chat/orchestrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** A render dispatch shaped like driveFilmStudio's. */
const RENDER = {
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video',
  locale: 'en',
  orientation: 'landscape',
  sceneCount: 3,
  clipSec: 8,
  style: 'Noir',
};

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { fetchSpy.mockRestore(); jest.restoreAllMocks(); });

/** The metadata the orchestrator (→ filmComposite) was handed. */
async function forwarded(extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await POST(post({ ...RENDER, ...extra }));
  expect(res.status).toBe(200);
  expect(orchestrate).toHaveBeenCalledTimes(1);
  return (orchestrate as jest.Mock).mock.calls[0][0].metadata as Record<string, unknown>;
}

test('the picked card\'s id reaches filmComposite as metadata.templateId, beside the style and length it is checked against', async () => {
  const md = await forwarded({ templateId: 'noir' });
  expect(md).toMatchObject({ templateId: 'noir', style: 'Noir', sceneCount: 3, clipSec: 8 });
});

test('no templateId → none in the metadata (the render is exactly what it was)', async () => {
  expect(await forwarded({})).not.toHaveProperty('templateId');
});

test.each([
  ['over-long', 'n'.repeat(41)],
  ['a number', 7],
  ['an object', { id: 'noir' }],
])('a malformed id (%s) is dropped, and the render still goes ahead (no 400)', async (_label, templateId) => {
  const md = await forwarded({ templateId });
  expect(md).not.toHaveProperty('templateId');
  expect(md).toMatchObject({ style: 'Noir', sceneCount: 3 });
});
