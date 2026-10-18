import { test, expect, type Page } from '@playwright/test';

/**
 * GG's UI plan, 2026-10-18, in a real browser (nothing is generated, nothing is charged):
 *   · the chat is the hub: one box and four quick buttons — video, image, music, avatar — under the empty chat's box;
 *   · a tap opens that tool and the words typed in the chat go with it as the tool's description (never typed twice);
 *   · one description box (GG's card, 05:14Z „დამალე"): on a desktop, while the Image, Music or Video panel is open, the
 *     composer's text box steps aside — the panel holds the words — and closing the panel brings it back with them.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const WORDS = 'ღამის თბილისი წვიმის შემდეგ';
// Background traffic is not a job: the presence heartbeat, client error logging and the analytics log POST on their own.
const BACKGROUND = /^\/api\/(presence|log-error|analytics\/track)\b/;

async function open(page: Page, path = '/ka/dashboard?tool=chat'): Promise<string[]> {
  const posts: string[] = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (r.method() === 'POST' && p.startsWith('/api/') && !BACKGROUND.test(p)) posts.push(p);
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
  await page.goto(path);
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
  return posts;
}

const tool = (page: Page) => page.locator('html').getAttribute('data-tool');
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [name, viewport, phone] of [['desktop 1280×800', DESKTOP, false], ['phone 390×844', PHONE, true]] as const) {
  test.describe(name, () => {
    test.use(phone ? { viewport, hasTouch: true, isMobile: true } : { viewport });

    test('the empty chat: the box and, under it, four quick buttons — video, image, music, avatar — nothing sideways', async ({ page }) => {
      await open(page);
      const quick = page.getByRole('group', { name: 'სწრაფი შექმნა' });
      await expect(quick.getByRole('button')).toHaveText(['ვიდეო', 'სურათი', 'მუსიკა', 'ავატარი']);
      const pill = (await page.getByTestId('composer-input').locator('xpath=..').boundingBox())!;
      const row = (await quick.boundingBox())!;
      expect(row.y).toBeGreaterThanOrEqual(pill.y + pill.height - 1); // under the box, never above it
      for (const h of await quick.getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
        expect(h).toBeGreaterThanOrEqual(44); // a thumb-sized target
      }
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      // The longest names (Russian) still fit four across.
      await page.goto('/ru/dashboard?tool=chat');
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole('group', { name: 'Быстрое создание' }).getByRole('button')).toHaveText(['Видео', 'Изображение', 'Музыка', 'Аватар']);
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });

    test('words typed in the chat go to the tool a quick button opens — its description, not typed twice; nothing is sent', async ({ page }) => {
      const posts = await open(page);
      await page.getByTestId('composer-input').fill(WORDS);
      await page.getByTestId('home-quick-video').click();
      await expect.poll(() => tool(page)).toBe('video');
      // GG 2026-10-18: Video's words stay in the chat box (its panel has no prompt of its own).
      await expect(page.getByTestId('video-create-panel').filter({ visible: true })).toBeVisible();
      await expect(page.getByTestId('composer-input')).toHaveValue(WORDS);
      await expect(page.getByTestId('video-prompt-input')).toHaveCount(0);
      await expect(page.getByTestId('home-quick')).toHaveCount(0); // a tool, not the chat home
      expect(posts).toEqual([]);
    });
  });
}

test.describe('desktop: one description box', () => {
  test.use({ viewport: DESKTOP });

  test('Image: the panel holds the words and the composer\'s box steps aside; closing the panel brings the box back with them', async ({ page }) => {
    const posts = await open(page);
    await page.getByTestId('composer-input').fill(WORDS);
    await page.getByTestId('home-quick-image').click();
    await expect.poll(() => tool(page)).toBe('image');
    await expect(page.getByTestId('create-prompt').filter({ visible: true })).toHaveValue(WORDS);
    await expect(page.getByTestId('composer-input')).toBeHidden();
    // The pill keeps its voice controls while the box is aside, and no second Create: the panel's priced one is it.
    await expect(page.getByTestId('composer-bar').getByRole('button', { name: 'ხმის ჩაწერა' })).toBeVisible();
    await expect(page.getByTestId('composer-bar').getByRole('button', { name: 'ცოცხალი ხმა' })).toBeVisible();
    await expect(page.getByTestId('run-button')).toHaveCount(0);
    await expect(page.getByTestId('create-generate').filter({ visible: true })).toBeVisible();

    const chip = page.getByTestId('options-toggle');
    await chip.click(); // the panel away
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveValue(WORDS);
    await expect(page.getByTestId('run-button')).toBeVisible(); // Agent G's line, with its Send
    await chip.click(); // and back
    await expect(page.getByTestId('composer-input')).toBeHidden();
    expect(posts).toEqual([]);
  });

  test('Video: the box and its priced Send stay beside the open panel — the words are typed there, one button (GG, 2026-10-18)', async ({ page }) => {
    const posts = await open(page);
    await page.getByTestId('composer-input').fill(WORDS);
    await page.getByTestId('home-quick-video').click();
    await expect.poll(() => tool(page)).toBe('video');
    await expect(page.getByTestId('video-create-panel').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveValue(WORDS);
    // 24 s on Fast: the quote the panel's Generate used to show is on the Send now; the panel has no Generate.
    await expect(page.getByTestId('run-button')).toHaveAttribute('data-price', '75');
    await expect(page.getByTestId('video-generate')).toHaveCount(0);
    expect(posts).toEqual([]);
  });

  test('Music and Avatar open from their quick buttons; the avatar keeps its box (the words are its script)', async ({ page }) => {
    await open(page);
    await page.getByTestId('home-quick-music').click();
    await expect.poll(() => tool(page)).toBe('music');
    await expect(page.getByTestId('composer-input')).toBeHidden(); // Music's description is on its panel
    await expect(page.getByTestId('music-simple-input').filter({ visible: true })).toBeVisible();

    await page.goto('/ka/dashboard?tool=chat');
    await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('composer-input').fill('გამარჯობა, მე ვარ თქვენი ავატარი');
    await page.getByTestId('home-quick-avatar').click();
    await expect.poll(() => tool(page)).toBe('avatar');
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveValue('გამარჯობა, მე ვარ თქვენი ავატარი');
  });

  test('once the conversation starts the quick buttons are gone', async ({ page }) => {
    await page.route('**/api/chat/gemini', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': keep-alive\n\ndata: {"meta":{"provider":"gemini","model":"gemini-3.8-flash","mode":"fast"}}\n\ndata: {"text":"თბილისი საქართველოს დედაქალაქია."}\n\ndata: [DONE]\n\n' }));
    await open(page);
    await expect(page.getByTestId('home-quick')).toBeVisible();
    await page.getByTestId('composer-input').fill('რა არის თბილისი?');
    await page.getByTestId('composer-input').press('Enter');
    await expect(page.getByText('თბილისი საქართველოს დედაქალაქია.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('home-quick')).toHaveCount(0);
  });
});
