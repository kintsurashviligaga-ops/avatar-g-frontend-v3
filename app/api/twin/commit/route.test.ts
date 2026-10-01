/** @jest-environment node */
/**
 * POST /api/twin/commit — end to end against the storage fake: upload-url → the browser's uploads → commit. Pins the
 * consent record (version + time) and the server-issued digits in the manifest, MIME / size refusals, the copy-then-
 * validate switch, and the phone link being spent exactly once — with no public URL anywhere.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let mockFake: import('../../../../lib/twin/testing/fakeStorage').FakeStorage;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: {}, user: mockUser })),
  createServiceRoleClient: jest.fn(() => mockFake.client()),
}));

jest.mock('../../../../lib/api/rate-limit', () => {
  const realSetInterval = global.setInterval;
  global.setInterval = ((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  }) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { POST as COMMIT } from './route';
import { POST as UPLOAD_URL } from '../upload-url/route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { signHandoffToken, verifyHandoffToken } from '../../../../lib/avatar/handoff';
import { TWIN_CONSENT_VERSION } from '../../../../lib/legal/content';
import { FakeStorage, fileBytes } from '../../../../lib/twin/testing/fakeStorage';
import { __resetTwinBucketCheck } from '../../../../lib/twin/store';
import { signCaptureTicket } from '../../../../lib/twin/ticket';
import { parseManifest } from '../../../../lib/twin/validate';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SLOTS = { front: 'image/jpeg', left: 'image/jpeg', right: 'image/jpeg', voice: 'audio/webm;codecs=opus' };
const MANIFEST = `twins/${UID}/twin.json`;
const ENV = { ...process.env };
const authMock = authedClientFromRequest as jest.MockedFunction<typeof authedClientFromRequest>;
const rateMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

const req = (url: string, body: unknown) =>
  new NextRequest(`https://myavatar.ge${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

type Start = { uploads: Record<string, { path: string; token: string }>; digits: string; ticket: string };
async function start(extra: Record<string, unknown> = {}): Promise<Start> {
  const res = await UPLOAD_URL(req('/api/twin/upload-url', { slots: SLOTS, ...extra }));
  expect(res.status).toBe(200);
  return res.json() as Promise<Start>;
}

type Upload = { bytes: Uint8Array; type: string } | null;
/** What the browser does with each signed upload URL. */
function upload(s: Start, over: Partial<Record<'front' | 'left' | 'right' | 'voice', Upload>> = {}) {
  const def: Record<string, Upload> = {
    front: { bytes: fileBytes('jpeg'), type: 'image/jpeg' },
    left: { bytes: fileBytes('jpeg'), type: 'image/jpeg' },
    right: { bytes: fileBytes('jpeg'), type: 'image/jpeg' },
    voice: { bytes: fileBytes('webm', 30_000), type: 'audio/webm;codecs=opus' },
  };
  for (const [slot, u] of Object.entries(s.uploads)) {
    const v = slot in over ? over[slot as 'front'] : def[slot];
    if (v) mockFake.put('twins', u.path, v.bytes, v.type);
  }
}

const consent = (over: Record<string, unknown> = {}) => ({ version: TWIN_CONSENT_VERSION, acceptedAt: new Date(Date.now() - 60_000).toISOString(), ...over });
const commit = (body: Record<string, unknown>) => COMMIT(req('/api/twin/commit', body));
const manifest = () => {
  const o = mockFake.get('twins', MANIFEST);
  return o ? parseManifest(JSON.parse(new TextDecoder().decode(o.bytes)), UID) : null;
};
const captureFolders = () => [...new Set(mockFake.paths('twins').filter((p) => p.startsWith(`twins/${UID}/twin-`)).map((p) => p.split('/')[2]))];

beforeEach(() => {
  jest.clearAllMocks();
  mockFake = new FakeStorage();
  mockUser = { id: UID };
  __resetTwinBucketCheck();
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  process.env.AVATAR_HANDOFF_SECRET = 'test-handoff-secret';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(mockFake.callsTo('getPublicUrl')).toEqual([]);
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe('guards', () => {
  test('flag off → 404 before auth or storage', async () => {
    delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
    expect((await commit({})).status).toBe(404);
    expect(authMock).not.toHaveBeenCalled();
    expect(mockFake.calls).toEqual([]);
  });

  test('RATE_LIMITS.WRITE applies', async () => {
    rateMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    expect((await commit({})).status).toBe(429);
    expect(rateMock).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.WRITE);
  });

  test('a guest → 401', async () => {
    const s = await start();
    mockUser = null;
    expect((await commit({ ticket: s.ticket, consent: consent() })).status).toBe(401);
    expect(manifest()).toBeNull();
  });

  test('no / tampered ticket → 400; a ticket of another user → 403', async () => {
    expect((await commit({ consent: consent() })).status).toBe(400);
    const s = await start();
    expect((await commit({ ticket: `${s.ticket}x`, consent: consent() })).status).toBe(400);
    const theirs = signCaptureTicket({ u: OTHER, d: '12345678', s: { front: 'jpg', left: 'jpg', right: 'jpg' } });
    const res = await commit({ ticket: theirs, consent: consent() });
    expect(res.status).toBe(403);
    expect(mockFake.callsTo('copy')).toEqual([]);
  });

  test.each([
    ['missing', undefined],
    ['an outdated text version', { version: '2025-01-01.old' }],
    ['a time in the future', { acceptedAt: new Date(Date.now() + 3_600_000).toISOString() }],
    ['a time from yesterday', { acceptedAt: new Date(Date.now() - 86_400_000).toISOString() }],
    ['not a time', { acceptedAt: 'yesterday' }],
  ])('consent %s → 400 consent_required, nothing copied or written', async (_label, over) => {
    const s = await start();
    upload(s);
    const res = await commit({ ticket: s.ticket, consent: over === undefined ? undefined : consent(over) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'consent_required', consentVersion: TWIN_CONSENT_VERSION });
    expect(mockFake.callsTo('copy')).toEqual([]);
    expect(manifest()).toBeNull();
  });
});

describe('a committed twin', () => {
  test('records consent (version + time) and the SERVER’s digits; voice unverified, no provider copies; staging cleared', async () => {
    const s = await start();
    upload(s);
    const acceptedAt = new Date(Date.now() - 90_000).toISOString();
    const res = await commit({ ticket: s.ticket, consent: consent({ acceptedAt }), voiceSeconds: 14.24 });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const j = await res.json();
    expect(j).toEqual({ ok: true, committedAt: expect.any(String), hasVoice: true });

    const m = manifest()!;
    expect(m).not.toBeNull();
    expect(m.consent).toEqual({ version: TWIN_CONSENT_VERSION, acceptedAt, recordedAt: j.committedAt });
    expect(m.digits).toBe(s.digits);
    expect(m.voiceVerified).toBe(false);
    expect(m.providerRefs).toEqual({});
    expect(m.via).toBe('session');
    expect(m.voice).toMatchObject({ mime: 'audio/webm', seconds: 14.2 });
    for (const slot of ['front', 'left', 'right'] as const) expect(m.photos[slot].path).toBe(`twins/${UID}/twin-${m.captureId}/${slot}.jpg`);
    expect(mockFake.paths('twins').filter((p) => p.includes('/staging/'))).toEqual([]);
    const saved = mockFake.callsTo('upload').find((c) => c.path === MANIFEST)!;
    expect(saved.opts).toMatchObject({ contentType: 'application/json', upsert: true });
  });

  test('a re-capture replaces the twin: one capture folder remains, the manifest points at it', async () => {
    const first = await start();
    upload(first);
    await commit({ ticket: first.ticket, consent: consent() });
    const firstId = manifest()!.captureId;
    const second = await start();
    upload(second);
    expect((await commit({ ticket: second.ticket, consent: consent() })).status).toBe(200);
    expect(manifest()!.captureId).not.toBe(firstId);
    expect(captureFolders()).toEqual([`twin-${manifest()!.captureId}`]);
  });

  test('a photo-only capture (no voice recorded) commits with voice null', async () => {
    const s = await start();
    upload(s, { voice: null });
    const res = await commit({ ticket: s.ticket, consent: consent(), voiceSeconds: 20 });
    expect(await res.json()).toMatchObject({ ok: true, hasVoice: false });
    expect(manifest()!.voice).toBeNull();
  });
});

describe('objects are validated — MIME and size rejection', () => {
  test.each([
    ['an SVG as the front photo', 415, 'unsupported_type', { front: { bytes: fileBytes('svg'), type: 'image/svg+xml' } }],
    ['HTML labelled image/jpeg', 415, 'content_mismatch', { left: { bytes: fileBytes('html'), type: 'image/jpeg' } }],
    ['a PNG where a JPEG was signed', 415, 'unsupported_type', { right: { bytes: fileBytes('png'), type: 'image/png' } }],
    ['a 5 MB photo', 413, 'too_large', { left: { bytes: fileBytes('jpeg', 5 * 1024 * 1024), type: 'image/jpeg' } }],
    ['a JPEG as the voice', 415, 'content_mismatch', { voice: { bytes: fileBytes('jpeg', 20_000), type: 'audio/webm' } }],
    ['an empty photo', 400, 'too_small', { front: { bytes: fileBytes('jpeg', 100), type: 'image/jpeg' } }],
  ])('%s → %i %s, no manifest, nothing kept', async (_label, status, error, over) => {
    const s = await start();
    upload(s, over as never);
    const res = await commit({ ticket: s.ticket, consent: consent() });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error });
    expect(manifest()).toBeNull();
    expect(mockFake.paths('twins')).toEqual([]);
  });

  test('a missing photo → 400 missing_photo', async () => {
    const s = await start();
    upload(s, { right: null });
    expect(await (await commit({ ticket: s.ticket, consent: consent() })).json()).toEqual({ error: 'missing_photo', slot: 'right' });
  });
});

describe('the phone link is spent exactly once', () => {
  test('commit with the link → the link’s user, via handoff; the same link cannot commit again', async () => {
    mockUser = null; // the phone has no session
    const token = signHandoffToken(UID)!;
    const s = await start({ handoffToken: token });
    upload(s);
    const ok = await commit({ ticket: s.ticket, consent: consent(), handoffToken: token });
    expect(ok.status).toBe(200);
    expect(manifest()!.via).toBe('handoff');
    const firstId = manifest()!.captureId;

    // Replayed: the link is spent, so it cannot even sign new uploads — nor commit a capture staged another way.
    expect((await UPLOAD_URL(req('/api/twin/upload-url', { slots: SLOTS, handoffToken: token }))).status).toBe(401);
    mockUser = { id: UID };
    const again = await start();
    upload(again);
    const res = await commit({ ticket: again.ticket, consent: consent(), handoffToken: token });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'link_already_used' });
    expect(manifest()!.captureId).toBe(firstId);
  });

  test('a link spent between upload-url and commit (another phone won) → 401, and this capture’s copy is discarded', async () => {
    mockUser = null;
    const token = signHandoffToken(UID)!;
    const s = await start({ handoffToken: token });
    upload(s);
    // The other phone's commit claims the link first — after this request already passed the "unused" check.
    const realClient = mockFake.client.bind(mockFake);
    let lists = 0;
    mockFake.client = () => {
      const c = realClient();
      const from = c.storage.from;
      c.storage.from = (bucket: string) => {
        const api = from(bucket);
        const list = api.list;
        api.list = async (dir, opts) => {
          if (dir === 'handoff' && ++lists === 1) {
            const r = await list(dir, opts);
            mockFake.put('twins', `handoff/${verifyHandoffToken(token)!.jti}`, '1', 'text/plain');
            return r;
          }
          return list(dir, opts);
        };
        return api;
      };
      return c;
    };
    const res = await commit({ ticket: s.ticket, consent: consent(), handoffToken: token });
    expect(res.status).toBe(401);
    expect(manifest()).toBeNull();
    expect(captureFolders()).toEqual([]);
  });
});

describe('storage trouble never half-commits', () => {
  test('the manifest write fails → 503, the copy is dropped, and the SAME link can be retried', async () => {
    mockUser = null;
    const token = signHandoffToken(UID)!;
    const s = await start({ handoffToken: token });
    upload(s);
    mockFake.failNext('upload', 'boom', { pathIncludes: 'twin.json' });
    const res = await commit({ ticket: s.ticket, consent: consent(), handoffToken: token });
    expect(res.status).toBe(503);
    expect(manifest()).toBeNull();
    expect(captureFolders()).toEqual([]);
    // The link was given back: the retry (staging is still there) succeeds.
    expect((await commit({ ticket: s.ticket, consent: consent(), handoffToken: token })).status).toBe(200);
    expect(manifest()!.via).toBe('handoff');
  });

  test('a write that LANDED despite the error is kept (never delete the capture a manifest points at)', async () => {
    const s = await start();
    upload(s);
    mockFake.failNext('upload', 'lost response', { pathIncludes: 'twin.json', landed: true });
    const res = await commit({ ticket: s.ticket, consent: consent() });
    expect(res.status).toBe(200);
    const m = manifest()!;
    expect(mockFake.get('twins', m.photos.front.path)).toBeDefined();
  });

  test('storage down while promoting → 503, nothing switched', async () => {
    const s = await start();
    upload(s);
    mockFake.failNext('copy', 'boom');
    expect((await commit({ ticket: s.ticket, consent: consent() })).status).toBe(503);
    expect(manifest()).toBeNull();
    expect(captureFolders()).toEqual([]);
  });
});
