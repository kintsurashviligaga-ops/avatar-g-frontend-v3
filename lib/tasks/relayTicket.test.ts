/** @jest-environment node */
import { mintRelayTicket, relayTicketEnabled, verifyRelayTicket } from './relayTicket';

const ENV = { TASK_RELAY_SECRET: 'a-test-secret-long-enough' };
const C = { userId: 'u-1', taskId: 'job_abc', workersOpen: true };
const T0 = 1_000_000;

test('flag is off unless set', () => {
  expect(relayTicketEnabled({})).toBe(false);
  expect(relayTicketEnabled({ TASK_RELAY_TICKET: '1' })).toBe(true);
  expect(relayTicketEnabled({ TASK_RELAY_TICKET: 'off' })).toBe(false);
});

test('a fresh ticket verifies for its own task and carries the claims', () => {
  const t = mintRelayTicket(C, T0, 60_000, ENV)!;
  expect(verifyRelayTicket(t, 'job_abc', T0 + 1, ENV)).toEqual(C);
  expect(verifyRelayTicket(mintRelayTicket({ ...C, workersOpen: false }, T0, 60_000, ENV), 'job_abc', T0, ENV)?.workersOpen).toBe(false);
});

test('another task, expiry, another secret, tampering or garbage: null', () => {
  const t = mintRelayTicket(C, T0, 60_000, ENV)!;
  expect(verifyRelayTicket(t, 'job_other', T0, ENV)).toBeNull();
  expect(verifyRelayTicket(t, 'job_abc', T0 + 60_000, ENV)).toBeNull();
  expect(verifyRelayTicket(t, 'job_abc', T0, { TASK_RELAY_SECRET: 'another-secret-long-enough' })).toBeNull();
  const parts = t.split('.');
  parts[0] = Buffer.from('u-2').toString('base64url');
  expect(verifyRelayTicket(parts.join('.'), 'job_abc', T0, ENV)).toBeNull();
  for (const bad of ['', 'x', 'a.b.c.d.e', null, undefined, 'a'.repeat(2000)]) expect(verifyRelayTicket(bad, 'job_abc', T0, ENV)).toBeNull();
});

test('no secret: nothing minted, nothing verified', () => {
  expect(mintRelayTicket(C, T0, 60_000, {})).toBeNull();
  const t = mintRelayTicket(C, T0, 60_000, ENV)!;
  expect(verifyRelayTicket(t, 'job_abc', T0, {})).toBeNull();
  expect(mintRelayTicket(C, T0, 60_000, { TASK_RELAY_SECRET: 'short' })).toBeNull();
});

test('falls back to the service role key as secret', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-long-enough' };
  expect(verifyRelayTicket(mintRelayTicket(C, T0, 1000, env), 'job_abc', T0, env)).toEqual(C);
});
