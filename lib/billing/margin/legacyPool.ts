/**
 * lib/billing/margin/legacyPool.ts — reads a user's 30-day legacy pool (GG 2026-11-14 10:26Z) and prices one action with it.
 *
 * The pool lives in `credit_legacy_pools` (docs/v8.1-finance/sql/v8_legacy_pool.sql, NOT applied yet: it runs in the
 * DB-up test). Until then, or when the read fails, the state is null and every action costs the v8 price (chargeFor).
 * The pool is only ever shrunk by the `consume_legacy_pool` RPC, in the same call as the debit, so two parallel actions
 * can never both spend the same legacy credits. This file never writes.
 */
import { chargeFor, type Charge, type LegacyState } from './legacy';

export interface LegacyPoolReader {
  from(table: 'credit_legacy_pools'): {
    select(cols: string): { eq(col: string, v: string): { maybeSingle(): PromiseLike<{ data: { pool: number | string | null; launch_at: string | null } | null; error: unknown }> } };
  };
}

/** The user's pool, or null when there is none (bought after launch, table not created yet, read failed). */
export async function readLegacyState(client: LegacyPoolReader, userId: string): Promise<LegacyState | null> {
  try {
    const { data, error } = await client.from('credit_legacy_pools').select('pool,launch_at').eq('user_id', userId).maybeSingle();
    if (error || !data || !data.launch_at) return null;
    const pool = Number(data.pool);
    return Number.isFinite(pool) && pool > 0 ? { legacyPool: pool, launchAt: data.launch_at } : null;
  } catch {
    return null;
  }
}

/** What to charge for one action: today's price from the pool while it lasts and the window is open, else v8. */
export async function priceWithLegacyPool(client: LegacyPoolReader, userId: string, v8Credits: number, legacyCredits: number | null, now: Date = new Date()): Promise<Charge> {
  return chargeFor(v8Credits, legacyCredits, await readLegacyState(client, userId), now);
}
