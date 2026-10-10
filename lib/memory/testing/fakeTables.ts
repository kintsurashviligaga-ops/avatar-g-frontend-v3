/**
 * A tiny in-memory stand-in for the Supabase query builder over plain rows, enough for the memory stores
 * (lib/chat/userMemory, lib/memory/context, app/api/memory): select / insert / upsert / update / delete with eq, neq,
 * order, limit, single and maybeSingle, and `count: 'exact'` on a delete. Every query is recorded, so a test can check
 * that each one was scoped to the user. `fail` makes a table's queries answer with an error.
 */
type Row = Record<string, unknown>;

export interface Query {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  filters: Array<[string, 'eq' | 'neq', unknown]>;
  payload?: unknown;
}

export interface FakeTables {
  tables: Record<string, Row[]>;
  queries: Query[];
  fail: Set<string>;
  client: { from(table: string): unknown };
}

export function fakeTables(initial: Record<string, Row[]> = {}): FakeTables {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const queries: Query[] = [];
  const fail = new Set<string>();

  function builder(table: string) {
    const q: Query = { table, op: 'select', filters: [] };
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let one: 'single' | 'maybe' | null = null;
    let conflict: string[] = [];
    const rows = () => (tables[table] ??= []);
    const match = (r: Row) => q.filters.every(([c, op, v]) => (op === 'eq' ? r[c] === v : r[c] !== v));
    const run = () => {
      queries.push(q);
      if (fail.has(table)) return { data: null, error: { message: `${table} unavailable` }, count: null };
      if (q.op === 'insert' || q.op === 'upsert') {
        const list = (Array.isArray(q.payload) ? q.payload : [q.payload]) as Row[];
        const out: Row[] = [];
        for (const p of list) {
          const same = conflict.length ? rows().find((r) => conflict.every((c) => r[c] === p[c])) : undefined;
          if (same && q.op === 'upsert') { Object.assign(same, p); out.push(same); continue; }
          const row = { id: `id-${rows().length + 1}`, created_at: new Date(1_700_000_000_000 + rows().length).toISOString(), ...p };
          rows().push(row);
          out.push(row);
        }
        return { data: one ? out[0] ?? null : out, error: null, count: out.length };
      }
      let hit = rows().filter(match);
      if (q.op === 'delete') {
        tables[table] = rows().filter((r) => !match(r));
        return { data: hit, error: null, count: hit.length };
      }
      if (q.op === 'update') {
        for (const r of hit) Object.assign(r, q.payload as Row);
      }
      if (order) {
        const { col, asc } = order;
        hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (limit !== null) hit = hit.slice(0, limit);
      const data = hit.map((r) => ({ ...r }));
      if (one) return { data: data[0] ?? null, error: one === 'single' && !data[0] ? { message: 'no rows' } : null, count: data.length };
      return { data, error: null, count: data.length };
    };
    const b = {
      select() { return b; },
      insert(p: unknown) { q.op = 'insert'; q.payload = p; return b; },
      upsert(p: unknown, opts?: { onConflict?: string }) { q.op = 'upsert'; q.payload = p; conflict = (opts?.onConflict ?? '').split(',').filter(Boolean); return b; },
      update(p: unknown) { q.op = 'update'; q.payload = p; return b; },
      delete() { q.op = 'delete'; return b; },
      eq(c: string, v: unknown) { q.filters.push([c, 'eq', v]); return b; },
      neq(c: string, v: unknown) { q.filters.push([c, 'neq', v]); return b; },
      order(col: string, o?: { ascending?: boolean }) { order = { col, asc: o?.ascending !== false }; return b; },
      limit(n: number) { limit = n; return b; },
      single() { one = 'single'; return b; },
      maybeSingle() { one = 'maybe'; return b; },
      then<T>(resolve: (v: ReturnType<typeof run>) => T, reject?: (e: unknown) => T) {
        try { return Promise.resolve(resolve(run())); } catch (e) { return reject ? Promise.resolve(reject(e)) : Promise.reject(e); }
      },
    };
    return b;
  }

  return { tables, queries, fail, client: { from: (table: string) => builder(table) } };
}
