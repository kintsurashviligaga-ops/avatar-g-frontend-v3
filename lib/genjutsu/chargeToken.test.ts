/** @jest-environment node */
/**
 * The VFX charge token: it names WHO paid and under which ref, bound to one job, so the status route can refund the
 * payer — and only the payer — without trusting an id, a row or the client. No amount is in it.
 */
jest.mock('server-only', () => ({}));

import {
  composeOmniJobId, composeVeoJobId, genjutsuChargeForPolledId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, parseVeoJobId,
  signGenjutsuCharge, uuidFromRef, withGenjutsuCharge,
} from './chargeToken';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OP = 'models/veo-3.1-fast-generate-preview/operations/abc123';

beforeEach(() => { process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-secret' }; });
afterAll(() => { process.env = ENV; });

test('an authentic token round-trips and is bound to exactly its job', () => {
  const ref = genjutsuChargeRef(UID, UUID);
  const jobId = composeVeoJobId(OP, '16:9', 1_760_000_000_000);
  const id = withGenjutsuCharge(jobId, signGenjutsuCharge({ u: UID, r: ref, j: jobId })!);
  expect(genjutsuChargeForPolledId(id)).toEqual({ jobId, charge: { u: UID, r: ref, j: jobId } });
});

test('a token cannot be re-pointed at another job, forged, or accepted under another secret', () => {
  const ref = genjutsuChargeRef(UID, UUID);
  const jobId = composeVeoJobId(OP, '16:9', 1_760_000_000_000);
  const token = signGenjutsuCharge({ u: UID, r: ref, j: jobId })!;
  const other = composeVeoJobId('models/m/operations/other', '16:9', 1_760_000_000_000);
  expect(genjutsuChargeForPolledId(withGenjutsuCharge(other, token)).charge).toBeNull();
  expect(genjutsuChargeForPolledId(withGenjutsuCharge(jobId, token.slice(0, -3) + 'AAA')).charge).toBeNull();
  expect(genjutsuChargeForPolledId(jobId).charge).toBeNull(); // no token at all
  process.env.GENJUTSU_CHARGE_SECRET = 'another-secret';
  expect(genjutsuChargeForPolledId(withGenjutsuCharge(jobId, token)).charge).toBeNull();
});

test('no signing key → not ready, nothing can be signed (the route refuses to reserve)', () => {
  delete process.env.GENJUTSU_CHARGE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(genjutsuChargeReady()).toBe(false);
  expect(signGenjutsuCharge({ u: UID, r: 'r', j: 'j' })).toBeNull();
});

test('the token carries no amount — a refund pays what the ledger shows', () => {
  const jobId = composeVeoJobId(OP, '9:16', 1_760_000_000_000);
  const token = signGenjutsuCharge({ u: UID, r: genjutsuChargeRef(UID, UUID), j: jobId })!;
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
  expect(Object.keys(payload).sort()).toEqual(['j', 'r', 'u', 'v']);
});

test('the reservation ref and the job-row id derive from one uuid; only refs this module minted parse back', () => {
  const ref = genjutsuChargeRef(UID, UUID);
  expect(ref).toBe(`genjutsu:reserve:${UUID}:${UID}`);
  expect(uuidFromRef(ref)).toBe(UUID);
  expect(genjutsuJobId(UUID)).toBe(`genjutsu:${UUID}`);
  for (const bad of ['motion:reserve:x', `genjutsu:reserve:short:${UID}`, '', 'genjutsu:reserve:']) expect(uuidFromRef(bad)).toBeNull();
});

test('the job id composite round-trips, and rejects anything malformed', () => {
  expect(parseVeoJobId(composeVeoJobId(OP, '9:16', 1_760_000_000_123.4))).toEqual({ operation: OP, aspect: '9:16', createdMs: 1_760_000_000_123, voiced: false, clipSec: null, engine: 'veo', omniOp: null });
  // The talking avatar voiced by ElevenLabs carries its marker inside the signed id.
  expect(composeVeoJobId(OP, '9:16', 1_760_000_000_000, true)).toBe(`${OP}::9:16::1760000000000::v`);
  expect(parseVeoJobId(composeVeoJobId(OP, '9:16', 1_760_000_000_000, true))).toEqual({ operation: OP, aspect: '9:16', createdMs: 1_760_000_000_000, voiced: true, clipSec: null, engine: 'veo', omniOp: null });
  // The video service's direct clip carries its length, and a Georgian line laid over it, inside the signed id.
  expect(composeVeoJobId(OP, '16:9', 1_760_000_000_000, false, 6)).toBe(`${OP}::16:9::1760000000000::c6`);
  expect(composeVeoJobId(OP, '9:16', 1_760_000_000_000, true, 8)).toBe(`${OP}::9:16::1760000000000::c8v`);
  expect(parseVeoJobId(`${OP}::16:9::5::c6`)).toEqual({ operation: OP, aspect: '16:9', createdMs: 5, voiced: false, clipSec: 6, engine: 'veo', omniOp: null });
  expect(parseVeoJobId(`${OP}::9:16::5::c4v`)).toEqual({ operation: OP, aspect: '9:16', createdMs: 5, voiced: true, clipSec: 4, engine: 'veo', omniOp: null });
  // The 10 s clip is Gemini Omni Flash's: its interaction id, never voiced over (Omni speaks Georgian itself).
  expect(composeOmniJobId('ChBjAbC_d-123', '9:16', 1_760_000_000_000)).toBe('ChBjAbC_d-123::9:16::1760000000000::o10');
  expect(parseVeoJobId('ChBjAbC_d-123::9:16::5::o10')).toEqual({ operation: 'ChBjAbC_d-123', aspect: '9:16', createdMs: 5, voiced: false, clipSec: 10, engine: 'omni', omniOp: 'clip' });
  // A shorter Omni clip (a Georgian line, GG's card 2026-10-26 10:55Z) names its own length.
  expect(composeOmniJobId('ChBjAbC_d-123', '9:16', 5, undefined, 8)).toBe('ChBjAbC_d-123::9:16::5::o8');
  for (const sec of [4, 6, 8] as const) {
    expect(parseVeoJobId(`ChBjAbC_d-123::9:16::5::o${sec}`)).toEqual({ operation: 'ChBjAbC_d-123', aspect: '9:16', createdMs: 5, voiced: false, clipSec: sec, engine: 'omni', omniOp: 'clip' });
  }
  // An uploaded video Omni edits or extends: its op and billed seconds ride in the signed id.
  expect(composeOmniJobId('ChBjAbC_d-123', '16:9', 7, { op: 'edit', seconds: 6 })).toBe('ChBjAbC_d-123::16:9::7::oe6');
  expect(parseVeoJobId('ChBjAbC_d-123::16:9::7::oe6')).toEqual({ operation: 'ChBjAbC_d-123', aspect: '16:9', createdMs: 7, voiced: false, clipSec: 6, engine: 'omni', omniOp: 'edit' });
  expect(parseVeoJobId(composeOmniJobId('ChBjAbC_d-123', '9:16', 7, { op: 'extend', seconds: 10 }))).toEqual({ operation: 'ChBjAbC_d-123', aspect: '9:16', createdMs: 7, voiced: false, clipSec: 10, engine: 'omni', omniOp: 'extend' });
  for (const bad of ['oe5', 'ox12', 'oe', 'ox', 'oy8', 'oe8v', 'oex8']) expect(parseVeoJobId(`ChBjAbC_d-123::9:16::5::${bad}`)).toBeNull();
  for (const bad of ['', OP, `${OP}::1:1::5`, `${OP}::16:9::nope`, `${OP}::16:9::0`, `::16:9::5`, `${OP}::16:9`, `${OP}::16:9::5::x`, `${OP}::16:9::5::v::v`,
    `${OP}::16:9::5::c5`, `${OP}::16:9::5::c10`, `${OP}::16:9::5::c`, `${OP}::16:9::5::cv`, `${OP}::16:9::5::c8vv`, `${OP}::16:9::5::vc8`, `${OP}::16:9::5::o5`, `${OP}::16:9::5::o12`, `${OP}::16:9::5::o10v`, `${OP}::16:9::5::o`]) expect(parseVeoJobId(bad)).toBeNull();
});
