import { test, expect } from '@playwright/test';

const COPY = {
  ka: { tool: 'სურათი', action: 'სტუდიაში გახსნა', placeholder: 'აღწერე სურათი, რომ დაგიხატო…', description: 'შექმენი ფოტო აღწერით ან დაარედაქტირე ატვირთული საცნობარო ფოტო სურათის სტუდიაში.' },
  en: { tool: 'Image', action: 'Open in the studio', placeholder: 'Describe an image to generate…', description: 'Create photos from a description or edit uploaded reference images in the Image studio.' },
  ru: { tool: 'Изображение', action: 'Открыть в студии', placeholder: 'Опишите изображение для генерации…', description: 'Создавайте фотографии по описанию или редактируйте загруженные изображения в студии изображений.' },
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
      const fontRequests: string[] = [];
      page.on('request', request => { if (request.resourceType() === 'font') fontRequests.push(request.url()); });
      // Every API is intercepted. A handoff must not start a chat, quote, generation or job.
      await page.route('**/api/**', async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (req.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) mutations.push(path);
        await route.fulfill({ json: {} });
      });
      await page.goto(`/${locale}/services/photo`);
      const c = COPY[locale];
      await expect(page.getByText(c.description, { exact: true })).toBeVisible();
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
      // Linux runners need not have Arial, which next/font uses for its optional OS fallback.
      // Model that absence on every host; verifying the packaged faces must not load local fallbacks.
      const fallbackCount = await page.evaluate(() => {
        let replaced = 0;
        for (const face of [...document.fonts]) {
          if (!face.family.includes('_Fallback')) continue;
          document.fonts.delete(face);
          document.fonts.add(new FontFace(face.family, 'local("MyAvatar-Deliberately-Absent-OS-Font")', {
            weight: face.weight, style: face.style,
          }));
          replaced++;
        }
        return replaced;
      });
      expect(fallbackCount).toBe(3);
      const loadedFonts = await page.evaluate(async () => {
        const css = getComputedStyle(document.documentElement);
        return Promise.all(([
          ['--font-ui', 'MyAvatarПривет'], ['--font-display', 'MyAvatarПривет'], ['--font-georgian', 'ქართული'],
        ] as const).map(async ([variable, text]) => {
          // Loading the full CSS stack also tries next/font's local("Arial") face and rejects on
          // a Linux host without Arial, even when the downloaded primary face loaded successfully.
          const family = css.getPropertyValue(variable).split(',')[0].trim();
          const faces = family ? await document.fonts.load(`500 16px ${family}`, text) : [];
          return { variable, loaded: faces.length > 0 && faces.every(face => face.status === 'loaded' && !face.family.includes('_Fallback')) };
        }));
      });
      expect(loadedFonts).toEqual(['--font-ui', '--font-display', '--font-georgian'].map(variable => ({ variable, loaded: true })));
      expect(fontRequests.length).toBeGreaterThanOrEqual(3);
      expect(fontRequests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath('image-handoff.png') });
    });
  }
}
