import type { BrokerConfig } from './config';

export type AuthorizationRequest = {
  state: string;
  challenge: string;
  scopes: string[];
};

/** Validate a broker authorization request before any consent or grant exists.
 * This parser does not authenticate a user or issue an authorization code. */
export function parseAuthorizationRequest(params: URLSearchParams, config: BrokerConfig, readOnly = false): AuthorizationRequest | null {
  const one = (name: string): string | null => {
    const values = params.getAll(name);
    return values.length === 1 && values[0] ? values[0] : null;
  };
  const client = one('client_id');
  const redirect = one('redirect_uri');
  const responseType = one('response_type');
  const resource = one('resource');
  const state = one('state');
  const challenge = one('code_challenge');
  const method = one('code_challenge_method');
  const rawScope = one('scope');
  if (client !== config.clientId || redirect !== config.redirectUri || responseType !== 'code' ||
      resource !== config.resource || !state || state.length > 1024 || /[\u0000-\u001f\u007f]/.test(state) ||
      !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || method !== 'S256' || !rawScope) return null;
  const scopes = rawScope.split(/\s+/).filter(Boolean);
  if (!scopes.includes('mcp:read') || new Set(scopes).size !== scopes.length ||
      scopes.some((scope) => scope !== 'mcp:read' && scope !== 'mcp:write') || (readOnly && scopes.includes('mcp:write'))) return null;
  return { state, challenge, scopes };
}
