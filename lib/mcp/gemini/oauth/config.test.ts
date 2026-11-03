/** @jest-environment node */
import { brokerConfig } from './config';
jest.mock('server-only', () => ({}));

const base = { NODE_ENV: 'production', MCP_BROKER_EXPERIMENTAL: 'true', MCP_BROKER_PREVIEW_ENABLED: 'true',
  MCP_BROKER_CLIENT_ID: 'client', MCP_BROKER_CLIENT_SECRET: 'synthetic-client-secret-for-tests-only',
  MCP_BROKER_REDIRECT_URI: 'https://client.example/callback', VERCEL_URL: 'build-project.vercel.app',
  MCP_GEMINI_RESOURCE_URL: 'https://build-project.vercel.app/api/mcp/gemini',
  MCP_BROKER_PREVIEW_SUPABASE_URL: 'https://staging-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_URL: 'https://staging-project.supabase.co' };

test('production stays closed even with preview flag; preview is deployment-host bound', () => {
  expect(brokerConfig({ ...base, VERCEL_ENV: 'production' })).toBeNull();
  expect(brokerConfig({ ...base, NODE_ENV: 'test', VERCEL_ENV: 'production' })).toBeNull();
  expect(brokerConfig({ ...base })).toBeNull();
  expect(brokerConfig({ ...base, VERCEL_ENV: 'preview', MCP_BROKER_PREVIEW_ENABLED: 'false' })).toBeNull();
  expect(brokerConfig({ ...base, VERCEL_ENV: 'preview', MCP_GEMINI_RESOURCE_URL: 'https://myavatar.ge/api/mcp/gemini' })).toBeNull();
  expect(brokerConfig({ ...base, VERCEL_ENV: 'preview', VERCEL_URL: 'myavatar.ge', MCP_GEMINI_RESOURCE_URL: 'https://myavatar.ge/api/mcp/gemini' })).toBeNull();
  expect(brokerConfig({ ...base, VERCEL_ENV: 'preview' })?.resource).toBe(base.MCP_GEMINI_RESOURCE_URL);
});

test('preview can derive its resource from the unique Vercel deployment without a circular env setting', () => {
  const preview = { ...base, VERCEL_ENV: 'preview', MCP_GEMINI_RESOURCE_URL: '' };
  expect(brokerConfig(preview)?.resource).toBe('https://build-project.vercel.app/api/mcp/gemini');
  expect(brokerConfig({ ...preview, VERCEL_URL: 'evil.example' })).toBeNull();
  expect(brokerConfig({ ...preview, VERCEL_URL: 'name.vercel.app.attacker.test' })).toBeNull();
  expect(brokerConfig({ ...preview, VERCEL_ENV: 'production' })).toBeNull();
  expect(brokerConfig({ ...preview, MCP_BROKER_PREVIEW_ENABLED: 'false' })).toBeNull();
  expect(brokerConfig({ ...preview, MCP_BROKER_PREVIEW_SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co' })).toBeNull();
});

test('preview requires an explicit isolated canonical staging project for all Supabase clients', () => {
  const preview = { ...base, VERCEL_ENV: 'preview' };
  expect(brokerConfig({ ...preview, MCP_BROKER_PREVIEW_SUPABASE_URL: '' })).toBeNull();
  expect(brokerConfig({ ...preview, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' })).toBeNull();
  expect(brokerConfig({ ...preview, SUPABASE_URL: 'https://zwksnayknzggdcenqqxy.supabase.co' })).toBeNull();
  const production = 'https://zwksnayknzggdcenqqxy.supabase.co';
  expect(brokerConfig({ ...preview, MCP_BROKER_PREVIEW_SUPABASE_URL: production, NEXT_PUBLIC_SUPABASE_URL: production })).toBeNull();
  expect(brokerConfig({ ...preview, NODE_ENV: 'test', MCP_BROKER_PREVIEW_SUPABASE_URL: production, NEXT_PUBLIC_SUPABASE_URL: production })).toBeNull();
  expect(brokerConfig({ ...preview, MCP_BROKER_PREVIEW_SUPABASE_URL: 'https://alias.example.com', NEXT_PUBLIC_SUPABASE_URL: 'https://alias.example.com' })).toBeNull();
  expect(brokerConfig({ ...preview, SUPABASE_URL: preview.NEXT_PUBLIC_SUPABASE_URL })?.resource).toBe(base.MCP_GEMINI_RESOURCE_URL);
});

test('registered redirects cannot pre-populate OAuth response parameters', () => {
  const preview = { ...base, VERCEL_ENV:'preview' };
  for (const key of ['code','state','error','error_description','error_uri']) {
    expect(brokerConfig({ ...preview, MCP_BROKER_REDIRECT_URI:`https://client.example/callback?${key}=bad` })).toBeNull();
  }
  expect(brokerConfig({ ...preview, MCP_BROKER_REDIRECT_URI:'https://client.example/callback?source=gemini' })).not.toBeNull();
});
