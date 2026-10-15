import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { balanceOf, evidence, projectUser } from '../video-core-live/_live';
import { MUSIC_PRICE, audioFacts, confirm, jobRow, ledgerForJob, newestCard, openStudio, storedBytes, waitPhase } from './_music';

/**
 * The delivery chain with GENUINE Lyria output. The stand-in provider's `[e2e:replay]` returns, byte for byte, the
 * instrumental Google Lyria (lyria-3-clip-preview, Vertex) produced live on 2026-10-14 in Preview build c4c8792e — it
 * refuses unless the SHA-256 matches. Everything else is the real chain on the throwaway local Supabase: quote →
 * explicit Create → one reservation → worker → ffmpeg QC → private Storage → Library row → inline player → download.
 * This is a REPLAY of a live capture, not a provider call (the live call itself is in evidence/lyria-live/result.json).
 */

const LYRIA_SHA256 = '09eaddb7207b3f5682c98990e971bb7a8410d6aa7c2139f578e1719a7fe08887';

test('real Lyria bytes: quote → Create → one debit → QC → private Storage → Library → play → download, digest preserved', async ({ page, isMobile }, info) => {
  expect(createHash('sha256').update(readFileSync('docs/handoffs/music-studio/evidence/lyria-live/A-instrumental.mp3')).digest('hex')).toBe(LYRIA_SHA256);
  const user = projectUser(info);
  const before = await balanceOf(user.id);
  await openStudio(page, 'en', 'music');

  const styles = page.getByTestId('music-styles-input');
  await expect(styles).toBeVisible({ timeout: 60_000 });
  const instrumental = page.getByTestId('music-instrumental');
  if ((await instrumental.getAttribute('aria-pressed')) !== 'true') await instrumental.click();
  await styles.fill(`calm cinematic cello and piano over soft rain [e2e:replay] ${isMobile ? 'mobile' : 'desktop'}`);
  const quoted = page.waitForResponse((r) => r.url().endsWith('/api/music/studio/quote'));
  await page.getByTestId('music-create').click();
  expect((await quoted).status()).toBe(200);

  const card = newestCard(page);
  await waitPhase(card, 'quoted', 30_000);
  await expect(card.getByTestId('music-confirm')).toHaveText(new RegExp(`Create · ${MUSIC_PRICE} credits`));
  expect(await balanceOf(user.id), 'a quote never charges').toBe(before);

  const { jobId, status } = await confirm(page, card, user.id, isMobile ? 'tap' : 'click');
  expect(status).toBe(202);
  await waitPhase(card, 'completed', 120_000);

  // One quote → one job → exactly one debit of the displayed price.
  expect(await balanceOf(user.id)).toBe(before - MUSIC_PRICE);
  expect((await ledgerForJob(user.id, jobId)).map((r) => r.delta)).toEqual([-MUSIC_PRICE]);

  // Private Storage holds the Lyria bytes unchanged; the Library row points at them.
  const row = await jobRow(jobId);
  expect(row).toMatchObject({ user_id: user.id, service_type: 'music', status: 'completed' });
  const result = row!.result as { bucket: string; path: string; digest: string; qc?: Record<string, unknown> };
  expect(result.path).toBe(`music-studio/${user.id}/${jobId}.mp3`);
  expect(result.digest).toBe(LYRIA_SHA256);
  expect(createHash('sha256').update(await storedBytes(result.bucket, result.path)).digest('hex')).toBe(LYRIA_SHA256);

  // Signed, expiring link (a JWT with exp) — the bucket is not public.
  const player = card.getByTestId('music-player');
  const src = (await player.getAttribute('src')) ?? '';
  expect(src).toMatch(/\/storage\/v1\/object\/sign\/renders\/music-studio\//);
  const token = new URL(src).searchParams.get('token') ?? '';
  const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number; iat?: number; url?: string };
  expect(claims.exp! - claims.iat!).toBeGreaterThan(0);
  expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(24 * 3600);
  expect(claims.url).toBe(`renders/${result.path}`);
  const publicUrl = src.replace('/object/sign/', '/object/public/').split('?')[0];
  expect((await page.request.get(publicUrl)).ok(), 'no public read of a private track').toBe(false);

  const played = await player.evaluate(async (el) => {
    const a = el as HTMLAudioElement;
    a.muted = true;
    if (a.readyState < 1) await new Promise((r) => { a.addEventListener('loadedmetadata', r, { once: true }); a.load(); });
    await a.play();
    await new Promise((r) => setTimeout(r, 1500));
    a.pause();
    return { duration: a.duration, currentTime: a.currentTime, error: a.error?.code ?? null };
  });
  expect(played.error).toBeNull();
  expect(played.duration).toBeGreaterThan(30);
  expect(played.duration).toBeLessThan(31.5);
  expect(played.currentTime).toBeGreaterThan(0.3);

  const dlP = page.waitForEvent('download');
  const link = card.getByTestId('music-download');
  if (isMobile) await link.tap(); else await link.click();
  const dl = await dlP;
  const file = (await dl.path())!;
  expect(createHash('sha256').update(readFileSync(file)).digest('hex'), 'the user downloads the exact Lyria bytes').toBe(LYRIA_SHA256);
  const facts = await audioFacts(file);
  expect(facts).toMatchObject({ codec: 'mp3', sampleRate: 44100 });

  // The Library row survives a reload (read back from the database, not the page).
  await page.reload();
  expect((await jobRow(jobId))?.status).toBe('completed');

  evidence(`real-lyria-replay-${isMobile ? 'mobile' : 'desktop'}`, {
    jobId, debit: MUSIC_PRICE, balanceBefore: before, balanceAfter: before - MUSIC_PRICE, digest: result.digest,
    storedPath: result.path, signedTtlSec: claims.exp! - claims.iat!, played, downloadName: dl.suggestedFilename(), facts,
  });
});
