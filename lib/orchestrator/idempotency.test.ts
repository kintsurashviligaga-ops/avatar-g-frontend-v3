/**
 * @jest-environment node
 *
 * Idempotency layer — verifies the graceful no-op degradation that is the
 * DEFAULT state on this stack (no Upstash Redis env configured). Every
 * guarantee must keep the app working rather than throw.
 *
 * `server-only` is mocked because this unit test runs outside the Next.js
 * server runtime.
 */
jest.mock('server-only', () => ({}));

import {
  hashPayload,
  claimIdempotencyKey,
  lockTokens,
  commitTokenLock,
  releaseTokenLock,
  recordProviderResult,
  isProviderTripped,
  idempotencyEnabled,
} from './idempotency';

describe('idempotency — no-Redis graceful degradation', () => {
  test('idempotencyEnabled() is false without Upstash env', () => {
    expect(idempotencyEnabled()).toBe(false);
  });

  test('hashPayload is deterministic + collision-stable for distinct inputs', async () => {
    const a1 = await hashPayload({ agent: 'image', prompt: 'a red car' });
    const a2 = await hashPayload({ agent: 'image', prompt: 'a red car' });
    const b  = await hashPayload({ agent: 'image', prompt: 'a blue car' });
    expect(a1).toBe(a2);          // deterministic
    expect(a1).not.toBe(b);       // different payload → different hash
    expect(a1.length).toBeGreaterThanOrEqual(8);
  });

  test('claimIdempotencyKey allows through when Redis absent (never blocks)', async () => {
    const first  = await claimIdempotencyKey('user1', 'k', 60);
    const second = await claimIdempotencyKey('user1', 'k', 60);
    // Without Redis we cannot dedup, so BOTH must be allowed — failing open
    // is the correct behaviour (never block a paying user on infra absence).
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  test('token lock lifecycle resolves without throwing (optimistic no-Redis path)', async () => {
    const lock = await lockTokens('user1', 50, 600);
    expect(lock).not.toBeNull();
    expect(lock?.amount).toBe(50);
    expect(lock?.userId).toBe('user1');
    expect(typeof lock?.lockId).toBe('string');
    // commit + release must be safe no-ops without Redis.
    await expect(commitTokenLock(lock!)).resolves.toBeUndefined();
    await expect(releaseTokenLock(lock!)).resolves.toBeUndefined();
  });

  test('circuit breaker is a safe no-op without Redis (never trips)', async () => {
    await expect(recordProviderResult('heygen', false)).resolves.toBeUndefined();
    await expect(recordProviderResult('heygen', false)).resolves.toBeUndefined();
    await expect(recordProviderResult('heygen', false)).resolves.toBeUndefined();
    // Without Redis we cannot track state → never trips (fails open).
    expect(await isProviderTripped('heygen')).toBe(false);
  });
});
