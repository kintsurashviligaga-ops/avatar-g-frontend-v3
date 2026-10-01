import { test, expect, type Page } from '@playwright/test';

/**
 * tests/pricing-layout.spec.ts — no TEXT on a pricing card may paint outside the card (owner report, 2026-10-01:
 * text overflowed the package borders).
 *
 * ⚠️ MEASURE THE TEXT, NOT THE BOXES. A flex item with min-w-0 keeps its box inside the card while its glyphs spill
 * out of it, so comparing element rects passes on exactly the bug this file exists for (review, 2026-10-01). Every
 * text node is measured with a Range — that is where the pixels are.
 *
 * The page renders INSIDE the studio shell, whose sidebar takes ~220 px — so the grid picks its columns from its OWN
 * width (CSS container queries), not the window's. At a 1024-px window the old viewport rule packed four cards into
 * ~800 px and broke Georgian / Russian words mid-syllable.
 */

async function audit(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('#pricing .grid') as HTMLElement;
    const cards = [...grid.children] as HTMLElement[];
    const spill: string[] = [];
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent || '').trim();
        if (!text) continue;
        if ((n.parentElement as HTMLElement).closest('span.absolute')) continue; // the „popular" badge sits on the edge by design
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          if (r.width === 0) continue;
          if (r.right > box.right - 1 || r.left < box.left + 1 || r.bottom > box.bottom - 1) spill.push(text.slice(0, 30));
        }
      }
    }
    // The shell's body is the scroller (not the document), so look for sideways overflow THERE and in the grid.
    let scroller: HTMLElement | null = grid.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    return {
      cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      minCard: Math.min(...cards.map((c) => c.getBoundingClientRect().width)),
      buttonHeights: [...grid.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().height)),
      spill: [...new Set(spill)],
      sideways: grid.scrollWidth > grid.clientWidth + 1 || (!!scroller && scroller.scrollWidth > scroller.clientWidth + 1),
    };
  });
}

const FIRST_TIER = { ka: 'უფასო', en: 'Free', ru: 'Бесплатно' } as const;

const CASES: { width: number; height: number; lang: keyof typeof FIRST_TIER; cols: number }[] = [
  { width: 375, height: 812, lang: 'ka', cols: 1 },
  { width: 1024, height: 900, lang: 'ru', cols: 2 }, // the width that broke: the sidebar + four cards
  { width: 1024, height: 900, lang: 'ka', cols: 2 },
  { width: 1440, height: 900, lang: 'en', cols: 4 },
];

for (const c of CASES) {
  test(`pricing cards contain their text — ${c.lang} at ${c.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
    await page.goto(`/${c.lang}/pricing`);
    await expect(page.locator('#pricing .grid > div')).toHaveCount(4, { timeout: 45_000 });
    await expect(page.locator('#pricing h3').first()).toHaveText(FIRST_TIER[c.lang]); // the language under test rendered
    await page.waitForTimeout(800); // the cards fade/slide in (framer-motion); measure at rest
    const a = await audit(page);
    expect(a.spill).toEqual([]);
    expect(a.sideways).toBe(false);
    expect(a.cols).toBe(c.cols);
    expect(a.minCard).toBeGreaterThanOrEqual(240); // never the 154-px columns again
    for (const h of a.buttonHeights) expect(h).toBeLessThanOrEqual(56); // one-line buttons, no 104-px blocks
  });
}
