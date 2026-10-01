/** @jest-environment node */
/**
 * The capture ticket binds what the server decided at upload-url time — whose capture, its staging nonce, which slot
 * types, which digits, when consent was recorded, which phone link started it — so the commit can neither be pointed
 * elsewhere nor record digits (or a consent time) the client chose.
 */
jest.mock('server-only', () => ({}));

import {
  CAPTURE_TICKET_TTL_MS,
  captureTicketsReady,
  newCaptureDigits,
  newStagingNonce,
  signCaptureTicket,
  verifyCaptureTicket,
} from './ticket';

const UID = '11111111-2222-4333-8444-555555555555';
const SLOTS = { front: 'jpg', left: 'jpg', right: 'jpg', voice: 'webm' };
const N = '00112233445566778899aabbccddeeff';
const JTI = 'AbCdEfGhIjKlMnOpQrStUv';
const saved = { secret: process.env.AVATAR_HANDOFF_SECRET, service: process.env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  process.env.AVATAR_HANDOFF_SECRET = 'test-handoff-secret';
});
afterEach(() => {
  if (saved.secret === undefined) delete process.env.AVATAR_HANDOFF_SECRET;
  else process.env.AVATAR_HANDOFF_SECRET = saved.secret;
  if (saved.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
});

test('round-trip: the ticket carries the user, the nonce, the slot types, the digits and the SERVER consent time', () => {
  const t = signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS }, 1_000)!;
  expect(verifyCaptureTicket(t, 2_000)).toEqual({ v: 2, u: UID, n: N, d: '40917263', s: SLOTS, c: 1_000, iat: 1_000, exp: 1_000 + CAPTURE_TICKET_TTL_MS });
});

test('a phone capture carries the jti of the link that started it', () => {
  const t = signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS, j: JTI }, 1_000)!;
  expect(verifyCaptureTicket(t, 2_000)).toMatchObject({ j: JTI });
  expect(signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS, j: '../x' })).toBeNull();
});

test('the consent time cannot be chosen by the client: it is the signing clock, under the MAC', () => {
  const t = signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS }, 5_000)!;
  const [p, payload, sig] = t.split('.');
  const earlier = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), c: 1 })).toString('base64url');
  expect(verifyCaptureTicket(`${p}.${earlier}.${sig}`)).toBeNull();
  expect(verifyCaptureTicket(t, 6_000)!.c).toBe(5_000);
});

test('the staging nonce is fresh per capture and well-formed; a ticket without one is never signed', () => {
  const a = newStagingNonce();
  expect(a).toMatch(/^[0-9a-f]{32}$/);
  expect(newStagingNonce()).not.toBe(a);
  expect(signCaptureTicket({ u: UID, n: '../staging', d: '40917263', s: SLOTS })).toBeNull();
  expect(signCaptureTicket({ u: UID, d: '40917263', s: SLOTS } as never)).toBeNull();
});

test('a tampered payload or signature does not verify', () => {
  const t = signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS })!;
  const [p, payload, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), d: '11111111' })).toString('base64url');
  expect(verifyCaptureTicket(`${p}.${forged}.${sig}`)).toBeNull();
  expect(verifyCaptureTicket(`${p}.${payload}.${sig!.slice(0, -2)}xx`)).toBeNull();
  expect(verifyCaptureTicket('tw2.e30.abc')).toBeNull();
  expect(verifyCaptureTicket(null)).toBeNull();
});

test('it expires with the signed upload URLs it commits (2 h)', () => {
  const t = signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS }, 0)!;
  expect(verifyCaptureTicket(t, CAPTURE_TICKET_TTL_MS)).not.toBeNull();
  expect(verifyCaptureTicket(t, CAPTURE_TICKET_TTL_MS + 1)).toBeNull();
});

test('a capture without all three photos, or with a slot type the twin refuses, is never signed', () => {
  expect(signCaptureTicket({ u: UID, n: N, d: '40917263', s: { front: 'jpg', left: 'jpg' } })).toBeNull();
  expect(signCaptureTicket({ u: UID, n: N, d: '40917263', s: { ...SLOTS, front: 'svg' } })).toBeNull();
  expect(signCaptureTicket({ u: UID, n: N, d: '40917263', s: { ...SLOTS, voice: 'jpg' } })).toBeNull();
  expect(signCaptureTicket({ u: UID, n: N, d: '40917263', s: { ...SLOTS, back: 'jpg' } as never })).toBeNull();
  expect(signCaptureTicket({ u: 'anonymous', n: N, d: '40917263', s: SLOTS })).toBeNull();
  expect(signCaptureTicket({ u: UID, n: N, d: 'abcd', s: SLOTS })).toBeNull();
});

test('voice is optional', () => {
  const s = { front: 'jpg', left: 'jpg', right: 'jpg' };
  expect(verifyCaptureTicket(signCaptureTicket({ u: UID, n: N, d: '12345678', s })!)).toMatchObject({ s });
});

test('fail-closed with no key; a ticket signed under one key does not verify under another', () => {
  const t = signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS })!;
  process.env.AVATAR_HANDOFF_SECRET = 'rotated';
  expect(verifyCaptureTicket(t)).toBeNull();
  delete process.env.AVATAR_HANDOFF_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(captureTicketsReady()).toBe(false);
  expect(signCaptureTicket({ u: UID, n: N, d: '40917263', s: SLOTS })).toBeNull();
});

test('digits: the configured length, digits only, from the CSPRNG (not the same twice in a row)', () => {
  const a = newCaptureDigits();
  const b = newCaptureDigits();
  expect(a).toMatch(/^\d{8}$/);
  expect(b).toMatch(/^\d{8}$/);
  expect(new Set(Array.from({ length: 20 }, () => newCaptureDigits())).size).toBeGreaterThan(1);
});
