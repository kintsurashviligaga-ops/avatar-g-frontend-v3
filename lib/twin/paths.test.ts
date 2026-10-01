/** @jest-environment node */
/**
 * Digital Twin paths: derived from the user id (deterministic), under the same `twins/<uid>/` root as the Live-Avatar
 * voice sample, and owner-checked — another user's id, traversal, encoding and prefix tricks all fail.
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

import { LIVE_AVATAR_BUCKET, liveAvatarPath } from '../avatar/enroll';
import { TWIN_PRIVATE_BUCKET as ENROLL_TWIN_BUCKET, twinVoicePath } from '../avatar/twinStorage';
import {
  LEGACY_LIVE_AVATAR_BUCKET,
  TWIN_PRIVATE_BUCKET,
  assertOwnTwinPath,
  baseMime,
  extForSlotMime,
  handoffJtiPath,
  isOwnLegacyLiveAvatarPath,
  isOwnTwinPath,
  legacyLiveAvatarDir,
  twinCaptureDir,
  twinCapturePath,
  twinManifestPath,
  isStagingNonce,
  twinStagingDir,
  twinStagingNonceDir,
  twinStagingPath,
  twinUserPrefix,
} from './paths';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CAP = '0123456789abcdef';
const NONCE = '00112233445566778899aabbccddeeff';
const NONCE2 = 'ffeeddccbbaa99887766554433221100';

describe('deterministic paths in the private twins bucket', () => {
  test('the bucket is the dedicated private one, shared with the Live-Avatar voice writer', () => {
    expect(TWIN_PRIVATE_BUCKET).toBe('twins');
    expect(TWIN_PRIVATE_BUCKET).toBe(ENROLL_TWIN_BUCKET);
  });

  test('every path is a pure function of its inputs', () => {
    expect(twinUserPrefix(UID)).toBe(`twins/${UID}/`);
    expect(twinManifestPath(UID)).toBe(`twins/${UID}/twin.json`);
    expect(twinStagingDir(UID)).toBe(`twins/${UID}/staging`);
    expect(twinStagingNonceDir(UID, NONCE)).toBe(`twins/${UID}/staging/${NONCE}`);
    expect(twinStagingPath(UID, NONCE, 'front', 'jpg')).toBe(`twins/${UID}/staging/${NONCE}/front.jpg`);
    expect(twinStagingPath(UID, NONCE, 'voice', 'webm')).toBe(`twins/${UID}/staging/${NONCE}/voice.webm`);
    expect(twinCaptureDir(UID, CAP)).toBe(`twins/${UID}/twin-${CAP}`);
    expect(twinCapturePath(UID, CAP, 'left', 'jpg')).toBe(`twins/${UID}/twin-${CAP}/left.jpg`);
    expect(twinCapturePath(UID, CAP, 'right', 'jpg')).toBe(twinCapturePath(UID, CAP, 'right', 'jpg'));
    expect(handoffJtiPath('AbCdEfGhIjKlMnOpQrStUv')).toBe('handoff/AbCdEfGhIjKlMnOpQrStUv');
  });

  test('each capture stages in its OWN folder: two captures of one user never name the same upload target', () => {
    expect(twinStagingPath(UID, NONCE, 'front', 'jpg')).not.toBe(twinStagingPath(UID, NONCE2, 'front', 'jpg'));
    expect(twinStagingPath(UID, NONCE, 'front', 'jpg').startsWith(`${twinStagingDir(UID)}/`)).toBe(true);
  });

  test('one prefix holds everything biometric: the Live-Avatar voice sample is under it too', () => {
    expect(twinVoicePath(UID, 'webm').startsWith(twinUserPrefix(UID))).toBe(true);
    expect(isOwnTwinPath(UID, twinVoicePath(UID, 'm4a'))).toBe(true);
  });

  test('the legacy Live-Avatar folder matches the enroll writer (bucket and poster path)', () => {
    expect(LEGACY_LIVE_AVATAR_BUCKET).toBe(LIVE_AVATAR_BUCKET);
    expect(`${legacyLiveAvatarDir(UID)}/poster.jpg`).toBe(liveAvatarPath(UID));
  });

  test('anything that is not a user id, slot, allowed extension or capture id is refused, not path-joined', () => {
    for (const bad of ['', 'anonymous', '../x', `${UID}/../${OTHER}`, UID.toUpperCase() + '0']) {
      expect(() => twinUserPrefix(bad)).toThrow();
    }
    expect(() => twinStagingPath(UID, NONCE, 'front', 'webm')).toThrow(); // a photo slot never takes an audio extension
    expect(() => twinStagingPath(UID, NONCE, 'voice', 'jpg')).toThrow();
    expect(() => twinStagingPath(UID, NONCE, 'back' as never, 'jpg')).toThrow();
    expect(() => twinStagingPath(UID, NONCE, 'front', 'jpg/../../x')).toThrow();
    for (const nonce of ['', '..', 'front.jpg', NONCE.toUpperCase(), `${NONCE}/..`, NONCE.slice(1)]) {
      expect(isStagingNonce(nonce)).toBe(false);
      expect(() => twinStagingPath(UID, nonce, 'front', 'jpg')).toThrow();
    }
    expect(() => twinCaptureDir(UID, '../staging')).toThrow();
    expect(() => twinCaptureDir(UID, 'ABCDEF0123456789')).toThrow();
    for (const jti of ['', 'short', '../../twins/x', 'has space in it padding']) expect(() => handoffJtiPath(jti)).toThrow();
  });
});

describe('owner-prefix check', () => {
  test('the caller’s own objects pass', () => {
    for (const p of [twinManifestPath(UID), twinStagingPath(UID, NONCE, 'front', 'jpg'), twinCapturePath(UID, CAP, 'voice', 'm4a')]) {
      expect(isOwnTwinPath(UID, p)).toBe(true);
      expect(assertOwnTwinPath(UID, p)).toBe(p);
    }
  });

  test.each([
    ['another user', `twins/${OTHER}/twin.json`],
    ['traversal out of the prefix', `twins/${UID}/../${OTHER}/twin.json`],
    ['a dot segment', `twins/${UID}/./twin.json`],
    ['an empty segment', `twins/${UID}//twin.json`],
    ['percent-encoded traversal', `twins/${UID}/%2e%2e/${OTHER}/twin.json`],
    ['a leading slash', `/twins/${UID}/twin.json`],
    ['backslashes', `twins\\${UID}\\twin.json`],
    ['the bare prefix', `twins/${UID}/`],
    ['a longer id sharing the prefix', `twins/${UID}0/twin.json`],
    ['another bucket’s folder', `live-avatars/${UID}/poster.jpg`],
    ['a control character', `twins/${UID}/twin.json\n`],
    ['an absurd length', `twins/${UID}/${'a'.repeat(300)}`],
  ])('refuses %s', (_label, path) => {
    expect(isOwnTwinPath(UID, path)).toBe(false);
    expect(() => assertOwnTwinPath(UID, path)).toThrow(/owner prefix/);
  });

  test('ids compare exactly: an upper-cased spelling of the owner’s id is not the owner’s folder', () => {
    const owner = 'abcdef12-3456-4789-8abc-def012345678';
    expect(isOwnTwinPath(owner, `twins/${owner}/twin.json`)).toBe(true);
    expect(isOwnTwinPath(owner, `twins/${owner.toUpperCase()}/twin.json`)).toBe(false);
  });

  test('non-strings and a non-uuid owner never pass', () => {
    expect(isOwnTwinPath(UID, null)).toBe(false);
    expect(isOwnTwinPath(UID, 42)).toBe(false);
    expect(isOwnTwinPath('anonymous', 'twins/anonymous/twin.json')).toBe(false);
  });

  test('the legacy folder has its own owner check', () => {
    expect(isOwnLegacyLiveAvatarPath(UID, `live-avatars/${UID}/poster.jpg`)).toBe(true);
    expect(isOwnLegacyLiveAvatarPath(UID, `live-avatars/${OTHER}/poster.jpg`)).toBe(false);
    expect(isOwnLegacyLiveAvatarPath(UID, `live-avatars/${UID}/../${OTHER}/poster.jpg`)).toBe(false);
  });
});

describe('MIME → extension, per slot', () => {
  test('codec parameters are ignored; only the slot’s own family is allowed', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(extForSlotMime('voice', 'audio/webm;codecs=opus')).toBe('webm');
    expect(extForSlotMime('voice', 'audio/mp4')).toBe('m4a');
    expect(extForSlotMime('front', 'IMAGE/JPEG')).toBe('jpg');
    expect(extForSlotMime('front', 'image/svg+xml')).toBeNull();
    expect(extForSlotMime('front', 'text/html')).toBeNull();
    expect(extForSlotMime('front', 'audio/webm')).toBeNull();
    expect(extForSlotMime('voice', 'image/jpeg')).toBeNull();
    expect(extForSlotMime('voice', undefined)).toBeNull();
  });
});
