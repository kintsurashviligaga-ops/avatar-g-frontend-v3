/**
 * lib/connectors/oauth/live.ts — the live wiring of a token connector (server only): config from env when the flag
 * opens it to this user, the service-role store for its provider, and the connector_accounts probe. Closed = cfg null,
 * which every caller reads as "not offered".
 */
import type { User } from '@supabase/supabase-js';
import { createConnectorAccountStore } from '@/lib/connectors/google/store';
import { flagOpenTo } from './access';
import type { TokenConnectorDeps, TokenConnectorSpec } from './types';
export { linkedToken, tokenRedirectUri } from './token';

type Sb = Parameters<typeof createConnectorAccountStore>[0];

export async function liveTokenDeps(spec: TokenConnectorSpec, user: User | null, env: NodeJS.ProcessEnv = process.env): Promise<TokenConnectorDeps> {
  const cfg = flagOpenTo(user, spec.flag, env) ? spec.config(env) : null;
  if (!cfg) return { cfg: null, store: null, tableReady: false };
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const sb = createServiceRoleClient() as unknown as Sb;
    return { cfg, store: createConnectorAccountStore(sb, spec.id), tableReady: await providerRowsAllowed(sb, spec.id) };
  } catch {
    return { cfg, store: null, tableReady: false };
  }
}

/**
 * The APPLIED connector_accounts migration (20261101a) allows provider 'google_drive' only. Rows for notion/github need
 * 20261120a (widens the check). There is no cheap read that proves a CHECK constraint, so the probe reads the
 * information schema's check clause; any failure = not ready (the connector then says "needs setup", never fakes a link).
 */
const probes = new Map<string, { at: number; ready: boolean }>();
async function providerRowsAllowed(sb: Sb, provider: string, now = Date.now()): Promise<boolean> {
  const hit = probes.get(provider);
  if (hit && now - hit.at < (hit.ready ? 300_000 : 30_000)) return hit.ready;
  let ready = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = (sb as any).rpc;
    if (typeof rpc === 'function') {
      const { data, error } = await rpc.call(sb, 'connector_providers_allowed');
      ready = !error && Array.isArray(data) && data.map(String).includes(provider);
    }
  } catch {
    ready = false;
  }
  probes.set(provider, { at: now, ready });
  return ready;
}
