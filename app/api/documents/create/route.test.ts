/** @jest-environment node */
jest.mock('server-only', () => ({}));

const getUser = jest.fn();
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: (...a: unknown[]) => getUser(...a) }));
const limited = { burst: null as unknown, daily: null as unknown };
const refund = jest.fn();
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { WRITE: {}, DOCUMENT_DAILY: { keyPrefix: 'rl:doc:user' } },
  checkRateLimit: async () => limited.burst,
  checkRateLimitByKey: async () => limited.daily,
  refundRateLimitByKey: (...a: unknown[]) => refund(...a),
}));
const compose = jest.fn();
jest.mock('../../../../lib/documents/compose', () => ({ composeDocument: (...a: unknown[]) => compose(...a) }));
const upload = jest.fn();
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadBufferAndSign: (...a: unknown[]) => upload(...a) }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const SPEC = {
  title: 'ქართული ანგარიში',
  locale: 'ka',
  sections: [{ heading: 'შესავალი', blocks: [{ type: 'paragraph', text: 'ტექსტი ქართულად.' }] }],
};

const req = (body: unknown) => new NextRequest('http://localhost/api/documents/create', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  jest.clearAllMocks();
  limited.burst = null;
  limited.daily = null;
  getUser.mockResolvedValue({ id: 'user-1' });
  compose.mockResolvedValue(SPEC);
  upload.mockResolvedValue('https://storage.example/signed.pdf');
});

describe('POST /api/documents/create', () => {
  it('refuses a signed-out caller before any model call', async () => {
    getUser.mockResolvedValue(null);
    const res = await POST(req({ prompt: 'შემიქმენი PDF' }));
    expect(res.status).toBe(401);
    expect(compose).not.toHaveBeenCalled();
  });

  it('refuses an empty prompt', async () => {
    expect((await POST(req({ prompt: ' ' }))).status).toBe(400);
    expect(compose).not.toHaveBeenCalled();
  });

  it('stops at the daily cap before any model call', async () => {
    limited.daily = new Response(null, { status: 429 });
    expect((await POST(req({ prompt: 'შემიქმენი PDF' }))).status).toBe(429);
    expect(compose).not.toHaveBeenCalled();
  });

  it('writes a real PDF to the caller\'s own folder and returns a signed link', async () => {
    const res = await POST(req({ prompt: 'შემიქმენი 1-გვერდიანი PDF', locale: 'ka' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, url: 'https://storage.example/signed.pdf', fileName: 'ქართული ანგარიში.pdf', pages: 1 });
    const [bucket, path, buf, type] = upload.mock.calls[0];
    expect(bucket).toBe('renders');
    expect(path).toMatch(/^documents\/user-1\/\d{4}-\d{2}-\d{2}-[0-9a-f-]{36}\.pdf$/);
    expect(type).toBe('application/pdf');
    expect((buf as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(refund).not.toHaveBeenCalled();
  });

  it('hands the bytes back inline when Storage refuses them', async () => {
    upload.mockResolvedValue(null);
    const body = await (await POST(req({ prompt: 'შემიქმენი PDF' }))).json();
    expect(body.url).toBeNull();
    expect(Buffer.from(body.data, 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('says so and gives the allowance back when Gemini writes no valid document', async () => {
    compose.mockResolvedValue(null);
    const res = await POST(req({ prompt: 'შემიქმენი PDF' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('not_written');
    expect(refund).toHaveBeenCalledWith('user-1', expect.anything());
    expect(upload).not.toHaveBeenCalled();
  });
});
