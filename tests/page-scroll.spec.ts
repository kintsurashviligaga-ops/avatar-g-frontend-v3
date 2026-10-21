import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`Document scrolling ${viewport.width}px`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('myavatar-cookie-consent', 'necessary');
        localStorage.setItem('myavatar:tour-seen', '1');
        localStorage.setItem('myavatar:welcomed', '1');
      });
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
    });

    test('a long legal document scrolls to its final section, keeps Close reachable and returns to the bounded chat', async ({ page }, info) => {
      await page.goto('/en');
      await expect(page.getByTestId('composer-input')).toBeVisible();
      await page.goto('/en/privacy');
      const lastSection = page.getByRole('heading', { level: 2 }).last();
      await expect(lastSection).toBeAttached();
      await expect(lastSection).not.toBeInViewport();
      // A real wheel gesture must reach the end; scrollIntoView would bypass overflow:hidden.
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 20_000);
      await expect(lastSection).toBeInViewport();
      const close = page.getByRole('button', { name: 'Close', exact: true });
      await expect(close).toBeInViewport();
      await page.screenshot({ path: info.outputPath('document-end.png') });
      await close.click();
      await expect(page).toHaveURL(/\/en\/?$/);
      const composer = page.getByTestId('composer-input');
      await expect(composer).toBeInViewport();
      await composer.fill('Keep this draft after resizing');
      await page.setViewportSize({ width: viewport.width, height: Math.floor(viewport.height * 0.7) });
      await expect(composer).toBeInViewport();
      await expect(composer).toHaveValue('Keep this draft after resizing');
      await page.mouse.wheel(0, 20_000);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(composer).toBeInViewport();
    });
  });
}
