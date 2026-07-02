import { htmlToReadableText, scrapeWebpage } from './scrapeWebpage';

describe('scrape_webpage extraction (STEP 3, pure)', () => {
  const html = `<!doctype html><html><head><title>  Acme Pricing  </title>
    <style>.x{color:red}</style><script>track()</script></head>
    <body><nav>Home About</nav>
    <h1>Plans</h1><p>Pro is $29/mo.</p><p>Team is $99/mo &amp; scales.</p>
    <svg><path d="M0"/></svg><footer>© 2026</footer></body></html>`;

  it('extracts the title and readable body, dropping script/style/nav/svg/footer', () => {
    const { title, text } = htmlToReadableText(html);
    expect(title).toBe('Acme Pricing');
    expect(text).toMatch(/Plans/);
    expect(text).toMatch(/Pro is \$29\/mo/);
    expect(text).toMatch(/Team is \$99\/mo & scales/); // entity decoded
    expect(text).not.toMatch(/track\(\)/); // script removed
    expect(text).not.toMatch(/color:red/); // style removed
    expect(text).not.toMatch(/Home About/); // nav removed
  });

  it('honors maxChars', () => {
    const { text } = htmlToReadableText('<p>' + 'a'.repeat(500) + '</p>', 100);
    expect(text.length).toBeLessThanOrEqual(100);
  });

  it('scrapeWebpage rejects a non-URL without throwing', async () => {
    const r = await scrapeWebpage({ url: 'not a url' } as never);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid url/);
  });

  it('scrapeWebpage returns a structured error (never throws) on fetch failure', async () => {
    const r = await scrapeWebpage({ url: 'http://127.0.0.1:0/nope' });
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});
