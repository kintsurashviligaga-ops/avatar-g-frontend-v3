import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '../../../supabase/server';
import type { McpPrincipal } from '../auth';
import { brokerConfig } from './config';
import { opaqueTokenDigest } from './tokens';
import { upstreamConfig, verifyUpstreamAccess, refreshUpstreamToken } from './upstreamOAuth';
import { brokerEncryptionKey, openUpstreamToken, sealUpstreamToken } from './upstreamSecrets';

type Grant = { grant_id: string; user_id: string; scopes: string[]; access_ciphertext: string | null; access_expires_at: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function grantRow(value: unknown): Grant | null {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object') return null;
  const row = value[0] as Record<string, unknown>;
  if (typeof row.grant_id !== 'string' || !uuid.test(row.grant_id) || typeof row.user_id !== 'string' || !uuid.test(row.user_id) ||
      !Array.isArray(row.scopes) || !row.scopes.includes('mcp:read') || row.scopes.some((s) => s !== 'mcp:read' && s !== 'mcp:write') ||
      new Set(row.scopes).size !== row.scopes.length ||
      (row.access_ciphertext !== null && typeof row.access_ciphertext !== 'string') ||
      (row.access_expires_at !== null && typeof row.access_expires_at !== 'string')) return null;
  return row as Grant;
}

/** Resolve a resource-bound opaque bearer to an independently verified user
 * token for existing RLS clients. The broker is strictly disabled in production.
 * An uncertain upstream refresh is never retried; re-linking is required. */
export async function resolveBrokerPrincipal(token: string): Promise<McpPrincipal | null> {
  const config = brokerConfig();
  const upstream = upstreamConfig();
  const key = brokerEncryptionKey();
  const hash = opaqueTokenDigest('access', token);
  if (!config || !upstream || !key || !hash) return null;
  try {
    const db = createServiceRoleClient();
    const lookupArgs = { p_access_hash: hash, p_client_id: config.clientId, p_resource: config.resource };
    const lookup = async () => {
      const result = await db.rpc('mcp_oauth_resolve_access', lookupArgs);
      return result.error ? null : grantRow(result.data);
    };
    const row = await lookup();
    if (!row) return null;
    const binding = { grantId: row.grant_id, userId: row.user_id, clientId: config.clientId };
    let access: string;
    const cachedExpiry = row.access_expires_at ? Date.parse(row.access_expires_at) : 0;
    if (row.access_ciphertext && Number.isFinite(cachedExpiry) && cachedExpiry > Date.now() + 60_000) {
      const cached = openUpstreamToken(row.access_ciphertext, binding, 'access', key);
      if (!cached) return null;
      const verifiedExpiry = await verifyUpstreamAccess(upstream, cached, row.user_id);
      if (!verifiedExpiry || verifiedExpiry <= Date.now() + 60_000) return null;
      access = cached;
    } else {
      const claim = randomUUID();
      const args = { p_grant_id: row.grant_id, p_user_id: row.user_id, p_client_id: config.clientId, p_resource: config.resource, p_claim_id: claim };
      const claimed = await db.rpc('mcp_oauth_claim_upstream_refresh', args);
      if (claimed.error || typeof claimed.data !== 'string') return null; // Includes contention.
      let completed = false;
      try {
        const refresh = openUpstreamToken(claimed.data, binding, 'refresh', key);
        if (!refresh) return null;
        const next = await refreshUpstreamToken(upstream, refresh, row.user_id);
        if (!next || next.expiresAt <= Date.now() + 5_000) return null;
        const encryptedAccess = sealUpstreamToken(next.accessToken, binding, 'access', key);
        const encryptedRefresh = sealUpstreamToken(next.refreshToken, binding, 'refresh', key);
        if (!encryptedAccess || !encryptedRefresh) return null;
        const saved = await db.rpc('mcp_oauth_complete_upstream_refresh', {
          ...args, p_access_ciphertext: encryptedAccess, p_refresh_ciphertext: encryptedRefresh,
          p_access_expires_at: new Date(next.expiresAt).toISOString(),
        });
        if (saved.error || saved.data !== true) return null;
        completed = true;
        access = next.accessToken; // Already verified by refreshUpstreamToken.
      } finally {
        if (!completed) {
          // If this call also fails the row stays "refreshing" and remains unusable.
          try { await db.rpc('mcp_oauth_uncertain_upstream_refresh', args); } catch { /* stays locked */ }
        }
      }
    }
    const current = await lookup();
    if (!current || current.grant_id !== row.grant_id || current.user_id !== row.user_id ||
        JSON.stringify(current.scopes) !== JSON.stringify(row.scopes)) return null;
    return { userId: row.user_id, token: access, clientId: config.clientId, scopes: current.scopes };
  } catch { return null; }
}
