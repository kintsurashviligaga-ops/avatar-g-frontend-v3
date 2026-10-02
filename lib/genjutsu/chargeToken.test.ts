/** @jest-environment node */
/**
 * The VFX charge token: it names WHO paid and under which ref, bound to one job, so the status route can refund the
 * payer — and only the payer — without trusting an id, a row or the client. No amount is in it.
 */
jest.mock('server-only', () => ({}));

import {
  composeVeoJobId, genjutsuChargeForPolledId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, parseVeoJobId,
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
  expect(parseVeoJobId(composeVeoJobId(OP, '9:16', 1_760_000_000_123.4))).toEqual({ operation: OP, aspect: '9:16', createdMs: 1_760_000_000_123 });
  for (const bad of ['', OP, `${OP}::1:1::5`, `${OP}::16:9::nope`, `${OP}::16:9::0`, `::16:9::5`, `${OP}::16:9`]) expect(parseVeoJobId(bad)).toBeNull();
});
