/**
 * lib/agent/workspace/dbLock.ts — the workspace lease every server instance shares:
 * supabase/migrations/20261127a_workspace_locks.sql (Phase 8.23, flag WORKSPACE_LOCKS=1, off by default).
 *
 * `acquire` answers true (the lease is ours), false (another live holder has it), or THROWS when the lock cannot be
 * reached: no client, the function not created yet, a DB error. The store treats a throw as "no lock available" and
 * writes as it did before the lock existed, so turning the flag on before the SQL runs changes nothing.
 * Postgres advisory locks were not used: a transaction lock ends when the RPC returns, before the storage writes it
 * should cover, and a session lock is unsafe behind the connection pooler.
 */
import 'server-only';
import type { WorkspaceLock } from './store';

type RpcError = { code?: string; message?: string } | null;
export interface LockRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}

async function serviceRoleClient(): Promise<LockRpcClient> {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  const c = createServiceRoleClient();
  if (!c) throw new Error('storage not configured');
  return c as unknown as LockRpcClient;
}

export function dbWorkspaceLock(opts: { client?: () => LockRpcClient | Promise<LockRpcClient> } = {}): WorkspaceLock {
  const client = opts.client ?? serviceRoleClient;
  return {
    async acquire(uid, ws, holder, ttlSec) {
      const { data, error } = await (await client()).rpc('workspace_lock_acquire', { p_user: uid, p_ws: ws, p_holder: holder, p_ttl: ttlSec });
      if (error) throw new Error(error.message ?? error.code ?? 'workspace_lock_acquire failed');
      if (typeof data !== 'boolean') throw new Error('workspace_lock_acquire answered no boolean');
      return data;
    },
    async release(uid, ws, holder) {
      const { error } = await (await client()).rpc('workspace_lock_release', { p_user: uid, p_ws: ws, p_holder: holder });
      // A lease that cannot be released ends by itself after its TTL.
      if (error) throw new Error(error.message ?? error.code ?? 'workspace_lock_release failed');
    },
  };
}
