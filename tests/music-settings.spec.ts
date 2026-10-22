import { expect, test } from '@playwright/test';
import { openMusicSettings } from './music-studio-live/_panel';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test.describe(`Music settings ${viewport.width}px`, () => {
    test.use({ viewport });
    test('Advanced fields are reachable through settings; closing and reopening retains the description', async ({ page }) => {
      const mutations: string[] = [];
      await page.addInitScript(() => {
        localStorage.setItem('myavatar-cookie-consent', 'necessary');
        localStorage.setItem('myavatar:tour-seen', '1');
        localStorage.setItem('myavatar:welcomed', '1');
        localStorage.setItem('myavatar:music-ui-mode', 'advanced');
      });
      // No provider, authentication or shared backend is used by this panel-only check.
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) mutations.push(path);
        if (path === '/api/ai/music/engines') {
          await route.fulfill({ json: { engines: {}, references: { cover: false, voice: false }, chain: [] } });
        } else await route.fulfill({ status: 200, json: {} });
      });
      await page.goto('/en/dashboard?tool=music');
      await expect(page.locator('html')).toHaveAttribute('data-tool', 'music');
      await openMusicSettings(page);
      const description = page.getByTestId('music-styles-input');
      await expect(description).toBeVisible();
      await description.fill('calm piano with soft strings');
      await expect(page.getByTestId('music-instrumental')).toBeVisible();
      await expect(page.getByTestId('music-create')).toBeVisible();
      // Repeating the helper must leave an already open sheet/panel open.
      await openMusicSettings(page);
      const toggle = page.getByTestId('options-toggle');
      if (viewport.width >= 1024) await toggle.click();
      else await page.getByTestId('options-sheet').getByRole('button', { name: 'Close', exact: true }).click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(description).toBeHidden();
      await openMusicSettings(page);
      await expect(description).toHaveValue('calm piano with soft strings');
      expect(mutations).toEqual([]);
    });
  });
}
