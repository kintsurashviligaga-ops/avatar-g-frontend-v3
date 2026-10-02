/**
 * lib/research/testing/fakes.ts — TEST-ONLY doubles for the research saga: a ledger with the REAL semantics (a debit
 * dedupes on its ref, a refund is idempotent and capped at the ledger's net debit), a scripted Interactions client, a
 * context-files port, and a harness that wires them to the real store over the in-memory FakeDb. Imported by no
 * production code.
 */
import { randomUUID } from 'node:crypto';
import type { ResearchContextFile } from '../context';
import type { CancelOutcome, InteractionsClient, PollOutcome, StartOutcome } from '../interactionsClient';
import { parseInteraction } from '../parse';
import { createResearchService, type ContextFilesPort, type LedgerPort, type ResearchDeps } from '../service';
import { createSupabaseResearchStore } from '../store';
import type { ResearchJobRow } from '../types';
import { FakeDb } from './fakeDb';

export class FakeLedger implements LedgerPort {
  balance: number;
  /** [ref, delta] in order. Debits are negative. */
  entries: Array<{ ref: string; delta: number }> = [];
  calls: string[] = [];
  /** Make the next deduct answer something else: 'skipped' | 'error' | 'commit-then-throw'. */
  nextDeduct: 'ok' | 'skipped' | 'error' | 'commit-then-throw' = 'ok';
  /** Make the next refund fail like an unreadable ledger. */
  failRefunds = 0;

  constructor(balance: number) {
    this.balance = balance;
  }

  private net(ref: string): number {
    const taken = this.entries.filter((e) => e.ref === ref && e.delta < 0).reduce((s, e) => s - e.delta, 0);
    const given = this.entries.filter((e) => e.ref.startsWith(`${ref}:`) && e.delta > 0).reduce((s, e) => s + e.delta, 0);
    return Math.max(0, taken - given);
  }

  async deduct(_userId: string, credits: number, ref: string) {
    this.calls.push(`deduct:${credits}:${ref}`);
    const mode = this.nextDeduct;
    this.nextDeduct = 'ok';
    if (mode === 'skipped') return { ok: false, reason: 'skipped' };
    if (mode === 'error') return { ok: false, reason: 'error' };
    if (this.entries.some((e) => e.ref === ref && e.delta < 0)) return { ok: true }; // deduct_credits dedupes on the ref
    if (this.balance < credits) return { ok: false, reason: 'insufficient' };
    this.balance -= credits;
    this.entries.push({ ref, delta: -credits });
    if (mode === 'commit-then-throw') throw new Error('connection reset after commit');
    return { ok: true };
  }

  async refundByRef(_userId: string, ref: string, claimed?: number) {
    this.calls.push(`refund:${ref}`);
    if (this.failRefunds > 0) {
      this.failRefunds--;
      return { ok: false, refunded: 0, reason: 'error' };
    }
    const net = this.net(ref);
    const amount = Math.min(net, typeof claimed === 'number' && claimed > 0 ? claimed : net);
    if (!(amount > 0)) return { ok: false, refunded: 0, reason: 'skipped' };
    if (!this.entries.some((e) => e.ref === `${ref}:refund`)) {
      this.balance += amount;
      this.entries.push({ ref: `${ref}:refund`, delta: amount });
    }
    return { ok: true, refunded: amount };
  }

  /** Total of everything ever refunded under `ref`. */
  refunded(ref: string): number {
    return this.entries.filter((e) => e.ref.startsWith(`${ref}:`) && e.delta > 0).reduce((s, e) => s + e.delta, 0);
  }
}

export class FakeClient implements InteractionsClient {
  startCalls: Array<{ agent: string; input: string }> = [];
  pollCalls: string[] = [];
  cancelCalls: string[] = [];
  /** Outcomes consumed in order; the last one repeats. */
  startScript: StartOutcome[] = [{ ok: true, id: 'interaction-1' }];
  pollScript: PollOutcome[] = [];
  cancelScript: CancelOutcome[] = [{ ok: true, parsed: parseInteraction({ status: 'cancelled' }) }];
  /** Runs inside start() — lets a test observe the ledger at the moment the provider is called. */
  onStart: (() => void) | null = null;

  async start(req: { agent: string; input: string }): Promise<StartOutcome> {
    this.startCalls.push(req);
    this.onStart?.();
    return this.startScript.length > 1 ? this.startScript.shift()! : this.startScript[0]!;
  }
  async poll(id: string): Promise<PollOutcome> {
    this.pollCalls.push(id);
    const out = this.pollScript.length > 1 ? this.pollScript.shift() : this.pollScript[0];
    return out ?? { ok: true, parsed: parseInteraction({ status: 'in_progress' }) };
  }
  async cancel(id: string): Promise<CancelOutcome> {
    this.cancelCalls.push(id);
    return this.cancelScript.length > 1 ? this.cancelScript.shift()! : this.cancelScript[0]!;
  }

  pollsAs(...answers: unknown[]): void {
    this.pollScript = answers.map((a) => ({ ok: true as const, parsed: parseInteraction(a) }));
  }
}

export class FakeFiles implements ContextFilesPort {
  files = new Map<string, ResearchContextFile & { user: string }>();
  nextUnavailable = false;
  add(user: string, f: ResearchContextFile): void {
    this.files.set(f.id, { ...f, user });
  }
  async loadForRun(userId: string, ids: string[]) {
    if (this.nextUnavailable) {
      this.nextUnavailable = false;
      return { ok: false as const, code: 'unavailable' as const };
    }
    const out: ResearchContextFile[] = [];
    for (const id of ids) {
      const f = this.files.get(id);
      if (!f || f.user !== userId) return { ok: false as const, code: 'invalid_file' as const };
      out.push({ id: f.id, name: f.name, text: f.text });
    }
    return { ok: true as const, files: out };
  }
}

export const RESEARCH_DB_OPTIONS = {
  unique: { research_jobs: [['user_id', 'client_request_id']] },
  touchUpdatedAt: ['research_jobs'],
  // The columns the database fills in for research_context_files (id, created_at).
  defaults: {
    research_context_files: (now: string) => ({ id: randomUUID(), created_at: now }),
    notifications: (now: string) => ({ id: randomUUID(), read: false, created_at: now }),
  },
};

export interface Harness {
  db: FakeDb;
  ledger: FakeLedger;
  client: FakeClient;
  files: FakeFiles;
  clock: { ms: number };
  alerts: Array<{ marker: string; data: Record<string, unknown> }>;
  notified: Array<{ id: string; outcome: string }>;
  service: ReturnType<typeof createResearchService>;
  store: ReturnType<typeof createSupabaseResearchStore>;
  job(id: string): ResearchJobRow;
  jobs(): ResearchJobRow[];
}

export const T0 = Date.UTC(2026, 9, 2, 12, 0, 0);

export function makeHarness(opts: { balance?: number; limits?: Partial<ReturnType<NonNullable<ResearchDeps['limits']>>> } = {}): Harness {
  const clock = { ms: T0 };
  const db = new FakeDb({}, { ...RESEARCH_DB_OPTIONS, now: () => clock.ms });
  const ledger = new FakeLedger(opts.balance ?? 1_000);
  const client = new FakeClient();
  const files = new FakeFiles();
  const alerts: Harness['alerts'] = [];
  const notified: Harness['notified'] = [];
  let n = 0;
  const store = createSupabaseResearchStore(db as never);
  const service = createResearchService({
    store,
    client,
    ledger,
    files,
    notify: async (job, outcome) => {
      notified.push({ id: job.id, outcome });
    },
    alert: (marker, data) => alerts.push({ marker, data }),
    now: () => clock.ms,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    limits: () => ({ enabled: true, globalDaily: 60, userDaily: 4, maxActive: 2, agent: 'deep-research-preview-04-2026', deadlineMs: 61 * 60_000, ...(opts.limits ?? {}) }),
  });
  return {
    db, ledger, client, files, clock, alerts, notified, service, store,
    job: (id) => db.rows('research_jobs').find((r) => r.id === id) as unknown as ResearchJobRow,
    jobs: () => db.rows('research_jobs') as unknown as ResearchJobRow[],
  };
}
