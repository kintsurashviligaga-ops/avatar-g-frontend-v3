import { openSiteAsk, openSiteGoal } from './openSiteAsk';

describe('openSiteAsk', () => {
  test.each([
    ['გახსენი youtube', 'https://www.youtube.com'],
    ['გამიხსენი იუთუბი', 'https://www.youtube.com'],
    ['შედი youtube-ზე', 'https://www.youtube.com'],
    ['open github.com/vercel', 'https://github.com/vercel'],
    ['გადადი https://example.ge/page', 'https://example.ge/page'],
    ['Go to wikipedia please', 'https://www.wikipedia.org'],
    ['открой ютуб', 'https://www.youtube.com'],
    ['გახსეჯი საიტი magticom.ge', 'https://magticom.ge'], // GG 07:39Z, a typo
    ['magticom.ge საიტი მაჩვენე', 'https://magticom.ge'],
  ])('%s → %s', (text, url) => {
    expect(openSiteAsk(text)).toEqual({ url });
  });

  test('a generic site ask lets Agent G pick the address', () => {
    expect(openSiteAsk('გახსენი საქართველოს პარლამენტის საიტი')).toEqual({ url: null });
  });

  test.each([
    'youtube-ის ბმული გაანალიზე',          // a site named, no open verb
    'გახსენი ვიდეოს ხელსაწყო',              // open a tool, not a site
    'შექმენი ვიდეო youtube-ისთვის',          // create, not open
    'what is google?',
    '',
  ])('not an open-site ask: %s', (text) => {
    expect(openSiteAsk(text)).toBeNull();
  });

  test('the goal carries the address', () => {
    expect(openSiteGoal('გახსენი youtube', { url: 'https://www.youtube.com' })).toContain('https://www.youtube.com');
    expect(openSiteGoal(' გახსენი საიტი ', { url: null })).toBe('გახსენი საიტი');
  });
});

describe('the chat hands an open-site ask to Agent G (GG 2026-11-07 06:58Z)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
  test('only when the browser is open to the user, before any media routing, and the Start card is drawn', () => {
    const turn = src.slice(src.indexOf('agentTurnRef.current = (text: string, viaVoice: boolean): boolean => {'));
    const site = turn.indexOf('openSiteAsk(text)');
    expect(site).toBeGreaterThan(0);
    expect(site).toBeLessThan(turn.indexOf('const isOtherMediaAsk'));
    expect(turn.slice(0, site)).toContain('browserOnRef.current');
    expect(src).toContain("fetch('/api/agent/browser/run', { credentials: 'same-origin' })");
    expect(src).toContain('<PlanStartCard key={`b-${m.browserPlan.token.slice(-12)}`} kind="browser"');
  });
});
