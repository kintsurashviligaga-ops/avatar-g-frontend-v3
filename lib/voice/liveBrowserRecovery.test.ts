import { liveBrowserIntent, liveRecoveryLink } from './liveBrowserRecovery';

test('recovery preserves the current origin/path but discards auth queries and fragments', () => {
  expect(liveRecoveryLink('https://myavatar.ge/ka/dashboard?tool=music&code=private&token=private#private'))
    .toBe('https://myavatar.ge/ka/dashboard?voice=1');
  expect(liveRecoveryLink('http://localhost:3147/ka?old=1')).toBe('http://localhost:3147/ka?voice=1');
  expect(liveRecoveryLink('https://myavatar.ge//example.com?token=private')).toBe('https://myavatar.ge//example.com?voice=1');
});

test.each(['not a URL', 'javascript:alert(1)', 'data:text/plain,secret', 'file:///private/file', 'https://user:password@myavatar.ge/ka'])('unsafe recovery source is refused: %s', (href) => {
  expect(liveRecoveryLink(href)).toBe('');
  expect(liveBrowserIntent(href, 'Android')).toBeNull();
});

test('Android Chrome handoff requires HTTPS and sanitizes its own link too', () => {
  expect(liveBrowserIntent('https://myavatar.ge/ka?token=private#private', 'Android 14'))
    .toBe('intent://myavatar.ge/ka?voice=1#Intent;scheme=https;package=com.android.chrome;end');
  expect(liveBrowserIntent('http://localhost/ka', 'Android 14')).toBeNull();
  expect(liveBrowserIntent('https://myavatar.ge/ka', 'iPhone')).toBeNull();
});
