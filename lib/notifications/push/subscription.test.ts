/** @jest-environment node */
/**
 * What a PushSubscription must look like before the server stores it — above all, that its endpoint (a URL our server will
 * POST to) is https on a real push service and nothing else.
 */
import { isAllowedPushEndpoint, subscribeBodySchema } from './subscription';
import { testBrowserKeys } from './testing/keys';

describe('isAllowedPushEndpoint', () => {
  test.each([
    'https://fcm.googleapis.com/fcm/send/dXJ0:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk',
    'https://web.push.apple.com/QHJ0dKu',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
    'https://fcm.googleapis.com:443/fcm/send/x',
  ])('accepts a real push service: %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  test.each([
    'http://fcm.googleapis.com/fcm/send/x', // not https
    'https://evil.example/fcm/send/x', // not a push service
    'https://fcm.googleapis.com.evil.example/x', // a lookalike suffix
    'https://evilpush.apple.com.attacker.net/x',
    'https://notpush.apple.com/x', // a suffix without the dot boundary would match this
    'https://generativelanguage.googleapis.com/v1/models', // another Google API is not a push service
    'https://user:pass@fcm.googleapis.com/x', // credentials
    'https://fcm.googleapis.com:8443/x', // another port
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
    'javascript:alert(1)',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });

  test('refuses an endpoint longer than the table holds', () => {
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${'x'.repeat(2100)}`)).toBe(false);
  });
});

describe('subscribeBodySchema', () => {
  const keys = testBrowserKeys();
  const body = (over: Record<string, unknown> = {}, keyOver: Record<string, unknown> = {}) => ({
    subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', expirationTime: null, keys: { ...keys, ...keyOver }, ...over },
    locale: 'en',
  });

  test('a browser subscription passes, and padded keys are stored unpadded', () => {
    const r = subscribeBodySchema.safeParse(body({}, { auth: `${keys.auth}==` }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.subscription.keys.auth).toBe(keys.auth);
  });

  test.each([
    ['an endpoint on an unknown host', body({ endpoint: 'https://evil.example/push' })],
    ['an http endpoint', body({ endpoint: 'http://fcm.googleapis.com/fcm/send/abc' })],
    ['a p256dh that is not a P-256 point', body({}, { p256dh: Buffer.alloc(65, 7).toString('base64url') })],
    ['a short auth secret', body({}, { auth: Buffer.alloc(8).toString('base64url') })],
    ['a key with a character base64url does not have', body({}, { p256dh: `${keys.p256dh.slice(0, -1)}+` })],
    ['missing keys', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' } }],
    ['an unknown locale', { ...body(), locale: 'de' }],
    ['no body at all', null],
  ])('refuses %s', (_label, input) => {
    expect(subscribeBodySchema.safeParse(input).success).toBe(false);
  });
});
