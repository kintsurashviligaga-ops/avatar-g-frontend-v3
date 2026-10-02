/**
 * requestId.ts — the idempotency key of ONE start attempt. POST /api/research/start replays a repeated key instead of charging
 * twice, so the rule is: keep the key while the outcome is UNKNOWN (the network dropped, the function timed out) and the user
 * presses again with the same question; take a fresh one after any definite answer (started, or refused) — a refused attempt's
 * key must never be reused for a changed request, or the server could replay the refusal.
 */
export function newRequestId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16));
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export class RequestIdKeeper {
  private key = '';
  private id = '';

  /** The key for a request described by `fingerprint` (same fingerprint + unsettled outcome → the same key). */
  get(fingerprint: string): string {
    if (!this.id || fingerprint !== this.key) {
      this.key = fingerprint;
      this.id = newRequestId();
    }
    return this.id;
  }

  /** The attempt ended with a DEFINITE answer: the next press is a new attempt. */
  settle(definite: boolean): void {
    if (definite) this.id = '';
  }
}
