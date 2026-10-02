/**
 * lib/research/testing/fakeDb.ts — TEST-ONLY: an in-memory stand-in for the supabase-js query builder, just the calls the
 * research store and the connectors store make (select / insert / update / delete; eq, neq, in, is, lt, lte, gt, gte,
 * order, limit, single, maybeSingle, count + head). Like supabase-js it ANSWERS `{ data, error }` and never throws; a test
 * injects an error with `failNext`. It models what the real schema does for the paths under test: unique constraints
 * (23505), the `updated_at` trigger, and column defaults. Imported by no production code.
 */
export type FakeRow = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete';

export interface FakeOp {
  table: string;
  op: Op;
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
  /** The column list a select asked for ('*' or 'a,b,c') — so a test can prove a heavy column was never selected. */
  cols?: string;
}

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export interface FakeDbOptions {
  /** Unique column sets per table — a duplicate insert answers 23505, like Postgres. */
  unique?: Record<string, string[][]>;
  /** Column defaults applied on insert, per table (a function so they can read the clock). */
  defaults?: Record<string, (now: string) => FakeRow>;
  /** Tables that carry an `updated_at` trigger. */
  touchUpdatedAt?: string[];
  /** The clock (ms) — tests advance it. */
  now?: () => number;
}

export class FakeDb {
  tables = new Map<string, FakeRow[]>();
  ops: FakeOp[] = [];
  private failures: Array<{ table: string; op: Op; message: string; code?: string }> = [];
  private seq = 0;
  readonly opts: Required<FakeDbOptions>;

  constructor(seed: Record<string, FakeRow[]> = {}, opts: FakeDbOptions = {}) {
    this.opts = { unique: {}, defaults: {}, touchUpdatedAt: [], now: () => Date.now(), ...opts };
    for (const [t, rows] of Object.entries(seed)) this.tables.set(t, rows.map((r) => ({ ...r })));
  }

  rows(table: string): FakeRow[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  nowIso(): string {
    return new Date(this.opts.now()).toISOString();
  }

  /** The next `op` on `table` answers `{ error }` (and changes nothing). */
  failNext(table: string, op: Op, message = 'injected failure', code?: string): void {
    this.failures.push({ table, op, message, ...(code ? { code } : {}) });
  }

  takeFailure(table: string, op: Op): { message: string; code?: string } | null {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op);
    if (i < 0) return null;
    const [f] = this.failures.splice(i, 1);
    return f!;
  }

  nextSeq(): number {
    return ++this.seq;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  /** Writes only (insert / update / delete), for "nothing was written" assertions. */
  writes(table?: string): FakeOp[] {
    return this.ops.filter((o) => o.op !== 'select' && (!table || o.table === table));
  }
}

type Filter = [kind: 'eq' | 'neq' | 'in' | 'is' | 'lt' | 'lte' | 'gt' | 'gte', col: string, v: unknown];

export class FakeQuery implements PromiseLike<Result> {
  private op: Op = 'select';
  private payload: unknown;
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private returning = false;
  private countMode = false;
  private head = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private cols: string | undefined;

  constructor(private db: FakeDb, private table: string) {}

  select(cols?: string, opts?: { count?: 'exact'; head?: boolean }): this {
    this.cols = cols;
    if (this.op === 'select') {
      this.countMode = opts?.count === 'exact';
      this.head = opts?.head === true;
    } else this.returning = true;
    return this;
  }
  insert(rows: FakeRow | FakeRow[]): this {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(cols: FakeRow): this {
    this.op = 'update';
    this.payload = cols;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  eq(col: string, v: unknown): this { this.filters.push(['eq', col, v]); return this; }
  neq(col: string, v: unknown): this { this.filters.push(['neq', col, v]); return this; }
  in(col: string, vs: unknown[]): this { this.filters.push(['in', col, vs]); return this; }
  is(col: string, v: unknown): this { this.filters.push(['is', col, v]); return this; }
  lt(col: string, v: unknown): this { this.filters.push(['lt', col, v]); return this; }
  lte(col: string, v: unknown): this { this.filters.push(['lte', col, v]); return this; }
  gt(col: string, v: unknown): this { this.filters.push(['gt', col, v]); return this; }
  gte(col: string, v: unknown): this { this.filters.push(['gte', col, v]); return this; }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  maybeSingle(): Promise<Result> {
    this.mode = 'maybe';
    return this.run();
  }
  single(): Promise<Result> {
    this.mode = 'single';
    return this.run();
  }
  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }

  private matches(r: FakeRow): boolean {
    return this.filters.every(([kind, col, v]) => {
      const x = r[col];
      switch (kind) {
        case 'eq': return x === v;
        case 'neq': return x !== v;
        case 'in': return Array.isArray(v) && v.includes(x);
        case 'is': return v === null ? x === null || x === undefined : x === v;
        case 'lt': return x != null && (x as string | number) < (v as string | number);
        case 'lte': return x != null && (x as string | number) <= (v as string | number);
        case 'gt': return x != null && (x as string | number) > (v as string | number);
        case 'gte': return x != null && (x as string | number) >= (v as string | number);
      }
    });
  }

  private shape(rows: FakeRow[]): Result {
    const out = rows.map((r) => ({ ...r }));
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
    if (this.mode === 'single') {
      return out[0] ? { data: out[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    return { data: out, error: null };
  }

  private async run(): Promise<Result> {
    this.db.ops.push({
      table: this.table,
      op: this.op,
      filters: this.filters.map((f) => [...f] as [string, string, unknown]),
      ...(this.payload !== undefined ? { payload: this.payload } : {}),
      ...(this.cols !== undefined ? { cols: this.cols } : {}),
    });
    const failure = this.db.takeFailure(this.table, this.op);
    if (failure) return { data: null, error: { message: failure.message, ...(failure.code ? { code: failure.code } : {}) } };
    const rows = this.db.rows(this.table);
    const now = this.db.nowIso();

    if (this.op === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as FakeRow[];
      const defaults = this.db.opts.defaults[this.table];
      const stamped: FakeRow[] = [];
      for (const r of list) {
        const row: FakeRow = { ...(defaults ? defaults(now) : {}), ...r };
        for (const cols of this.db.opts.unique[this.table] ?? []) {
          // NULLs never collide (a partial unique index on a nullable column).
          if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
          if (rows.some((x) => cols.every((c) => x[c] === row[c]))) {
            return { data: null, error: { message: `duplicate key value violates unique constraint (${cols.join(', ')})`, code: '23505' } };
          }
        }
        stamped.push(row);
      }
      rows.push(...stamped.map((r) => ({ ...r })));
      return this.returning ? this.shape(stamped) : { data: null, error: null };
    }
    if (this.op === 'update') {
      const hit = rows.filter((r) => this.matches(r));
      const touch = this.db.opts.touchUpdatedAt.includes(this.table);
      for (const r of hit) {
        for (const cols of this.db.opts.unique[this.table] ?? []) {
          const next = { ...r, ...(this.payload as FakeRow) };
          if (cols.some((c) => next[c] === null || next[c] === undefined)) continue;
          if (rows.some((x) => x !== r && cols.every((c) => x[c] === next[c]))) {
            return { data: null, error: { message: `duplicate key value violates unique constraint (${cols.join(', ')})`, code: '23505' } };
          }
        }
        Object.assign(r, this.payload as FakeRow);
        if (touch) r.updated_at = now;
      }
      return this.returning ? this.shape(hit) : { data: null, error: null };
    }
    if (this.op === 'delete') {
      const keep = rows.filter((r) => !this.matches(r));
      rows.splice(0, rows.length, ...keep);
      return { data: null, error: null };
    }

    let out = rows.filter((r) => this.matches(r));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => {
        const x = a[col] as string | number;
        const y = b[col] as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (this.max !== null) out = out.slice(0, this.max);
    if (this.countMode) {
      const total = rows.filter((r) => this.matches(r)).length;
      return this.head ? { data: null, error: null, count: total } : { ...this.shape(out), count: total };
    }
    return this.shape(out);
  }
}
