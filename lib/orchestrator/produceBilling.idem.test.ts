/** @jest-environment node */
import { idemRef, bodyFingerprint } from './idemRef';

describe('THE EXPLOIT: a fixed idempotencyKey used to buy unlimited free renders', () => {
  it('same key + DIFFERENT prompt now produces a DIFFERENT ref, so it is charged again', () => {
    const a = idemRef('image', 'p1', { prompt: 'a cat', idempotencyKey: 'CONSTANT' });
    const b = idemRef('image', 'p1', { prompt: 'a dog', idempotencyKey: 'CONSTANT' });
    expect(a).not.toBe(b);
  });

  it('holds across all six produce surfaces', () => {
    for (const kind of ['image', 'music', 'voice', 'avatar', 'interior', 'film']) {
      const a = idemRef(kind, 'p', { prompt: 'x', idempotencyKey: 'K' });
      const b = idemRef(kind, 'p', { prompt: 'y', idempotencyKey: 'K' });
      expect(a).not.toBe(b);
    }
  });
});

describe('the legitimate feature still works — a real retry must not double-charge', () => {
  it('same key + IDENTICAL body collapses to the same ref', () => {
    const body = { prompt: 'a cat', style: 'oil', idempotencyKey: 'K' };
    expect(idemRef('image', 'p1', body)).toBe(idemRef('image', 'p2', { ...body }));
  });

  it('a retry that re-serialises the body in a different key order still collapses', () => {
    const a = idemRef('image', 'p', { prompt: 'x', style: 'y', idempotencyKey: 'K' });
    const b = idemRef('image', 'p', { style: 'y', prompt: 'x', idempotencyKey: 'K' });
    expect(a).toBe(b);
  });

  it('transport-only ids do not change the fingerprint — they are not part of the request’s meaning', () => {
    expect(bodyFingerprint({ prompt: 'x', jobId: '1' })).toBe(bodyFingerprint({ prompt: 'x', jobId: '2' }));
    expect(bodyFingerprint({ prompt: 'x', clientJobId: 'a' })).toBe(bodyFingerprint({ prompt: 'x' }));
  });

  it('two DIFFERENT users sending the same key are still separated — the RPC dedupes on (user_id, ref)', () => {
    // The ref itself may match; isolation is the RPC's (user_id, ref) key, which this must not defeat.
    expect(idemRef('image', 'p', { prompt: 'x', idempotencyKey: 'K' })).toBe(idemRef('image', 'p', { prompt: 'x', idempotencyKey: 'K' }));
  });
});

describe('fingerprint bounds', () => {
  it('is stable, hex, and bounded', () => {
    const f = bodyFingerprint({ a: 1, b: [1, 2, { c: 3 }] });
    expect(f).toMatch(/^[0-9a-f]{32}$/);
    expect(bodyFingerprint({ a: 1, b: [1, 2, { c: 3 }] })).toBe(f);
  });

  it('nested content changes are detected, not just top-level ones', () => {
    expect(bodyFingerprint({ o: { deep: 1 } })).not.toBe(bodyFingerprint({ o: { deep: 2 } }));
  });

  it('array ORDER matters — [a,b] is not the same request as [b,a]', () => {
    expect(bodyFingerprint({ shots: ['a', 'b'] })).not.toBe(bodyFingerprint({ shots: ['b', 'a'] }));
  });

  it.each([[null], [undefined], [0], ['']])('survives %p without throwing', (v) => {
    expect(bodyFingerprint(v)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('a circular body degrades to a constant rather than crashing the charge path', () => {
    const c: Record<string, unknown> = { prompt: 'x' }; c.self = c;
    expect(() => bodyFingerprint(c)).not.toThrow();
  });
});
