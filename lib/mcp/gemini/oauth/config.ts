import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

export type BrokerConfig = { clientId: string; clientSecret: string; redirectUri: string; resource: string };

/** The prototype stays closed until explicitly configured. All trust anchors are
 * server settings, never headers or URLs supplied by the caller. */
export function brokerConfig(env: NodeJS.ProcessEnv = process.env): BrokerConfig | null {
  // These token endpoints are not wired to upstream authorization or RLS.
  // A single environment flag must never expose this prototype in production.
  if (env.NODE_ENV === 'production' || env.MCP_BROKER_EXPERIMENTAL !== 'true') return null;
  const clientId = env.MCP_BROKER_CLIENT_ID ?? '';
  const clientSecret = env.MCP_BROKER_CLIENT_SECRET ?? '';
  const redirectUri = env.MCP_BROKER_REDIRECT_URI ?? '';
  const resource = env.MCP_GEMINI_RESOURCE_URL ?? '';
  if (!clientId || clientId.length > 256 || Buffer.byteLength(clientSecret) < 32 || clientSecret.length > 4096) return null;
  try {
    const redirect = new URL(redirectUri);
    const target = new URL(resource);
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.href !== redirectUri ||
        target.protocol !== 'https:' || target.username || target.password || target.hash || target.search ||
        target.pathname !== '/api/mcp/gemini' || target.href !== resource) return null;
    return { clientId, clientSecret, redirectUri, resource };
  } catch { return null; }
}

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
/** Compare both credentials even on mismatch; never log either credential. */
export function validClient(config: BrokerConfig, id: string, secret: string): boolean {
  if (id.length > 4096 || secret.length > 4096) return false;
  const idOk = timingSafeEqual(digest(id), digest(config.clientId));
  const secretOk = timingSafeEqual(digest(secret), digest(config.clientSecret));
  return idOk && secretOk;
}

/** OAuth HTTP Basic uses form-encoded client credentials. Reject malformed,
 * mixed or repeated credentials rather than guessing which value is intended. */
export function clientCredentials(header: string | null, form: URLSearchParams): { id: string; secret: string } | null {
  const ids = form.getAll('client_id');
  const secrets = form.getAll('client_secret');
  if (ids.length > 1 || secrets.length > 1) return null;
  if (header) {
    if (ids.length || secrets.length) return null;
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
    const encoded = match?.[1];
    if (!encoded || encoded.length > 12000) return null;
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator < 1) return null;
      return { id: decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, ' ')), secret: decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, ' ')) };
    } catch { return null; }
  }
  if (ids.length !== 1 || secrets.length !== 1 || !ids[0] || !secrets[0]) return null;
  return { id: ids[0], secret: secrets[0] };
}
