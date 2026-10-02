/**
 * lib/orchestrator/jobChargeToken.ts — "this provider job is already paid for under ref R", signed, riding INSIDE the
 * job id the client already round-trips verbatim (`<providerJobId>~<prefix>.<payload>.<mac>`).
 *
 * WHY: a route that RESERVES before it submits cannot put the provider's job id in the charge ref (the job does not
 * exist yet), so the poll route can no longer derive the ref from the id it polls — and must not trust a job row
 * (owner-writable) or a client claim to authorise a refund. The token binds (user, ref, providerJobId): it cannot be
 * re-pointed at someone else's job, nor at another job of one's own. The AMOUNT is never in it — refunds pay back what
 * the LEDGER shows under the ref (refundDebitByRef), once.
 *
 * One factory, one domain per route family, so a token minted for one can never be replayed as another's: the MAC
 * covers `<domain>:<payload>` and the prefix is checked. Same construction as lib/billing/avatarCharge (service-role
 * key as the fallback secret, constant-time compare, fail-closed with no key).
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JobCharge {
  /** The user whose ledger holds the reservation. */
  u: string;
  /** The deduct_credits ref the reservation was taken under. */
  r: string;
  /** The provider job this charge covers (bare). */
  j: string;
}

export interface JobChargeToken {
  /** True when tokens can be minted — check BEFORE reserving, so a reservation never strands without one. */
  ready(): boolean;
  sign(c: JobCharge): string | null;
  withToken(jobId: string, token: string): string;
  /** The bare job id, and its charge only when the token is authentic and bound to exactly that job. */
  forPolledId(id: string): { jobId: string; charge: JobCharge | null };
}

const SEP = '~';

export function createJobChargeToken(opts: { prefix: string; domain: string; secretEnv: string }): JobChargeToken {
  const key = () => process.env[opts.secretEnv] || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const mac = (payload: string) => createHmac('sha256', key()).update(`${opts.domain}:${payload}`).digest('base64url');
  return {
    ready: () => key().length > 0,
    sign(c) {
      if (!key() || !c.u || !c.r || !c.j) return null;
      const payload = Buffer.from(JSON.stringify({ v: 1, u: c.u, r: c.r, j: c.j })).toString('base64url');
      return `${opts.prefix}.${payload}.${mac(payload)}`;
    },
    withToken: (jobId, token) => `${jobId}${SEP}${token}`,
    forPolledId(id) {
      const at = id.lastIndexOf(`${SEP}${opts.prefix}.`);
      if (at <= 0) return { jobId: id, charge: null };
      const jobId = id.slice(0, at);
      const token = id.slice(at + 1);
      if (!key() || token.length > 4096) return { jobId, charge: null };
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== opts.prefix) return { jobId, charge: null };
      const payload = parts[1] ?? '';
      const a = Buffer.from(parts[2] ?? '');
      const b = Buffer.from(mac(payload));
      if (a.length !== b.length || !timingSafeEqual(a, b)) return { jobId, charge: null };
      try {
        const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<JobCharge> & { v?: unknown };
        if (p.v !== 1 || typeof p.u !== 'string' || !p.u || typeof p.r !== 'string' || !p.r || p.j !== jobId) {
          return { jobId, charge: null };
        }
        return { jobId, charge: { u: p.u, r: p.r, j: p.j } };
      } catch {
        return { jobId, charge: null };
      }
    },
  };
}
