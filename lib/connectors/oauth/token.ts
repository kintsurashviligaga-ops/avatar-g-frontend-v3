/**
 * lib/connectors/oauth/token.ts — the pure helpers of a token connector (no flag, no Supabase import), so the agent's
 * tool list can use them without loading the admin guard or the env schema.
 */
import { decryptToken } from '@/lib/connectors/google/crypto';
import type { TokenConnectorDeps, TokenConnectorSpec } from './types';

/** The callback URL registered at the provider: fixed per deployment. */
export function tokenRedirectUri(spec: Pick<TokenConnectorSpec, 'id'>, origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/connectors/${spec.id}/callback`;
}

/** The plain token for this user, or null (not linked, tampered, another user's row, store down). */
export async function linkedToken(deps: TokenConnectorDeps, userId: string): Promise<string | null> {
  if (!deps.cfg || !deps.store || !deps.tableReady) return null;
  const row = await deps.store.get(userId).catch(() => null);
  return row ? decryptToken(row.sealedRefreshToken, userId, deps.cfg.keys) : null;
}

