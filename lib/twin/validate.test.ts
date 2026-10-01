/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any -- the manifest cases mutate raw JSON on purpose */
/**
 * What lands in the twin bucket is checked, not trusted: an uploaded object's size, declared MIME and real bytes, and a
 * manifest read back from storage (every path must be the caller's own derived path).
 */
import { fileBytes } from './testing/fakeStorage';
import { twinCapturePath } from './paths';
import { buildManifest, checkTwinObject, parseManifest, sniffMime } from './validate';
import { TWIN_LIMITS } from './types';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CAP = '0123456789abcdef';

describe('sniffMime — the first bytes, not the label', () => {
  test.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['webm', 'audio/webm'],
    ['ogg', 'audio/ogg'],
    ['m4a', 'audio/mp4'],
  ] as const)('%s → %s', (kind, mime) => {
    expect(sniffMime(fileBytes(kind, 64))).toBe(mime);
  });

  test('HTML, SVG and empty input are nothing the twin accepts', () => {
    expect(sniffMime(fileBytes('html', 64))).toBeNull();
    expect(sniffMime(fileBytes('svg', 64))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe('checkTwinObject — size, MIME and content per slot', () => {
  const photo = (over: Partial<Parameters<typeof checkTwinObject>[1]> = {}) =>
    checkTwinObject('front', { storedMime: 'image/jpeg', bytes: 200_000, head: fileBytes('jpeg', 32), expectedExt: 'jpg', ...over });

  test('a real JPEG face photo passes', () => {
    expect(photo()).toEqual({ ok: true, mime: 'image/jpeg', ext: 'jpg' });
  });

  test('size: an empty file is 400, one over the slot cap is 413', () => {
    expect(photo({ bytes: 10 })).toMatchObject({ ok: false, status: 400, reason: 'too_small' });
    expect(photo({ bytes: TWIN_LIMITS.photoMaxBytes + 1 })).toMatchObject({ ok: false, status: 413, reason: 'too_large' });
    expect(checkTwinObject('voice', { storedMime: 'audio/webm', bytes: TWIN_LIMITS.voiceMaxBytes + 1, head: fileBytes('webm', 32), expectedExt: 'webm' }))
      .toMatchObject({ ok: false, status: 413 });
  });

  test('MIME: a type the slot does not allow is 415', () => {
    expect(photo({ storedMime: 'image/svg+xml', head: fileBytes('svg', 32) })).toMatchObject({ ok: false, status: 415, reason: 'unsupported_type' });
    expect(photo({ storedMime: 'text/html', head: fileBytes('html', 32) })).toMatchObject({ ok: false, status: 415 });
    expect(photo({ storedMime: 'audio/webm', head: fileBytes('webm', 32) })).toMatchObject({ ok: false, status: 415 });
  });

  test('MIME: a type other than the one the upload was signed for is 415 (no switching after signing)', () => {
    expect(photo({ storedMime: 'image/png', head: fileBytes('png', 32) })).toMatchObject({ ok: false, status: 415, reason: 'unsupported_type' });
  });

  test('content: an HTML page (or a PNG) labelled image/jpeg is 415', () => {
    expect(photo({ head: fileBytes('html', 32) })).toMatchObject({ ok: false, status: 415, reason: 'content_mismatch' });
    expect(photo({ head: fileBytes('png', 32) })).toMatchObject({ ok: false, status: 415, reason: 'content_mismatch' });
  });

  test('voice: MediaRecorder types pass with their codec parameters; a JPEG in the voice slot does not', () => {
    expect(checkTwinObject('voice', { storedMime: 'audio/webm;codecs=opus', bytes: 90_000, head: fileBytes('webm', 32), expectedExt: 'webm' }))
      .toEqual({ ok: true, mime: 'audio/webm', ext: 'webm' });
    expect(checkTwinObject('voice', { storedMime: 'audio/mp4', bytes: 90_000, head: fileBytes('m4a', 32), expectedExt: 'm4a' }))
      .toEqual({ ok: true, mime: 'audio/mp4', ext: 'm4a' });
    expect(checkTwinObject('voice', { storedMime: 'audio/webm', bytes: 90_000, head: fileBytes('jpeg', 32), expectedExt: 'webm' }))
      .toMatchObject({ ok: false, status: 415 });
  });
});

describe('the manifest — rebuilt from storage, never trusted', () => {
  const obj = (slot: 'front' | 'left' | 'right', uid = UID, cap = CAP) => ({ path: twinCapturePath(uid, cap, slot, 'jpg'), mime: 'image/jpeg', bytes: 1234 });
  const good = () =>
    buildManifest({
      userId: UID,
      captureId: CAP,
      photos: { front: obj('front'), left: obj('left'), right: obj('right') },
      voice: { path: twinCapturePath(UID, CAP, 'voice', 'webm'), mime: 'audio/webm', bytes: 50_000 },
      voiceSeconds: 14.2,
      digits: '40917263',
      consent: { version: '2026-10-02.draft', acceptedAt: '2026-10-02T09:59:00.000Z' },
      via: 'session',
      now: new Date('2026-10-02T10:00:00.000Z'),
    });

  test('a built manifest round-trips exactly, with voice unverified and no provider copies', () => {
    const m = good();
    expect(m).toMatchObject({ voiceVerified: false, providerRefs: {}, committedAt: '2026-10-02T10:00:00.000Z' });
    expect(m.consent).toEqual({ version: '2026-10-02.draft', acceptedAt: '2026-10-02T09:59:00.000Z', recordedAt: '2026-10-02T10:00:00.000Z' });
    expect(parseManifest(JSON.parse(JSON.stringify(m)), UID)).toEqual(m);
  });

  test('a manifest of another user is not this user’s twin', () => {
    expect(parseManifest(good(), OTHER)).toBeNull();
  });

  test.each([
    ['a path in another user’s folder', (m: Record<string, any>) => { m.photos.front.path = twinCapturePath(OTHER, CAP, 'front', 'jpg'); }],
    ['a path in another capture', (m: Record<string, any>) => { m.photos.left.path = twinCapturePath(UID, 'fedcba9876543210', 'left', 'jpg'); }],
    ['a staging path', (m: Record<string, any>) => { m.photos.right.path = `twins/${UID}/staging/right.jpg`; }],
    ['traversal', (m: Record<string, any>) => { m.photos.front.path = `twins/${UID}/twin-${CAP}/../../${OTHER}/twin-${CAP}/front.jpg`; }],
    ['the voice in a photo slot', (m: Record<string, any>) => { m.photos.front.path = twinCapturePath(UID, CAP, 'voice', 'webm'); }],
    ['a voice marked verified', (m: Record<string, any>) => { m.voiceVerified = true; }],
    ['digits that are not digits', (m: Record<string, any>) => { m.digits = '12ab'; }],
    ['no voice key at all', (m: Record<string, any>) => { delete m.voice; }],
    ['a bad capture id', (m: Record<string, any>) => { m.captureId = '../staging'; }],
    ['an unknown version', (m: Record<string, any>) => { m.v = 2; }],
  ])('refuses %s', (_label, mutate) => {
    const m = JSON.parse(JSON.stringify(good())) as Record<string, any>;
    mutate(m);
    expect(parseManifest(m, UID)).toBeNull();
  });

  test('a photo-only twin (no voice) is valid', () => {
    const m = { ...good(), voice: null };
    expect(parseManifest(m, UID)).toMatchObject({ voice: null });
  });

  test('unknown fields are dropped, not carried', () => {
    const m = { ...good(), providerRefs: { heygen: 'x' }, extra: 'nope' } as unknown;
    const parsed = parseManifest(m, UID)!;
    expect(parsed.providerRefs).toEqual({});
    expect('extra' in parsed).toBe(false);
  });
});
