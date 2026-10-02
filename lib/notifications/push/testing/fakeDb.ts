/**
 * lib/notifications/push/testing/fakeDb.ts — TEST-ONLY: an in-memory `push_subscriptions` behind the supabase-js calls the
 * push channel and routes make (select / upsert / update / delete; eq, in, order, limit; delete's exact count). Like
 * supabase-js it ANSWERS `{ data, error }` and never throws. `missingTable` makes every call answer PostgREST's "no such
 * table" (PGRST205); `failNext` injects one error. Imported by no production code.
 */
export type PushRow = Record<string, unknown>;
type Op = 'select' | 'upsert' | 'update' | 'delete';

export interface PushOp {
  op: Op;
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
  opts?: unknown;
}

type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

export class FakePushDb {
  rows: PushRow[];
  ops: PushOp[] = [];
  missingTable = false;
  private failures: Array<{ op: Op; code: string }> = [];
  private seq = 0;

  constructor(rows: PushRow[] = []) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  failNext(op: Op, code = 'XX000'): void {
    this.failures.push({ op, code });
  }

  takeFailure(op: Op): string | null {
    const i = this.failures.findIndex((f) => f.op === op);
    if (i < 0) return null;
    return this.failures.splice(i, 1)[0]!.code;
  }

  nextId(): string {
    return `sub-${++this.seq}`;
  }

  from(table: string): FakePushQuery {
    if (table !== 'push_subscriptions') throw new Error(`unexpected table ${table}`);
    return new FakePushQuery(this);
  }
}

export class FakePushQuery implements PromiseLike<Result> {
  private op: Op = 'select';
  private payload: unknown;
  private opts: unknown;
  private filters: Array<['eq' | 'in', string, unknown]> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private cols = '*';

  constructor(private db: FakePushDb) {}

  select(cols = '*'): this { this.cols = cols; return this; }
  upsert(row: PushRow, opts?: { onConflict?: string }): this { this.op = 'upsert'; this.payload = row; this.opts = opts; return this; }
  update(p: PushRow): this { this.op = 'update'; this.payload = p; return this; }
  delete(opts?: { count?: 'exact' }): this { this.op = 'delete'; this.opts = opts; return this; }
  eq(col: string, v: unknown): this { this.filters.push(['eq', col, v]); return this; }
  in(col: string, v: unknown[]): this { this.filters.push(['in', col, v]); return this; }
  order(col: string, o?: { ascending?: boolean }): this { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number): this { this.max = n; return this; }

  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }

  private match(r: PushRow): boolean {
    return this.filters.every(([k, c, v]) => (k === 'eq' ? r[c] === v : Array.isArray(v) && v.includes(r[c])));
  }

  private run(): Result {
    this.db.ops.push({ op: this.op, filters: this.filters.map((f) => [...f] as [string, string, unknown]), payload: this.payload, opts: this.opts });
    if (this.db.missingTable) {
      return { data: null, error: { message: "Could not find the table 'public.push_subscriptions' in the schema cache", code: 'PGRST205' } };
    }
    const failure = this.db.takeFailure(this.op);
    if (failure) return { data: null, error: { message: 'injected failure', code: failure } };

    if (this.op === 'upsert') {
      const row = this.payload as PushRow;
      const key = ((this.opts as { onConflict?: string } | undefined)?.onConflict ?? 'id') as string;
      const hit = this.db.rows.find((r) => r[key] === row[key]);
      if (hit) Object.assign(hit, row);
      else this.db.rows.push({ id: this.db.nextId(), last_success_at: null, failure_count: 0, ...row });
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      for (const r of this.db.rows.filter((x) => this.match(x))) Object.assign(r, this.payload as PushRow);
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      const gone = this.db.rows.filter((r) => this.match(r));
      this.db.rows = this.db.rows.filter((r) => !this.match(r));
      return { data: null, error: null, count: (this.opts as { count?: string } | undefined)?.count === 'exact' ? gone.length : null };
    }
    let out = this.db.rows.filter((r) => this.match(r));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max !== null) out = out.slice(0, this.max);
    const cols = this.cols.trim() === '*' ? null : this.cols.split(',').map((c) => c.trim());
    return { data: out.map((r) => (cols ? Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])) : { ...r })), error: null };
  }
}
