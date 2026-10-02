import { test, expect, type Page, type Route } from '@playwright/test';
import { quoteCredits } from '@/lib/credits/quote';
import { IMAGE_TEMPLATES } from '@/lib/studio/templates';

/**
 * The Image tool's Create screen in a real browser — Higgsfield's "Create image" (ref3) on a 375 × 812 phone, and ref6's
 * form-beside-the-result grammar on a 1280 × 800 desktop.
 *
 *   phone    rows in the reference's order (header · upload · prompt · templates · advanced · chips · Generate), the price ON the
 *            button and equal to the quote, pickers that open as sheets with large options, a gallery that renders every card
 *            without layout shift, no horizontal scroll, and a Generate that sends exactly what the screen shows.
 *   desktop  three panes: the navigation, the Result pane + Models & prices in the centre, the same panel in the right column.
 *
 * Nothing leaves the machine: the image route is fulfilled by a mock, and the studio is told it is signed in (the
 * dummy-Supabase dev server has no session; a guest is — correctly — sent to sign-in instead of generating).
 *
 * Screenshots: set UI_IMAGE_SHOTS_DIR to also write them there (they are never committed).
 */

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
const SHOTS = process.env.UI_IMAGE_SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Cookie banner, first-run tour and welcome are one-offs that would sit on top of the screen under test. */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
}

/**
 * Opens the studio and chooses the Image tool the way the sidebar does (`omni:set-tool`).
 * ⚠️ NOT `?tool=image`: under `next dev`'s StrictMode the mount effects run twice and the second run of "close the settings in
 * the chat" clobbers the sheet the deep link just opened (the same for product / swap / remix). A production build runs
 * them once; choosing the tool after mount is what every real user does and is not affected.
 */
async function openImage(page: Page, locale = 'en'): Promise<void> {
  await page.goto(`/${locale}/dashboard`, { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'image' })));
  await expect(page.getByTestId('image-create-panel')).toBeVisible({ timeout: 15_000 });
}

/** The studio reads a published flag to stop guests before any request; pin it after mount (ChatChrome publishes '0'). */
async function pretendSignedIn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

interface ImageRequest { prompt?: string; aspectRatio?: string; quality?: string; style?: string; referenceImage?: string; templateId?: string; negativePrompt?: string; batchTile?: number }

/** Fulfils /api/nanobanana/image with a picture the dev server already serves, and records what was asked. */
async function mockImageRoute(page: Page, calls: ImageRequest[]): Promise<void> {
  await page.route('**/api/nanobanana/image', async (route: Route) => {
    calls.push(route.request().postDataJSON() as ImageRequest);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, url: new URL('/templates/image/product.jpg', page.url()).toString(), model: 'mock' }),
    });
  });
}

const noSideways = (page: Page) => page.evaluate(() => {
  const doc = document.documentElement;
  const sheet = document.querySelector('[data-testid="options-sheet"]');
  return { page: doc.scrollWidth - doc.clientWidth, body: document.body.scrollWidth - doc.clientWidth, sheet: sheet ? sheet.scrollWidth - sheet.clientWidth : 0 };
});

test.describe('phone 375×812 — ref3', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => { await seed(page); });

  test('the rows are ref3\'s, in order: header ▾ ✕ · upload · prompt with Model … Auto ▾ · chips · Generate ✦ N', async ({ page }) => {
    await openImage(page);
    const panel = page.getByTestId('image-create-panel');
    const rows = await panel.evaluate((el) => [...el.querySelectorAll('[data-create-row]')].map((n) => n.getAttribute('data-create-row')).filter((r) => r !== 'footer'));
    expect(rows).toEqual(['header', 'upload', 'prompt', 'templates', 'advanced', 'options', 'generate']);

    // Top to bottom on the screen as well as in the DOM.
    const tops = await Promise.all(['header', 'upload', 'prompt', 'options', 'generate'].map((r) => panel.locator(`[data-create-row="${r}"]`).evaluate((n) => n.getBoundingClientRect().top)));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);

    await expect(page.getByTestId('create-tool-switch')).toContainText('Create image');
    await expect(page.getByTestId('create-close')).toBeVisible();
    await expect(panel.locator('[data-create-row="upload"]')).toContainText('Choose an image to upload');
    await expect(panel.locator('[data-create-row="upload"]')).toContainText('(max 1)');
    await expect(page.getByTestId('create-prompt')).toHaveAttribute('placeholder', 'Describe your concept, scene, or idea');
    await expect(page.getByTestId('model-row')).toContainText('Model');
    await expect(page.getByTestId('model-row')).toContainText('Auto');
    await expect(page.getByTestId('chip-aspect')).toHaveText('1:1');
    await expect(page.getByTestId('chip-quality')).toHaveText('2K');
    await expect(page.getByTestId('chip-count')).toHaveText('1');
    await shot(page, 'phone-create');
  });

  test('the sheet is a real dialog: focus moves INTO it, Tab stays inside, and the header names the tool switcher', async ({ page }) => {
    await openImage(page);
    const sheet = page.getByTestId('options-sheet');
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect.poll(() => sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    // The header's chevron opens the tool switcher (the same sheet as the "+"), and choosing a tool there changes the screen.
    await page.getByTestId('create-tool-switch').click();
    const tools = page.getByTestId('tool-sheet');
    await expect(tools).toBeVisible();
    await expect(tools.getByRole('button', { name: /Image/ }).first()).toHaveAttribute('aria-pressed', 'true');
    await tools.getByRole('button', { name: /Music/ }).first().click();
    await expect(page.getByTestId('image-create-panel')).toHaveCount(0);
  });

  test('the price is ON the button and it is the quote — it follows the count, not the size', async ({ page }) => {
    await openImage(page);
    const go = page.getByTestId('create-generate');
    await expect(go).toContainText('Generate');
    await expect(go).toHaveAttribute('data-price', String(quoteCredits({ tool: 'image', count: 1 })));

    await page.getByTestId('chip-quality').click();
    await page.getByRole('dialog', { name: 'Quality' }).getByRole('radio', { name: /4K/ }).click();
    await expect(page.getByTestId('chip-quality')).toHaveText('4K');
    await expect(go).toHaveAttribute('data-price', String(quoteCredits({ tool: 'image', count: 1 }))); // every size costs the same

    await page.getByTestId('chip-count').click();
    await page.getByRole('dialog', { name: 'How many images' }).getByRole('radio', { name: /4 images/ }).click();
    await expect(page.getByTestId('chip-count')).toHaveText('4');
    await expect(go).toHaveAttribute('data-price', String(quoteCredits({ tool: 'image', count: 4 })));
    await expect(go).toContainText(String(quoteCredits({ tool: 'image', count: 4 })));
  });

  test('no horizontal scroll — the sheet open, a picker open, the gallery open — and the composer\'s text box steps aside', async ({ page }) => {
    await openImage(page);
    expect(await noSideways(page)).toEqual({ page: 0, body: 0, sheet: 0 });
    await page.getByTestId('templates-toggle').click();
    await page.getByTestId('advanced-toggle').click();
    await page.getByTestId('chip-aspect').click();
    await expect(page.getByRole('dialog', { name: 'Aspect ratio' })).toBeVisible();
    expect(await noSideways(page)).toEqual({ page: 0, body: 0, sheet: 0 });
    await page.keyboard.press('Escape');

    // The prompt lives in the sheet; closing it leaves the pill's [+] · tool chip · mic, and no second text box.
    await page.getByTestId('create-close').click();
    await expect(page.getByTestId('image-create-panel')).toBeHidden();
    await expect(page.getByTestId('composer-input')).toBeHidden();
    await expect(page.getByTestId('plus')).toBeVisible();
    await expect(page.getByTestId('options-toggle')).toContainText('Image');
    expect(await noSideways(page)).toEqual({ page: 0, body: 0, sheet: 0 });
    // …and the chip brings the screen back.
    await page.getByTestId('options-toggle').click();
    await expect(page.getByTestId('image-create-panel')).toBeVisible();
  });

  test('the pickers are sheets with large options: ten ratios drawn as shapes, three sizes naming their model, three counts with prices', async ({ page }) => {
    await openImage(page);
    await page.getByTestId('chip-aspect').click();
    const aspect = page.getByRole('dialog', { name: 'Aspect ratio' });
    const tiles = aspect.getByRole('radio');
    await expect(tiles).toHaveCount(10);
    for (const box of await tiles.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }))) {
      expect(box[0]).toBeGreaterThanOrEqual(44);
      expect(box[1]).toBeGreaterThanOrEqual(44);
    }
    await shot(page, 'phone-picker-aspect');
    await tiles.filter({ hasText: '9:16' }).click();
    await expect(page.getByTestId('chip-aspect')).toHaveText('9:16');

    await page.getByTestId('chip-quality').click();
    const quality = page.getByRole('dialog', { name: 'Quality' }).getByRole('radio');
    await expect(quality).toHaveCount(3);
    await expect(quality.nth(0)).toContainText('Nano Banana V2');
    await expect(quality.nth(2)).toContainText('Nano Banana Pro');
    await page.keyboard.press('Escape');

    // The model row: the studio's ModelPicker — Auto checked, the route's own three models open, the rest dimmed, no price
    // (the request names the model and the server quotes it; tests/model-picker.spec.ts follows a pick into the request).
    await page.getByTestId('model-row').click();
    const model = page.getByRole('dialog', { name: 'Model' });
    await expect(model.locator('[data-model="nb/auto"]')).toHaveAttribute('aria-checked', 'true');
    await expect(model.locator('[role="radio"]:not([aria-disabled="true"])')).toHaveCount(3);
    await expect(model).not.toContainText('credits');
    await shot(page, 'phone-picker-model');
  });

  test('every template card renders — a real thumbnail through next/image where one is shipped, the palette tile where not — and the grid does not shift', async ({ page }) => {
    await openImage(page);
    await page.getByTestId('templates-toggle').click();
    const gallery = page.getByTestId('image-templates');
    await expect(gallery.getByRole('radio')).toHaveCount(IMAGE_TEMPLATES.length);

    const shipped = IMAGE_TEMPLATES.filter((t) => t.thumb);
    const bare = IMAGE_TEMPLATES.filter((t) => !t.thumb);
    expect(shipped.length + bare.length).toBe(IMAGE_TEMPLATES.length);

    for (const t of shipped) {
      const img = gallery.locator(`[data-template="${t.id}"] img`);
      await expect(img).toHaveCount(1);
      await expect(img).toHaveAttribute('data-nimg', 'fill'); // inside the card's own 3:4 box: never part of layout
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { timeout: 20_000 }).toBe(true);
    }
    for (const t of bare) {
      await expect(gallery.locator(`[data-template="${t.id}"] img`)).toHaveCount(0);
      await expect(gallery.locator(`[data-template="${t.id}"]`)).toHaveCSS('background-image', /linear-gradient/);
    }

    // No layout shift: every card is the same 3:4 box before and after its picture has loaded, shipped or not.
    const boxes = await gallery.getByRole('radio').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
    expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
    expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
    for (const b of boxes) expect(Math.abs(b.h / b.w - 4 / 3)).toBeLessThan(0.06);
    await shot(page, 'phone-templates');

    // Picking one lights it and sets the chips it owns; the picked card's values show in the chips.
    await gallery.locator('[data-template="poster"]').click();
    await expect(gallery.locator('[data-template="poster"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('chip-aspect')).toHaveText('3:4');
  });

  test('Generate sends exactly what the screen shows, closes the sheet, and the picture lands in the conversation', async ({ page }) => {
    const calls: ImageRequest[] = [];
    await mockImageRoute(page, calls);
    await openImage(page);
    await pretendSignedIn(page);

    await page.getByTestId('chip-aspect').click();
    await page.getByRole('dialog', { name: 'Aspect ratio' }).getByRole('radio').filter({ hasText: '9:16' }).click();
    await page.getByTestId('chip-quality').click();
    await page.getByRole('dialog', { name: 'Quality' }).getByRole('radio', { name: /4K/ }).click();
    await page.getByTestId('advanced-toggle').click();
    await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Anime' }).click();
    await page.getByTestId('create-negative').fill('blurry, watermark');
    await page.getByTestId('create-prompt').fill('A lighthouse on a cliff at sunset');
    await page.getByTestId('create-generate').click();

    await expect(page.getByTestId('image-create-panel')).toBeHidden(); // the studio closes the sheet on a send
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ prompt: 'A lighthouse on a cliff at sunset', aspectRatio: '9:16', quality: 'ultra', style: 'Anime', negativePrompt: 'blurry, watermark' });
    expect(calls[0]!.referenceImage).toBeUndefined();
    await expect(page.locator('img[alt="Generated image"]').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'phone-result');
  });

  test('a PICKED card travels with the request; editing a value it set forgets it (a lit card is not a picked card)', async ({ page }) => {
    const calls: ImageRequest[] = [];
    await mockImageRoute(page, calls);
    await openImage(page);
    await pretendSignedIn(page);

    await page.getByTestId('templates-toggle').click();
    await page.getByTestId('image-templates').locator('[data-template="poster"]').click();
    await expect(page.getByTestId('chip-aspect')).toHaveText('3:4');
    await page.getByTestId('create-prompt').fill('A knight before a burning castle');
    await page.getByTestId('create-generate').click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ templateId: 'poster', aspectRatio: '3:4', quality: 'high', style: 'Cinematic' });

    // The sheet closed on send. Back in, one value the card set is changed: the card is no longer what the controls say.
    await page.getByTestId('options-toggle').click();
    await page.getByTestId('chip-aspect').click();
    await page.getByRole('dialog', { name: 'Aspect ratio' }).getByRole('radio').filter({ hasText: '1:1' }).click();
    await page.getByTestId('create-prompt').fill('A knight before a burning castle, wide');
    await page.getByTestId('create-generate').click();
    await expect.poll(() => calls.length).toBe(2);
    expect(calls[1]!.templateId).toBeUndefined();
    expect(calls[1]).toMatchObject({ aspectRatio: '1:1' });
  });

  test('an empty prompt is not sent: Generate focuses the prompt and says why', async ({ page }) => {
    const calls: ImageRequest[] = [];
    await mockImageRoute(page, calls);
    await openImage(page);
    await pretendSignedIn(page);
    await page.getByTestId('create-generate').click();
    await expect(page.getByTestId('image-create-panel').getByRole('alert')).toContainText('Describe what you want to create first.');
    await expect(page.getByTestId('create-prompt')).toBeFocused();
    expect(calls).toHaveLength(0);
    await shot(page, 'phone-empty-prompt');
  });

  test('a picked picture goes in as the ONE reference, and replacing it replaces it', async ({ page }) => {
    const calls: ImageRequest[] = [];
    await mockImageRoute(page, calls);
    await openImage(page);
    await pretendSignedIn(page);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const input = page.getByTestId('reference-input');
    await expect(input).toHaveAttribute('accept', 'image/*');
    expect(await input.evaluate((el) => (el as HTMLInputElement).multiple)).toBe(false);
    await input.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByAltText('first.png')).toBeVisible();
    await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByAltText('second.png')).toBeVisible();
    await expect(page.getByAltText('first.png')).toHaveCount(0); // replaced, not stacked
    await page.getByTestId('create-prompt').fill('Make it snow');
    await page.getByTestId('create-generate').click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]!.referenceImage).toMatch(/^data:image\//);
    await shot(page, 'phone-reference');
  });

  test('Georgian and Russian: the screen speaks the language and still has no horizontal scroll', async ({ page }) => {
    for (const [locale, title, generate] of [['ka', 'სურათის შექმნა', 'შექმნა'], ['ru', 'Создать изображение', 'Создать']] as const) {
      await openImage(page, locale);
      await expect(page.getByTestId('create-tool-switch')).toContainText(title);
      await expect(page.getByTestId('create-generate')).toContainText(generate);
      await page.getByTestId('templates-toggle').click();
      await page.getByTestId('advanced-toggle').click();
      expect(await noSideways(page)).toEqual({ page: 0, body: 0, sheet: 0 });
      await shot(page, `phone-${locale}`);
    }
  });
});

test.describe('desktop 1280×800 — ref6', () => {
  test.use({ viewport: DESKTOP });

  test.beforeEach(async ({ page }) => { await seed(page); });

  test('three panes: the navigation, the Result pane with Models & prices in the centre, the same panel in the right column', async ({ page }) => {
    await openImage(page);
    const right = page.getByTestId('settings-panel');
    await expect(right.getByTestId('image-create-panel')).toBeVisible();
    const centre = page.getByTestId('image-desk');
    await expect(centre).toBeVisible();
    await expect(centre.getByTestId('image-result-pane')).toBeVisible();
    await expect(centre.getByTestId('models-prices')).toBeAttached();

    // Left → right on the screen: the navigation column (the centre starts after it), then the centre, then the settings column.
    const [centreBox, rightBox] = await Promise.all([centre, right].map((l) => l.evaluate((n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right }; })));
    expect(centreBox!.left).toBeGreaterThan(250);
    expect(centreBox!.right).toBeLessThanOrEqual(rightBox!.left + 1);

    // The thread's greeting and chips are not drawn behind it, and the page does not scroll sideways.
    await expect(page.getByText('How can I help?')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await shot(page, 'desktop-create');
  });

  test('the right column: templates open by default (every card), pickers are popovers, the footer holds chips and Generate', async ({ page }) => {
    await openImage(page);
    const panel = page.getByTestId('settings-panel').getByTestId('image-create-panel');
    await expect(panel.getByTestId('templates-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByTestId('image-templates').getByRole('radio')).toHaveCount(IMAGE_TEMPLATES.length);
    await expect(panel.getByTestId('create-close')).toHaveCount(0); // the column has its own close

    await panel.getByTestId('chip-aspect').click();
    await expect(page.getByTestId('picker-popover')).toBeVisible();
    await expect(page.getByTestId('picker-aspect')).toHaveCount(0); // that id is the PHONE sheet's
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('picker-popover')).toHaveCount(0);

    // The footer stays on screen while the gallery scrolls under it.
    const footer = panel.locator('[data-create-row="footer"]');
    const inView = () => footer.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.top >= 0; });
    expect(await inView()).toBe(true);
    await panel.getByTestId('image-templates').evaluate((el) => el.scrollIntoView({ block: 'end' }));
    expect(await inView()).toBe(true);
    await expect(panel.getByTestId('create-generate')).toBeVisible();
  });

  test('Models & prices doubles as the picker: three rows priced by the quote; a row sets the size in the right column', async ({ page }) => {
    await openImage(page);
    const table = page.getByTestId('models-prices');
    await table.scrollIntoViewIfNeeded();
    const rows = table.getByRole('radio');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Auto · 1K');
    await expect(rows.nth(2)).toContainText('Nano Banana Pro');
    for (let i = 0; i < 3; i++) await expect(rows.nth(i)).toContainText(`${quoteCredits({ tool: 'image', count: 1 })} credits / image`);
    await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'true'); // 2K, the default
    await rows.nth(2).click();
    await expect(rows.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('settings-panel').getByTestId('chip-quality')).toHaveText('4K');
    await shot(page, 'desktop-models');
  });

  test('the result lands in the centre with the studio\'s actions; the conversation is one tap away', async ({ page }) => {
    const calls: ImageRequest[] = [];
    await mockImageRoute(page, calls);
    await openImage(page);
    await pretendSignedIn(page);
    const panel = page.getByTestId('settings-panel').getByTestId('image-create-panel');
    await panel.getByTestId('create-prompt').fill('A lighthouse on a cliff at sunset');
    await panel.getByTestId('create-generate').click();

    const pane = page.getByTestId('image-result-pane');
    const picture = pane.getByTestId('result-image');
    await expect(picture).toBeVisible({ timeout: 20_000 });
    for (const name of ['Download', 'Share', 'Upscale', 'Generate again', 'Edit this image', 'Send to video']) {
      await expect(pane.getByRole('toolbar').getByRole('button', { name })).toBeVisible();
    }
    expect(calls[0]).toMatchObject({ prompt: 'A lighthouse on a cliff at sunset', aspectRatio: '1:1', quality: 'high' });

    // The thread is inside a disclosure — nothing was deleted.
    const conversation = page.getByTestId('image-conversation');
    await expect(conversation).toBeVisible();
    await expect(conversation.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    await conversation.getByRole('button').click();
    await expect(conversation.getByText('A lighthouse on a cliff at sunset')).toBeVisible();
    await shot(page, 'desktop-result');

    // "Edit this image" loads it as the reference in the right column's upload card.
    await pane.getByRole('button', { name: 'Edit this image' }).click();
    await expect(panel.locator('[data-create-row="upload"] img')).toBeVisible();
    await expect(panel.getByTestId('create-prompt')).toBeFocused();
  });
});
