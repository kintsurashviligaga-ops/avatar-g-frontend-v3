/** @jest-environment node */
/**
 * /api/voice/clone — pinned with ElevenLabs (fetch) and Supabase mocked: no network, no spend, no DB.
 *
 *   · POST is rate-limited (EXPENSIVE), takes audio/* only and at most 10 MB (413 above), and tags every clone with
 *     its owner in the provider-side description;
 *   · DELETE calls ElevenLabs DELETE /v1/voices/{id} BEFORE the row goes — and only for a voice the provider says
 *     was cloned for THIS caller. The row's external_id is user-writable (RLS insert/update), so a row naming the
 *     platform's Georgian voice or another user's clone must never delete it.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let lookupRow: Record<string, unknown> | null = null;
let insertError: { message: string } | null = null;
let rowDeletes = 0;

function queryBuilder() {
  let op: 'select' | 'insert' | 'delete' | 'update' = 'select';
  let inserted: Record<string, unknown> | null = null;
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: jest.fn(() => b),
    insert: jest.fn((v: Record<string, unknown>) => { op = 'insert'; inserted = v; return b; }),
    delete: jest.fn(() => { op = 'delete'; rowDeletes += 1; return b; }),
    update: jest.fn(() => { op = 'update'; return b; }),
    eq: jest.fn(() => b),
    neq: jest.fn(() => b),
    order: jest.fn(async () => ({ data: [], error: null })),
    maybeSingle: jest.fn(async () => ({ data: lookupRow, error: null })),
    single: jest.fn(async () => (op === 'insert' && !insertError
      ? { data: { id: 'row-new', ...inserted }, error: null }
      : { data: null, error: insertError })),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
  });
  return b;
}

jest.mock('../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: mockUser } })) },
    from: jest.fn(() => queryBuilder()),
  })),
  createServiceRoleClient: jest.fn(() => { throw new Error('service role must not be needed in these tests'); }),
}));

jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:exp' } },
}));

jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest, NextResponse } from 'next/server';
import { POST, DELETE } from './route';
import { checkRateLimit, RATE_LIMITS } from '../../../../lib/api/rate-limit';

const rateMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

const USER_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_USER = '99999999-8888-4777-8666-555555555555';
const VOICE_ID = 'AbCdEf0123456789wxyz';
const KA_PLATFORM_VOICE = '9jZPhI8VfIo3Mx8pl6OF'; // lib/audio/georgian-voice.ts KA_VOICE_FEMALE
const EL_VOICE_URL = `https://api.elevenlabs.io/v1/voices/${VOICE_ID}`;

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER_ID };
  lookupRow = null;
  insertError = null;
  rowDeletes = 0;
  process.env.ELEVENLABS_API_KEY = 'test-el-key';
  fetchSpy = jest.spyOn(global, 'fetch');
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  fetchSpy.mockRestore();
  warnSpy.mockRestore();
  process.env = { ...ENV };
});

const calls = () => fetchSpy.mock.calls as Array<[string, RequestInit | undefined]>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// ── POST ─────────────────────────────────────────────────────────────────────

function upload(opts: { bytes?: number; type?: string; name?: string; headers?: Record<string, string> } = {}) {
  const form = new FormData();
  const data = new Uint8Array(opts.bytes ?? 4096);
  form.append('audio', new Blob([data], { type: opts.type ?? 'audio/webm;codecs=opus' }), 'sample.webm');
  form.append('name', opts.name ?? 'My voice');
  return new NextRequest('https://myavatar.ge/api/voice/clone', { method: 'POST', body: form, headers: opts.headers });
}

describe('POST', () => {
  test('an oversize upload (> 10 MB) is refused with 413 before any provider call', async () => {
    const res = await POST(upload({ bytes: 10 * 1024 * 1024 + 1 }));
    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('an honest Content-Length over the cap is refused (413) before the body is parsed', async () => {
    const req = upload({ headers: { 'content-length': String(50 * 1024 * 1024) } });
    const parse = jest.spyOn(req, 'formData');
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(parse).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each(['video/mp4', 'application/octet-stream', 'image/png', ''])(
    'a non-audio upload (%p) is refused with 415 before any provider call',
    async (type) => {
      const res = await POST(upload({ type }));
      expect(res.status).toBe(415);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  test('the EXPENSIVE rate limit applies, before auth and before any provider call', async () => {
    rateMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    const res = await POST(upload());
    expect(res.status).toBe(429);
    expect(rateMock).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.EXPENSIVE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a guest is refused (401) and nothing is cloned', async () => {
    mockUser = null;
    const res = await POST(upload());
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a 10 MB audio sample clones, tagged with its owner in the provider-side description', async () => {
    fetchSpy
      .mockResolvedValueOnce(json({ voice_id: VOICE_ID }))
      .mockResolvedValueOnce(new Response('preview off', { status: 500 }));
    const res = await POST(upload({ bytes: 10 * 1024 * 1024, name: `  ${'n'.repeat(300)}  ` }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ voiceId: VOICE_ID, sample: { external_id: VOICE_ID, user_id: USER_ID } });
    const [url, init] = calls()[0]!;
    expect(url).toBe('https://api.elevenlabs.io/v1/voices/add');
    const sent = init!.body as FormData;
    expect(String(sent.get('description'))).toContain(`myavatar-owner:${USER_ID}`);
    expect(String(sent.get('name'))).toHaveLength(100);
  });

  test('a provider rejection never echoes the provider body to the user', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"detail":"quota exceeded, upgrade at elevenlabs.io/billing"}', { status: 401 }));
    const res = await POST(upload());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/elevenlabs|quota|billing/i);
  });

  test('a failed row insert deletes the just-created provider voice (no orphan)', async () => {
    insertError = { message: 'insert failed' };
    fetchSpy
      .mockResolvedValueOnce(json({ voice_id: VOICE_ID }))
      .mockResolvedValueOnce(new Response('preview off', { status: 500 }))
      .mockResolvedValueOnce(json({ status: 'ok' }));
    const res = await POST(upload());
    expect(res.status).toBe(500);
    const del = calls().find(([, init]) => init?.method === 'DELETE');
    expect(del?.[0]).toBe(EL_VOICE_URL);
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

const del = (id = 'row-1') =>
  DELETE(new NextRequest(`https://myavatar.ge/api/voice/clone?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));

describe('DELETE', () => {
  test('calls the provider\'s delete URL for the caller\'s own voice, then removes the row', async () => {
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: VOICE_ID };
    fetchSpy
      .mockResolvedValueOnce(json({ voice_id: VOICE_ID, description: `MyAvatar voice clone · myavatar-owner:${USER_ID}` }))
      .mockResolvedValueOnce(json({ status: 'ok' }));
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 'row-1', providerDeleted: true });
    const [url, init] = calls()[1]!;
    expect(url).toBe(EL_VOICE_URL);
    expect(init!.method).toBe('DELETE');
    expect((init!.headers as Record<string, string>)['xi-api-key']).toBe('test-el-key');
    expect(rowDeletes).toBe(1);
  });

  test('a provider delete failure keeps the row (502) so the user can retry', async () => {
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: VOICE_ID };
    fetchSpy
      .mockResolvedValueOnce(json({ voice_id: VOICE_ID, description: `myavatar-owner:${USER_ID}` }))
      .mockResolvedValueOnce(new Response('upstream down', { status: 503 }));
    const res = await del();
    expect(res.status).toBe(502);
    expect(rowDeletes).toBe(0);
  });

  test('a provider lookup failure keeps the row (502) and deletes nothing at the provider', async () => {
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: VOICE_ID };
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const res = await del();
    expect(res.status).toBe(502);
    expect(calls().some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(rowDeletes).toBe(0);
  });

  test('a voice already gone at the provider (404) → the row is removed, no DELETE sent', async () => {
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: VOICE_ID };
    fetchSpy.mockResolvedValueOnce(json({ detail: { status: 'voice_not_found' } }, 404));
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 'row-1', providerDeleted: true });
    expect(calls().some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(rowDeletes).toBe(1);
  });

  test.each([
    ['the platform Georgian voice (no owner tag)', KA_PLATFORM_VOICE, 'Native Georgian speaker'],
    ['another user\'s clone', VOICE_ID, `MyAvatar voice clone · myavatar-owner:${OTHER_USER}`],
    ['a legacy clone without a tag', VOICE_ID, ''],
  ])('a row naming %s never deletes that voice — only the row goes', async (_label, externalId, description) => {
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: externalId };
    fetchSpy.mockResolvedValueOnce(json({ voice_id: externalId, description }));
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 'row-1', providerDeleted: false });
    expect(calls()).toHaveLength(1);
    expect(calls()[0]![1]?.method ?? 'GET').toBe('GET');
    expect(rowDeletes).toBe(1);
  });

  test('a malformed external_id never reaches a provider URL', async () => {
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: '../../user/subscription' };
    const res = await del();
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rowDeletes).toBe(1);
  });

  test('a row that is not the caller\'s (or does not exist) → 404, nothing deleted anywhere', async () => {
    lookupRow = null;
    const res = await del();
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rowDeletes).toBe(0);
  });

  test('a guest is refused (401)', async () => {
    mockUser = null;
    const res = await del();
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rowDeletes).toBe(0);
  });

  test('no provider key → 503 and the row is kept (it is the only pointer to the voice)', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    lookupRow = { id: 'row-1', provider: 'elevenlabs', external_id: VOICE_ID };
    const res = await del();
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rowDeletes).toBe(0);
  });
});
