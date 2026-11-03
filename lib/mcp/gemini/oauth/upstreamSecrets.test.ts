/** @jest-environment node */
import { brokerEncryptionKey, openUpstreamToken, sealUpstreamToken } from './upstreamSecrets';
jest.mock('server-only', () => ({}));

const key = Buffer.alloc(32, 7);
const binding = { grantId: 'grant-a', userId: 'user-a', clientId: 'client-a' };

test('requires a canonical independent 256-bit base64 key', () => {
  expect(brokerEncryptionKey({ MCP_BROKER_ENCRYPTION_KEY: key.toString('base64') })).toEqual(key);
  expect(brokerEncryptionKey({ MCP_BROKER_ENCRYPTION_KEY: 'bad' })).toBeNull();
  expect(brokerEncryptionKey({ CONNECTOR_TOKEN_KEY: key.toString('base64') })).toBeNull();
});

test('encrypts with random IV and binds each envelope to grant, user, client and token type', () => {
  const one = sealUpstreamToken('synthetic-token', binding, 'refresh', key)!;
  const two = sealUpstreamToken('synthetic-token', binding, 'refresh', key)!;
  expect(one).not.toBe(two);
  expect(one).not.toContain('synthetic-token');
  expect(openUpstreamToken(one, binding, 'refresh', key)).toBe('synthetic-token');
  for (const replacement of [{ ...binding, grantId: 'other' }, { ...binding, userId: 'other' }, { ...binding, clientId: 'other' }]) {
    expect(openUpstreamToken(one, replacement, 'refresh', key)).toBeNull();
  }
  expect(openUpstreamToken(one, binding, 'access', key)).toBeNull();
  expect(openUpstreamToken(one + '.', binding, 'refresh', key)).toBeNull();
  expect(openUpstreamToken(one, binding, 'refresh', Buffer.alloc(32, 8))).toBeNull();
  const parts = one.split('.');
  parts[2] = (parts[2]![0] === 'A' ? 'B' : 'A') + parts[2]!.slice(1);
  expect(openUpstreamToken(parts.join('.'), binding, 'refresh', key)).toBeNull();
});
