import { test, expect, type Page } from '@playwright/test';
import { openStudio, openVideoTool, waitForBoard, ROUTE_CHECK_MS, typeFilmPrompt, sendFilm, say } from './video-core/_shared';

/**
 * GG's plan 2026-10-17 11:28Z, item 1, in a real browser with every route mocked (nothing is generated, nothing is
 * charged): after a first result Agent G lost the thread and could not open or close a panel. A delivered film left the
 * composer in Video, so „გახსენი ავატარი" was planned as the next film, „გავაკეთოთ ავატარი" became an avatar card whose
 * script was those two words, and nothing closed a panel. Now the words are the studio's own controls in any tool, and
 * the tool changes in the SAME conversation: the film stays in the thread above.
 */

const FILM_URL = 'https://e2e-media.supabase.co/films/final-master.mp4';
const BRIEF = 'A quiet harbour at dawn, three fishing boats';


const tool = (page: Page) => page.evaluate(() => document.documentElement.dataset.tool ?? '');

test.describe('the studio’s controls by text, after a first result (GG, 2026-10-17)', () => {
  test('after a delivered film: open the avatar, close its panel, back to the chat, open Video — one thread, nothing planned or charged', async ({ page }) => {
    const calls = await openStudio(page, { assemble: { status: 200, body: { url: FILM_URL, qa: null } } });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await openVideoTool(page, false);
    await typeFilmPrompt(page, BRIEF);
    await page.getByTestId('video-tile-length').click();
    await page.getByTestId('video-preset-4').click();
    await page.keyboard.press('Escape');
    await sendFilm(page);
    await waitForBoard(page, 'en', 1);
    await page.getByTestId('storyboard-generate').click();
    await expect.poll(() => calls.assemble.length, { timeout: 30_000 }).toBe(1);
    const film = page.locator(`video[src^="${FILM_URL}"]`).first();
    await expect(film).toBeAttached({ timeout: 30_000 });
    expect(await tool(page)).toBe('video');
    const plans = calls.storyboard.length;
    const chats = calls.chat.length;

    // GG's words. The composer is still in Video: they used to be its next brief.
    await say(page, 'გავაკეთოთ ავატარი');
    await expect.poll(() => tool(page)).toBe('avatar');
    await expect(page.getByText('Write what the avatar says, or attach a photo.', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await say(page, 'ჩაკეტე პანელი');
    await expect(page.getByText('Closed the settings.', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('settings-panel')).toBeHidden();
    expect(await tool(page)).toBe('avatar');

    await say(page, 'ჩაკეტე პანელი');
    await expect.poll(() => tool(page)).toBe('chat');

    await say(page, 'გახსენი ვიდეო');
    await expect.poll(() => tool(page)).toBe('video');
    await expect(page.getByText('Tell me what the film is about.', { exact: false }).first()).toBeVisible();

    await say(page, 'დაბრუნდი ჩატში');
    await expect.poll(() => tool(page)).toBe('chat');

    // The same conversation all along: the film is still in the thread. No plan, no model turn, no card, no render.
    await expect(film).toBeAttached();
    expect(calls.storyboard.length).toBe(plans);
    expect(calls.chat.length).toBe(chats);
    expect(calls.assemble).toHaveLength(1);
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);
  });

  test('a message that asks for more than a panel still goes on as before (it is not taken for a command)', async ({ page }) => {
    const calls = await openStudio(page);
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await say(page, 'open the settings and tell me what a storyboard is');
    await expect.poll(() => calls.chat.length, { timeout: 20_000 }).toBe(1);
    expect(await tool(page)).toBe('chat');
  });
});
