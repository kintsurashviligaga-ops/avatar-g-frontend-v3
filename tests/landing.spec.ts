import { expect, test, type Page } from '@playwright/test';

/**
 * The landing and the guest dashboard at a phone and a desktop width (docs/DESIGN.md, the brief's §5):
 * video is first, "შესვლა" works, every brand image answers 200, nothing overlaps or scrolls sideways.
 */
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Two boxes overlap when their rectangles intersect by more than a hairline. */
function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
}

for (const vp of VIEWPORTS) {
  test.describe(`landing · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('says video first, and its doors go to the studio and to sign-in', async ({ page }) => {
      await page.goto('/ka');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('ვიდეო ერთი იდეიდან.');
      const cta = page.getByRole('link', { name: /შექმენი ვიდეო/ }).first();
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '/ka/dashboard');
      const signIn = page.getByRole('link', { name: 'შესვლა' }).first();
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute('href', '/ka/login');
      await noHorizontalScroll(page);
    });

    test('the first service card is Video, marked "მთავარი"; image, music and avatar follow', async ({ page }) => {
      await page.goto('/ka');
      const cards = page.locator('#services-title ~ ul > li a');
      await expect(cards).toHaveCount(4);
      await expect(cards.nth(0)).toContainText('ვიდეო');
      await expect(cards.nth(0)).toContainText('მთავარი');
      await expect(cards.nth(0)).toHaveAttribute('href', '/ka/dashboard?mode=video');
      await expect(cards.nth(1)).toHaveAttribute('href', '/ka/dashboard?mode=image');
      await expect(cards.nth(2)).toHaveAttribute('href', '/ka/dashboard?mode=music');
      await expect(cards.nth(3)).toHaveAttribute('href', '/ka/dashboard?mode=lipsync');
    });

    test('every brand image on the page answers 200', async ({ page, request }) => {
      await page.goto('/ka');
      await page.evaluate(async () => {
        // Walk the page so lazy images request their source.
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      });
      const srcs = await page.$$eval('img', (imgs) => imgs.map((i) => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src).filter(Boolean));
      expect(srcs.length).toBeGreaterThanOrEqual(6);
      for (const src of new Set(srcs)) {
        const res = await request.get(src);
        expect(res.status(), src).toBe(200);
      }
      for (const file of ['/brand/v1/hero-16x9.jpg', '/brand/v1/hero-9x16.jpg', '/brand/v1/og.jpg']) {
        expect((await request.get(file)).status(), file).toBe(200);
      }
    });

    test('the hero copy clears the header, and the header items do not collide', async ({ page }) => {
      await page.goto('/ka');
      const header = await page.locator('header').first().boundingBox();
      const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
      expect(header && h1).toBeTruthy();
      expect(overlaps(header!, h1!)).toBe(false);
      const items = page.locator('header a');
      const boxes = (await Promise.all((await items.all()).map((l) => l.boundingBox()))).filter((b) => b && b.width > 0);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
    });

    test('en and ru are video-first too', async ({ page }) => {
      await page.goto('/en');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Video from a single idea.');
      await page.goto('/ru');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Видео из одной идеи.');
    });
  });
}

test('the landing is in the server HTML: `curl /ka` returns the headline', async ({ request }) => {
  const res = await request.get('/ka', { headers: { accept: 'text/html' } });
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('ვიდეო ერთი იდეიდან');
});

test('the studio server HTML carries the video-first copy, and never the old line', async ({ request }) => {
  const html = await (await request.get('/ka/dashboard', { headers: { accept: 'text/html' } })).text();
  expect(html).toContain('შექმენი ვიდეო, სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.');
  expect(html).not.toContain('შექმენი სურათი ან მუსიკა');
  expect(html).not.toContain('ჰკითხე ნებისმიერი');
  expect(html).not.toContain('🇬🇪');
});

test.describe('landing · 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  // The segmented language pill pushed „შესვლა“ 35 px off a 320 px screen; phones now get a compact menu.
  test('the header fits: the wordmark whole, „შესვლა“ on screen, and the language menu switches the page', async ({ page }) => {
    await page.goto('/ka');
    const wordmark = (await page.locator('header [role="img"]').boundingBox())!;
    const menu = page.locator('header summary');
    const menuBox = (await menu.boundingBox())!;
    const signIn = (await page.locator('header').getByRole('link', { name: 'შესვლა' }).boundingBox())!;
    expect(wordmark.x + wordmark.width).toBeLessThanOrEqual(menuBox.x);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(signIn.x);
    expect(signIn.x + signIn.width).toBeLessThanOrEqual(320);
    expect(menuBox.height).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);
    await menu.click();
    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Video from a single idea.');
  });
});

/**
 * The guest dashboard. The cookie choice is pre-set to "necessary only" so the banner never sits over the composer.
 * The TanStack devtools button is development-only (the package exports a no-op in production) and is ignored.
 */
const VIDEO_PLACEHOLDER = 'აღწერე კადრი, ჩაწერე ხმა, ან მიამაგრე ფაილი…';

async function openDashboard(page: Page, path = '/ka/dashboard') {
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('რით დაგეხმარო?');
}

for (const vp of VIEWPORTS) {
  test.describe(`guest dashboard · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('opens on video: the reel chip is first and pressed, the composer asks for a shot', async ({ page }) => {
      await openDashboard(page);
      const sub = page.getByText('შექმენი ვიდეო, სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.');
      await expect(sub).toBeVisible();
      const line = (await sub.textContent()) ?? '';
      expect(line.indexOf('ვიდეო')).toBeGreaterThanOrEqual(0);
      expect(line.indexOf('ვიდეო')).toBeLessThan(line.indexOf('სურათი')); // video is named first
      await expect(page.getByRole('button', { name: 'ვიდეო', exact: true })).toBeVisible(); // the mode control
      const chips = page.getByRole('group', { name: 'დაიწყე' }).getByRole('button');
      await expect(chips).toHaveCount(4);
      for (let i = 0; i < 4; i++) await expect(chips.nth(i)).toBeVisible();
      await expect(chips.nth(0)).toHaveText('კინო რილი 9:16');
      await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await expect(chips.nth(1)).toHaveText('პროდუქტის სურათი');
      await expect(chips.nth(2)).toHaveText('საუნდთრექი');
      await expect(chips.nth(3)).toHaveText('ავატარის პორტრეტი');
      await expect(page.getByPlaceholder(VIDEO_PLACEHOLDER)).toBeVisible();
    });

    test('the service menu lists Video first, and image, music and avatar are one click away', async ({ page }) => {
      await openDashboard(page);
      await page.getByRole('button', { name: 'ვიდეო', exact: true }).click();
      const items = page.getByRole('menuitemradio');
      await expect(items.nth(0)).toContainText('ვიდეო');
      await expect(items.nth(0)).toHaveAttribute('aria-checked', 'true');
      await expect(items.nth(1)).toContainText('სურათი');
      await expect(items.nth(2)).toContainText('მუსიკა');
      await expect(items.nth(3)).toContainText('ავატარი');
    });

    test('a chip switches the service and sends nothing', async ({ page }) => {
      await openDashboard(page);
      const posts: string[] = [];
      page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/')) posts.push(r.url()); });
      const chips = page.getByRole('group', { name: 'დაიწყე' }).getByRole('button');
      await chips.nth(1).click();
      await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'false');
      const box = page.getByPlaceholder('აღწერე სურათი, რომ დაგიხატო…');
      await expect(box).toBeFocused();
      // The chip writes a starter the user completes — and an untouched starter has nothing to send.
      await expect(box).toHaveValue('პროდუქტის სურათი — პროდუქტი: ');
      await expect(page.getByRole('button', { name: 'სურათის შექმნა' })).toHaveCount(0);
      await box.press('Enter');
      await page.waitForTimeout(800);
      expect(posts).toEqual([]);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // still the empty state: nothing was sent
    });

    // docs/DESIGN.md §11 LIVE_GAP: both of these used to drop a guest into „ჩატი“, as if chat were home.
    test('closing the options with ✕ keeps the service', async ({ page }) => {
      await openDashboard(page);
      const toggle = page.getByTestId('options-toggle');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('button', { name: 'დახურვა' }).first().click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('button', { name: 'ვიდეო', exact: true })).toBeVisible();
      await expect(page.getByPlaceholder(VIDEO_PLACEHOLDER)).toBeVisible();
    });

    test('picking the service that is already on keeps it', async ({ page }) => {
      await openDashboard(page);
      await page.getByRole('button', { name: 'ვიდეო', exact: true }).click();
      await page.getByRole('menuitemradio').first().click(); // „ვიდეო“, already checked
      await expect(page.getByRole('menuitemradio')).toHaveCount(0); // the menu closed
      await expect(page.getByRole('button', { name: 'ვიდეო', exact: true })).toBeVisible();
      await expect(page.getByPlaceholder(VIDEO_PLACEHOLDER)).toBeVisible();
    });

    test('with text in the box, Send takes the live-voice slot', async ({ page }) => {
      await openDashboard(page);
      const live = page.getByRole('button', { name: 'ცოცხალი ხმა' });
      const create = page.getByRole('button', { name: 'ვიდეოს შექმნა' });
      await expect(live).toBeVisible();
      await expect(create).toHaveCount(0);
      await page.getByPlaceholder(VIDEO_PLACEHOLDER).fill('ღამის თბილისი წვიმის შემდეგ');
      await expect(create).toBeVisible();
      await expect(live).toHaveCount(0);
    });

    // ResultCard end to end on the REAL composer and job queue. The only stand-in is the network: the image
    // request is held open by the test (or answered by it), so nothing reaches a provider and nothing is spent.
    // The guest gate is lifted in this browser only — it is the sign-in wall, not what is under test.
    async function startImageJob(page: Page) {
      await page.evaluate(() => { document.documentElement.dataset.authed = '1'; });
      await page.getByRole('group', { name: 'დაიწყე' }).getByRole('button').nth(1).click(); // product image
      await page.locator('select[aria-label="ფორმატი"]:visible').selectOption('9:16');
      await page.locator('textarea').last().fill('შავი ღვინის ბოთლი სველ ქვაზე, ღამე');
      await page.getByRole('button', { name: 'სურათის შექმნა' }).click();
    }

    test('a generating job is a studio card in its own shape, and its cancel stops that job', async ({ page }) => {
      await page.route('**/api/nanobanana/image', () => { /* held open: the job stays in flight */ });
      await openDashboard(page);
      await startImageJob(page);
      const card = page.getByTestId('result-card');
      await expect(card).toHaveAttribute('data-state', 'rendering');
      await expect(card.getByText(/^სურათი · 9:16 · \d+%$/)).toBeVisible();
      expect(await card.locator('div').first().evaluate((el) => (el as HTMLElement).style.aspectRatio)).toBe('9 / 16');
      await expect(card.getByRole('progressbar')).toBeAttached();
      const cancel = card.getByRole('button', { name: 'გაუქმება' });
      const box = (await cancel.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await cancel.click();
      await expect(page.getByTestId('result-card')).toHaveCount(0);
      await expect(page.getByText('⏹ შეჩერდა')).toBeVisible();
    });

    test('when the image lands, the card gives way to it', async ({ page }) => {
      await page.route('**/api/nanobanana/image', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: '/brand/v1/card-image.jpg' }) }));
      await openDashboard(page);
      await startImageJob(page);
      await expect(page.locator('img[src="/brand/v1/card-image.jpg"]').first()).toBeVisible();
      await expect(page.getByTestId('result-card')).toHaveCount(0);
    });

    test('"შესვლა" opens the sign-in', async ({ page }) => {
      await openDashboard(page);
      await page.locator('header').getByRole('button', { name: 'შესვლა' }).click();
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test('the brand plate loads, and nothing overlaps or leaves the screen', async ({ page, request }) => {
      await openDashboard(page);
      const plate = page.locator('img[src="/brand/v1/dashboard-plate.jpg"]');
      await expect(plate).toHaveCount(1);
      await expect.poll(() => plate.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0);
      expect((await request.get('/brand/v1/dashboard-plate.jpg')).status()).toBe(200);

      const header = (await page.locator('header').first().boundingBox())!;
      const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const composer = (await page.getByPlaceholder(VIDEO_PLACEHOLDER).boundingBox())!;
      const options = (await page.getByTestId('options-toggle').boundingBox())!;
      const chips = await Promise.all((await page.getByRole('group', { name: 'დაიწყე' }).getByRole('button').all()).map((c) => c.boundingBox()));
      expect(overlaps(header, h1)).toBe(false);
      for (const c of chips) {
        expect(overlaps(c!, h1)).toBe(false);
        expect(overlaps(c!, options)).toBe(false);
        expect(overlaps(c!, composer)).toBe(false);
        expect(c!.height).toBeGreaterThanOrEqual(44); // tap target
      }
      for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) expect(overlaps(chips[i]!, chips[j]!)).toBe(false);
      expect(composer.y + composer.height).toBeLessThanOrEqual(vp.height);
      await noHorizontalScroll(page);
    });
  });
}
