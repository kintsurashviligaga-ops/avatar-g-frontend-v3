/**
 * perf/library.pw.ts — Library tab switches in a real browser, mock environment (MASTER TASK v3.1 §4.1, §4.2).
 *
 * The signed-in /en/library page runs on the local server; its API answers from fixture rows after a fixed delay and
 * its media come from the repo's fixture files (perf/session.ts). Each sample is a fresh page that opens Image (a tab
 * not seen yet in that page), then goes back to Video (a tab it has already shown: the warm return §4.2 is about).
 *
 * Timed in the page: from the tab's click to the frame after that tab's first card is in the DOM (the card, not its
 * pixels). Beside the time, per switch: whether the gallery showed its loading spinner, how many Library API requests
 * and media requests the switch caused. These are the app's own costs over a fixed fixture, not production numbers.
 *
 * Run: npm run perf:browser (or npx playwright test -c playwright.perf.config.ts perf/library.pw.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { ITEMS_PER_KIND, LIBRARY_API_MS, signedInLibrary, type Traffic } from './session';
import { MIN_P95_SAMPLES, summarize, writeResults } from './stats';

const SAMPLES = Math.max(1, Number(process.env.PERF_SAMPLES) || MIN_P95_SAMPLES);

interface Switch { ms: number; spinner: boolean; library: number; media: number }

/** Clicks the tab named `tab` and resolves when `card` is in the gallery, timed inside the page. */
async function switchTab(page: Page, traffic: Traffic, tab: string, card: string): Promise<Switch> {
  const before = { library: traffic.library.length, media: traffic.media.length };
  const inPage = await page.evaluate(async ({ tab, card }) => {
    const root = [...document.querySelectorAll('h1')].find((h) => h.textContent === 'Library')?.parentElement;
    const button = root && [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === tab);
    if (!root || !button) throw new Error(`no ${tab} tab`);
    let spinner = false;
    const started = performance.now();
    const shown = new Promise<number>((resolve) => {
      const check = () => {
        if (root.querySelector('.animate-spin')) spinner = true;
        if (!root.querySelector(card)) return false;
        requestAnimationFrame(() => resolve(performance.now()));
        return true;
      };
      const watch = new MutationObserver(() => { if (check()) watch.disconnect(); });
      watch.observe(root, { childList: true, subtree: true, attributes: true });
    });
    button.click();
    const at = await shown;
    return { ms: at - started, spinner };
  }, { tab, card });
  await page.waitForTimeout(300); // let a background refresh or a late media read land in this switch's count
  return { ...inPage, library: traffic.library.length - before.library, media: traffic.media.length - before.media };
}

test.use({ viewport: { width: 1280, height: 800 } });

test(`Library tab switches (${SAMPLES} samples)`, async ({ browser, baseURL }) => {
  test.setTimeout(30 * 60_000);
  const first: Switch[] = [];
  const warm: Switch[] = [];
  for (let i = -1; i < SAMPLES; i += 1) { // i = -1 compiles the page and the route; not counted
    const context = await browser.newContext();
    const page = await context.newPage();
    const traffic = await signedInLibrary(page, baseURL);
    await page.goto('/en/library', { waitUntil: 'load' });
    await expect(page.locator('video[src*="film_0"]')).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(300);
    const image = await switchTab(page, traffic, 'Image', 'img[alt="image 0"]');
    const video = await switchTab(page, traffic, 'Video', 'video[src*="film_0"]');
    if (i >= 0) { first.push(image); warm.push(video); }
    await context.close();
  }

  const base = {
    environment: 'mock' as const,
    payload: `${ITEMS_PER_KIND} items/tab, Library API fixture ${LIBRARY_API_MS} ms, fixture media (webm 41 KB, jpg 99 KB)`,
    network: 'loopback; API and media stubbed in the page',
    unit: 'ms' as const,
    note: `Click → frame after the tab's first card is in the DOM; ${process.env.PERF_SERVER ?? 'next dev'} server.`,
  };
  const count = (s: Switch[], k: 'library' | 'media') => s.map((x) => x[k]);
  const spun = (s: Switch[]) => `spinner shown in ${s.filter((x) => x.spinner).length}/${s.length} switches`;
  writeResults('library', [
    summarize({ ...base, interaction: 'library.tab.first', cache: 'cold', note: `${base.note} A tab not yet shown in this page; ${spun(first)}.` }, first.map((x) => x.ms)),
    summarize({ ...base, interaction: 'library.tab.warm', cache: 'warm', note: `${base.note} Back to a tab already shown; ${spun(warm)}.` }, warm.map((x) => x.ms)),
    summarize({ ...base, interaction: 'library.tab.warm.api-requests', cache: 'warm', unit: 'count', note: 'Library API requests one warm return caused.' }, count(warm, 'library')),
    summarize({ ...base, interaction: 'library.tab.warm.media-requests', cache: 'warm', unit: 'count', note: 'Media requests one warm return caused (12 films, preload=metadata).' }, count(warm, 'media')),
  ]);
});
