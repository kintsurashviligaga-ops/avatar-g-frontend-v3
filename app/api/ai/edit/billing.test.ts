/** @jest-environment node */
/**
 * POST /api/ai/edit (inpaint) — the generative object-removal ran on a Replicate masked-inpaint model, which has no Google
 * engine. It is refused with 503 google_only right after the action check, before the guard, the ledger or any model,
 * whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1); the fail-closed charge it used to pin went with the code. The
 * deterministic ffmpeg actions still reach their guard. Every provider, ffmpeg op and the ledger are mocked — no network,
 * no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'ru' })),
  insufficientCreditsMessage: () => 'Недостаточно кредитов',
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  createSignedAssetUrl: jest.fn(async () => 'https://proj.supabase.co/storage/v1/object/sign/uploads/p.png?token=t'),
  parseSupabaseObjectUrl: jest.fn(() => null),
  uploadBufferAndSign: jest.fn(async () => null),
}));
jest.mock('../../../../lib/video/trimClip', () => ({ trimClip: jest.fn() }));
jest.mock('../../../../lib/video/surgicalOps', () => ({
  cropClip: jest.fn(), gradeClip: jest.fn(), detachAudio: jest.fn(), fadeClip: jest.fn(),
  renderVideoDraft: jest.fn(), renderPhotoDraft: jest.fn(), renderConcat: jest.fn(),
}));
jest.mock('../../../../lib/replicate/client', () => ({
  createPrediction: jest.fn(async () => ({ id: 'p1', status: 'succeeded', output: 'https://replicate.delivery/out.png' })),
  pollUntilDone: jest.fn(),
}));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/services/montage/montagePlan', () => ({ maxrateForTarget: jest.fn() }));
jest.mock('../../../../lib/orchestrator/saveEditorOutput', () => ({ saveEditorOutput: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { createPrediction } from '../../../../lib/replicate/client';
import { guardGeneration } from '../../../../lib/api/generationGuard';

const ENV = { ...process.env };
const post = (body: Record<string, unknown> = { action: 'inpaint', mediaUrl: 'user-1/photo.png', maskUrl: 'data:image/png;base64,AAAA', prompt: 'remove the cup' }) =>
  POST(new NextRequest('https://myavatar.ge/api/ai/edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'test-token', REPLICATE_INPAINT_MODEL: 'owner/inpaint' };
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => { process.env = ENV; });

test.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
])('env %p: the Replicate inpaint is refused before the guard, the ledger or the model', async (env) => {
  Object.assign(process.env, env);
  const res = await post();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ url: null, code: 'google_only', error: 'google_only' });
  expect(guardGeneration).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
  expect(createPrediction).not.toHaveBeenCalled();
});

test('an unknown action is still a 400, before anything runs', async () => {
  const res = await post({ action: 'restyle', mediaUrl: 'user-1/photo.png' });
  expect(res.status).toBe(400);
  expect(guardGeneration).not.toHaveBeenCalled();
});

test('a deterministic ffmpeg action still reaches its guard', async () => {
  (guardGeneration as jest.Mock).mockResolvedValueOnce({ ok: false, response: new Response('{}', { status: 401 }) });
  const res = await post({ action: 'crop', mediaUrl: 'user-1/clip.mp4' });
  expect(res.status).toBe(401);
  expect(guardGeneration).toHaveBeenCalledTimes(1);
  expect(createPrediction).not.toHaveBeenCalled();
});
