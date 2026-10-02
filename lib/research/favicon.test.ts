/** @jest-environment node */
import { isAllowedFaviconRedirect, validFaviconDomain } from './favicon';

describe('validFaviconDomain — only public DNS names get through', () => {
  test.each([
    ['example.org', 'example.org'], ['WWW.BBC.COM', 'bbc.com'], ['news.example.co.uk', 'news.example.co.uk'], ['xn--80ak6aa92e.com', 'xn--80ak6aa92e.com'], ['  reuters.com  ', 'reuters.com'],
  ])('%s → %s', (raw, want) => {
    expect(validFaviconDomain(raw)).toBe(want);
  });

  test.each([
    'localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '[::1]', 'a', 'no-dot', 'a..b.com', '-bad.com', 'bad-.com', 'under_score.com', 'host.com:8080', 'host.com/path', 'user@host.com',
    'http://host.com', 'host.com?x=1', 'intranet.corp', 'printer.local', 'service.internal', 'x.test', 'a.invalid', 'foo.example', 'a'.repeat(300) + '.com', '', 'bbc.c', 'bbc.123',
  ])('%s is refused', (raw) => {
    expect(validFaviconDomain(raw)).toBeNull();
  });

  test('non-strings are refused', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(validFaviconDomain(v)).toBeNull();
  });
});

describe('isAllowedFaviconRedirect', () => {
  const base = 'https://www.google.com/s2/favicons?domain=bbc.com&sz=64';
  test('Google\'s image hosts over https are allowed', () => {
    expect(isAllowedFaviconRedirect('https://t0.gstatic.com/faviconV2?url=https://bbc.com', base)).toBe(true);
    expect(isAllowedFaviconRedirect('https://t3.gstatic.com/faviconV2', base)).toBe(true);
    expect(isAllowedFaviconRedirect('https://lh3.googleusercontent.com/x', base)).toBe(true);
  });
  test('anything else is not: other hosts, http, look-alikes, internal addresses, junk', () => {
    for (const loc of ['https://evil.example.net/x', 'http://t0.gstatic.com/x', 'https://t0.gstatic.com.evil.com/x', 'https://gstatic.com.evil.com/', 'https://169.254.169.254/latest/meta-data', 'https://localhost/', 'javascript:alert(1)', '', 'not a url']) {
      expect(isAllowedFaviconRedirect(loc, base)).toBe(false);
    }
  });
});
