/**
 * A recording Supabase stand-in for route tests: every builder call is logged, and awaiting the chain resolves to
 * whatever `resolve(table, op, calls)` returns. Covers select/insert/update/delete + any filter chain.
 */
export type FakeCall = { table: string; op: string; args: unknown[]; filters: Array<[string, ...unknown[]]> };

export function fakeSupabase(resolve: (call: FakeCall) => { data?: unknown; error?: unknown }) {
  const log: FakeCall[] = [];
  const builder = (table: string, op: string, args: unknown[]) => {
    const call: FakeCall = { table, op, args, filters: [] };
    log.push(call);
    const chain: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null, ...resolve(call) }).then(res, rej);
          }
          return (...a: unknown[]) => {
            call.filters.push([String(prop), ...a]);
            return chain;
          };
        },
      },
    );
    return chain;
  };
  const client = {
    from: (table: string) => ({
      select: (...a: unknown[]) => builder(table, 'select', a),
      insert: (...a: unknown[]) => builder(table, 'insert', a),
      update: (...a: unknown[]) => builder(table, 'update', a),
      delete: (...a: unknown[]) => builder(table, 'delete', a),
    }),
  };
  return { client, log };
}
