import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  MEDIA_DIR, OUT_DIR, attach, balanceOf, decodedFrames, evidence, highBandVolumeDb, isQuote, jobsOf, ledgerOf, logPage, openSignedInStudio,
  paced, projectUser, say, shot, startRun,
} from './_live';

/**
 * MUSIC SYNCHRONISATION IN THE USER'S LANGUAGE, on the real backend: Russian on the desktop (/ru), Georgian on the
 * phone (/ka). Two clips and a track whose halves sound different (global-setup late-beat.mp3: a low hum before its
 * 10th second, a 3 kHz tone after it, clicks throughout), and one sentence that says where the music starts and how
 * long the cut is. Checked three ways, none of them the plan alone:
 *   · the quote and the card's own words (5 s, the track from 0:10, free) in the page's language;
 *   · the worker's QC record on the job row (qc.audio.sourceStartSec = 10, at the master's first frame);
 *   · the delivered master: exactly 150 decoded frames at 30 fps, and its sound above 2 kHz — which only the track's
 *     second half has. Offline calibration on these same fixtures with this branch's montage pipeline and real
 *     ffmpeg: the master with the music from 0:10 measures −19 dB in that band, the same cut from the start of the
 *     track −52 dB, the track's own first five seconds −49 dB and its 10–15 s −16 dB. The threshold is −30 dB.
 * Agent G media is free: the balance and the ledger must not move.
 */
const FPS = 30;
const ASK = {
  desktop: { locale: 'ru' as const, text: 'Смонтируй это под музыку с 10-й секунды, 5 секунд', from: /Трек начинается с 0:10/ },
  mobile: { locale: 'ka' as const, text: 'ეს ვიდეოები მუსიკაზე დაამონტაჟე, მუსიკა 0:10-დან, 5 წამიანი', from: /მუსიკა იწყება 0:10-დან/ },
};
const BAND_DB_FLOOR = -30;

test.describe('Video Core live — the music from the second the user names, in Russian and Georgian', () => {
  test.beforeEach(({ page }, info) => { test.setTimeout(480_000); logPage(page, projectUser(info).id); });

  test('the track from 0:10, 5 s, in the page language → quote → Start → 150 frames that sound like the track after 0:10', async ({ page, isMobile }, info) => {
    const me = projectUser(info);
    const ask = isMobile ? ASK.mobile : ASK.desktop;
    const balance = await balanceOf(me.id);
    const ledgerRows = (await ledgerOf(me.id)).length;
    const t0 = new Date(Date.now() - 1_000).toISOString();

    // The fixture is what it says: quiet above 2 kHz before 0:10, loud there after it.
    const track = join(MEDIA_DIR, 'late-beat.mp3');
    const trackEarly = await highBandVolumeDb(track, 5, 0);
    const trackLate = await highBandVolumeDb(track, 5, 10);
    expect(trackEarly).toBeLessThan(-40);
    expect(trackLate).toBeGreaterThan(-25);

    await openSignedInStudio(page, ask.locale);
    await attach(page, isMobile, ['clip-a.mp4', 'clip-b.mp4', 'late-beat.mp3']);
    await paced(me.id);
    const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await say(page, ask.text);
    const q = (await (await quoteRes).json()) as { ok: boolean; quote?: { totalSec: number; musicStartSec: number; credits: number }; error?: string; message?: string };
    expect(q.ok, `quote refused: ${q.error} ${q.message}`).toBe(true);
    expect(q.quote).toMatchObject({ totalSec: 5, musicStartSec: 10, credits: 0 });
    const card = page.getByTestId('agent-montage-card').last();
    await expect(card).toHaveAttribute('data-phase', 'quoted');
    // Said back in the page's language, with the start the user asked for.
    await expect(page.getByText(ask.from).last()).toBeVisible();
    await shot(page, `${info.project.name}-sync-quoted`);

    const run = await startRun(page, 'montage', isMobile, me.id);
    const result = page.getByTestId('agent-montage-result').last();
    await expect(result.locator('video[src]')).toBeAttached({ timeout: 200_000 });
    await expect(card).toHaveAttribute('data-phase', 'done');
    await shot(page, `${info.project.name}-sync-done`);

    // The master as the browser plays it, decoded and listened to.
    const src = await result.locator('video[src]').getAttribute('src');
    const res = await page.request.get(src!);
    expect(res.status()).toBe(200);
    mkdirSync(join(OUT_DIR, 'downloads'), { recursive: true });
    const file = join(OUT_DIR, 'downloads', `${info.project.name}-sync.mp4`);
    writeFileSync(file, await res.body());
    const d = await decodedFrames(file);
    expect(d.frames).toBe(5 * FPS);
    expect(d.fps).toBe(FPS);
    expect(d.hasAudio).toBe(true);
    const masterBand = await highBandVolumeDb(file, 5, 0);
    expect(masterBand, 'the master plays the track after its 10th second (3 kHz band)').toBeGreaterThan(BAND_DB_FLOOR);

    // The worker's own record of where the track started.
    const [job] = (await jobsOf(me.id, t0)).filter((j) => (j.params as { _exec?: { kind?: string } })._exec?.kind === 'agent-montage');
    expect(job).toMatchObject({ status: 'completed' });
    if (run.jobId) expect(job!.id).toBe(run.jobId);
    const audio = (job!.result as { qc?: { audio?: { sourceStartSec?: number; timelineStartSec?: number; targetSec?: number } } } | null)?.qc?.audio;
    expect(audio).toMatchObject({ sourceStartSec: 10, timelineStartSec: 0, targetSec: 5 });

    // Free lane.
    expect(await balanceOf(me.id)).toBe(balance);
    expect((await ledgerOf(me.id)).length).toBe(ledgerRows);
    evidence(`${info.project.name}-sync`, {
      locale: ask.locale, sentence: ask.text, jobId: job!.id, quote: q.quote, qcAudio: audio, decoded: d,
      highBandDb: { master: masterBand, trackFirst5s: trackEarly, trackFrom10s: trackLate, floor: BAND_DB_FLOOR }, balance,
    });
  });
});
