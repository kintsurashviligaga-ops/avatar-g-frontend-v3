import { test, expect, type Page, type Route } from '@playwright/test';
import { openStudio, openVideoTool, waitForBoard, json, ROUTE_CHECK_MS, typeFilmPrompt, sendFilm } from './video-core/_shared';

/**
 * GG's two reports from Production, 2026-10-17 07:39Z, in a real browser with every route mocked (nothing is generated,
 * nothing is charged):
 *
 *   · a 4-second film was delivered, then „უკეთესად გააკეთე" („make it better") started a different film: the two words
 *     were planned as a brief of their own. Now the SAME brief is planned again, improved, at the same length; the board
 *     is free and nothing renders before its Generate;
 *   · „შექმენი ავატარი რომელიც ამბობს ქართულად: გადადი მაი ავატარ ჯიზე და დაიწყე" ended on „ეს ხელსაწყო დროებით
 *     შეჩერებულია…": with no photo it went to the HeyGen presenter, which the Google-only boundary refuses. Now Agent G's
 *     card names the line, the Cloud TTS voice, a ready presenter and Veo's price (25); its yes NAMES that presenter's
 *     built-in face to the Veo avatar (MASTER TASK v3.1 PR 9: built-in avatars only, nothing uploaded), with the words
 *     alone, the voice's gender and the price on screen. HeyGen is never called.
 */

const FILM_URL = 'https://e2e-media.supabase.co/films/final-master.mp4';
const BRIEF = 'A quiet harbour at dawn, three fishing boats';
const GG_ORDER = 'შექმენი ავატარი რომელიც ამბობს ქართულად: გადადი მაი ავატარ ჯიზე და დაიწყე';
const GG_LINE = 'გადადი მაი ავატარ ჯიზე და დაიწყე';
const AVATAR_URL = 'https://e2e-media.supabase.co/renders/avatar-veo/voiced.mp4';

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  // On a desktop an open Image, Music or Video panel holds the description and the composer's box steps aside (GG's card,
  // 2026-10-18): put the panel away, as a person does, to write to Agent G.
  if (await box.isHidden()) {
    await page.getByTestId('options-toggle').click();
    await expect(box).toBeVisible();
  }
  await box.fill(text);
  await box.press('Enter');
}

test.describe('make it better, and the talking avatar in the chat (GG, 2026-10-17)', () => {
  test('„უკეთესად გააკეთე" after a delivered 4 s film plans the same film again, improved and 4 s long — nothing renders', async ({ page }) => {
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
    await expect(page.locator(`video[src^="${FILM_URL}"]`).first()).toBeAttached({ timeout: 30_000 });
    await page.keyboard.press('Escape').catch(() => undefined);
    const chatBefore = calls.chat.length;

    await say(page, 'უკეთესად გააკეთე');

    await expect.poll(() => calls.storyboard.filter((b) => b.planOnly).length, { timeout: 20_000 }).toBe(2);
    const [first, again] = calls.storyboard.filter((b) => b.planOnly);
    expect(String(again!.prompt).startsWith(String(first!.prompt))).toBe(true);
    expect(String(again!.prompt)).toContain('Improve on the previous version: the same story');
    expect(again!.sceneCount).toBe(first!.sceneCount);
    await expect(page.getByText('Improving the video above', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await waitForBoard(page, 'en', 1);
    // A plan only: no second render, no model reply, no Agent G question about the words.
    expect(calls.orchestrate).toHaveLength(1);
    expect(calls.chat.length).toBe(chatBefore);
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);
  });

  test('GG’s avatar order in the chat: the card at 25, „yes" sends Veo a ready presenter and the line; HeyGen is never asked', async ({ page }) => {
    const veo: Array<Record<string, unknown>> = [];
    const heygen: string[] = [];
    await page.route('**/api/avatar/veo', async (r: Route) => {
      if (r.request().method() === 'GET') { await r.fulfill(json(200, { success: true, open: true, credits: 25, seconds: 8 })); return; }
      veo.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
      await r.fulfill(json(202, { success: true, op: 'avatar', jobId: 'operations/e2e::9:16::1760000000000~gj1.t', credits: 25, engine: 'Veo', voice: 'Google Cloud TTS' }));
    });
    await page.route('**/api/genjutsu/status**', (r) => r.fulfill(json(200, { success: true, done: true, state: 'ready', videoUrl: AVATAR_URL })));
    await page.route('**/api/heygen/**', (r) => { heygen.push(r.request().url()); return r.fulfill(json(503, { success: false, error: 'google_only' })); });
    await page.route('**/api/video/lipsync**', (r) => { heygen.push(r.request().url()); return r.fulfill(json(503, { success: false, error: 'google_only' })); });
    const calls = await openStudio(page);
    await page.waitForTimeout(ROUTE_CHECK_MS);

    await say(page, GG_ORDER);
    const card = page.locator('[data-testid="agent-g-card"][data-kind="confirm"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    const offer = page.getByText('I’ll make an 8-second talking avatar (9:16).', { exact: false }).first();
    await expect(offer).toBeVisible();
    for (const words of [`“${GG_LINE}”`, 'a Georgian female voice (Google Cloud TTS)', 'a ready presenter', '25 credits']) {
      await expect(page.getByText(words, { exact: false }).first()).toBeVisible();
    }
    expect(veo).toHaveLength(0); // nothing before the yes

    await say(page, 'yes');
    await expect.poll(() => veo.length, { timeout: 20_000 }).toBe(1);
    expect(veo[0]).toMatchObject({ speech: GG_LINE, direction: '', aspect: '9:16', voiceGender: 'female', expectedCredits: 25 });
    expect(String(veo[0]!.avatar)).toMatch(/^\/avatars\/preset-\d\.jpg$/); // the presenter's built-in face, by name
    expect(veo[0]).not.toHaveProperty('photo');
    expect(calls.sign).toHaveLength(0); // nothing uploaded
    await expect(page.locator(`video[src^="${AVATAR_URL}"]`).first()).toBeAttached({ timeout: 20_000 });

    // „make it better" after the avatar offers another take of the SAME line at its price — never a new line.
    await say(page, 'make it better');
    await expect(page.getByText('I’ll shoot the avatar again', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await say(page, 'yes');
    await expect.poll(() => veo.length, { timeout: 20_000 }).toBe(2);
    expect(veo[1]).toMatchObject({ speech: GG_LINE, aspect: '9:16', voiceGender: 'female', expectedCredits: 25 });
    expect(heygen).toEqual([]);
  });
});
