import { test, expect } from '@playwright/test';

const COPY = {
  ka: { tool: 'სურათი', action: 'სტუდიაში გახსნა', placeholder: 'აღწერე სურათი, რომ დაგიხატო…' },
  en: { tool: 'Image', action: 'Open in the studio', placeholder: 'Describe an image to generate…' },
  ru: { tool: 'Изображение', action: 'Открыть в студии', placeholder: 'Опишите изображение для генерации…' },
} as const;

for (const width of [390, 1440]) {
  for (const locale of ['ka', 'en', 'ru'] as const) {
    test(`photo service ${locale} ${width}px opens the active Image studio without generation`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => {
        localStorage.setItem('myavatar-cookie-consent', 'necessary');
        localStorage.setItem('myavatar:tour-seen', '1');
        localStorage.setItem('myavatar:welcomed', '1');
      });
      const mutations: string[] = [];
      // Every API is intercepted. A handoff must not start a chat, quote, generation or job.
      await page.route('**/api/**', async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (req.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) mutations.push(path);
        await route.fulfill({ json: {} });
      });
      await page.goto(`/${locale}/services/photo`);
      const c = COPY[locale];
      await expect(page.locator('#studio-tool-name')).toHaveText(c.tool);
      const primary = page.getByTestId('service-primary');
      await expect(primary).toHaveCount(1);
      await expect(primary).toBeVisible();
      await expect(primary).toHaveText(c.action);
      await expect(primary).toHaveAttribute('href', `/${locale}/dashboard?tool=image`);
      expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('main textarea, main select')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('photo-service.png') });
      await primary.click();
      const composer = page.getByPlaceholder(c.placeholder, { exact: true });
      await expect(composer).toBeAttached();
      const options = page.getByTestId('options-toggle');
      await expect(options).toHaveAttribute('aria-expanded', /^(true|false)$/);
      if (await options.getAttribute('aria-expanded') === 'true') await options.click();
      await expect(composer).toBeVisible();
      await expect(composer).toHaveValue('');
      expect(new URL(page.url()).pathname).toBe(`/${locale}/dashboard`);
      expect(mutations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath('image-handoff.png') });
    });
  }
}
