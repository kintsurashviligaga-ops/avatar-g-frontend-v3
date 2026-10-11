/**
 * uploadFileToStorage with the chat's options: progress from an XHR PUT to the signed URL, Stop, and the server's check
 * that the STORED bytes are the attached kind (/api/upload/verify).
 */
const mockPut = jest.fn();
jest.mock('../../../lib/supabase/browser', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => mockPut(...a) }) } }),
}));

import { uploadErrorText, uploadFileToStorage } from './useUpload';

type Call = { url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let verifyStatus = 200;
let verifyBody: Record<string, unknown> = { ok: true, format: 'mp4' };

/** A stand-in XMLHttpRequest: reports progress in two steps, then answers `status`. */
class FakeXhr {
  static status = 200;
  static sent: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  static hold = false;
  static last: FakeXhr | null = null;
  status = 0;
  timeout = 0;
  url = '';
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_m: string, url: string) { this.url = url; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(body: unknown) {
    FakeXhr.sent.push({ url: this.url, headers: this.headers, body });
    FakeXhr.last = this;
    if (FakeXhr.hold) return;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 });
    this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    this.status = FakeXhr.status;
    this.onload?.();
  }
  abort() { this.onabort?.(); }
}

const realFetch = global.fetch;
beforeEach(() => {
  calls = [];
  verifyStatus = 200;
  verifyBody = { ok: true, format: 'mp4' };
  FakeXhr.status = 200;
  FakeXhr.sent = [];
  FakeXhr.hold = false;
  mockPut.mockReset().mockResolvedValue({ error: null });
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  global.fetch = jest.fn(async (url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (String(url) === '/api/upload/verify') {
      return { status: verifyStatus, ok: verifyStatus === 200, json: async () => verifyBody } as unknown as Response;
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({ bucket: 'uploads', path: 'omni-uploads/u1/1-a.mp4', token: 'tok', signedUrl: 'https://p.supabase.co/storage/v1/object/upload/sign/uploads/omni-uploads/u1/1-a.mp4?token=tok', contentType: body.contentType }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterAll(() => { global.fetch = realFetch; });

const file = (name: string, type: string, size = 100) => {
  const f = new File([new Uint8Array(4)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

test('progress: the bytes go to the signed URL by XHR with the approved type; progress reaches 1; verify runs', async () => {
  const seen: number[] = [];
  const out = await uploadFileToStorage(file('clipA.mp4', 'video/mp4'), { onProgress: (f) => seen.push(f), verifyKind: 'video' });
  expect(out).toEqual({ path: 'omni-uploads/u1/1-a.mp4', format: 'mp4' });
  expect(seen).toEqual([0.4, 1, 1]);
  expect(FakeXhr.sent).toHaveLength(1);
  expect(FakeXhr.sent[0]!.url).toMatch(/\/object\/upload\/sign\/uploads\/omni-uploads\/u1\/1-a\.mp4\?token=tok$/);
  expect(FakeXhr.sent[0]!.headers).toMatchObject({ 'content-type': 'video/mp4', 'x-upsert': 'false' });
  expect(mockPut).not.toHaveBeenCalled();
  expect(calls.map((c) => c.url)).toEqual(['/api/upload/sign', '/api/upload/verify']);
  expect(calls[1]!.body).toEqual({ path: 'omni-uploads/u1/1-a.mp4', kind: 'video' });
});

test('stored bytes that are not the attached kind → content error, named in the text', async () => {
  verifyStatus = 422;
  verifyBody = { error: 'content_mismatch' };
  await expect(uploadFileToStorage(file('song.mp4', 'video/mp4'), { onProgress: () => {}, verifyKind: 'video' })).resolves.toEqual({ error: 'content' });
  expect(uploadErrorText('content', 'ka', 'song.mp4')).toMatch(/song\.mp4$/);
});

test('a gateway 401/403 on the XHR falls back to the supabase-js PUT with the same token', async () => {
  FakeXhr.status = 403;
  await expect(uploadFileToStorage(file('a.mp4', 'video/mp4'), { onProgress: () => {} })).resolves.toEqual({ path: 'omni-uploads/u1/1-a.mp4' });
  expect(mockPut).toHaveBeenCalledTimes(1);
  expect(mockPut.mock.calls[0]![1]).toBe('tok');
});

test('any other failed PUT is a failure, not a retry with a spent token', async () => {
  FakeXhr.status = 500;
  await expect(uploadFileToStorage(file('a.mp4', 'video/mp4'), { onProgress: () => {} })).resolves.toEqual({ error: 'fail' });
  expect(mockPut).not.toHaveBeenCalled();
  FakeXhr.status = 0;
  await expect(uploadFileToStorage(file('a.mp4', 'video/mp4'), { onProgress: () => {} })).resolves.toEqual({ error: 'fail' });
});

test('Stop: an aborted upload answers aborted and never verifies', async () => {
  FakeXhr.hold = true;
  const ac = new AbortController();
  const p = uploadFileToStorage(file('a.mp4', 'video/mp4'), { onProgress: () => {}, signal: ac.signal, verifyKind: 'video' });
  await new Promise((r) => setTimeout(r, 0));
  ac.abort();
  await expect(p).resolves.toEqual({ error: 'aborted' });
  expect(calls.map((c) => c.url)).toEqual(['/api/upload/sign']);
});

test('without options nothing changes: supabase-js PUT, no verify', async () => {
  await expect(uploadFileToStorage(file('a.mp4', 'video/mp4'))).resolves.toEqual({ path: 'omni-uploads/u1/1-a.mp4' });
  expect(FakeXhr.sent).toEqual([]);
  expect(calls.map((c) => c.url)).toEqual(['/api/upload/sign']);
});
