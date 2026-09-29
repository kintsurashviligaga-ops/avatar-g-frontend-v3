/** @jest-environment node */
/**
 * The Higgsfield webhook route: authenticate by the signed job id in the URL, reject bodies that are not the
 * documented envelope, record then apply, answer 2xx only after the durable write — and 5xx (so Higgsfield
 * retries) when the write fails.
 */
jest.mock('server-only', () => ({}));

const mockApply = jest.fn();
const mockRecord = jest.fn();
let mockRuntime: unknown = null;
jest.mock('../../../../lib/studio/runtime', () => ({ getStudioRuntime: () => mockRuntime }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: () => undefined }));

import { POST } from './route';
import { signJobId } from '../../../../lib/providers/higgsfield/webhookAuth';

const SECRET = 'a-webhook-secret-of-sufficient-length';
const JOB = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

function req(body: unknown, q: { job?: string; sig?: string | null } = {}) {
  const job = q.job ?? JOB;
  const sig = q.sig === undefined ? signJobId(job, SECRET) : q.sig;
  const url = new URL(`https://myavatar.ge/api/webhooks/higgsfield?job=${job}${sig === null ? '' : `&sig=${sig}`}`);
  return {
    nextUrl: url,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as never;
}

const COMPLETED = {
  request_id: '9417a243-e457-4075-895b-b68f3cda5303',
  status: 'completed',
  error: null,
  payload: { video: { url: 'https://cdn.higgsfield.ai/out.mp4', content_type: 'video/mp4' } },
};

beforeAll(() => { process.env.HF_WEBHOOK_SECRET = SECRET; });
beforeEach(() => {
  mockApply.mockReset().mockResolvedValue({ applied: true });
  mockRecord.mockReset().mockResolvedValue(true);
  mockRuntime = { store: { recordEvent: mockRecord }, saga: { applyEvent: mockApply } };
});

test('a valid, signed completion is recorded, then applied with the outputs from `payload`', async () => {
  const res = await POST(req(COMPLETED));
  expect(res.status).toBe(200);
  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ provider: 'higgsfield', requestId: COMPLETED.request_id, status: 'completed', jobId: JOB }));
  expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB, requestId: COMPLETED.request_id, status: 'completed', outputUrls: ['https://cdn.higgsfield.ai/out.mp4'] }));
});

test('a forged event for someone else’s job (bad / missing signature) is refused with a 4xx and never applied', async () => {
  expect((await POST(req(COMPLETED, { sig: 'forged' }))).status).toBe(401);
  expect((await POST(req(COMPLETED, { sig: null }))).status).toBe(401);
  expect((await POST(req(COMPLETED, { job: 'not-a-uuid', sig: signJobId('not-a-uuid', SECRET) }))).status).toBe(401);
  expect(mockApply).not.toHaveBeenCalled();
});

test('a body that is not the documented envelope is rejected', async () => {
  expect((await POST(req('not json'))).status).toBe(400);
  expect((await POST(req({ ...COMPLETED, status: 'done' }))).status).toBe(400);
  expect((await POST(req({ ...COMPLETED, request_id: '../x' }))).status).toBe(400);
  expect(mockApply).not.toHaveBeenCalled();
});

test('a duplicate delivery is acknowledged 2xx — and still applied (idempotently), so a half-processed first attempt is never lost', async () => {
  mockRecord.mockResolvedValue(false);
  const res = await POST(req(COMPLETED));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ duplicate: true });
  expect(mockApply).toHaveBeenCalledTimes(1);
});

test('a failed durable write answers 5xx so Higgsfield re-delivers', async () => {
  mockRecord.mockRejectedValue(new Error('db down'));
  expect((await POST(req(COMPLETED))).status).toBe(500);
  mockRecord.mockResolvedValue(true);
  mockApply.mockRejectedValue(new Error('db down'));
  expect((await POST(req(COMPLETED))).status).toBe(500);
});

test('no runtime (Supabase unconfigured) → 503, retried later', async () => {
  mockRuntime = null;
  expect((await POST(req(COMPLETED))).status).toBe(503);
});

test('failed / nsfw carry no outputs to the saga', async () => {
  await POST(req({ request_id: COMPLETED.request_id, status: 'nsfw', error: null, payload: null }));
  expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ status: 'nsfw', outputUrls: [] }));
});
