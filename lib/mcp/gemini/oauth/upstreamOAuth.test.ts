/** @jest-environment node */
import { createClient } from '@supabase/supabase-js';
import { exchangeUpstreamCode, refreshUpstreamToken, upstreamAuthorizationUrl, upstreamConfig } from './upstreamOAuth';
jest.mock('server-only', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', MCP_BROKER_UPSTREAM_CLIENT_ID: 'client', MCP_BROKER_UPSTREAM_CLIENT_SECRET: 's'.repeat(32), MCP_BROKER_UPSTREAM_REDIRECT_URI: 'https://myavatar.ge/api/mcp/oauth/upstream/callback', MCP_GEMINI_RESOURCE_URL: 'https://myavatar.ge/api/mcp/gemini' };
const config = upstreamConfig(env)!;
const verifier = 'v'.repeat(43);
const exp = () => Math.floor(Date.now() / 1000) + 300;

beforeEach(() => {
  (createClient as jest.Mock).mockReturnValue({ auth: {
    getClaims: async () => ({ data: { claims: { iss: config.issuer, sub: 'user-a', client_id: config.clientId, aud: 'authenticated', exp: exp() } }, error: null }),
    getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
  } });
});
afterEach(() => jest.resetAllMocks());

test('accepts only a trusted exact callback origin and strong client secret', () => {
  expect(config.issuer).toBe('https://project.supabase.co/auth/v1');
  expect(upstreamConfig({ ...env, MCP_BROKER_UPSTREAM_REDIRECT_URI: 'https://evil.example/api/mcp/oauth/upstream/callback' })).toBeNull();
  expect(upstreamConfig({ ...env, MCP_BROKER_UPSTREAM_CLIENT_SECRET: 'short' })).toBeNull();
  expect(upstreamConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'http://project.supabase.co' })).toBeNull();
});

test('builds a fixed upstream authorization URL with independent PKCE', () => {
  const url = new URL(upstreamAuthorizationUrl(config, 's'.repeat(43), 'c'.repeat(43))!);
  expect(url.origin).toBe('https://project.supabase.co');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
  expect(upstreamAuthorizationUrl(config, 'short', 'c'.repeat(43))).toBeNull();
});

test('validates the returned signed OAuth identity before exposing tokens to its caller', async () => {
  const request = jest.fn(async () => Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 300 }));
  const tokens = await exchangeUpstreamCode(config, 'one-time-code', verifier, 'user-a', request as unknown as typeof fetch);
  expect(tokens).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
  expect(request).toHaveBeenCalledWith(`${config.issuer}/oauth/token`, expect.objectContaining({ redirect: 'error', cache: 'no-store' }));
  (createClient as jest.Mock).mockReturnValue({ auth: {
    getClaims: async () => ({ data: { claims: { iss: config.issuer, sub: 'other', client_id: config.clientId, aud: 'authenticated', exp: exp() } }, error: null }),
    getUser: jest.fn(),
  } });
  expect(await exchangeUpstreamCode(config, 'one-time-code', verifier, 'user-a', request as unknown as typeof fetch)).toBeNull();
});

test('rejects non-success, missing refresh token and malformed verifier', async () => {
  const request = jest.fn(async () => Response.json({ access_token: 'access', expires_in: 300 }));
  expect(await exchangeUpstreamCode(config, 'code', verifier, 'user-a', request as unknown as typeof fetch)).toBeNull();
  expect(await exchangeUpstreamCode(config, 'code', 'short', 'user-a', request as unknown as typeof fetch)).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});

test('refresh returns the rotated token or keeps the previous token when rotation is omitted', async () => {
  const rotated = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300 }));
  expect(await refreshUpstreamToken(config, 'old-refresh', 'user-a', rotated as unknown as typeof fetch)).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' });
  const options = rotated.mock.calls[0]?.[1] as unknown as RequestInit;
  expect(options.body).toBeInstanceOf(URLSearchParams);
  expect((options.body as URLSearchParams).get('grant_type')).toBe('refresh_token');
  const unchanged = jest.fn(async () => Response.json({ access_token: 'new-access', expires_in: 300 }));
  expect(await refreshUpstreamToken(config, 'old-refresh', 'user-a', unchanged as unknown as typeof fetch)).toMatchObject({ refreshToken: 'old-refresh' });
});

test('refresh fails closed on subject mismatch or an uncertain network result', async () => {
  const request = jest.fn(async () => Response.json({ access_token: 'access', refresh_token: 'rotated', expires_in: 300 }));
  expect(await refreshUpstreamToken(config, 'old-refresh', 'different-user', request as unknown as typeof fetch)).toBeNull();
  const failure = jest.fn(async () => { throw new Error('network'); });
  expect(await refreshUpstreamToken(config, 'old-refresh', 'user-a', failure as unknown as typeof fetch)).toBeNull();
  expect(failure).toHaveBeenCalledTimes(1);
});
