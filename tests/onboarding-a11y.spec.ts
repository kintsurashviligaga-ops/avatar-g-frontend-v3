import { expect, test, type Page } from '@playwright/test';

/**
 * First-run UX + accessibility on the studio (/en/dashboard), at a phone and a desktop width:
 *  · the first-run tour appears on a first visit — a labelled dialog beside the composer, focus inside it, never over
 *    the composer itself and never pushing the page sideways; on a desktop it goes on to the Avatar tool;
 *  · Skip (and Escape) dismiss it, and it does not come back after a reload;
 *  · "Skip to main content" is the first Tab stop, and it moves focus to the main region — past the sidebar.
 * axe is not installed: targeted assertions only. The cookie choice is pre-set ("necessary only") so the banner never
 * covers anything — and because the tour, by design, waits while any dialog (the banner included) is on screen.
 */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const TOUR_SEEN = 'myavatar:tour-seen';

async function presetConsent(page: Page, opts: { tourSeen?: boolean } = {}) {
  await page.addInitScript(([seen, key]) => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      if (seen) localStorage.setItem(key as string, '1');
    } catch { /* private mode */ }
  }, [opts.tourSeen ?? false, TOUR_SEEN] as const);
}

/** The page scrolls in <body>, not the document — check both for a sideways scroll. */
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(0);
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
}

const tourDialog = (page: Page) => page.getByRole('dialog', { name: 'Start here' });

for (const vp of VIEWPORTS) {
  test.describe(`onboarding + a11y · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('the tour appears on a first visit: a labelled dialog beside the composer, focus inside, nothing sideways', async ({ page }) => {
      await presetConsent(page);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      const dialog = tourDialog(page);
      await expect(dialog).toBeVisible({ timeout: 45_000 });
      await expect(dialog).toContainText('Describe what you want to create');
      // A real dialog for assistive tech, non-modal (the page behind stays usable).
      expect(await dialog.getAttribute('aria-labelledby')).toBeTruthy();
      expect(await dialog.getAttribute('aria-describedby')).toBeTruthy();
      expect(await dialog.getAttribute('aria-modal')).toBeNull();
      // Focus moved into it — onto its primary action (a phone has one step: the Avatar row is in the closed drawer).
      const primary = dialog.getByRole('button', { name: vp.name === 'phone' ? 'Got it' : 'Next' });
      await expect(primary).toBeFocused();
      await expect(dialog.getByRole('button', { name: 'Skip' })).toBeVisible();
      // Beside the composer, never on top of it, and whole on screen.
      const card = (await dialog.boundingBox())!;
      const composer = (await page.locator('[data-tour="composer"]').boundingBox())!;
      expect(overlaps(card, composer)).toBe(false);
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(vp.width);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height).toBeLessThanOrEqual(vp.height);
      for (const b of await dialog.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await noHorizontalScroll(page);

      if (vp.name === 'desktop') {
        // Step 2 points at the Avatar tool in the sidebar (the twin entry is off in this build).
        await primary.click();
        const second = page.getByRole('dialog', { name: 'Make a photo talk' });
        await expect(second).toBeVisible();
        await expect(second.getByRole('button', { name: 'Got it' })).toBeFocused();
        const row = (await page.locator('aside[aria-label="Menu"] [data-tour="tool-avatar"]').boundingBox())!;
        const card2 = (await second.boundingBox())!;
        expect(card2.x).toBeGreaterThanOrEqual(row.x + row.width); // to the right of the row, not over it
        await noHorizontalScroll(page);
      }
    });

    test('Skip dismisses it, and it does not reappear after a reload', async ({ page }) => {
      await presetConsent(page);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      const dialog = tourDialog(page);
      await expect(dialog).toBeVisible({ timeout: 45_000 });
      await dialog.getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
      expect(await page.evaluate((k) => localStorage.getItem(k), TOUR_SEEN)).toBe('1');
      await noHorizontalScroll(page);

      await page.reload({ waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
      // Well past the tour's start delay: it stays away.
      await page.waitForTimeout(3_000);
      await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
    });

    test('Escape dismisses it too', async ({ page }) => {
      await presetConsent(page);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      await expect(tourDialog(page)).toBeVisible({ timeout: 45_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
      expect(await page.evaluate((k) => localStorage.getItem(k), TOUR_SEEN)).toBe('1');
    });

    test('"Skip to main content" is the first Tab stop and moves focus to the main region, past the sidebar', async ({ page }) => {
      await presetConsent(page, { tourSeen: true });
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible(); // shown while focused
      expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Enter');
      const main = page.locator('#studio-main');
      await expect(main).toBeFocused();
      expect(await page.evaluate(() => !!document.activeElement?.closest('main#main-content'))).toBe(true);
      expect(new URL(page.url()).hash).toBe(''); // the studio reads the hash; the skip never writes it
      // The next Tab lands in the main region, not back in the sidebar.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#studio-main'))).toBe(true);
      await noHorizontalScroll(page);
    });
  });
}

test.describe('onboarding + a11y · landing', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the landing\'s first Tab stop is the skip link, and it lands on the headline', async ({ page }) => {
    await presetConsent(page);
    await page.goto('/en/landing', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#landing-main')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /Create a video|Create video/ }).first()).toBeFocused();
    // One main landmark on the page.
    expect(await page.locator('main').count()).toBe(1);
  });
});
