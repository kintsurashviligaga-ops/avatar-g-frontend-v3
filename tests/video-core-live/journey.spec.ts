import { test, expect, type Page, type Response } from '@playwright/test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  OUT_DIR, attach, balanceOf, decodedFrames, evidence, jobsOf, ledgerOf, liveUser, openSignedInStudio, projectUser,
  rows, say, shot, signInToken,
} from './_live';

/**
 * THE USER'S JOURNEY ON THE REAL BACKEND, desktop and iPhone-13 viewport, each as its own synthetic admin
 * (AGENT_G_MEDIA_EXEC=admin, as in Production): signed in through the sheet (auth.setup.ts) → files up through the
 * paperclip (sign → PUT to local storage → verify's byte sniff) → Agent G reads the sentence → a quote probed by real
 * ffmpeg → Start → a real ffmpeg render, the per-clip QC, the master in the private `renders` bucket → the result plays
 * → Download → the decoded frame count is exact → the Library lists it. Then Stop / Retry, idempotency, error
 * recovery, the edit lane (trim, 2× speed, slow motion) and another user's denied access — all on the same stack.
 *
 * Agent G media is free (MONTAGE/EDIT_PRICE_CREDITS = 0), so the ledger must not move here; the paid paths (film / Veo)
 * have no provider credential in this job and are not part of this suite.
 */

const FPS = 30;
const isQuote = (kind: 'montage' | 'edit') => (r: Response) =>
  r.url().endsWith(`/api/agent/media/${kind}`) && r.request().method() === 'POST' && (r.request().postDataJSON() as { action?: string } | null)?.action === 'quote';
const isRun = (kind: 'montage' | 'edit') => (r: Response) =>
  r.url().endsWith(`/api/agent/media/${kind}`) && r.request().method() === 'POST' && (r.request().postDataJSON() as { action?: string } | null)?.action === 'run';
const press = async (page: Page, testId: string, isMobile: boolean) => {
  const el = page.getByTestId(testId).last();
  if (isMobile) await el.tap(); else await el.click();
};

async function downloadResult(page: Page, resultTestId: string, name: string): Promise<string> {
  const result = page.getByTestId(resultTestId).last();
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await result.getByRole('button', { name: 'Download', exact: true }).click();
  mkdirSync(join(OUT_DIR, 'downloads'), { recursive: true });
  const file = join(OUT_DIR, 'downloads', `${name}-${(await download).suggestedFilename()}`);
  await (await download).saveAs(file);
  return file;
}

test.describe.serial('Video Core live — the montage journey', () => {
  let since = '';
  let jobId = '';

  test.beforeAll(() => { since = new Date(Date.now() - 2_000).toISOString(); });

  test('upload → Agent G → quote → Start (double-pressed) → real ffmpeg master → exact frames → Download → Library', async ({ page, isMobile }, info) => {
    const me = projectUser(info);
    const before = await balanceOf(me.id);
    await openSignedInStudio(page);
    await attach(page, isMobile, ['clip-a.mp4', 'clip-b.mp4', 'beat.mp3']);

    const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await say(page, 'Cut these to the music, 5 seconds long');
    const q = (await (await quoteRes).json()) as { ok: boolean; quote?: { jobId: string; totalSec: number; credits: number }; error?: string; message?: string };
    expect(q.ok, `quote refused: ${q.error} ${q.message}`).toBe(true);
    expect(q.quote!.totalSec).toBe(5); // the sentence's length, not the music's
    expect(q.quote!.credits).toBe(0);
    const card = page.getByTestId('agent-montage-card').last();
    await expect(card).toHaveAttribute('data-phase', 'quoted');
    await shot(page, `${info.project.name}-montage-quoted`);

    // IDEMPOTENCY: two presses of Start → one job.
    const runs: Response[] = [];
    page.on('response', (r) => { if (isRun('montage')(r)) runs.push(r); });
    const start = page.getByTestId('agent-montage-start').last();
    if (isMobile) { await start.tap(); await start.tap({ force: true, timeout: 2_000 }).catch(() => undefined); }
    else { await start.dblclick(); }

    const result = page.getByTestId('agent-montage-result').last();
    await expect(result.locator('video[src]')).toBeAttached({ timeout: 200_000 });
    await expect(card).toHaveAttribute('data-phase', 'done');
    const jobs = (await jobsOf(me.id, since)).filter((j) => (j.params as { _exec?: { kind?: string } })._exec?.kind === 'agent-montage');
    expect(jobs, 'one press or two, exactly one montage job').toHaveLength(1);
    jobId = jobs[0]!.id;
    expect(jobs[0]).toMatchObject({ status: 'completed', service_type: 'film' });
    const replayed = await Promise.all(runs.map(async (r) => (await r.json().catch(() => ({}))) as { jobId?: string; replay?: boolean }));
    expect(new Set(replayed.map((r) => r.jobId).filter(Boolean))).toEqual(new Set([jobId]));
    await shot(page, `${info.project.name}-montage-done`);

    // EXPORT: Download, then count every decoded frame.
    const file = await downloadResult(page, 'agent-montage-result', `${info.project.name}-montage`);
    const d = await decodedFrames(file);
    expect(d.frames).toBe(5 * FPS);
    expect(d.fps).toBe(FPS);
    expect(d.hasAudio).toBe(true);

    // Free lane: the ledger did not move; the audit trail has the quote and the run.
    expect(await balanceOf(me.id)).toBe(before);
    expect((await ledgerOf(me.id)).filter((r) => r.job_id === jobId || String(r.metadata?.ref ?? '').includes(jobId))).toEqual([]);
    const audit = await rows<{ props: { phase?: string; outcome?: string } }>(`analytics_events?event_name=eq.audit.agent_g.media&props->>jobId=eq.${jobId}&select=props`);
    expect(audit.map((a) => a.props.phase)).toEqual(expect.arrayContaining(['quote', 'run']));

    // LIBRARY: the finished montage is filed server-side and listed.
    const lib = page.waitForResponse((r) => r.url().includes('/api/studio/library') && r.request().method() === 'GET', { timeout: 90_000 });
    await page.goto('/en/library');
    const listed = await (await lib).text();
    const masterPath = (jobs[0]!.signed_url ?? '').split('?')[0]!.split('/renders/')[1] ?? '';
    expect(listed.includes(jobId) || (!!masterPath && listed.includes(masterPath)), 'the library lists this montage').toBe(true);
    await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `${info.project.name}-library`);
    evidence(`${info.project.name}-montage`, { jobId, quote: q.quote, startResponses: replayed, decoded: d, balanceBefore: before, balanceAfter: await balanceOf(me.id), audit: audit.map((a) => a.props) });
  });

  test('another user cannot read this job, its master or its uploads (RLS, storage, task route)', async ({ playwright }, info) => {
    test.skip(!jobId, 'needs the montage from the previous step');
    // A clean API context: the project's `request` carries the OWNER's session cookies (storageState), and the server
    // reads the cookie before a bearer token (lib/supabase/server.ts authedClientFromRequest), so every call below would
    // otherwise be the owner's.
    const request = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    const other = liveUser('other');
    const token = await signInToken(other.email);
    expect(await rows(`generation_jobs?id=eq.${jobId}&select=id`, { token })).toEqual([]);
    const task = await request.get(`/api/tasks?id=${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    expect([403, 404]).toContain(task.status());
    const owner = projectUser(info);
    const [job] = await rows<{ params: { request?: { manifest?: Array<{ ref?: string }> } } }>(`generation_jobs?id=eq.${jobId}&select=params`);
    const ref = JSON.stringify(job?.params ?? {}).match(/omni-uploads\/[0-9a-f-]{36}\/[^"?]+/)?.[0];
    expect(ref, 'the job names the owner\'s upload path').toBeTruthy();
    expect(ref).toContain(owner.id);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
    const stolen = await fetch(`${url}/storage/v1/object/authenticated/uploads/${ref}`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` } });
    expect(stolen.status).toBeGreaterThanOrEqual(400);
    const anon = await fetch(`${url}/storage/v1/object/public/uploads/${ref}`);
    expect(anon.status).toBeGreaterThanOrEqual(400);
    // Quoting with the owner's file is refused as not theirs (the lane is open only to admins, so ask as the other admin).
    const otherAdmin = liveUser(owner.key === 'desktop' ? 'mobile' : 'desktop');
    const adminToken = await signInToken(otherAdmin.email);
    const q = await request.post('/api/agent/media/montage', { headers: { Authorization: `Bearer ${adminToken}` }, data: { action: 'quote', files: [ref, ref], names: ['a.mp4', 'b.mp4'] } });
    const body = (await q.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    evidence(`${info.project.name}-other-user`, { jobRowsVisible: 0, taskRoute: task.status(), storageAuthenticated: stolen.status, storagePublic: anon.status, foreignQuote: { status: q.status(), error: body.error } });
    await request.dispose();
  });

  test('Stop while it renders → cancelled, nothing charged → Retry → a fresh quote → the full-length master', async ({ page, isMobile }, info) => {
    const me = projectUser(info);
    const before = await balanceOf(me.id);
    const t0 = new Date(Date.now() - 1_000).toISOString();
    await openSignedInStudio(page);
    await attach(page, isMobile, ['long-a.mp4', 'long-b.mp4', 'long-beat.mp3']);
    const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await say(page, 'Cut these to the music, 20 seconds long');
    const q = (await (await quoteRes).json()) as { ok: boolean; quote?: { totalSec: number } };
    expect(q.ok).toBe(true);
    const card = page.getByTestId('agent-montage-card').last();
    await expect(card).toHaveAttribute('data-phase', 'quoted');
    await press(page, 'agent-montage-start', isMobile);
    await expect(card).toHaveAttribute('data-phase', 'running', { timeout: 30_000 });
    await expect(page.getByTestId('agent-montage-stop').last()).toBeEnabled();
    await press(page, 'agent-montage-stop', isMobile);
    await expect(card).toHaveAttribute('data-phase', 'cancelled', { timeout: 60_000 });
    const [stopped] = (await jobsOf(me.id, t0)).filter((j) => (j.params as { _exec?: { kind?: string } })._exec?.kind === 'agent-montage');
    expect(stopped).toMatchObject({ status: 'failed' });
    expect(String(stopped!.error)).toMatch(/cancel/i);
    expect(await balanceOf(me.id)).toBe(before);
    await shot(page, `${info.project.name}-stopped`);

    // Retry: a new quote, then a full render.
    const requote = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await press(page, 'agent-montage-retry', isMobile);
    expect(((await (await requote).json()) as { ok: boolean }).ok).toBe(true);
    const again = page.getByTestId('agent-montage-card').last();
    await expect(again).toHaveAttribute('data-phase', 'quoted', { timeout: 30_000 });
    await press(page, 'agent-montage-start', isMobile);
    await expect(page.getByTestId('agent-montage-result').last().locator('video[src]')).toBeAttached({ timeout: 300_000 });
    const file = await downloadResult(page, 'agent-montage-result', `${info.project.name}-retry`);
    const d = await decodedFrames(file);
    expect(d.frames).toBe(20 * FPS);
    expect(await balanceOf(me.id)).toBe(before);
    const all = (await jobsOf(me.id, t0)).filter((j) => (j.params as { _exec?: { kind?: string } })._exec?.kind === 'agent-montage');
    expect(all.map((j) => j.status)).toEqual(['failed', 'completed']);
    evidence(`${info.project.name}-stop-retry`, { stopped: { id: stopped!.id, error: stopped!.error }, retried: all[1]?.id, decoded: d, balance: before });
  });

  test('error recovery: a file that is not audio is refused at upload; an undecodable clip is refused at the quote, nothing runs', async ({ page, isMobile }, info) => {
    const me = projectUser(info);
    const t0 = new Date(Date.now() - 1_000).toISOString();
    await openSignedInStudio(page);
    // 1 — the byte sniff: a text file named .mp3 never becomes an attachment.
    await attach(page, isMobile, ['not-a-song.mp3'], false);
    const chip = page.getByTestId('composer-attachment').last();
    await expect(chip).toHaveAttribute('data-status', 'failed', { timeout: 60_000 });
    await shot(page, `${info.project.name}-upload-refused`);
    // 2 — an MP4 header with no index: the upload passes, the quote's probe cannot read it, and says so.
    await openSignedInStudio(page);
    await attach(page, isMobile, ['truncated.mp4', 'clip-b.mp4', 'beat.mp3']);
    const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await say(page, 'Cut these to the music, 5 seconds long');
    const q = (await (await quoteRes).json()) as { ok: boolean; error?: string; message?: string };
    expect(q.ok).toBe(false);
    await expect(page.getByTestId('agent-montage-start')).toHaveCount(0);
    await shot(page, `${info.project.name}-unreadable-clip`);
    expect((await jobsOf(me.id, t0)).filter((j) => (j.params as { _exec?: { kind?: string } })._exec?.kind === 'agent-montage')).toEqual([]);
    evidence(`${info.project.name}-error-recovery`, { uploadRefusal: 'chip failed', quoteRefusal: { error: q.error, message: q.message } });
  });

  for (const [sentence, seconds, label] of [
    ['Trim it from 1 to 4 seconds', 3, 'trim'],
    ['Make it 2x speed', 3, 'speed-2x'],
    ['Slow motion please', 12, 'slow-motion'],
  ] as const) {
    test(`edit lane: „${sentence}" → plan → Start → the result has exactly ${seconds * FPS} frames`, async ({ page, isMobile }, info) => {
      const me = projectUser(info);
      const before = await balanceOf(me.id);
      await openSignedInStudio(page);
      await attach(page, isMobile, ['edit-source.mp4']);
      const quoteRes = page.waitForResponse(isQuote('edit'), { timeout: 90_000 });
      await say(page, sentence);
      const q = (await (await quoteRes).json()) as { ok: boolean; quote?: { plan: { durationSec: number }; credits: number }; error?: string; message?: string };
      expect(q.ok, `edit quote refused: ${q.error} ${q.message}`).toBe(true);
      expect(q.quote!.plan.durationSec).toBe(seconds);
      expect(q.quote!.credits).toBe(0);
      const card = page.getByTestId('agent-edit-card').last();
      await expect(card).toHaveAttribute('data-phase', 'quoted');
      await press(page, 'agent-edit-start', isMobile);
      const result = page.getByTestId('agent-edit-result').last();
      await expect(result.locator('video[src]')).toBeAttached({ timeout: 200_000 });
      const src = await result.locator('video[src]').getAttribute('src');
      const res = await page.request.get(src!);
      expect(res.status()).toBe(200);
      const file = join(OUT_DIR, 'downloads', `${info.project.name}-${label}.mp4`);
      mkdirSync(join(OUT_DIR, 'downloads'), { recursive: true });
      writeFileSync(file, await res.body());
      const d = await decodedFrames(file);
      expect(d.frames).toBe(seconds * FPS);
      expect(d.hasAudio).toBe(true);
      expect(await balanceOf(me.id)).toBe(before);
      evidence(`${info.project.name}-edit-${label}`, { sentence, plan: q.quote!.plan, decoded: d });
    });
  }
});
