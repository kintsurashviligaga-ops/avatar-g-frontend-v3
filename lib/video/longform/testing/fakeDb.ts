/**
 * lib/video/longform/testing/fakeDb.ts — TEST-ONLY: an in-memory stand-in for the supabase-js query builder, just the
 * calls the long-form routes make (select / insert / update / delete, eq / in / order / limit, maybeSingle, count +
 * head). Like supabase-js it ANSWERS `{ data, error }` and never throws — a test injects an error with `failNext`.
 * Imported by no production code.
 */
export type FakeRow = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete';

export interface FakeOp {
  table: string;
  op: Op;
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
}

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export class FakeDb {
  tables = new Map<string, FakeRow[]>();
  ops: FakeOp[] = [];
  private failures: Array<{ table: string; op: Op; message: string }> = [];

  constructor(seed: Record<string, FakeRow[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables.set(t, rows.map((r) => ({ ...r })));
  }

  rows(table: string): FakeRow[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  /** The next `op` on `table` answers `{ error: { message } }` (and changes nothing). */
  failNext(table: string, op: Op, message = 'injected failure'): void {
    this.failures.push({ table, op, message });
  }

  takeFailure(table: string, op: Op): string | null {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op);
    if (i < 0) return null;
    const [f] = this.failures.splice(i, 1);
    return f!.message;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

export class FakeQuery implements PromiseLike<Result> {
  private op: Op = 'select';
  private payload: unknown;
  private filters: Array<[string, string, unknown]> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private returning = false;
  private countMode = false;
  private head = false;
  private single = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }): this {
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
  eq(col: string, v: unknown): this {
    this.filters.push(['eq', col, v]);
    return this;
  }
  in(col: string, vs: unknown[]): this {
    this.filters.push(['in', col, vs]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  maybeSingle(): Promise<Result> {
    this.single = true;
    return this.run();
  }
  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }

  private matches(r: FakeRow): boolean {
    return this.filters.every(([kind, col, v]) => (kind === 'eq' ? r[col] === v : Array.isArray(v) && v.includes(r[col])));
  }

  private async run(): Promise<Result> {
    this.db.ops.push({ table: this.table, op: this.op, filters: this.filters, ...(this.payload !== undefined ? { payload: this.payload } : {}) });
    const failure = this.db.takeFailure(this.table, this.op);
    if (failure) return { data: null, error: { message: failure } };
    const rows = this.db.rows(this.table);

    if (this.op === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as FakeRow[];
      const stamped = list.map((r) => ({ created_at: new Date(0).toISOString(), ...r }));
      rows.push(...stamped.map((r) => ({ ...r })));
      return { data: this.returning ? stamped : null, error: null };
    }
    if (this.op === 'update') {
      const hit = rows.filter((r) => this.matches(r));
      hit.forEach((r) => Object.assign(r, this.payload as FakeRow));
      return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === 'delete') {
      const keep = rows.filter((r) => !this.matches(r));
      const gone = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      // Like the real schema: deleting a long-form job cascades to its scenes.
      if (this.table === 'longform_jobs' && gone > 0) {
        const ids = new Set(this.db.rows('longform_jobs').map((r) => r.id));
        const scenes = this.db.rows('longform_scenes');
        scenes.splice(0, scenes.length, ...scenes.filter((s) => ids.has(s.job_id)));
      }
      return { data: null, error: null };
    }

    let out = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out.sort((a, b) => (Number(a[col]) - Number(b[col])) * (asc ? 1 : -1));
    }
    if (this.max !== null) out = out.slice(0, this.max);
    if (this.countMode) return { data: this.head ? null : out, error: null, count: out.length };
    if (this.single) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}
