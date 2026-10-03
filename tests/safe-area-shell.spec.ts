import { test, expect, type Page } from '@playwright/test';

/**
 * tests/safe-area-shell.spec.ts — the studio reserves the iPhone's notch ONCE (installed PWA, 2026-10-03).
 *
 * ChatChrome's shell says `fixed inset-0`, but `.ag-fixed-shell { position: relative }` — unlayered, after
 * `@tailwind utilities` — beat it, so the shell sat in AppShell's flow under AppShell's own safe-area padding, and its
 * header padded by the safe area again: a 47 px empty band above the header, the composer's last 47 px below the
 * screen, and the body scrolling by the difference. With the shell in flow the keyboard fallback (top/height from the
 * visual viewport) was off by a safe area too.
 *
 * ⚠️ A 0 PX INSET HIDES ALL OF IT — desktop, and Safari in the browser in portrait. Only an installed iPhone
 * (standalone, `viewport-fit=cover`) has a top inset, so it is emulated here (CDP `Emulation.setSafeAreaInsetsOverride`).
 * ⚠️ THE BODY IS THE SCROLLER, NOT THE WINDOW (`body { height: 100%; overflow-x: hidden }` computes overflow-y to auto),
 * so `window.scrollY` stays 0 on exactly this bug — every ancestor of the shell is probed instead.
 */

type Insets = { top: number; bottom: number; left: number; right: number };
const NOTCH: Insets = { top: 47, bottom: 0, left: 0, right: 0 };

async function setSafeArea(page: Page, insets: Insets): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
}

async function openChat(page: Page): Promise<void> {
  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-chrome-header]')).toBeVisible();
}

/** Where the studio actually is, in viewport pixels. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.ag-fixed-shell:not(.app-native-shell)') as HTMLElement;
    const header = document.querySelector('[data-chrome-header]') as HTMLElement;
    const composer = document.querySelector('[data-testid="composer-input"]') as HTMLElement;
    const s = shell.getBoundingClientRect();
    const scrolls: string[] = [];
    for (let el = shell.parentElement; el; el = el.parentElement) {
      const was = el.scrollTop;
      el.scrollTop = 10_000;
      if (el.scrollTop > 0) scrolls.push(`${el.tagName.toLowerCase()}${el.classList.contains('app-native-shell') ? '.app-native-shell' : ''} by ${el.scrollTop}px`);
      el.scrollTop = was;
    }
    return {
      viewportH: window.innerHeight,
      position: getComputedStyle(shell).position,
      shellTop: Math.round(s.top),
      shellBottom: Math.round(s.bottom),
      shellHeight: Math.round(s.height),
      headerContentTop: Math.round(header.getBoundingClientRect().top + parseFloat(getComputedStyle(header).paddingTop)),
      composerBottom: Math.round(composer.getBoundingClientRect().bottom),
      scrolls,
    };
  });
}

test.describe('the studio on an iPhone screen — the safe area is reserved once', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  test('a 47 px notch: the header starts under it, the shell fills the screen, the composer is on it, nothing scrolls', async ({ page }) => {
    await setSafeArea(page, NOTCH);
    await openChat(page);
    await expect.poll(async () => (await layout(page)).headerContentTop).toBe(47);
    const l = await layout(page);
    expect(l.position).toBe('fixed');
    expect(l.shellTop).toBe(0);
    expect(l.shellBottom).toBe(l.viewportH);
    expect(l.composerBottom).toBeLessThanOrEqual(l.viewportH);
    expect(l.scrolls).toEqual([]);
  });

  test('no notch: the same screen, nothing reserved', async ({ page }) => {
    await setSafeArea(page, { top: 0, bottom: 0, left: 0, right: 0 });
    await openChat(page);
    const l = await layout(page);
    expect(l).toMatchObject({ position: 'fixed', shellTop: 0, headerContentTop: 0, scrolls: [] });
    expect(l.shellBottom).toBe(l.viewportH);
  });

  test('installed (standalone) with a home indicator: AppShell does not pad around the studio, so nothing scrolls', async ({ page }) => {
    await setSafeArea(page, { top: 47, bottom: 34, left: 0, right: 0 });
    await openChat(page);
    // AppShell sets this from `(display-mode: standalone)`, which a browser test cannot match; the CSS keys on it.
    await page.evaluate(() => { document.documentElement.dataset.displayMode = 'standalone'; });
    await expect.poll(async () => (await layout(page)).scrolls).toEqual([]);
    const l = await layout(page);
    expect(l.headerContentTop).toBe(47);
    expect(l.shellBottom).toBe(l.viewportH);
    expect(l.composerBottom).toBeLessThanOrEqual(l.viewportH);
  });

  test('the keyboard fallback (iOS ignores resizes-content) pins the shell to the visible band — not a safe area below it', async ({ page }) => {
    await setSafeArea(page, NOTCH);
    await openChat(page);
    // iOS shape: the layout viewport keeps its height, the visual one shrinks by the keyboard and scroll-shifts 40 px.
    const band = await page.evaluate(() => {
      const vv = window.visualViewport!;
      const height = window.innerHeight - 336 - 40;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => height });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 40 });
      vv.dispatchEvent(new Event('resize'));
      return { top: 40, height };
    });
    await expect.poll(async () => (await layout(page)).shellTop).toBe(band.top);
    const l = await layout(page);
    expect(l.shellHeight).toBe(band.height);
    expect(l.composerBottom).toBeLessThanOrEqual(band.top + band.height);
  });
});

test.describe('the studio on a landscape iPhone', () => {
  test.use({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });

  test('the shell keeps its content clear of the notch on both sides', async ({ page }) => {
    await setSafeArea(page, { top: 0, bottom: 21, left: 59, right: 59 });
    await openChat(page);
    const sides = await page.evaluate(() => {
      const shell = document.querySelector('.ag-fixed-shell:not(.app-native-shell)') as HTMLElement;
      // In-flow children only — the phone drawer and overlays are fixed and pad themselves.
      const boxes = [...shell.children]
        .filter((c) => !['fixed', 'absolute'].includes(getComputedStyle(c).position))
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0);
      return { left: Math.round(Math.min(...boxes.map((r) => r.left))), right: Math.round(Math.max(...boxes.map((r) => r.right))) };
    });
    expect(sides.left).toBeGreaterThanOrEqual(59);
    expect(sides.right).toBeLessThanOrEqual(852 - 59);
  });
});

test.describe('pages without the studio', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  for (const path of ['/ka/landing', '/ka/terms']) {
    test(`${path} keeps AppShell's notch padding — it has no shell of its own to reserve it`, async ({ page }) => {
      await setSafeArea(page, NOTCH);
      await page.goto(path);
      const shell = page.locator('.app-native-shell');
      await expect(shell).toHaveCount(1);
      expect(await page.locator('.app-native-shell .ag-fixed-shell').count()).toBe(0);
      await expect(shell).toHaveCSS('padding-top', '47px');
    });
  }
});
