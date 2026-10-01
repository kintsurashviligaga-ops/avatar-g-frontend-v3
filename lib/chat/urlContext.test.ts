/**
 * @jest-environment node
 *
 * The url_context gate: env GEMINI_CHAT_URL_CONTEXT must be exactly `1` (default OFF — google_search + url_context on
 * gemini-3.8-flash is unverified live, and a 400 there would fail the turn without rotation), AND the latest user
 * message must carry a real http(s) link.
 */
import { containsHttpUrl, urlContextEnabled, wantsUrlContext } from './urlContext';

describe('containsHttpUrl', () => {
  it('finds http(s) links anywhere, including glued to Georgian or Cyrillic text', () => {
    expect(containsHttpUrl('read https://example.com/a?b=1')).toBe(true);
    expect(containsHttpUrl('წაიკითხე:https://myavatar.ge/ka')).toBe(true);
    expect(containsHttpUrl('статья http://пример.рф/статья.')).toBe(true); // IDN host → xn-- TLD
    expect(containsHttpUrl('(see https://docs.example.org/x).')).toBe(true);
    expect(containsHttpUrl('HTTPS://EXAMPLE.COM')).toBe(true);
    expect(containsHttpUrl('ip http://8.8.8.8/x')).toBe(true);
  });

  it('ignores text without a usable public link', () => {
    for (const t of ['no link here', 'www.example.com without a scheme', 'ftp://example.com/file', 'http://localhost:3000/x', 'https://', 'mailto:a@b.ge', 'javascript:alert(1)']) {
      expect(containsHttpUrl(t)).toBe(false);
    }
    for (const t of [undefined, null, 42, {}]) expect(containsHttpUrl(t)).toBe(false);
  });

  it('scans only the head of a huge message and stays fast', () => {
    const filler = 'ა '.repeat(40_000);
    expect(containsHttpUrl(`${filler}https://example.com`)).toBe(false);
    const started = Date.now();
    containsHttpUrl(`https://${'a'.repeat(1_000_000)}`);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('the env switch', () => {
  it('is on only for exactly "1"', () => {
    expect(urlContextEnabled({})).toBe(false);
    expect(urlContextEnabled({ GEMINI_CHAT_URL_CONTEXT: '' })).toBe(false);
    expect(urlContextEnabled({ GEMINI_CHAT_URL_CONTEXT: '0' })).toBe(false);
    expect(urlContextEnabled({ GEMINI_CHAT_URL_CONTEXT: 'true' })).toBe(false);
    expect(urlContextEnabled({ GEMINI_CHAT_URL_CONTEXT: '1' })).toBe(true);
    expect(urlContextEnabled({ GEMINI_CHAT_URL_CONTEXT: ' 1 ' })).toBe(true);
  });

  it('wantsUrlContext needs both the switch and a link', () => {
    const on = { GEMINI_CHAT_URL_CONTEXT: '1' };
    expect(wantsUrlContext('summarize https://example.com', on)).toBe(true);
    expect(wantsUrlContext('summarize https://example.com', {})).toBe(false);
    expect(wantsUrlContext('summarize this', on)).toBe(false);
  });
});
