/**
 * lib/connectors/google/index.ts — the live wiring of the Drive connector (server only): config from env, the
 * service-role store, the table probe. A user the CONNECTORS_DRIVE flag does not open gets `cfg: null`, which every
 * caller reads as "not configured" (the old 'soon' state).
 */
import type { User } from '@supabase/supabase-js';
import { driveOpenTo } from './access';
import type { DriveDeps } from './drive';
import { driveOAuthConfig } from './oauth';
import { createConnectorAccountStore } from './store';

export async function liveDriveDeps(user: User | null): Promise<DriveDeps> {
  const cfg = driveOpenTo(user) ? driveOAuthConfig() : null;
  if (!cfg) return { cfg: null, store: null, tableReady: false };
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const sb = createServiceRoleClient() as unknown as Parameters<typeof createConnectorAccountStore>[0];
    const ready = await accountsTableReady(sb);
    return { cfg, store: createConnectorAccountStore(sb), tableReady: ready };
  } catch {
    return { cfg, store: null, tableReady: false };
  }
}

/** Where Google sends the user back. Fixed per deployment so it matches the OAuth client's registered URI exactly. */
export function driveRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/connectors/google_drive/callback`;
}

// connector_accounts has no `id` column (its key is user_id + provider), so it gets its own probe. Cached like
// lib/research/capabilities tableReady: 5 min when present, 30 s when missing (a fresh migration shows up fast).
let probe: { at: number; ready: boolean } | null = null;
async function accountsTableReady(sb: Parameters<typeof createConnectorAccountStore>[0], now = Date.now()): Promise<boolean> {
  if (probe && now - probe.at < (probe.ready ? 300_000 : 30_000)) return probe.ready;
  let ready = false;
  try {
    const { error } = await sb.from('connector_accounts').select('user_id').limit(1);
    ready = !error;
  } catch {
    ready = false;
  }
  probe = { at: now, ready };
  return ready;
}
