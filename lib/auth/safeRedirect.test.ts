import { safeInternalPath } from './safeRedirect';

const FALLBACK = '/ka/dashboard';

describe('safeInternalPath — open-redirect guard', () => {
  test('passes legitimate same-origin absolute paths through unchanged', () => {
    expect(safeInternalPath('/ka/dashboard', FALLBACK)).toBe('/ka/dashboard');
    expect(safeInternalPath('/en/library', FALLBACK)).toBe('/en/library');
    expect(safeInternalPath('/ka/dashboard?x=1', FALLBACK)).toBe('/ka/dashboard?x=1');
  });

  test('rejects external + protocol-relative targets', () => {
    for (const evil of ['https://evil.com', 'http://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      expect(safeInternalPath(evil, FALLBACK)).toBe(FALLBACK);
    }
  });

  // The confirmed BLOCKER: a browser/URL-parser strips ASCII tab/CR/LF, so '/\t/evil.com'
  // resolves to '//evil.com' → off-origin. The regex-only guard let these through.
  test('rejects control-char open-redirect bypasses (tab / CR / LF, decoded from %09/%0D/%0A)', () => {
    for (const evil of ['/\t/evil.com', '/\r/evil.com', '/\n/evil.com', '/\t\\evil.com', '/\t//evil.com']) {
      expect(safeInternalPath(evil, FALLBACK)).toBe(FALLBACK);
    }
  });

  // Defence-in-depth: even control chars the URL parser does NOT strip (form-feed, vertical
  // tab) — which would otherwise ride through as a same-origin junk path — return the fallback.
  test('rejects any C0 control char, not just the URL-stripped ones', () => {
    for (const evil of ['/\f/evil.com', '/\v/evil.com', '/\x00/evil', '/\thttps://evil.com', '/\x1f/x']) {
      expect(safeInternalPath(evil, FALLBACK)).toBe(FALLBACK);
    }
  });

  test('rejects empty / nullish / non-absolute input', () => {
    expect(safeInternalPath('', FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath('relative/path', FALLBACK)).toBe(FALLBACK);
  });

  test('rejects login/auth self-referential targets (would loop the authed short-circuit)', () => {
    expect(safeInternalPath('/ka/login', FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath('/en/auth', FALLBACK)).toBe(FALLBACK);
    expect(safeInternalPath('/ka/login?redirect=/ka/dashboard', FALLBACK)).toBe(FALLBACK);
  });

  test('does not over-block paths that merely contain the substring', () => {
    expect(safeInternalPath('/ka/logins-report', FALLBACK)).toBe('/ka/logins-report');
    expect(safeInternalPath('/ka/authors', FALLBACK)).toBe('/ka/authors');
  });
});
