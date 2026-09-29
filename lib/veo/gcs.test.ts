/** @jest-environment node */
/**
 * gcs.ts against a mocked @google-cloud/storage, mocked google-auth-library / @vercel/oidc (via the real vertexAuth)
 * and a scripted global fetch — no network. Rules under test (docs/VEO_ENGINE.md §5): gs:// parsing, the output
 * prefix shape, input upload (data:/bytes/https/gcs, SSRF guard on every hop, 15 s deadline, 20 MB cap,
 * JPEG|PNG by magic bytes), V4 signed read URLs with a clamped ttl, and sanitised errors.
 */
jest.mock('server-only', () => ({}));

jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }));

jest.mock('google-auth-library', () => {
  class JWT {
    opts: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
    }
  }
  class GoogleAuth {
    opts: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
    }
  }
  return { JWT, GoogleAuth, ExternalAccountClient: { fromJSON: jest.fn(() => ({ kind: 'external' })) } };
});

const mockSave = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockFile = jest.fn();
const mockBucket = jest.fn();
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
}));

import { Storage } from '@google-cloud/storage';
import { GoogleAuth, JWT } from 'google-auth-library';
import { __resetVertexAuthForTests } from './vertexAuth';
import {
  SIGNED_URL_MAX_TTL_SEC,
  SIGNED_URL_MIN_TTL_SEC,
  VEO_INPUT_FETCH_TIMEOUT_MS,
  VEO_INPUT_MAX_BYTES,
  VeoGcsError,
  clampSignedUrlTtl,
  parseGsUri,
  signedReadUrl,
  toGsUri,
  uploadVeoInput,
  veoOutputPrefix,
} from './gcs';

const StorageMock = Storage as unknown as jest.Mock;

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────────

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 7)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(16)]);
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n';
const SA_EMAIL = 'veo-runner@my-proj.iam.gserviceaccount.com';
const keyB64 = (pk = PEM) =>
  Buffer.from(JSON.stringify({ type: 'service_account', private_key: pk, client_email: SA_EMAIL })).toString('base64');
const CONFIGURED = { GCP_PROJECT_ID: 'my-proj', GCP_VEO_BUCKET: 'gs://my-bucket/veo-in', GCP_SERVICE_ACCOUNT_KEY: keyB64() };

const ENV_NAMES = [
  'GCP_PROJECT_ID', 'GCP_VEO_LOCATION', 'GCP_VEO_BUCKET', 'GCP_SERVICE_ACCOUNT_KEY',
  'GCP_PROJECT_NUMBER', 'GCP_SERVICE_ACCOUNT_EMAIL', 'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
] as const;
const savedEnv: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();

function setEnv(vars: Record<string, string>) {
  for (const n of ENV_NAMES) delete process.env[n];
  Object.assign(process.env, vars);
}

beforeAll(() => {
  for (const n of ENV_NAMES) savedEnv[n] = process.env[n];
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  for (const n of ENV_NAMES) {
    if (savedEnv[n] === undefined) delete process.env[n]; else process.env[n] = savedEnv[n];
  }
  global.fetch = realFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  __resetVertexAuthForTests();
  setEnv(CONFIGURED);
  mockBucket.mockImplementation(() => ({ file: mockFile }));
  mockFile.mockImplementation(() => ({ save: mockSave, getSignedUrl: mockGetSignedUrl }));
  mockSave.mockResolvedValue(undefined);
  mockGetSignedUrl.mockResolvedValue(['https://storage.googleapis.com/my-bucket/o.mp4?X-Goog-Signature=abc']);
});

afterEach(() => {
  jest.restoreAllMocks(); // spies only (Jest 30) — the module mocks keep their implementations
  fetchMock.mockReset();
});

const imageResponse = (bytes: Buffer, contentType: string | null = 'image/png', extra: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { ...(contentType ? { 'content-type': contentType } : {}), ...extra } });
const redirect = (location: string | null, status = 302) =>
  new Response(null, { status, headers: location ? { location } : {} });

async function rejection(p: Promise<unknown>): Promise<VeoGcsError> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(VeoGcsError);
  return err as VeoGcsError;
}

const lastSave = () => {
  const call = mockSave.mock.calls[mockSave.mock.calls.length - 1];
  return { bytes: call?.[0] as Buffer, opts: call?.[1] as Record<string, unknown> };
};
const lastObjectPath = () => mockFile.mock.calls[mockFile.mock.calls.length - 1]?.[0] as string;

// ── gs:// URIs ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('parseGsUri / toGsUri', () => {
  it('splits bucket and object path', () => {
    expect(parseGsUri('gs://my-bucket/veo/s/1-ab/sample_0.mp4')).toEqual({ bucket: 'my-bucket', path: 'veo/s/1-ab/sample_0.mp4' });
    expect(parseGsUri('gs://my-bucket')).toEqual({ bucket: 'my-bucket', path: '' });
    expect(parseGsUri('gs://my-bucket/')).toEqual({ bucket: 'my-bucket', path: '' });
    expect(parseGsUri('  gs://my-bucket/a  ')).toEqual({ bucket: 'my-bucket', path: 'a' });
  });

  it.each([['https://storage.googleapis.com/b/o'], ['gs://'], ['gs:///o'], ['gs://Upper/o'], ['gs://my-bucket/a\nb'], ['s3://b/o'], ['']])(
    'returns null for %p', (uri) => {
      expect(parseGsUri(uri)).toBeNull();
    });

  it('returns null for a non-string at runtime', () => {
    expect(parseGsUri(undefined as unknown as string)).toBeNull();
  });

  it('builds URIs, dropping leading slashes and keeping a trailing one', () => {
    expect(toGsUri('my-bucket', 'a/b.png')).toBe('gs://my-bucket/a/b.png');
    expect(toGsUri('my-bucket', '//a/b.png')).toBe('gs://my-bucket/a/b.png');
    expect(toGsUri('my-bucket', 'veo/x/')).toBe('gs://my-bucket/veo/x/');
    expect(parseGsUri(toGsUri('my-bucket', 'a/b.png'))).toEqual({ bucket: 'my-bucket', path: 'a/b.png' });
  });

  it('refuses an invalid bucket name', () => {
    expect(() => toGsUri('Not A Bucket', 'x')).toThrow(VeoGcsError);
  });
});

// ── output prefix ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('veoOutputPrefix', () => {
  it('is gs://BUCKET/[prefix/]veo/{session}/{ordinal}-{rand}/', () => {
    expect(veoOutputPrefix('sess-1', 3)).toMatch(/^gs:\/\/my-bucket\/veo-in\/veo\/sess-1\/3-[0-9a-f]{8}\/$/);
  });

  it('omits the prefix segment for a bare bucket', () => {
    setEnv({ ...CONFIGURED, GCP_VEO_BUCKET: 'my-bucket' });
    expect(veoOutputPrefix('s', 0)).toMatch(/^gs:\/\/my-bucket\/veo\/s\/0-[0-9a-f]{8}\/$/);
  });

  it('gets a fresh random suffix every time (a re-render never reuses an old prefix)', () => {
    const seen = new Set(Array.from({ length: 20 }, () => veoOutputPrefix('s', 1)));
    expect(seen.size).toBe(20);
  });

  it('sanitises the session to one [A-Za-z0-9_-] segment', () => {
    expect(veoOutputPrefix('user/../x y?z', 1)).toMatch(/\/veo\/user_x_y_z\/1-/);
    expect(veoOutputPrefix('///', 1)).toMatch(/\/veo\/session\/1-/);
    expect(veoOutputPrefix('', 1)).toMatch(/\/veo\/session\/1-/);
    expect(veoOutputPrefix('ქართული-id', 1)).toMatch(/\/veo\/id\/1-/);
    const long = veoOutputPrefix('a'.repeat(300), 1);
    expect(long).toMatch(new RegExp(`/veo/${'a'.repeat(64)}/1-`));
  });

  it('coerces the ordinal to a non-negative integer', () => {
    expect(veoOutputPrefix('s', 2.7)).toMatch(/\/s\/2-/);
    expect(veoOutputPrefix('s', -1)).toMatch(/\/s\/0-/);
    expect(veoOutputPrefix('s', Number.NaN)).toMatch(/\/s\/0-/);
  });

  it('throws not_configured without a Vertex config', () => {
    setEnv({});
    expect(() => veoOutputPrefix('s', 1)).toThrow(expect.objectContaining({ code: 'not_configured' }));
  });
});

// ── uploads: data URLs and bytes ──────────────────────────────────────────────────────────────────────────────────

describe('uploadVeoInput — data URLs and bytes', () => {
  it('uploads a PNG data URL to <bucket>/<prefix>/inputs/<session>/<uuid>.png with its contentType', async () => {
    const out = await uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 'sess-1' });
    expect(mockBucket).toHaveBeenCalledWith('my-bucket');
    const path = lastObjectPath();
    expect(path).toMatch(/^veo-in\/inputs\/sess-1\/[0-9a-f-]{36}\.png$/);
    const { bytes, opts } = lastSave();
    expect(Buffer.compare(bytes, PNG)).toBe(0);
    expect(opts).toMatchObject({ contentType: 'image/png', resumable: false, preconditionOpts: { ifGenerationMatch: 0 } });
    expect(out).toEqual({ kind: 'gcs', uri: `gs://my-bucket/${path}`, mimeType: 'image/png' });
  });

  it('uploads bytes media as .jpg / image/jpeg, whatever non-canonical type was declared', async () => {
    const out = await uploadVeoInput({ kind: 'bytes', base64: JPEG.toString('base64'), mimeType: 'image/jpg' }, { sessionId: 's' });
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.uri).toMatch(/\/inputs\/s\/[0-9a-f-]{36}\.jpg$/);
    expect(lastSave().opts.contentType).toBe('image/jpeg');
  });

  it('trusts the magic bytes over the declared type', async () => {
    const out = await uploadVeoInput(dataUrl('image/jpeg', PNG), { sessionId: 's' });
    expect(out.mimeType).toBe('image/png');
    expect(lastSave().opts.contentType).toBe('image/png');
  });

  it('uses a fresh object name per upload and never overwrites (ifGenerationMatch: 0)', async () => {
    await uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 's' });
    const a = lastObjectPath();
    await uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 's' });
    expect(lastObjectPath()).not.toBe(a);
  });

  it('writes directly under inputs/ when the bucket has no prefix', async () => {
    setEnv({ ...CONFIGURED, GCP_VEO_BUCKET: 'gs://my-bucket' });
    const out = await uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 'x/y' });
    expect(out.uri).toMatch(/^gs:\/\/my-bucket\/inputs\/x_y\/[0-9a-f-]{36}\.png$/);
  });

  it.each([
    ['image/webp', WEBP, 'image/webp'],
    ['image/gif', GIF, 'image/gif'],
    ['image/heic', HEIC, 'image/heic'],
    ['image/png', Buffer.from('<html>not an image</html>'), 'unrecognised bytes (declared image/png)'],
  ])('rejects %s input with a clear unsupported_type error', async (declared, bytes, label) => {
    const err = await rejection(uploadVeoInput(dataUrl(declared, bytes), { sessionId: 's' }));
    expect(err.code).toBe('unsupported_type');
    expect(err.message).toContain(label);
    expect(err.message).toContain('JPEG or PNG');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('rejects a non-base64 or malformed data URL', async () => {
    expect((await rejection(uploadVeoInput('data:image/png,%89PNG', { sessionId: 's' }))).code).toBe('invalid_input');
    expect((await rejection(uploadVeoInput('data:image/png;base64', { sessionId: 's' }))).code).toBe('invalid_input');
  });

  it('rejects an empty payload', async () => {
    expect((await rejection(uploadVeoInput('data:image/png;base64,', { sessionId: 's' }))).code).toBe('invalid_input');
  });

  it('rejects an oversized base64 payload before decoding it', async () => {
    const huge = 'A'.repeat(Math.ceil((VEO_INPUT_MAX_BYTES * 4) / 3 * 1.1));
    const from = jest.spyOn(Buffer, 'from');
    const err = await rejection(uploadVeoInput({ kind: 'bytes', base64: huge, mimeType: 'image/png' }, { sessionId: 's' }));
    expect(err.code).toBe('too_large');
    expect(from).not.toHaveBeenCalledWith(huge, 'base64');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('rejects a decoded image one byte over 20 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(VEO_INPUT_MAX_BYTES + 1 - PNG.length)]);
    const err = await rejection(uploadVeoInput({ kind: 'bytes', base64: big.toString('base64'), mimeType: 'image/png' }, { sessionId: 's' }));
    expect(err.code).toBe('too_large');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('accepts an image of exactly 20 MB', async () => {
    const atCap = Buffer.concat([PNG, Buffer.alloc(VEO_INPUT_MAX_BYTES - PNG.length)]);
    await expect(uploadVeoInput({ kind: 'bytes', base64: atCap.toString('base64'), mimeType: 'image/png' }, { sessionId: 's' }))
      .resolves.toMatchObject({ kind: 'gcs', mimeType: 'image/png' });
  });

  it('checks the configuration before doing any work', async () => {
    setEnv({});
    const err = await rejection(uploadVeoInput({ kind: 'url', url: 'https://cdn.example.com/a.png' }, { sessionId: 's' }));
    expect(err.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── uploads: gcs pass-through and string forms ────────────────────────────────────────────────────────────────────

describe('uploadVeoInput — pass-through and input forms', () => {
  it("passes a { kind: 'gcs' } input through untouched — no fetch, no Storage, no config needed", async () => {
    setEnv({});
    const media = { kind: 'gcs' as const, uri: 'gs://other-bucket/frames/a.png', mimeType: 'image/png' };
    await expect(uploadVeoInput(media, { sessionId: 's' })).resolves.toEqual(media);
    expect(StorageMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a gcs input that is not an object URI', async () => {
    for (const uri of ['gs://my-bucket', 'gs://my-bucket/dir/', 'https://x/y.png']) {
      const err = await rejection(uploadVeoInput({ kind: 'gcs', uri, mimeType: 'image/png' }, { sessionId: 's' }));
      expect(err.code).toBe('invalid_input');
    }
  });

  it('rejects string forms other than data: and https', async () => {
    for (const s of ['gs://my-bucket/a.png', 'http://cdn.example.com/a.png', 'ftp://x/a.png', 'just text']) {
      expect((await rejection(uploadVeoInput(s, { sessionId: 's' }))).code).toBe('invalid_input');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodes a data: URL inside { kind: 'url' } locally (as the Gemini path does) instead of refusing it", async () => {
    const out = await uploadVeoInput({ kind: 'url', url: ` ${dataUrl('image/png', PNG)}` }, { sessionId: 's' });
    expect(out).toMatchObject({ kind: 'gcs', mimeType: 'image/png' });
    expect(Buffer.compare(lastSave().bytes, PNG)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await rejection(uploadVeoInput({ kind: 'url', url: 'data:image/png,%89PNG' }, { sessionId: 's' }))).code).toBe('invalid_input');
  });

  it('treats an https string as a URL input', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(PNG));
    const out = await uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' });
    expect(out.mimeType).toBe('image/png');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cdn.example.com/a.png');
  });
});

// ── uploads: https fetch ──────────────────────────────────────────────────────────────────────────────────────────

describe('uploadVeoInput — https fetch', () => {
  it('fetches with manual redirects under one 15 s deadline, then uploads', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValueOnce(imageResponse(JPEG, 'image/jpeg'));
    const out = await uploadVeoInput({ kind: 'url', url: 'https://cdn.example.com/a.jpg' }, { sessionId: 's' });
    expect(timeout).toHaveBeenCalledWith(VEO_INPUT_FETCH_TIMEOUT_MS);
    expect(VEO_INPUT_FETCH_TIMEOUT_MS).toBe(15_000);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(out).toMatchObject({ kind: 'gcs', mimeType: 'image/jpeg' });
    expect(Buffer.compare(lastSave().bytes, JPEG)).toBe(0);
  });

  it.each([
    ['https://169.254.169.254/computeMetadata/v1/'],
    ['https://127.0.0.1/a.png'],
    ['https://10.0.0.5/a.png'],
    ['https://localhost/a.png'],
    ['https://[::1]/a.png'],
    ['http://cdn.example.com/a.png'],
    ['file:///etc/passwd'],
  ])('refuses %s without fetching', async (url) => {
    const err = await rejection(uploadVeoInput({ kind: 'url', url }, { sessionId: 's' }));
    expect(err.code).toBe('blocked_url');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-vets every redirect hop — a public host 302-ing to the metadata server is refused', async () => {
    fetchMock.mockResolvedValueOnce(redirect('https://169.254.169.254/computeMetadata/v1/'));
    const err = await rejection(uploadVeoInput({ kind: 'url', url: 'https://cdn.example.com/a.png' }, { sessionId: 's' }));
    expect(err.code).toBe('blocked_url');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect that downgrades to http', async () => {
    fetchMock.mockResolvedValueOnce(redirect('http://cdn.example.com/a.png'));
    expect((await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }))).code).toBe('blocked_url');
  });

  it('follows public redirects, resolving a relative Location', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://img.example.org/b.png', 301))
      .mockResolvedValueOnce(redirect('/c.png', 307))
      .mockResolvedValueOnce(imageResponse(PNG));
    await expect(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' })).resolves.toMatchObject({ mimeType: 'image/png' });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://cdn.example.com/a.png',
      'https://img.example.org/b.png',
      'https://img.example.org/c.png',
    ]);
  });

  it('gives up after 3 redirects', async () => {
    fetchMock.mockImplementation(async () => redirect('https://cdn.example.com/loop.png'));
    const err = await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }));
    expect(err.code).toBe('fetch_failed');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('fails a 3xx without a Location', async () => {
    fetchMock.mockResolvedValueOnce(redirect(null));
    expect(await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }))).toMatchObject({ code: 'fetch_failed', status: 302 });
  });

  it('reports a non-2xx with its status — and never echoes the (possibly signed) URL', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    const err = await rejection(uploadVeoInput('https://cdn.example.com/a.png?token=SECRET123', { sessionId: 's' }));
    expect(err).toMatchObject({ code: 'fetch_failed', status: 404 });
    expect(err.message).not.toMatch(/SECRET123|cdn\.example\.com/);
  });

  it.each([['text/html; charset=utf-8', 'text/html'], ['image/webp', 'image/webp'], ['image/svg+xml', 'image/svg+xml'], ['video/mp4', 'video/mp4']])(
    'refuses a %s response before downloading it', async (ct, label) => {
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>(
        { pull(c) { pulls += 1; c.enqueue(new Uint8Array(PNG)); c.close(); } },
        { highWaterMark: 0 }, // no eager pull: any pull means the body was read
      );
      fetchMock.mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'content-type': ct } }));
      const err = await rejection(uploadVeoInput('https://cdn.example.com/a', { sessionId: 's' }));
      expect(err.code).toBe('unsupported_type');
      expect(err.message).toContain(label);
      expect(pulls).toBe(0);
      expect(mockSave).not.toHaveBeenCalled();
    });

  it('judges octet-stream, missing and non-canonical types by the bytes', async () => {
    fetchMock
      .mockResolvedValueOnce(imageResponse(PNG, 'application/octet-stream'))
      .mockResolvedValueOnce(imageResponse(JPEG, null))
      .mockResolvedValueOnce(imageResponse(JPEG, 'image/jpg'));
    await expect(uploadVeoInput('https://cdn.example.com/1', { sessionId: 's' })).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(uploadVeoInput('https://cdn.example.com/2', { sessionId: 's' })).resolves.toMatchObject({ mimeType: 'image/jpeg' });
    await expect(uploadVeoInput('https://cdn.example.com/3', { sessionId: 's' })).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('rejects a WebP served as image/jpeg (the bytes decide)', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(WEBP, 'image/jpeg'));
    const err = await rejection(uploadVeoInput('https://cdn.example.com/a.jpg', { sessionId: 's' }));
    expect(err.code).toBe('unsupported_type');
    expect(err.message).toContain('image/webp');
  });

  it('rejects an honest Content-Length over 20 MB without reading the body', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(PNG, 'image/png', { 'content-length': String(VEO_INPUT_MAX_BYTES + 1) }));
    expect((await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }))).code).toBe('too_large');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('aborts a streamed body the moment it passes 20 MB (no Content-Length)', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 0) controller.enqueue(new Uint8Array(PNG));
        controller.enqueue(chunk);
        sent += 1;
        if (sent > 40) controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'content-type': 'image/png' } }));
    expect((await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }))).code).toBe('too_large');
    expect(sent).toBeLessThanOrEqual(22);
  });

  it('maps a timeout and a network failure to fetch_failed', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    const timedOut = await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }));
    expect(timedOut).toMatchObject({ code: 'fetch_failed', message: expect.stringContaining('timed out') });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const network = await rejection(uploadVeoInput('https://cdn.example.com/a.png', { sessionId: 's' }));
    expect(network).toMatchObject({ code: 'fetch_failed', message: expect.stringContaining('network') });
  });
});

// ── Storage client ────────────────────────────────────────────────────────────────────────────────────────────────

describe('the Storage client', () => {
  it('is built with the project id and the GoogleAuth from vertexAuth (wrapping the JWT)', async () => {
    await uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 's' });
    expect(StorageMock).toHaveBeenCalledTimes(1);
    const opts = StorageMock.mock.calls[0]?.[0] as { projectId: string; authClient: { opts: { authClient: unknown } }; retryOptions: unknown };
    expect(opts.projectId).toBe('my-proj');
    expect(opts.authClient).toBeInstanceOf(GoogleAuth);
    expect(opts.authClient.opts.authClient).toBeInstanceOf(JWT);
    expect(opts.retryOptions).toMatchObject({ autoRetry: true, totalTimeout: 60 });
  });

  it('is reused while the Vertex identity is unchanged and rebuilt when it changes', async () => {
    await uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 's' });
    await signedReadUrl('gs://my-bucket/o.mp4');
    expect(StorageMock).toHaveBeenCalledTimes(1);
    process.env.GCP_SERVICE_ACCOUNT_KEY = keyB64(PEM.replace('MIIEvQ', 'MIIEvR'));
    await signedReadUrl('gs://my-bucket/o.mp4');
    expect(StorageMock).toHaveBeenCalledTimes(2);
  });

  it('sanitises a failed upload: status kept, upload URL query and tokens dropped', async () => {
    mockSave.mockRejectedValueOnce(Object.assign(
      new Error('Forbidden https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o?uploadType=multipart&upload_id=SECRET_UPLOAD ya29.tok'),
      { code: 403 },
    ));
    const err = await rejection(uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 's' }));
    expect(err).toMatchObject({ code: 'storage_failed', status: 403 });
    expect(err.message).toContain('HTTP 403');
    expect(err.message).not.toMatch(/SECRET_UPLOAD|ya29\.tok/);
  });

  it('reports the precondition failure of an existing object as storage_failed 412', async () => {
    mockSave.mockRejectedValueOnce(Object.assign(new Error('Precondition Failed'), { code: 412 }));
    expect(await rejection(uploadVeoInput(dataUrl('image/png', PNG), { sessionId: 's' }))).toMatchObject({ code: 'storage_failed', status: 412 });
  });
});

// ── signed URLs ───────────────────────────────────────────────────────────────────────────────────────────────────

describe('signedReadUrl', () => {
  const NOW = 1_790_000_000_000;
  beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(NOW); });

  it('signs a V4 read URL for the object, 1 h by default', async () => {
    await expect(signedReadUrl('gs://my-bucket/veo/s/1-ab/sample_0.mp4')).resolves.toBe(
      'https://storage.googleapis.com/my-bucket/o.mp4?X-Goog-Signature=abc',
    );
    expect(mockBucket).toHaveBeenCalledWith('my-bucket');
    expect(mockFile).toHaveBeenCalledWith('veo/s/1-ab/sample_0.mp4');
    expect(mockGetSignedUrl).toHaveBeenCalledWith({ version: 'v4', action: 'read', expires: NOW + 3600 * 1000 });
  });

  it.each([
    [10, SIGNED_URL_MIN_TTL_SEC],
    [60, 60],
    [7200.9, 7200],
    [10_000_000, SIGNED_URL_MAX_TTL_SEC],
    [Number.NaN, 3600],
    [Number.POSITIVE_INFINITY, 3600],
    [-5, SIGNED_URL_MIN_TTL_SEC],
  ])('clamps ttl %p → %p s', async (ttl, expected) => {
    await signedReadUrl('gs://my-bucket/o.mp4', ttl);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ expires: NOW + expected * 1000 }));
    expect(clampSignedUrlTtl(ttl)).toBe(expected);
  });

  it('caps at the V4 maximum of 7 days', () => {
    expect(SIGNED_URL_MAX_TTL_SEC).toBe(7 * 24 * 3600);
  });

  it('needs an object URI', async () => {
    for (const uri of ['gs://my-bucket', 'gs://my-bucket/dir/', 'https://x/y.mp4', 'nonsense']) {
      expect((await rejection(signedReadUrl(uri))).code).toBe('invalid_input');
    }
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('throws not_configured without a Vertex config', async () => {
    setEnv({});
    expect((await rejection(signedReadUrl('gs://my-bucket/o.mp4'))).code).toBe('not_configured');
  });

  it('sanitises a signing failure (e.g. signBlob denied under WIF)', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(Object.assign(
      new Error("Permission 'iam.serviceAccounts.signBlob' denied; token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln"),
      { code: 403 },
    ));
    const err = await rejection(signedReadUrl('gs://my-bucket/o.mp4'));
    expect(err).toMatchObject({ code: 'storage_failed', status: 403 });
    expect(err.message).toContain('signBlob');
    expect(err.message).not.toContain('eyJzdWIi');
  });

  it('works under WIF too (Storage gets the GoogleAuth wrapping the external-account client)', async () => {
    setEnv({
      GCP_PROJECT_ID: 'my-proj', GCP_VEO_BUCKET: 'gs://my-bucket',
      GCP_PROJECT_NUMBER: '123', GCP_SERVICE_ACCOUNT_EMAIL: SA_EMAIL,
      GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
    });
    await signedReadUrl('gs://my-bucket/o.mp4');
    const opts = StorageMock.mock.calls[0]?.[0] as { authClient: { opts: { authClient: { kind?: string } } } };
    expect(opts.authClient.opts.authClient.kind).toBe('external');
  });
});
