import { test, expect, type Page } from '@playwright/test';

/**
 * EVERY SERVICE PANEL FITS ITS COLUMN (the owner, 2026-10-09 18:28Z: the Photographer panel "goes out of its frame" in a
 * mid-width desktop window — camera chips cut in half at the edge, „Photograph / er" broken inside the word). In the 300 px
 * desktop column, for every tool that has a panel:
 *   · nothing sticks out past the column's edges (anything wider is clipped by a scroller of its own, on purpose);
 *   · a one-word title never breaks inside the word;
 *   · the Photographer's and Interior designer's option rows wrap, so no chip is ever cut by the edge;
 *   · a carousel that has more cards says so (an arrow), and has none once it reaches the end.
 */
const TOOLS = ['video', 'image', 'photoshoot', 'interior', 'music', 'avatar', 'remix', 'product', 'swap', 'vfx', 'motion', 'dubbing', 'model3d', 'presentation'];

test.use({ viewport: { width: 1024, height: 800 } });

async function fit(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#studio-settings') as HTMLElement | null;
    if (!panel || panel.getBoundingClientRect().width === 0) return null;
    const pr = panel.getBoundingClientRect();
    const out: string[] = [];
    const cut: string[] = [];
    const broken: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? ''}] "${(el.textContent ?? '').trim().slice(0, 24)}"`;
    for (const el of Array.from(panel.querySelectorAll('*'))) {
      const h = el as HTMLElement;
      const r = h.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let p = h.parentElement;
      let clipped = false;
      while (p && p !== panel) {
        if (getComputedStyle(p).overflowX !== 'visible' && (r.right > p.getBoundingClientRect().right + 1 || r.left < p.getBoundingClientRect().left - 1)) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped && (r.right > pr.right + 1 || r.left < pr.left - 1)) out.push(name(h));
      // a radio row whose last option is cut by its own scroller
      if (h.getAttribute('role') === 'radiogroup' && h.closest('[data-testid$="-camera"], [data-testid="interior-panel"]') && !h.querySelector('[role=radiogroup]')) {
        const row = h.lastElementChild as HTMLElement | null;
        if (row && row.scrollWidth > row.clientWidth + 2) cut.push(name(h));
      }
    }
    for (const el of Array.from(panel.querySelectorAll('header span, h2 span'))) {
      const h = el as HTMLElement;
      const t = (h.textContent ?? '').trim();
      if (!t || /\s/.test(t) || h.children.length) continue;
      const lh = parseFloat(getComputedStyle(h).lineHeight) || 20;
      if (h.getBoundingClientRect().height > lh * 1.5) broken.push(t);
    }
    return { out, cut, broken };
  });
}

test('every service panel fits its 300 px column', async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
  const seen: string[] = [];
  for (const tool of TOOLS) {
    await page.goto(`/en/dashboard?tool=${tool}`);
    await expect(page.locator('#studio-settings')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(800);
    const r = await fit(page);
    expect(r, tool).not.toBeNull();
    expect.soft(r!.out, `${tool}: sticks out of the column`).toEqual([]);
    expect.soft(r!.cut, `${tool}: an option row is cut by the edge`).toEqual([]);
    expect.soft(r!.broken, `${tool}: a one-word title broke inside the word`).toEqual([]);
    seen.push(tool);
  }
  expect(seen).toEqual(TOOLS);

  // The Photographer's presets: more to the right → an arrow; paging to the end → no arrow on that side.
  await page.goto('/en/dashboard?tool=photoshoot');
  const next = page.getByTestId('photoshoot-presets-next');
  await expect(next).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('photoshoot-presets-prev')).toHaveCount(0);
  for (let i = 0; i < 12 && await next.count(); i += 1) { await next.click(); await page.waitForTimeout(450); }
  await expect(next).toHaveCount(0);
  await expect(page.getByTestId('photoshoot-presets-prev')).toBeVisible();
});
