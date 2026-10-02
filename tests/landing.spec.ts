import { expect, test, type Page } from '@playwright/test';

/**
 * The landing (/{lang}/landing) and the guest studio at a phone and a desktop width (docs/DESIGN.md, the brief's §5):
 * the home page opens on the chat, a guest can talk to it, "შესვლა" works, every brand image answers 200, nothing
 * overlaps or scrolls sideways.
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
      await page.goto('/ka/landing');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('ვიდეო ერთი იდეიდან.');
      const cta = page.getByRole('link', { name: /შექმენი ვიდეო/ }).first();
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '/ka/dashboard');
      const signIn = page.getByRole('link', { name: 'შესვლა' }).first();
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute('href', '/ka/dashboard?auth=login'); // the studio's sign-in sheet (lib/routing/signIn.ts)
      await noHorizontalScroll(page);
    });

    test('the first service card is Video, marked "მთავარი"; image, music and avatar follow', async ({ page }) => {
      await page.goto('/ka/landing');
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
      await page.goto('/ka/landing');
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
      for (const file of ['/brand/v1/hero-16x9.jpg', '/brand/v1/hero-9x16.jpg']) {
        expect((await request.get(file)).status(), file).toBe(200);
      }
    });

    test('the hero copy clears the header, and the header items do not collide', async ({ page }) => {
      await page.goto('/ka/landing');
      const header = await page.locator('header').first().boundingBox();
      const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
      expect(header && h1).toBeTruthy();
      expect(overlaps(header!, h1!)).toBe(false);
      const items = page.locator('header a');
      const boxes = (await Promise.all((await items.all()).map((l) => l.boundingBox()))).filter((b) => b && b.width > 0);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
    });

    test('three reels follow the hero: each a 9:16 loop with its poster, sources answering 200', async ({ page, request }) => {
      await page.goto('/ka/landing');
      const reels = page.locator('section[aria-labelledby="reels-title"] video');
      await expect(reels).toHaveCount(3);
      for (const v of await reels.all()) {
        const src = (await v.getAttribute('src'))!;
        const poster = (await v.getAttribute('poster'))!;
        expect((await request.get(src)).status(), src).toBe(200);
        expect((await request.get(poster)).status(), poster).toBe(200);
        const box = (await v.boundingBox())!;
        expect(Math.abs(box.width / box.height - 9 / 16)).toBeLessThan(0.02);
      }
    });

    test('one lockup: the transparent rocket inside the name, never the opaque tile', async ({ page }) => {
      await page.goto('/ka/landing');
      const lockup = page.locator('header').getByRole('img', { name: /MyAvatar/ });
      await expect(lockup).toBeVisible();
      await expect(lockup.getByTestId('rocket-mark')).toBeVisible();
      await expect(page.locator('img[src*="gemini-rocket"]')).toHaveCount(0);
    });

    test('en and ru are video-first too', async ({ page }) => {
      await page.goto('/en/landing');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Video from a single idea.');
      await page.goto('/ru/landing');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Видео из одной идеи.');
    });
  });
}

test('the landing is in the server HTML: `curl /ka/landing` returns the headline', async ({ request }) => {
  const res = await request.get('/ka/landing', { headers: { accept: 'text/html' } });
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('ვიდეო ერთი იდეიდან');
});

test('the home page is the chat: `/` → `/ka`, which serves the studio with the home metadata, not the landing', async ({ request }) => {
  const root = await request.get('/', { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers()['location']).toMatch(/\/ka$/);
  const res = await request.get('/ka', { headers: { accept: 'text/html' } });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<link rel="canonical" href="https://myavatar.ge/ka"');
  expect(html).not.toContain('reels-title'); // the landing's sections are not on the home page any more
});

test('the studio server HTML carries the video-first copy, and never the old line', async ({ request }) => {
  const html = await (await request.get('/ka/dashboard', { headers: { accept: 'text/html' } })).text();
  expect(html).toContain('შექმენი ვიდეო, სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.');
  expect(html).not.toContain('შექმენი სურათი ან მუსიკა');
  expect(html).not.toContain('ჰკითხე ნებისმიერი');
  expect(html).not.toContain('🇬🇪');
});

test.describe('landing · reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the reels stay on their posters', async ({ page }) => {
    await page.goto('/ka/landing');
    await page.locator('#reels-title').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const playing = await page.locator('section[aria-labelledby="reels-title"] video').evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length);
    expect(playing).toBe(0);
  });
});

test.describe('landing · 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  // The segmented language pill pushed „შესვლა“ 35 px off a 320 px screen; phones now get a compact menu.
  test('the header fits: the wordmark whole, „შესვლა“ on screen, and the language menu switches the page', async ({ page }) => {
    await page.goto('/ka/landing');
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
    await expect(page).toHaveURL(/\/en\/landing$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Video from a single idea.');
  });
});

/**
 * The guest dashboard. The cookie choice is pre-set to "necessary only" so the banner never sits over the composer.
 * The TanStack devtools button is development-only (the package exports a no-op in production) and is ignored.
 */
const VIDEO_PLACEHOLDER = 'აღწერე კადრი, ჩაწერე ხმა, ან მიამაგრე ფაილი…';

/** The studio on the VIDEO tool — most tests below exercise the video studio, which is one tap from the chat. */
async function openDashboard(page: Page, path = '/ka/dashboard?tool=video') {
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.goto(path);
  // The composer is what every path has: the video tool's Create screen replaces the greeting on a desktop.
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
}

/**
 * The settings: on a desktop a panel on the right, open by default (Google AI Studio); on a phone a sheet the tool chip
 * opens (Gemini). Either way the chip's aria-expanded says which, and this returns the visible container.
 */
async function openSettings(page: Page) {
  const toggle = page.getByTestId('options-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const settings = page.locator('#studio-settings, [data-testid="options-sheet"]').filter({ visible: true });
  await expect(settings).toHaveCount(1);
  return settings;
}

for (const vp of VIEWPORTS) {
  test.describe(`guest dashboard · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('the home page opens on the chat for a guest: Chat is the first sidebar row and the active tool', async ({ page }) => {
      await openDashboard(page, '/ka');
      await expect(page).toHaveURL(/\/ka$/);
      await expect(page.getByPlaceholder('ჰკითხე MyAvatar-ს')).toBeVisible();
      if (vp.name === 'phone') await page.locator('header').getByRole('button', { name: 'მენიუ' }).click();
      const nav = page.locator('aside[aria-label="მენიუ"]');
      const rows = nav.getByRole('button');
      await expect(nav.getByTestId('sidebar-chat')).toHaveAttribute('aria-current', 'true');
      // The hub row comes before every other row in the menu (after the collapse control), and is named once.
      const names = await rows.allTextContents();
      const firstRow = names.findIndex((n) => n.trim().length > 0);
      expect(names[firstRow]!.trim()).toBe('ჩატი');
      expect(names.filter((n) => n.trim() === 'ჩატი')).toHaveLength(1);
    });

    test('a guest\'s plain chat turn is sent to the chat; a generation request opens sign-in and sends nothing', async ({ page }) => {
      const posts: string[] = [];
      page.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (r.method() === 'POST' && path.startsWith('/api/') && !/^\/api\/(presence|log-error)\b/.test(path)) posts.push(path);
      });
      // The chat answer is stubbed: nothing reaches Google.
      await page.route('**/api/chat/gemini', (route) =>
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': keep-alive\n\ndata: {"meta":{"provider":"gemini","model":"gemini-3.8-flash","mode":"fast"}}\n\ndata: {"text":"გამარჯობა!"}\n\ndata: [DONE]\n\n' }));
      await openDashboard(page, '/ka');
      const box = page.getByPlaceholder('ჰკითხე MyAvatar-ს');
      await box.fill('გამიკეთე ვიდეო ზღვაზე');
      await box.press('Enter');
      await expect(page.locator('input[type="email"]')).toBeVisible(); // the sign-in sheet
      expect(posts).toEqual([]);
      await page.keyboard.press('Escape');
      await box.fill('რა არის თბილისი?');
      await box.press('Enter');
      await expect(page.getByText('გამარჯობა!')).toBeVisible();
      expect(posts).toEqual(['/api/chat/gemini']);
    });

    test('the home is the greeting and the box — no sub line, no starter chips, nothing under the box', async ({ page }) => {
      await openDashboard(page, '/ka/dashboard?tool=chat');
      // Owner, 2026-10-02: "in the middle only რით დაგეხმარო; remove the four frames below".
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('რით დაგეხმარო?');
      await expect(page.getByText('შექმენი ვიდეო, სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'დაიწყე' })).toHaveCount(0);
      await expect(page.getByTestId('price-tag')).toHaveCount(0);
      await expect(page.getByTestId('chat-disclaimer')).toHaveCount(0);
      await expect(page.getByPlaceholder('ჰკითხე MyAvatar-ს')).toBeVisible();
    });

    test('the video tool: the tool chip names what you make, and the composer asks for a shot', async ({ page }) => {
      await openDashboard(page);
      // The tool chip names what you make and its shape — its text is its accessible name.
      await expect(page.getByTestId('options-toggle')).toHaveText('ვიდეო · 9:16 · 24წმ');
      await expect(page.getByPlaceholder(VIDEO_PLACEHOLDER)).toBeVisible();
    });

    test('„+“ opens photos, camera, files and the tools — Chat, then Video, image, music and avatar one tap away', async ({ page }) => {
      await openDashboard(page);
      await page.getByTestId('plus').click();
      const sheet = page.getByTestId('tool-sheet');
      await expect(sheet).toBeVisible();
      // exact: the photo-culling TOOL („ფოტოების შერჩევა …") also contains „ფოტოები" — the attach tile is the exact name.
      for (const tile of ['ფოტოები', 'კამერა', 'ფაილები']) await expect(sheet.getByRole('button', { name: tile, exact: true })).toBeVisible();
      const tools = sheet.getByRole('list', { name: 'ხელსაწყოები' }).getByRole('button');
      await expect(tools.nth(0)).toContainText('ჩატი'); // the hub leads the one tool list
      await expect(tools.nth(1)).toContainText('ვიდეო');
      await expect(tools.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(tools.nth(2)).toContainText('სურათი');
      await expect(tools.nth(3)).toContainText('ფოტოგრაფი');
      await expect(tools.nth(4)).toContainText('ინტერიერის დიზაინერი');
      await expect(tools.nth(5)).toContainText('მუსიკა');
      await expect(tools.nth(6)).toContainText('ავატარი');
      // Nothing is lost one level down: the product ad, the swap, motion and the four studios.
      await expect(sheet.getByRole('list', { name: 'მეტი' }).getByRole('button').first()).toContainText('პროდუქტის რეკლამა');
    });

    test('a service in the sidebar switches the studio and is marked as the active one', async ({ page }) => {
      await openDashboard(page, '/ka/dashboard?tool=chat');
      if (vp.name === 'phone') await page.locator('header').getByRole('button', { name: 'მენიუ' }).click();
      const nav = page.locator('aside[aria-label="მენიუ"]');
      await nav.getByRole('button', { name: 'მუსიკა', exact: true }).click();
      await expect(page.getByTestId('options-toggle')).toHaveText('მუსიკა');
      // On a phone the music Create sheet opens by itself and covers the header: close it, then reopen the menu.
      if (vp.name === 'phone') { await page.keyboard.press('Escape'); await page.locator('header').getByRole('button', { name: 'მენიუ' }).click(); }
      await expect(nav.getByRole('button', { name: 'მუსიკა', exact: true })).toHaveAttribute('aria-current', 'true');
      await expect(nav.getByRole('button', { name: 'ვიდეო', exact: true })).not.toHaveAttribute('aria-current', 'true');
    });

    test('Enter on an empty box sends nothing, and the home stays the greeting and the box', async ({ page }) => {
      await openDashboard(page);
      const posts: string[] = [];
      // Background traffic is not a send: the presence heartbeat POSTs on its own schedule (it made this flaky on
      // production), and client error logging may too. Anything else POSTed to /api/ would be a job.
      const BACKGROUND = /^\/api\/(presence|log-error)\b/;
      page.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (r.method() === 'POST' && path.startsWith('/api/') && !BACKGROUND.test(path)) posts.push(r.url());
      });
      const box = page.getByPlaceholder(VIDEO_PLACEHOLDER);
      await box.focus();
      await box.press('Enter');
      await page.waitForTimeout(800);
      expect(posts).toEqual([]);
      await expect(box).toBeVisible(); // nothing was sent, nothing moved
    });

    // docs/DESIGN.md §11 LIVE_GAP: both of these used to drop a guest out of the tool they were on.
    test('closing the settings with ✕ keeps the service', async ({ page }) => {
      await openDashboard(page);
      const toggle = page.getByTestId('options-toggle');
      await openSettings(page);
      await page.getByRole('button', { name: 'დახურვა' }).filter({ visible: true }).first().click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveText('ვიდეო · 9:16 · 24წმ');
      await expect(page.getByPlaceholder(VIDEO_PLACEHOLDER)).toBeVisible();
    });

    test('picking the tool that is already on keeps it', async ({ page }) => {
      await openDashboard(page);
      await page.getByTestId('plus').click();
      const video = page.getByTestId('tool-sheet').getByRole('list', { name: 'ხელსაწყოები' }).getByRole('button').filter({ hasText: 'ვიდეო' }).first();
      await expect(video).toHaveAttribute('aria-pressed', 'true');
      await video.click();
      await expect(page.getByTestId('tool-sheet')).toHaveCount(0); // the sheet closed
      await expect(page.getByTestId('options-toggle')).toHaveText('ვიდეო · 9:16 · 24წმ');
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
      // The tool is chosen the way the sidebar does (`omni:set-tool`) — under `next dev`'s StrictMode a deep link's sheet is
      // clobbered by a mount effect; a production build and every real user choose the tool after mount.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'image' })));
      const panel = page.getByTestId('image-create-panel');
      await expect(panel).toBeVisible();
      await panel.getByRole('textbox').first().fill('შავი ღვინის ბოთლი სველ ქვაზე, ღამე');
      await panel.getByTestId('chip-aspect').click();
      await page.getByRole('dialog').getByRole('radio').filter({ hasText: '9:16' }).click();
      await expect(panel.getByTestId('chip-aspect')).toHaveText('9:16');
      await panel.getByRole('button', { name: /შექმნა/ }).last().click();
      // The sheet covers the feed on a phone: close it so the job's card is reachable.
      if (vp.name === 'phone') await page.keyboard.press('Escape');
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

    test('the video Create screen prints its price on the Generate button — it follows quality and length — and nothing sits under the composer', async ({ page }) => {
      await openDashboard(page);
      // Owner, 2026-10-02: no „25 კრედიტი · ~5 წთ“ caption under the box — a tool's price is ON its Generate button.
      await expect(page.getByTestId('price-tag')).toHaveCount(0);
      const pill = (await page.getByPlaceholder(VIDEO_PLACEHOLDER).locator('xpath=..').boundingBox())!;
      const chip = (await page.getByTestId('options-toggle').boundingBox())!;
      expect(chip.y).toBeGreaterThanOrEqual(pill.y); // the tool chip is IN the composer
      expect(chip.y + chip.height).toBeLessThanOrEqual(pill.y + pill.height + 1);
      const settings = await openSettings(page);
      const generate = settings.getByTestId('video-generate');
      // 24 s on the default tier (Fast) = 24 × 3.125 credits; Best is ×3.3 (rounded up), Economy ×0.6 — lib/credits/videoPricing.
      await expect(generate).toHaveAttribute('data-price', '75');
      await settings.getByTestId('video-quality-standard').click();
      await expect(generate).toHaveAttribute('data-price', '248');
      await settings.getByTestId('video-quality-lite').click();
      await expect(generate).toHaveAttribute('data-price', '45');
      await settings.getByTestId('video-quality-fast').click();
      await expect(generate).toHaveAttribute('data-price', '75');
      // The length is chosen in its own picker (4 s – 4 min); the price and the composer's chip follow it.
      await settings.getByTestId('video-tile-length').click();
      await page.getByTestId('video-preset-8').click();
      await expect(page.getByTestId('video-duration-price')).toHaveAttribute('data-price', '25');
      await page.keyboard.press('Escape');
      await expect(generate).toHaveAttribute('data-price', '25');
      await expect(page.getByTestId('options-toggle')).toHaveText('ვიდეო · 9:16 · 8წმ');
    });

    test('the video tool opens on Fast, and Economy / Best are one tap away', async ({ page }) => {
      await openDashboard(page);
      const settings = await openSettings(page);
      await expect(settings.getByTestId('video-quality-fast')).toHaveAttribute('aria-checked', 'true');
      await expect(settings.getByTestId('video-quality-standard')).toHaveAttribute('aria-checked', 'false');
      await expect(settings.getByTestId('video-quality-lite')).toHaveAttribute('aria-checked', 'false');
    });

    test('"შესვლა" opens the sign-in', async ({ page }) => {
      await openDashboard(page);
      await page.locator('header').getByRole('button', { name: 'შესვლა' }).click();
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test('one lockup: the transparent rocket inside the name — no opaque tile and no "M" badge beside it', async ({ page, request }) => {
      // „ორი ლოგო არ უნდა ჩანდეს" — the rocket raster beside the wordmark (an opaque tile: the PNG has no alpha) and
      // an "M" circle styled like the account initial read as a second logo. The cut-out lives INSIDE the lockup.
      await openDashboard(page);
      await expect(page.locator('img[src*="gemini-rocket"]')).toHaveCount(0);
      await expect(page.getByText('M', { exact: true })).toHaveCount(0);
      const marks = page.locator('[role="img"][aria-label="MyAvatar.ge"] [data-testid="rocket-mark"]').filter({ visible: true });
      await expect(marks.first()).toBeVisible();
      const png = await (await request.get('/brand/rocket-mark.png')).body();
      expect(png[25]).toBe(6); // PNG colour type 6: it has an alpha channel
    });

    test('the brand plate loads, and nothing overlaps or leaves the screen', async ({ page, request }) => {
      await openDashboard(page, '/ka/dashboard?tool=chat');
      const plate = page.locator('img[src="/brand/v1/dashboard-plate.jpg"]');
      await expect(plate).toHaveCount(1);
      await expect.poll(() => plate.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0);
      expect((await request.get('/brand/v1/dashboard-plate.jpg')).status()).toBe(200);

      const header = (await page.locator('header').filter({ visible: true }).first().boundingBox())!;
      const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const composer = (await page.getByPlaceholder('ჰკითხე MyAvatar-ს').boundingBox())!;
      expect(overlaps(header, h1)).toBe(false);
      expect(overlaps(h1, composer)).toBe(false);
      expect(composer.y + composer.height).toBeLessThanOrEqual(vp.height);
      await noHorizontalScroll(page);
    });
  });
}

test.describe('guest dashboard · desktop is a studio', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('navigation, the session and its settings side by side — Google AI Studio’s three columns', async ({ page }) => {
    // A tool that keeps the generic settings panel (the Create screens of video / image / music draw their own header).
    await openDashboard(page, '/ka/dashboard?tool=remix');
    const nav = (await page.locator('aside[aria-label="მენიუ"]').boundingBox())!;
    const bar = page.locator('header').filter({ visible: true });
    await expect(bar).toHaveCount(1); // the studio's own title bar; the phone header steps aside
    await expect(bar.getByRole('heading', { name: 'ახალი სესია' })).toBeVisible();
    const title = (await bar.boundingBox())!;
    const settings = page.locator('#studio-settings');
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('heading', { name: 'პარამეტრები' })).toBeVisible();
    const right = (await settings.boundingBox())!;
    expect(nav.x + nav.width).toBeLessThanOrEqual(title.x + 1);
    expect(title.x + title.width).toBeLessThanOrEqual(right.x + 1);
    expect(right.x + right.width).toBeLessThanOrEqual(1280);
    // The settings panel closes from the title bar and comes back from it.
    await page.getByTestId('settings-panel-toggle').click();
    await expect(settings).toBeHidden();
    await page.getByTestId('settings-panel-toggle').click();
    await expect(settings).toBeVisible();
    await noHorizontalScroll(page);
  });
});
