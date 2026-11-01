/**
 * The sandbox spend store every server instance shares: supabase/migrations/20261031b_sandbox_spend.sql.
 *
 * Fails closed. If the client cannot be built, the functions are missing, or the database answers with an error,
 * `reserve` returns null and the runner refuses the run. That is the opposite of the idempotency store on purpose:
 * here an unreadable ledger must never let money be spent.
 */
import 'server-only';
import type { SandboxSpendStore } from './budget';

type RpcError = { code?: string; message?: string } | null;
export interface SpendRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
  from(table: string): { select(cols: string): PromiseLike<{ data: unknown; error: RpcError }> };
}

async function serviceRoleClient(): Promise<SpendRpcClient> {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  return createServiceRoleClient() as unknown as SpendRpcClient;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dbSpendStore(opts: { userId?: string | null; client?: () => SpendRpcClient | Promise<SpendRpcClient> } = {}): SandboxSpendStore {
  const client = opts.client ?? serviceRoleClient;
  const user = opts.userId && UUID.test(opts.userId) ? opts.userId : null;
  return {
    async reserve(usd, cap) {
      try {
        const { data, error } = await (await client()).rpc('reserve_sandbox_spend', { p_usd: usd, p_cap: cap, p_user: user });
        if (error || typeof data !== 'string' || !UUID.test(data)) return null;
        return data;
      } catch {
        return null;
      }
    },
    async settle(ticket, _reserved, used) {
      if (!UUID.test(ticket)) return;
      const { error } = await (await client()).rpc('settle_sandbox_spend', { p_id: ticket, p_used: used });
      if (error) throw new Error(error.message ?? 'settle_failed');
    },
    async total() {
      const { data, error } = await (await client()).from('sandbox_spend').select('reserved_usd, used_usd');
      if (error || !Array.isArray(data)) throw new Error(error?.message ?? 'total_failed');
      return (data as { reserved_usd: number | string; used_usd: number | string | null }[]).reduce(
        (sum, r) => sum + Number(r.used_usd ?? r.reserved_usd),
        0,
      );
    },
  };
}
