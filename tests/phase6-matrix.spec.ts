import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * tests/phase6-matrix.spec.ts — MASTER TASK v3.1 Phase 6, the cross-surface matrix the other specs leave thin:
 * every UI language (ka / en / ru) on a desktop and a phone screen, keyboard and touch, reduced motion, the guest
 * boundary, and rapid navigation. The server runs on a dummy Supabase (as preview-e2e), so every visitor is a guest
 * and nothing can reach a paid provider.
 *
 * What each test holds:
 *  · the home page and the studio open in the URL's language (<html lang> follows it), fit the screen with no sideways
 *    scroll, and raise no uncaught page error;
 *  · the composer is reachable: by Tab alone on a desktop, by a tap on a phone;
 *  · with "reduce motion" on, the page sees the preference, and no endlessly repeating animation runs on the studio;
 *  · a guest's Library is the labelled demo library, with nothing to delete;
 *  · once per run, the paid image, speech, avatar and music endpoints refuse a guest before any provider call (401/403,
 *    or music's named 503 refusal on this keyless server);
 *  · fast navigation (home → studio → library → pricing → studio, then back and forward, each before the last finished
 *    loading) ends on a rendered page with no page error, and the studio still opens after it.
 * Screenshots of the studio in each language and size are attached as evidence (docs/master-v3.1/VERIFICATION.md).
 */

const LOCALES = ['ka', 'en', 'ru'] as const;
const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

/** Uncaught errors the page raises (not console noise from the dummy backend). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
  return errors;
}

async function fitsScreen(page: Page): Promise<{ inner: number; doc: number; body: number }> {
  return page.evaluate(() => ({
    inner: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
}

async function openStudio(page: Page, locale: string): Promise<void> {
  await page.goto(`/${locale}/dashboard?tool=chat`);
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
}

async function attachShot(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

for (const [size, use] of Object.entries(SIZES)) {
  test.describe(`${size}`, () => {
    test.use(use);

    for (const locale of LOCALES) {
      test(`${locale}: home and studio open in ${locale}, fit the screen and raise no page error`, async ({ page }, info) => {
        const errors = watchErrors(page);

        await page.goto(`/${locale}`);
        await expect(page.locator('html')).toHaveAttribute('lang', locale, { timeout: 15_000 });
        let w = await fitsScreen(page);
        expect(w.doc, 'home scrolls sideways').toBeLessThanOrEqual(w.inner + 1);

        await openStudio(page, locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        w = await fitsScreen(page);
        expect(w.doc, 'studio scrolls sideways').toBeLessThanOrEqual(w.inner + 1);
        await attachShot(page, info, `studio-${locale}-${size}`);

        expect(errors).toEqual([]);
      });
    }

    test('the composer is reachable without a mouse', async ({ page }) => {
      await openStudio(page, 'en');
      const composer = page.getByTestId('composer-input');
      if (size === 'phone') {
        await composer.tap();
        await expect(composer).toBeFocused();
        return;
      }
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      let reached = false;
      for (let i = 0; i < 80 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await composer.evaluate((el) => el === document.activeElement);
      }
      expect(reached, 'Tab never reaches the composer').toBe(true);
      await page.keyboard.type('hello');
      await expect(composer).toHaveValue(/hello/);
    });

    test('reduced motion: the page sees the preference and nothing animates endlessly', async ({ browser }, info) => {
      const context = await browser.newContext({ ...use, reducedMotion: 'reduce' });
      const page = await context.newPage();
      try {
        await openStudio(page, 'ka');
        expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
        await page.waitForTimeout(1_500); // let the first paint's transitions settle
        const endless = await page.evaluate(() =>
          document.getAnimations()
            .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity)
            .map((a) => {
              const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
              const name = (a as CSSAnimation).animationName ?? a.constructor.name;
              return `${name} on ${target?.tagName.toLowerCase() ?? '?'}.${String(target?.className ?? '').slice(0, 80)}`;
            }));
        await info.attach('endless-animations.json', { body: JSON.stringify(endless, null, 1), contentType: 'application/json' });
        expect(endless).toEqual([]);
      } finally {
        await context.close();
      }
    });

    test('a guest: the Library is the labelled demo library, with nothing to delete', async ({ page, request }) => {
      const read = page.waitForResponse((r) => r.url().includes('/api/studio/library') && r.request().method() === 'GET', { timeout: 30_000 });
      await page.goto('/en/library');
      await read;
      await expect(page.getByRole('button', { name: /^delete/i })).toHaveCount(0);

      const lib = await request.get('/api/studio/library');
      expect([200, 503]).toContain(lib.status());
      if (lib.status() === 200) expect((await lib.json()).demo).toBe(true);
    });

    test('fast navigation lands on a working page with no page error', async ({ page }) => {
      const errors = watchErrors(page);
      for (const path of ['/en', '/en/dashboard?tool=chat', '/en/library', '/en/pricing', '/en/dashboard?tool=chat']) {
        await page.goto(path, { waitUntil: 'commit' });
      }
      await page.goBack({ waitUntil: 'commit' });
      await page.goBack({ waitUntil: 'commit' });
      await page.goForward({ waitUntil: 'commit' });
      await page.goForward({ waitUntil: 'commit' });
      // Where history lands depends on the screen (a phone keeps a history step for an open sheet), so the end page
      // is any of the visited ones; it must have finished rendering, and nothing may have thrown on the way.
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(/\/en(\/(dashboard\?tool=chat|library|pricing))?$/);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
      await page.goto('/en/dashboard?tool=chat');
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
      expect(errors).toEqual([]);
    });
  });
}

// Once per run, not per screen size: the paid routes share one per-address EXPENSIVE bucket (5 calls a minute), so
// probing them on both sizes would trip the rate limit and stop proving the sign-in gate.
test('a guest: paid endpoints refuse before any work', async ({ request }) => {
  const probe = { prompt: 'a guest probe', text: 'a guest probe', makeInstrumental: true };
  // Routes that reach their sign-in check answer a guest 401/403.
  for (const path of ['/api/image/jobs/quote', '/api/tts/gemini', '/api/nanobanana/image', '/api/avatar/veo']) {
    const res = await request.post(path, { data: probe });
    expect([401, 403], `${path} answered ${res.status()}`).toContain(res.status());
  }
  // Music refuses even earlier on this server: the studio is switched off (not_enabled), and the platform budget guard
  // cannot reach its store (platform_budget). Either is a named refusal before any provider call, never a 200; past
  // those gates the music route's requireAuthForGeneration answers a guest 401.
  for (const path of ['/api/music/studio/quote', '/api/ai/music']) {
    const res = await request.post(path, { data: probe });
    const status = res.status();
    if (status === 401 || status === 403) continue;
    expect(status, `${path} answered ${status}`).toBe(503);
    expect(['not_enabled', 'platform_budget'], `${path} refusal code`).toContain((await res.json()).code);
  }
});
