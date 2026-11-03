/** @jest-environment node */
import { parseAuthorizationRequest } from './authorization';
import type { BrokerConfig } from './config';

const config: BrokerConfig = { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://client.example/callback', resource: 'https://myavatar.ge/api/mcp/gemini' };
const valid = () => new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', resource: config.resource, state: 'state', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', scope: 'mcp:read mcp:write' });

test('accepts only the registered client, exact resource and S256 PKCE', () => {
  expect(parseAuthorizationRequest(valid(), config)).toEqual({ state: 'state', challenge: 'x'.repeat(43), scopes: ['mcp:read', 'mcp:write'] });
  for (const [key, value] of [['client_id', 'other'], ['redirect_uri', 'https://evil.example/callback'], ['resource', 'https://evil.example'], ['code_challenge_method', 'plain'], ['scope', 'mcp:read admin']]) {
    const params = valid(); params.set(key!, value!);
    expect(parseAuthorizationRequest(params, config)).toBeNull();
  }
});

test('rejects duplicated security-sensitive parameters', () => {
  const params = valid(); params.append('redirect_uri', config.redirectUri);
  expect(parseAuthorizationRequest(params, config)).toBeNull();
});

test('preview requires read-only scope', () => {
  expect(parseAuthorizationRequest(valid(), config, true)).toBeNull();
  const read = valid(); read.set('scope', 'mcp:read');
  expect(parseAuthorizationRequest(read, config, true)?.scopes).toEqual(['mcp:read']);
});
