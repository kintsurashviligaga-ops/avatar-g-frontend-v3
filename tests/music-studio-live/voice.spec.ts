import { test, expect } from '@playwright/test';
import { balanceOf, evidence, projectUser } from '../video-core-live/_live';
import { cards, confirm, ledgerForJob, newestCard, openStudio, voice, waitPhase } from './_music';

/**
 * Agent G Live Voice → Music Studio, at the TOOL-DISPATCH layer: each step is the validated `music_studio` call the
 * call's executor hands the studio (window `myavatar:live-action`), and the studio's answer is what the model would
 * hear. There is NO microphone, speech recognition or Gemini Live session here — those are not claimed by this spec.
 *
 * What it proves in the running app: a plan is a card with a price and nothing is charged; the call's own `click` cannot
 * press Create (data-live-guard="spend"); a repeated plan makes no second card; status reads price and progress; a
 * cancel, an edit, a join, a download and "save" reach the cards; only the user's tap starts (and charges) a job.
 */

test.describe.configure({ mode: 'serial' });

test('voice plans, never spends; the user\'s tap starts it; voice edits, joins, downloads, reads status and cancels', async ({ page }, info) => {
  const user = projectUser(info);
  await openStudio(page);
  const before = await balanceOf(user.id);
  const n0 = await cards(page).count();

  // plan → a card on screen, priced by the server; a duplicate call within the window adds nothing.
  const plan = { action: 'plan', prompt: `voice lofi beat ${info.project.name}`, genre: 'lofi', mood: 'calm', tempo: 'slow' };
  const first = await voice(page, plan);
  expect(first.took).toBe(true);
  expect(first.reply).toMatchObject({ ok: true });
  expect(first.reply!.message).toMatch(/only by tapping Create/);
  const again = await voice(page, plan);
  expect(again.reply!.message).toMatch(/already on screen; no second card/);
  await expect(cards(page)).toHaveCount(n0 + 1);
  const card = newestCard(page);
  await waitPhase(card, 'quoted', 30_000);
  await expect(card).toContainText('lofi');
  await expect(card).toContainText('calm');

  // status → the price the card shows; still nothing charged.
  const status = await voice(page, { action: 'status' });
  expect((status.reply!.state as { cards: Array<{ phase: string; credits?: number }> }).cards[0]).toMatchObject({ phase: 'quoted', credits: 5 });
  expect(await balanceOf(user.id)).toBe(before);

  // The call's own hands cannot press Create: the live click guard refuses a `data-live-guard="spend"` control.
  const guard = await page.evaluate(() => {
    const b = document.querySelectorAll('[data-testid="music-confirm"]');
    return (b[b.length - 1] as HTMLElement | undefined)?.closest('[data-live-guard]')?.getAttribute('data-live-guard') ?? null;
  });
  expect(guard).toBe('spend');
  expect(await balanceOf(user.id)).toBe(before);

  // Nothing to edit, join, download or cancel yet → said plainly.
  expect((await voice(page, { action: 'cancel' })).reply).toMatchObject({ ok: false, error: 'nothing_running' });
  expect((await voice(page, { action: 'edit', command: 'fade out 3s' })).reply).toMatchObject({ ok: false });

  // The user's own tap starts it (one debit); voice reads progress meanwhile.
  const { jobId } = await confirm(page, card, user.id);
  const progress = await voice(page, { action: 'status' });
  expect(['starting', 'running', 'completed']).toContain((progress.reply!.state as { cards: Array<{ phase: string }> }).cards[0]!.phase);
  await waitPhase(card, 'completed', 120_000);
  expect((await ledgerForJob(user.id, jobId)).map((r) => r.delta)).toEqual([-5]);

  // Voice edit → a new version (free, original kept).
  const edited = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/edit'));
  expect((await voice(page, { action: 'edit', command: 'trim from 0 to 12 seconds' })).reply).toMatchObject({ ok: true });
  expect((await edited).status()).toBe(200);
  await expect(card.getByTestId('music-version')).toHaveCount(1);
  // A second edit while one runs is refused (no duplicate work).
  const e2 = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/edit'));
  const fade = await voice(page, { action: 'edit', command: 'fade in 2 seconds' });
  const busy = await voice(page, { action: 'edit', command: 'fade in 2 seconds' });
  expect(fade.reply).toMatchObject({ ok: true });
  expect(busy.reply).toMatchObject({ ok: false, error: 'busy' });
  await e2;
  await expect(card.getByTestId('music-version')).toHaveCount(2);

  // Voice join of the two newest tracks with a crossfade → a third version.
  const j = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/edit'));
  expect((await voice(page, { action: 'join', count: 2, crossfadeSec: 2 })).reply).toMatchObject({ ok: true });
  const joinRes = await j;
  expect(joinRes.status()).toBe(200);
  expect(((await joinRes.json()) as { durationSec: number }).durationSec).toBeGreaterThan(21);
  await expect(card.getByTestId('music-version')).toHaveCount(3);

  // Voice download → the browser saves the newest track; "save" says the Library already has it.
  const dl = page.waitForEvent('download');
  expect((await voice(page, { action: 'download' })).reply).toMatchObject({ ok: true });
  expect((await dl).suggestedFilename()).toMatch(/^myavatar-music-[0-9a-f]{8}-join-2-crossfade-2s\.mp3$/);
  expect((await voice(page, { action: 'save' })).reply!.message).toMatch(/already saved in the user's Library/);
  expect(await balanceOf(user.id), 'voice edits, joins and downloads are free').toBe(before - 5);

  // Voice cancel of a running job → refunded once.
  await voice(page, { action: 'plan', prompt: `voice cancel check [e2e:slow] ${info.project.name}` });
  const slow = newestCard(page);
  await waitPhase(slow, 'quoted', 30_000);
  const { jobId: slowId } = await confirm(page, slow, user.id);
  await expect(slow.getByTestId('music-cancel')).toBeVisible({ timeout: 30_000 });
  expect((await voice(page, { action: 'cancel' })).reply).toMatchObject({ ok: true });
  await waitPhase(slow, 'cancelled', 60_000);
  await expect.poll(async () => (await ledgerForJob(user.id, slowId)).map((r) => r.delta), { timeout: 60_000 }).toEqual([-5, 5]);
  expect(await balanceOf(user.id)).toBe(before - 5);

  evidence(`music-voice-${info.project.name}`, { jobId, slowId, before, after: await balanceOf(user.id) });
});

test('voice in Georgian and Russian: a plan in the page language; a song stays a song and is refused, not swapped', async ({ page }) => {
  await openStudio(page, 'ka');
  const ka = await voice(page, { action: 'plan', prompt: 'ქართული ხალხური მელოდია ფანდურზე', tempo: 'slow' });
  expect(ka.reply).toMatchObject({ ok: true });
  await waitPhase(newestCard(page), 'quoted', 30_000);
  await expect(newestCard(page).getByTestId('music-confirm')).toHaveText('შექმნა · 5 კრედიტი');
  const song = await voice(page, { action: 'plan', prompt: 'სიმღერა თბილისზე', mode: 'song', lyrics: 'თბილისო, მზის და ვარდების მხარეო', lyricsLanguage: 'ka' });
  expect(song.reply!.message).toMatch(/never offer an instrumental/);
  await waitPhase(newestCard(page), 'refused', 30_000);

  await openStudio(page, 'ru');
  await voice(page, { action: 'plan', prompt: 'энергичный электронный трек', tempo: 'fast' });
  await waitPhase(newestCard(page), 'quoted', 30_000);
  await expect(newestCard(page).getByTestId('music-confirm')).toHaveText('Создать · 5 кредитов');
});
