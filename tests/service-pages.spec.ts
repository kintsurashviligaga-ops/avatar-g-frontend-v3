import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * /{lang}/services/<slug> in a real browser — the pages in the studio's own shell (docs/DESIGN.md), not the old overlay.
 *
 * What only a browser can show: no invented numbers (the „1000 კრედიტი" stat cards) and no „Workspace / Chat" tabs; the
 * one primary action is a solid accent pill with ink text and no gradient or glow; a studio service links into its studio
 * tool; a form service's options read in the page's language, it posts the same values as before, renders the answer, and
 * turns a guest's 401 into „შესვლა"; nothing scrolls sideways at 390 px. /api/pipeline is mocked — nothing is generated.
 * Set SHOTS_DIR to also write screenshots (phone 390×844, desktop 1440×900).
 */

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const ACCENT = 'rgb(51, 143, 232)';

async function open(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const scrollers = [document.documentElement, document.body, ...document.querySelectorAll<HTMLElement>('main, main *')]
      .filter((el) => el.clientWidth >= window.innerWidth - 300 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    return Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth,
      ...scrollers.map((el) => el.scrollWidth - el.clientWidth),
    );
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectOnePrimaryPill(page: Page): Promise<void> {
  const primary = page.getByTestId('service-primary');
  await expect(primary).toHaveCount(1);
  const style = await primary.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, image: cs.backgroundImage, shadow: cs.boxShadow, color: cs.color, h: el.getBoundingClientRect().height };
  });
  expect(style.bg).toBe(ACCENT);
  expect(style.image).toBe('none');
  expect(style.shadow).toBe('none');
  expect(style.color).toBe('rgb(0, 0, 0)');
  expect(style.h).toBeGreaterThanOrEqual(44);
}

async function expectNoLegacyChrome(page: Page): Promise<void> {
  const main = page.locator('main');
  await expect(main.getByRole('button', { name: 'Workspace', exact: true })).toHaveCount(0);
  await expect(main.getByText('1000', { exact: true })).toHaveCount(0);
  for (const fake of ['გენერირებული', 'ამ თვეში', 'სტატისტიკა', 'Quick Tip', 'რჩევა']) await expect(main.getByText(fake, { exact: true })).toHaveCount(0);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}×${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const [path, tool, label] of [
      ['/ka/services/video', 'video', 'სტუდიაში გახსნა'],
      ['/ka/services/interior', 'interior', 'სტუდიაში გახსნა'],
      ['/en/services/music', 'music', 'Open in the studio'],
    ] as const) {
      test(`${path}: names its studio tool and opens it — no parallel generator, no invented numbers`, async ({ page }) => {
        await open(page, path);
        await expectNoLegacyChrome(page);
        const primary = page.getByTestId('service-primary');
        await expect(primary).toHaveText(label);
        await expect(primary).toHaveAttribute('href', `/${path.split('/')[1]}/dashboard?tool=${tool}`);
        await expectOnePrimaryPill(page);
        await expect(page.locator('main textarea, main select')).toHaveCount(0);
        await noHorizontalScroll(page);
        await shot(page, `${path.replace(/\//g, '_').slice(1)}-${size.width}`);
      });
    }

    test('/ka/services/tourism: Georgian options, the same values posted, the answer rendered', async ({ page }) => {
      let posted: Record<string, unknown> | null = null;
      await page.route('**/api/pipeline', async (route) => {
        posted = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobId: 'j', status: 'done', serviceId: 'tourism', result: '## დღე 1\n\n- ნარიყალა', provider: 'gemini' }) });
      });
      await open(page, '/ka/services/tourism');
      await expectNoLegacyChrome(page);

      const duration = page.getByLabel('ხანგრძლივობა');
      await expect(duration.locator('option')).toHaveText(['1 დღე', '3 დღე', '5 დღე', '1 კვირა', '2 კვირა']);
      await expect(page.getByLabel('გეგმის ტიპი')).toHaveValue('itinerary');
      for (const english of ['Full Itinerary', '5 days', 'Cultural & Historical']) await expect(page.locator('main option', { hasText: english })).toHaveCount(0);

      const primary = page.getByTestId('service-primary');
      await expect(primary).toBeDisabled();
      await page.getByLabel('სად მიდიხარ?').fill('თბილისი და ყაზბეგი');
      await duration.selectOption('7');
      await expectOnePrimaryPill(page);
      await primary.click();

      await expect(page.getByRole('heading', { name: 'დღე 1' })).toBeVisible();
      expect(posted).toMatchObject({
        action: 'generate',
        serviceId: 'tourism',
        userInput: 'თბილისი და ყაზბეგი',
        answers: { type: 'itinerary', duration: '7', style: 'cultural' },
        locale: 'ka',
      });
      await expect(page.getByRole('button', { name: 'კოპირება' })).toBeVisible();
      await noHorizontalScroll(page);
      await shot(page, `ka_services_tourism-result-${size.width}`);
    });

    test('/ka/services/tourism as a guest: the 401 becomes „შესვლა", back to this page', async ({ page }) => {
      await page.route('**/api/pipeline', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'auth_required', authRequired: true, message: 'x' }) }));
      await open(page, '/ka/services/tourism');
      await page.getByLabel('სად მიდიხარ?').fill('ბათუმი');
      await page.getByTestId('service-primary').click();
      const pane = page.locator('main section', { has: page.getByRole('heading', { name: 'შედეგი' }) });
      await expect(pane.getByRole('alert')).toHaveText('შესაქმნელად შედი ანგარიშზე.');
      const signIn = pane.getByRole('link', { name: 'შესვლა' });
      await expect(signIn).toHaveAttribute('href', '/ka/dashboard?auth=login&redirect=%2Fka%2Fservices%2Ftourism');
    });
  });
}
