import { test, expect } from '@playwright/test';
import { followUpUnsupportedText } from '@/lib/agent/media/montageChat';
import { openStudio, say, attachClips, attachClipsAndTrack, shot, EDIT_URL, MASTER_URL, QUOTE, ROUTE_CHECK_MS } from './_shared';

/**
 * ONE EDIT IN THE CHAT, ON A DESKTOP AND ON A PHONE — the Video Core v1.0 round-3 editing checks (the patterns of
 * tests/agent-g-edit.spec.ts, on both viewports, every route mocked):
 *
 *   · a video attached with „Convert this video to 9:16." is Agent G's own edit lane: ONE quote POST to
 *     /api/agent/media/edit with the file, the edit op and the name; the plan card says the frame and the fit; nothing
 *     runs before Start; Start runs it once and the result plays under the card;
 *   · with the edit lane closed to this user the ask is answered in words, nothing is quoted;
 *   · AC-23 on the phone: the unsupported music delay is said on the montage quote card, and a follow-up on a delivered
 *     montage is refused in words with zero new quote calls (the desktop pass of both lives in agent-g-intents.spec.ts).
 */

const NAMES: [string, string, string] = ['beach.webm', 'city.webm', 'song.wav'];

test.describe('Video Core — editing in the chat', () => {
  test('an attached video + „Convert this video to 9:16." → plan card → Start → the edit under the card', async ({ page, isMobile }) => {
    const calls = await openStudio(page, { edit: true });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await attachClips(page, ['beach.webm']);
    await say(page, 'Convert this video to 9:16.');
    const card = page.getByTestId('agent-edit-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.editQuote).toEqual([{ action: 'quote', file: 'omni-uploads/u/file-1', edits: [{ op: 'aspect', to: '9:16', fit: 'crop' }], name: 'beach.webm' }]);
    await expect(page.getByText(/Plan: frame 9:16, cropped to fill\./)).toBeVisible();
    expect(calls.editRun).toEqual([]); // nothing runs before Start
    expect(calls.chat).toEqual([]); // and the words never went to the chat model

    await page.getByTestId('agent-edit-start').click();
    await expect(card).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
    await expect(card.locator('li[aria-current="step"]')).toHaveAttribute('data-step', /^(render|qc)$/, { timeout: 10_000 });
    const result = page.getByTestId('agent-edit-result');
    await expect(result.locator(`video[src^="${EDIT_URL}"]`)).toBeAttached({ timeout: 25_000 });
    await expect(card).toHaveAttribute('data-phase', 'done');
    expect(calls.editRun).toHaveLength(1); // Start ran it exactly once
  });

  test('with the edit lane closed the ask is answered in words and nothing is quoted', async ({ page }) => {
    const calls = await openStudio(page, { edit: false });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await attachClips(page, ['beach.webm']);
    await say(page, 'Convert this video to 9:16.');
    await expect(page.getByText(/I cannot change a video's frame shape \(9:16\) in the chat yet/)).toBeVisible({ timeout: 20_000 });
    expect(calls.editQuote).toEqual([]);
    expect(calls.editRun).toEqual([]);
    await expect(page.getByTestId('agent-edit-card')).toHaveCount(0);
  });

  test('[ka · phone] AC-23 — the unsupported music delay is said on the quote card', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the desktop pass lives in agent-g-intents.spec.ts');
    const calls = await openStudio(page, { locale: 'ka', quote: { ...QUOTE, musicStartSec: 0, unsupported: ['music_delay'] } });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await attachClipsAndTrack(page, NAMES);
    await say(page, 'მუსიკა ვიდეოს მე-5 წამიდან დაიწყოს');
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    const NOTE = 'ამ ვერსიაში არ არის მხარდაჭერილი: მუსიკის მოგვიანებით ჩართვა ტაიმლაინზე.';
    const plan = page.getByText(NOTE).first();
    await expect(plan).toBeVisible();
    const lines = (await plan.evaluate((el) => el.textContent ?? '')).split('\n').map((l) => l.trim());
    expect(lines.some((l) => l.startsWith('ამ ვერსიაში არ არის მხარდაჭერილი'))).toBe(true);
    expect(calls.quote).toHaveLength(1);
    expect(calls.run).toHaveLength(0);
    await shot(page, 'ac23-unsupported-note-mobile');
  });

  test('[ka · phone] AC-23 — „add these two" after a delivered montage: refused in words, zero new quote calls', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the desktop pass lives in agent-g-intents.spec.ts');
    const calls = await openStudio(page, { locale: 'ka' });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await attachClipsAndTrack(page, NAMES);
    await say(page, 'cut these to the music');
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-start').click();
    await expect(page.getByTestId('agent-montage-result').locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });
    await attachClips(page, ['third.webm', 'fourth.webm']);
    await say(page, 'ეს ორიც დაამატე');
    await expect(page.getByText(followUpUnsupportedText('add_clips', 'ka'))).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_500);
    expect(calls.quote).toHaveLength(1);
    expect(calls.run).toHaveLength(1);
    await expect(page.getByTestId('composer-input')).toHaveValue('ეს ორიც დაამატე');
    await expect(page.getByTitle('fourth.webm')).toBeVisible();
  });
});
