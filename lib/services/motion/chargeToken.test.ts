/** @jest-environment node */
/**
 * The Motion Control charge token — what lets /api/motion-control/status refund a render that was reserved BEFORE its
 * Kling prediction existed. It may only ever name the payer's own reservation for exactly that prediction.
 */
jest.mock('server-only', () => ({}));

import { motionChargeForPolledId, motionChargeRef, motionChargeSigningReady, signMotionCharge, withMotionCharge } from './chargeToken';

const ENV = { ...process.env };
beforeEach(() => { process.env = { ...ENV, MOTION_CHARGE_SECRET: 'test-motion-secret' }; });
afterAll(() => { process.env = ENV; });

const charge = { u: 'user-1', r: motionChargeRef('user-1', 'uuid-1'), j: 'pred-abc' };

test('a signed id round-trips to the bare prediction and its charge', () => {
  const token = signMotionCharge(charge)!;
  const id = withMotionCharge('pred-abc', token);
  expect(id.startsWith('pred-abc~mc1.')).toBe(true);
  expect(motionChargeForPolledId(id)).toEqual({ jobId: 'pred-abc', charge });
});

test('a legacy id (no token) is the bare prediction with no charge', () => {
  expect(motionChargeForPolledId('pred-abc')).toEqual({ jobId: 'pred-abc', charge: null });
});

test('a token re-pointed at another prediction authorises nothing', () => {
  const token = signMotionCharge(charge)!;
  expect(motionChargeForPolledId(withMotionCharge('pred-OTHER', token)).charge).toBeNull();
});

test('a tampered payload or signature authorises nothing', () => {
  const token = signMotionCharge(charge)!;
  const [p, payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, u: 'attacker', r: charge.r, j: 'pred-abc' })).toString('base64url');
  expect(motionChargeForPolledId(`pred-abc~${p}.${forged}.${sig}`).charge).toBeNull();
  expect(motionChargeForPolledId(`pred-abc~${p}.${payload}.${sig}x`).charge).toBeNull();
});

test('a token signed with another key authorises nothing', () => {
  const token = signMotionCharge(charge)!;
  process.env.MOTION_CHARGE_SECRET = 'rotated';
  expect(motionChargeForPolledId(withMotionCharge('pred-abc', token)).charge).toBeNull();
});

test('fail-closed without a key: nothing is signed, nothing verifies, and the route is told not to reserve', () => {
  const token = signMotionCharge(charge)!;
  delete process.env.MOTION_CHARGE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(motionChargeSigningReady()).toBe(false);
  expect(signMotionCharge(charge)).toBeNull();
  expect(motionChargeForPolledId(withMotionCharge('pred-abc', token)).charge).toBeNull();
});

test('the reservation ref is server-minted and names the user', () => {
  expect(motionChargeRef('user-9', 'u-u-i-d')).toBe('motion:reserve:u-u-i-d:user-9');
});
