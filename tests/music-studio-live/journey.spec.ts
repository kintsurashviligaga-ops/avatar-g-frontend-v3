import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { balanceOf, evidence, projectUser, shot } from '../video-core-live/_live';
import {
  MUSIC_PRICE, audioFacts, cards, confirm, jobRow, ledgerForJob, newestCard, openStudio, storedBytes, voice, waitPhase,
} from './_music';

/**
 * Music Studio v1 — the One Window journey in a real browser (desktop Chrome and an iPhone 13 viewport, each its own
 * signed-in synthetic user), against `next start` of this branch and a throwaway local Supabase stack. The provider is
 * the isolated stand-in (lib/music/studio/e2eProvider): its bytes are a synthetic tone, NEVER Lyria output; the quote,
 * the reservation, the worker, QC, Storage, the Library rows, the edits and the refunds are the real ones.
 */

test.describe.configure({ mode: 'serial' });

const tag = (info: { project: { name: string } }) => (info.project.name.includes('mobile') ? 'mobile' : 'desktop');

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function download(page: Page, link: ReturnType<Page['getByTestId']>, isMobile: boolean): Promise<{ file: string; name: string }> {
  const dl = page.waitForEvent('download');
  if (isMobile) await link.tap(); else await link.click();
  const d = await dl;
  const file = await d.path();
  expect(file, 'the browser saved the file').toBeTruthy();
  // The page stayed on the app (a cross-origin link without `download=` would have opened the bare file instead).
  expect(page.url()).toContain('/dashboard');
  return { file: file!, name: d.suggestedFilename() };
}

test('panel → plan → quote → explicit Create → stages → player → download → edits → join → Library, exactly one debit', async ({ page, isMobile }, info) => {
  const user = projectUser(info);
  const before = await balanceOf(user.id);
  expect(before).toBeGreaterThanOrEqual(MUSIC_PRICE * 4);
  await openStudio(page, 'en', 'music');

  // The Music tool's own panel: instrumental, a description, Create.
  const styles = page.getByTestId('music-styles-input');
  await expect(styles).toBeVisible({ timeout: 60_000 });
  const instrumental = page.getByTestId('music-instrumental');
  if ((await instrumental.getAttribute('aria-pressed')) !== 'true') await instrumental.click();
  await expect(instrumental).toHaveAttribute('aria-pressed', 'true');
  const prompt = `calm piano with soft strings ${tag(info)}`;
  await styles.fill(prompt);
  const quoted = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/quote'));
  await page.getByTestId('music-create').click();
  expect((await quoted).status()).toBe(200);

  // Plan + exact price; nothing charged by the quote.
  const card = newestCard(page);
  await waitPhase(card, 'quoted', 30_000);
  const create = card.getByTestId('music-confirm');
  await expect(create).toHaveText(new RegExp(`Create · ${MUSIC_PRICE} credits`));
  await expect(create).toHaveAttribute('aria-label', `Confirm: ${MUSIC_PRICE} credits will be charged`);
  await expect(create).toHaveAttribute('data-live-guard', 'spend');
  await expect(card).toContainText('Instrumental');
  await expect(card).toContainText('≈ 30 s');
  expect(await balanceOf(user.id), 'a quote never charges').toBe(before);
  await shot(page, `music-${tag(info)}-quoted`);
  await noHorizontalScroll(page);

  // Explicit Create (a tap on the phone) → the named stages, never a percentage.
  const { jobId, status } = await confirm(page, card, isMobile ? 'tap' : 'click');
  expect(status).toBe(200);
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(card.getByTestId('music-stage')).toHaveText(/Queued|Reserving credits|Starting|Lyria is composing|Checking quality/);
  expect(await card.textContent()).not.toMatch(/\d\s?%/);
  await waitPhase(card, 'completed', 120_000);
  await expect(card).toHaveAttribute('data-job-id', jobId);
  await shot(page, `music-${tag(info)}-completed`);

  // Exactly one debit of the quoted price under the job's ref.
  expect(await balanceOf(user.id)).toBe(before - MUSIC_PRICE);
  const ledger = await ledgerForJob(user.id, jobId);
  expect(ledger.map((r) => r.delta)).toEqual([-MUSIC_PRICE]);

  // The Library row and the private stored file.
  const row = await jobRow(jobId);
  expect(row).toMatchObject({ user_id: user.id, service_type: 'music', status: 'completed' });
  const result = row!.result as { bucket: string; path: string; digest: string; credits: number; modelId: string };
  expect(result.bucket).toBe('renders');
  expect(result.path).toBe(`music-studio/${user.id}/${jobId}.mp3`);
  expect(result.credits).toBe(MUSIC_PRICE);
  const originalDigest = createHash('sha256').update(await storedBytes(result.bucket, result.path)).digest('hex');
  expect(originalDigest).toBe(result.digest);

  // Inline playback: the player loads the signed link and plays.
  const player = card.getByTestId('music-player');
  await expect(player).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/renders\/music-studio\//);
  const played = await player.evaluate(async (el) => {
    const a = el as HTMLAudioElement;
    a.muted = true;
    if (a.readyState < 1) await new Promise((r) => { a.addEventListener('loadedmetadata', r, { once: true }); a.load(); });
    await a.play();
    await new Promise((r) => setTimeout(r, 1200));
    a.pause();
    return { duration: a.duration, currentTime: a.currentTime, error: a.error?.code ?? null };
  });
  expect(played.error).toBeNull();
  expect(played.duration).toBeGreaterThan(28);
  expect(played.duration).toBeLessThan(32);
  expect(played.currentTime).toBeGreaterThan(0.3);

  // Download → a decodable 30 s MP3 under the app's own name.
  const dl = await download(page, card.getByTestId('music-download'), isMobile);
  expect(dl.name).toBe(`myavatar-music-${jobId.slice(0, 8)}.mp3`);
  const facts = await audioFacts(dl.file);
  expect(facts.codec).toBe('mp3');
  expect(facts.durationSec).toBeGreaterThan(29);
  expect(facts.durationSec).toBeLessThan(31.5);

  // Edits in Agent G's words — each a NEW version, free; the original never changes.
  const box = card.getByTestId('music-edit-input');
  const apply = async (words: string) => {
    const edited = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/edit'));
    await box.fill(words);
    await box.press('Enter');
    const r = await edited;
    expect(r.status(), `edit "${words}"`).toBe(200);
    return (await r.json()) as { jobId: string; durationSec: number; format: string; label: string; credits: number };
  };
  const trimmed = await apply('trim from 2 to 12 seconds');
  expect(trimmed.credits).toBe(0);
  expect(trimmed.durationSec).toBeGreaterThan(9.5);
  expect(trimmed.durationSec).toBeLessThan(10.5);
  const faded = await apply('fade out 3s');
  expect(faded.label).toMatch(/fade_out/);
  const quieter = await apply('make it -6dB');
  expect(quieter.label).toMatch(/volume/);
  const wav = await apply('convert to wav');
  expect(wav.format).toBe('wav');
  await expect(card.getByTestId('music-version')).toHaveCount(4);

  // The WAV version downloads and decodes as PCM, 10 s.
  const wavDl = await download(page, card.getByTestId('music-version').first().getByTestId('music-version-download'), isMobile);
  const wavFacts = await audioFacts(wavDl.file);
  expect(wavFacts.codec).toMatch(/^pcm_s16le$/);
  expect(Math.abs(wavFacts.durationSec - 10)).toBeLessThan(0.3);
  const m4a = await apply('export as m4a');
  expect(m4a.format).toBe('m4a');

  // Join the two newest tracks with a 2 s crossfade: wav 10 s + m4a 10 s → ≈ 18 s, again a new version.
  const joinedP = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/edit'));
  await box.fill('join these tracks with crossfade 2');
  await box.press('Enter');
  const joinedRes = await joinedP;
  expect(joinedRes.status()).toBe(200);
  const joined = (await joinedRes.json()) as { jobId: string; durationSec: number; label: string };
  expect(joined.label).toMatch(/join ×2 · crossfade 2s/);
  expect(Math.abs(joined.durationSec - 18)).toBeLessThan(0.5);
  await expect(card.getByTestId('music-version')).toHaveCount(6);

  // Every version is its own completed Library row of the same user, with its parent recorded; nothing was charged.
  for (const id of [trimmed.jobId, faded.jobId, quieter.jobId, wav.jobId, m4a.jobId, joined.jobId]) {
    const v = await jobRow(id);
    expect(v).toMatchObject({ user_id: user.id, service_type: 'music', status: 'completed' });
  }
  expect(await balanceOf(user.id), 'edits and joins are free').toBe(before - MUSIC_PRICE);
  // The original's file is byte-identical after six edits.
  expect(createHash('sha256').update(await storedBytes(result.bucket, result.path)).digest('hex')).toBe(originalDigest);
  await expect(card).toContainText('Saved to your Library. The original is never changed.');
  await shot(page, `music-${tag(info)}-versions`);
  await noHorizontalScroll(page);

  // An operation Music Studio does not have is said plainly, never simulated.
  await box.fill('remove the vocals');
  await box.press('Enter');
  await expect(card.getByTestId('music-edit-note')).toContainText('not available in Music Studio');
  evidence(`music-journey-${tag(info)}`, {
    jobId, before, after: await balanceOf(user.id), ledger, original: { path: result.path, digest: originalDigest, facts },
    versions: { trimmed, faded, quieter, wav, wavFacts, m4a, joined }, playback: played, downloadName: dl.name,
  });
});

test('Cancel mid-render returns the credits exactly once; Try again makes a NEW quote', async ({ page }, info) => {
  const user = projectUser(info);
  await openStudio(page);
  const before = await balanceOf(user.id);
  const planned = await voice(page, { action: 'plan', prompt: `slow ambient pad [e2e:slow] ${tag(info)}` });
  expect(planned.took).toBe(true);
  const card = newestCard(page);
  await waitPhase(card, 'quoted', 30_000);
  const { jobId } = await confirm(page, card);
  await expect(card.getByTestId('music-cancel')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => balanceOf(user.id), { timeout: 30_000 }).toBe(before - 5);
  await card.getByTestId('music-cancel').click();
  await waitPhase(card, 'cancelled', 60_000);
  await expect(card).toContainText('Cancelled. The reserved credits were returned.');
  await expect.poll(async () => (await ledgerForJob(user.id, jobId)).map((r) => r.delta), { timeout: 60_000 }).toEqual([-5, 5]);
  expect(await balanceOf(user.id)).toBe(before);
  expect((await jobRow(jobId))?.status).toBe('cancelled');
  // Try again → a new price, nothing charged until Create.
  await card.getByTestId('music-retry').click();
  await waitPhase(card, 'quoted', 30_000);
  expect(await balanceOf(user.id)).toBe(before);
  evidence(`music-cancel-${tag(info)}`, { jobId, ledger: await ledgerForJob(user.id, jobId) });
});

test('provider failure and QC failure: no track delivered, the reservation refunded exactly once (sweep twice changes nothing)', async ({ page, request }, info) => {
  const user = projectUser(info);
  await openStudio(page);
  const before = await balanceOf(user.id);
  const out: Record<string, unknown> = {};
  for (const fault of ['fail', 'silent'] as const) {
    await voice(page, { action: 'plan', prompt: `broken take [e2e:${fault}] ${tag(info)}` });
    const card = newestCard(page);
    await waitPhase(card, 'quoted', 30_000);
    const { jobId } = await confirm(page, card);
    await waitPhase(card, 'failed', 120_000);
    await expect(card).toContainText('The reserved credits were returned');
    await expect(card.getByTestId('music-player')).toHaveCount(0);
    await expect.poll(async () => (await ledgerForJob(user.id, jobId)).map((r) => r.delta), { timeout: 90_000 }).toEqual([-5, 5]);
    out[fault] = { jobId, row: await jobRow(jobId), ledger: await ledgerForJob(user.id, jobId) };
  }
  // The sweep (cron) twice: nothing more is refunded.
  const secret = process.env.CRON_SECRET ?? '';
  for (let i = 0; i < 2; i++) {
    const r = await request.get('/api/music/studio/sweep', { headers: { Authorization: `Bearer ${secret}` } });
    expect(r.status()).toBe(200);
  }
  for (const fault of ['fail', 'silent'] as const) {
    const { jobId } = out[fault] as { jobId: string };
    expect((await ledgerForJob(user.id, jobId)).map((r) => r.delta)).toEqual([-5, 5]);
  }
  expect(await balanceOf(user.id)).toBe(before);
  evidence(`music-failures-${tag(info)}`, out);
});

test('reload while it composes → the card returns to the same job and delivers it, one debit', async ({ page }, info) => {
  const user = projectUser(info);
  await openStudio(page);
  const before = await balanceOf(user.id);
  await voice(page, { action: 'plan', prompt: `reload check guitar ${tag(info)}` });
  const card = newestCard(page);
  await waitPhase(card, 'quoted', 30_000);
  const { jobId } = await confirm(page, card, 'keyboard'); // Create by keyboard: focus + Enter
  await waitPhase(card, 'running', 30_000);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 90_000 });
  const back = page.locator(`[data-testid="music-card"][data-job-id="${jobId}"]`);
  await expect(back).toHaveAttribute('data-phase', 'completed', { timeout: 120_000 });
  expect((await ledgerForJob(user.id, jobId)).map((r) => r.delta)).toEqual([-5]);
  expect(await balanceOf(user.id)).toBe(before - 5);
});

test('a sung song is refused before any price (vocals not verified) — never turned into an instrumental', async ({ page }, info) => {
  const user = projectUser(info);
  await openStudio(page);
  const before = await balanceOf(user.id);
  const n = await cards(page).count();
  const r = await voice(page, { action: 'plan', prompt: `a georgian love song ${tag(info)}`, mode: 'song', vocalGender: 'female' });
  expect(r.reply?.message).toMatch(/never offer an instrumental as if it were the song/);
  await expect(cards(page)).toHaveCount(n + 1);
  const card = newestCard(page);
  await waitPhase(card, 'refused', 30_000);
  await expect(card).toContainText(/vocals are not verified/i);
  await expect(card.getByTestId('music-confirm')).toHaveCount(0);
  expect(await balanceOf(user.id)).toBe(before);
});

test('Georgian and Russian: the card speaks the page language (plan, price, length note)', async ({ page }) => {
  for (const [locale, create, len] of [['ka', 'შექმნა · 5 კრედიტი', '≈ 30 წმ'], ['ru', 'Создать · 5 кредитов', '≈ 30 с']] as const) {
    await openStudio(page, locale);
    await voice(page, { action: 'plan', prompt: locale === 'ka' ? 'მშვიდი ფორტეპიანო' : 'спокойное пианино' });
    const card = newestCard(page);
    await waitPhase(card, 'quoted', 30_000);
    await expect(card.getByTestId('music-confirm')).toHaveText(create);
    await expect(card).toContainText(len);
  }
});

test('keyboard and accessibility: labelled controls, 44 px targets, focus reaches Create, live status region', async ({ page }) => {
  await openStudio(page);
  await voice(page, { action: 'plan', prompt: 'keyboard check marimba' });
  const card = newestCard(page);
  await waitPhase(card, 'quoted', 30_000);
  const create = card.getByTestId('music-confirm');
  await create.focus();
  await expect(create).toBeFocused();
  const box = await create.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(create).toHaveAccessibleName(/credits will be charged/);
  await expect(card).toHaveAttribute('aria-busy', 'false');
});
