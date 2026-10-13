import { test, expect, type Locator, type Page, type Request, type Response } from '@playwright/test';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  OUT_DIR, STATE_DIR, attach, balanceOf, decodedFrames, evidence, jobsOf, ledgerOf, liveUser, meanLuma, meanVolumeDb, openSignedInStudio,
  projectUser, rows, say, shot, signInToken,
} from './_live';

/**
 * THE USER'S JOURNEY ON THE REAL BACKEND, desktop and iPhone-13 viewport, each as its own synthetic admin
 * (AGENT_G_MEDIA_EXEC=admin, as in Production): signed in through the sheet (auth.setup.ts) → files up through the
 * paperclip (sign → PUT to local storage → verify's byte sniff) → Agent G reads the sentence → a quote probed by real
 * ffmpeg → Start → a real ffmpeg render, the per-clip QC, the master in the private `renders` bucket → the result plays
 * → Download → the decoded frame count is exact → the Library lists it. Then Stop / Retry, idempotency, error
 * recovery, the edit lane on Agent G's delivered video (trim, 2× speed, slow motion, volume, brightness) and another user's denied access —
 * all on the same stack.
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

/**
 * PACING. The server's limiter stays exactly as shipped (lib/api/rate-limit RATE_LIMITS.EXPENSIVE: 5 quote/run calls a
 * minute per user and client, shared by the montage and the edit routes), so the suite paces itself the way a person
 * would instead of switching it off: before a step that quotes or runs, it waits until this user has made at most
 * 5 − n such calls in the last 61 s (n = the calls the step can make). The limiter's fixed 60 s window then never holds
 * more than 5. Every call is logged from the page's own requests, across tests and projects (state/expensive-<user>.json).
 * CI run 3 (ebc3444) found why: Stop → Retry → Start within a minute of the first montage is the 6th call, and the
 * real server answers 429 „Too many requests… try again in a minute" (recorded in DEFECT_REGISTER_FINAL.md).
 */
const EXPENSIVE_PER_MIN = 5;
const callLog = (userId: string) => join(STATE_DIR, `expensive-${userId}.json`);
function expensiveCalls(userId: string): number[] {
  try { return JSON.parse(readFileSync(callLog(userId), 'utf8')) as number[]; } catch { return []; }
}
function logExpensive(userId: string): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(callLog(userId), JSON.stringify([...expensiveCalls(userId), Date.now()]));
}
async function paced(userId: string, n = 1): Promise<number> {
  const t0 = Date.now();
  while (expensiveCalls(userId).filter((t) => Date.now() - t < 61_000).length > EXPENSIVE_PER_MIN - n) {
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return Date.now() - t0;
}
const isExpensive = (r: Request) =>
  r.method() === 'POST' && /\/api\/agent\/media\/(montage|edit)$/.test(r.url()) && ['quote', 'run'].includes(String((r.postDataJSON() as { action?: string } | null)?.action));
/** Every quote/run the page sends is logged for this user. */
function logPage(page: Page, userId: string): void {
  page.on('request', (r) => { if (isExpensive(r)) logExpensive(userId); });
}
/** Start the card's plan once, paced; the run must be queued (a 429 here would be a pacing bug, said so by name). */
async function startRun(page: Page, kind: 'montage' | 'edit', isMobile: boolean, userId: string): Promise<{ jobId?: string; status?: string; replay?: boolean }> {
  await paced(userId);
  const run = page.waitForResponse(isRun(kind), { timeout: 60_000 });
  await press(page, `agent-${kind}-start`, isMobile);
  const r = await run;
  expect(r.status(), `run refused: HTTP ${r.status()} ${await r.text()}`).toBe(200);
  return (await r.json().catch(() => ({}))) as { jobId?: string; status?: string; replay?: boolean };
}

/**
 * Every read of a task the page makes (/api/tasks?id=…, every 3 s while a card runs): how many per HTTP status, and the
 * last task it was told about. A card that never settles then says whether the page was refused, or read a job that
 * did not move.
 */
function watchTaskReads(page: Page): { byStatus: Record<string, number>; last: unknown } {
  const seen: { byStatus: Record<string, number>; last: unknown } = { byStatus: {}, last: null };
  page.on('response', (r) => {
    if (!r.url().includes('/api/tasks?id=')) return;
    seen.byStatus[r.status()] = (seen.byStatus[r.status()] ?? 0) + 1;
    void r.json().then((b) => {
      const t = (b as { task?: Record<string, unknown> } | null)?.task;
      if (t) seen.last = { status: t.status, stage: t.stage, pct: t.pct, attempt: t.attempt, error: t.error };
    }).catch(() => undefined);
  });
  return seen;
}

/**
 * What a job says about itself when its card did not deliver: its row (status, stage, percent, error, lease), the
 * audit trail the route and the worker wrote, the task route's answer to this page, and the card. All of it synthetic,
 * from this throwaway stack; evidence() redacts any signed link's token before it reaches the public log.
 */
async function jobDiagnosis(page: Page, jobId: string, card: Locator): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(jobId);
  const [row] = await rows<Record<string, unknown>>(
    `generation_jobs?id=eq.${id}&select=status,current_stage,pct,error,created_at,updated_at,exec:params->_exec,plan:params->_job->request->plan,edits:params->_job->request->edits`,
  ).catch((e: unknown) => [{ readError: String(e) }]);
  const audit = await rows<{ props: Record<string, unknown>; created_at: string }>(
    `analytics_events?event_name=eq.audit.agent_g.media&props->>jobId=eq.${id}&select=props,created_at&order=created_at.asc`,
  ).catch(() => []);
  const task = await page.request.get(`/api/tasks?id=${id}`)
    .then(async (r) => ({ http: r.status(), body: await r.json().catch(() => null) }))
    .catch((e: unknown) => ({ readError: String(e) }));
  return {
    row: row ?? null,
    audit: audit.map((a) => ({ at: a.created_at, ...a.props })),
    task,
    card: { phase: await card.getAttribute('data-phase'), text: (await card.innerText().catch(() => '')).slice(0, 400) },
  };
}

/** Agent G's own 5 s montage, delivered in this thread (the "previous video" the edit tests then change). */
async function deliverMontage(page: Page, isMobile: boolean, userId: string): Promise<void> {
  await attach(page, isMobile, ['clip-a.mp4', 'clip-b.mp4', 'beat.mp3']);
  await paced(userId);
  const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
  await say(page, 'Cut these to the music, 5 seconds long');
  const q = (await (await quoteRes).json()) as { ok: boolean; error?: string; message?: string };
  expect(q.ok, `montage quote refused: ${q.error} ${q.message}`).toBe(true);
  await expect(page.getByTestId('agent-montage-card').last()).toHaveAttribute('data-phase', 'quoted');
  await startRun(page, 'montage', isMobile, userId);
  await expect(page.getByTestId('agent-montage-result').last().locator('video[src]')).toBeAttached({ timeout: 200_000 });
  await expect(page.getByTestId('agent-montage-card').last()).toHaveAttribute('data-phase', 'done');
}

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
    logPage(page, me.id);
    const before = await balanceOf(me.id);
    await openSignedInStudio(page);
    await attach(page, isMobile, ['clip-a.mp4', 'clip-b.mp4', 'beat.mp3']);

    await paced(me.id);
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
    await paced(me.id, 2);
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
    await paced(otherAdmin.id);
    logExpensive(otherAdmin.id);
    const q = await request.post('/api/agent/media/montage', { headers: { Authorization: `Bearer ${adminToken}` }, data: { action: 'quote', files: [ref, ref], names: ['a.mp4', 'b.mp4'] } });
    const body = (await q.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    evidence(`${info.project.name}-other-user`, { jobRowsVisible: 0, taskRoute: task.status(), storageAuthenticated: stolen.status, storagePublic: anon.status, foreignQuote: { status: q.status(), error: body.error } });
    await request.dispose();
  });

});

test.describe('Video Core live — Stop and Retry, error recovery, the edit lane', () => {
  // Each one stands alone (its own uploads), so one failing does not hide the others. Pacing can add up to a minute
  // before a step, so each has room for that plus a full render.
  test.beforeEach(({ page }, info) => { test.setTimeout(480_000); logPage(page, projectUser(info).id); });

  test('Stop while it renders → cancelled, nothing charged → Retry → a fresh quote → the full-length master', async ({ page, isMobile }, info) => {
    const me = projectUser(info);
    const before = await balanceOf(me.id);
    const t0 = new Date(Date.now() - 1_000).toISOString();
    await openSignedInStudio(page);
    await attach(page, isMobile, ['long-a.mp4', 'long-b.mp4', 'long-beat.mp3']);
    await paced(me.id);
    const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await say(page, 'Cut these to the music, 20 seconds long');
    const q = (await (await quoteRes).json()) as { ok: boolean; quote?: { totalSec: number } };
    expect(q.ok).toBe(true);
    const card = page.getByTestId('agent-montage-card').last();
    await expect(card).toHaveAttribute('data-phase', 'quoted');
    await startRun(page, 'montage', isMobile, me.id);
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
    await paced(me.id);
    const requote = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await press(page, 'agent-montage-retry', isMobile);
    expect(((await (await requote).json()) as { ok: boolean }).ok).toBe(true);
    const again = page.getByTestId('agent-montage-card').last();
    await expect(again).toHaveAttribute('data-phase', 'quoted', { timeout: 30_000 });
    await startRun(page, 'montage', isMobile, me.id);
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
    await paced(me.id);
    const quoteRes = page.waitForResponse(isQuote('montage'), { timeout: 90_000 });
    await say(page, 'Cut these to the music, 5 seconds long');
    const q = (await (await quoteRes).json()) as { ok: boolean; error?: string; message?: string };
    expect(q.ok).toBe(false);
    await expect(page.getByTestId('agent-montage-start')).toHaveCount(0);
    await shot(page, `${info.project.name}-unreadable-clip`);
    expect((await jobsOf(me.id, t0)).filter((j) => (j.params as { _exec?: { kind?: string } })._exec?.kind === 'agent-montage')).toEqual([]);
    evidence(`${info.project.name}-error-recovery`, { uploadRefusal: 'chip failed', quoteRefusal: { error: q.error, message: q.message } });
  });

  // THE EDIT LANE on Agent G's own delivered video (AC-11 „edit of a delivered video"): a 5 s montage is delivered first,
  // then the words name it („the previous video" / „წინა ვიდეო") and Agent G plans the edit on its signed master — no
  // chat model involved (lib/agent/chatTurn editStep, source 'previous'). Trim / speed words on a freshly ATTACHED file
  // are not this lane: Media Studio v2 hands them to the chat model's remix, which needs a provider credential this job
  // does not have (CI run 4 found the old version of these tests waiting for an edit quote that never comes).
  // Desktop asks in English, the phone in Georgian. Expected lengths are the 5 s master edited: 3 s, 2.5 s, 10 s; the sound
  // (volume, +6 dB) and the light (adjust, brightness +25) keep its 5 s and are measured against the master they changed:
  // louder by more than 4 dB of mean loudness, brighter by more than 6 levels of mean luma (GG 2026-10-13 06:34Z: „Trim,
  // Volume, Adjust"; both are stored edits that defect 39 refused).
  // CI run 6 (c09dbe4): the trim, then the first edit on each viewport, waited 200 s for a result that never came, while
  // 2× and slow motion passed. Run 7 (1b2b40f) put the trim last and printed its job (jobDiagnosis): still the trim, and
  // the worker had refused it 20 ms after it was queued, `invalid_request: the stored plan is not valid`, because JSONB
  // hands `{ op, fromSec, toSec }` back as `{ op, toSec, fromSec }` (DEFECT_REGISTER_FINAL row 39, a product defect).
  for (const { label, en, ka, seconds, op } of [
    { label: 'speed-2x', en: 'Make the previous video 2x speed.', ka: 'წინა ვიდეო 2-ჯერ ააჩქარე', seconds: 2.5, op: 'speed' },
    { label: 'slow-motion', en: 'Make the previous video slow motion.', ka: 'წინა ვიდეო ნელ მოძრაობაში გადაიყვანე', seconds: 10, op: 'speed' },
    { label: 'volume', en: 'Make the previous video louder.', ka: 'წინა ვიდეოს ხმა აუწიე', seconds: 5, op: 'volume' },
    { label: 'adjust', en: 'Make the previous video brighter.', ka: 'წინა ვიდეო გაანათე', seconds: 5, op: 'adjust' },
    { label: 'trim', en: 'Trim the previous video from 1 to 4 seconds.', ka: 'წინა ვიდეო 1-დან 4 წამამდე მოჭერი', seconds: 3, op: 'trim' },
  ] as const) {
    test(`edit lane on Agent G's delivered video: ${label} → plan → Start → exactly ${seconds * FPS} frames`, async ({ page, isMobile }, info) => {
      const me = projectUser(info);
      const before = await balanceOf(me.id);
      const ledgerBefore = (await ledgerOf(me.id)).length;
      const sentence = isMobile ? ka : en;
      await openSignedInStudio(page);
      await deliverMontage(page, isMobile, me.id);
      // The master the edit changes, kept to measure the change against.
      mkdirSync(join(OUT_DIR, 'downloads'), { recursive: true });
      const sourceSrc = await page.getByTestId('agent-montage-result').last().locator('video[src]').getAttribute('src');
      const source = await page.request.get(sourceSrc!);
      expect(source.status()).toBe(200);
      const sourceFile = join(OUT_DIR, 'downloads', `${info.project.name}-${label}-source.mp4`);
      writeFileSync(sourceFile, await source.body());

      await paced(me.id);
      const quoteRes = page.waitForResponse(isQuote('edit'), { timeout: 90_000 });
      await say(page, sentence);
      const q = (await (await quoteRes).json()) as { ok: boolean; quote?: { plan: { durationSec: number }; edits: { op: string }[]; credits: number }; error?: string; message?: string };
      expect(q.ok, `edit quote refused: ${q.error} ${q.message}`).toBe(true);
      expect(q.quote!.plan.durationSec).toBe(seconds);
      expect(q.quote!.credits).toBe(0);
      expect(q.quote!.edits.map((e) => e.op), 'the edit Agent G read from the words').toEqual([op]);
      const card = page.getByTestId('agent-edit-card').last();
      await expect(card).toHaveAttribute('data-phase', 'quoted');
      await shot(page, `${info.project.name}-edit-${label}-quoted`);
      const reads = watchTaskReads(page);
      const ran = Date.now();
      const runBody = await startRun(page, 'edit', isMobile, me.id);
      // The card ends delivered, failed or stopped; anything but delivered prints what the job says, then fails.
      await expect(card).toHaveAttribute('data-phase', /^(done|failed|cancelled)$/, { timeout: 200_000 }).catch(() => undefined);
      const phase = await card.getAttribute('data-phase');
      if (phase !== 'done') {
        const why = runBody.jobId ? await jobDiagnosis(page, runBody.jobId, card) : { noJobId: true };
        evidence(`${info.project.name}-edit-${label}-not-delivered`, { sentence, run: runBody, waitedMs: Date.now() - ran, taskReads: reads, ...why });
      }
      expect(phase, `the ${label} card ended '${phase}' (the job's own account is in the evidence line above)`).toBe('done');
      const deliveredMs = Date.now() - ran;
      const result = page.getByTestId('agent-edit-result').last();
      await expect(result.locator('video[src]')).toBeAttached();
      const src = await result.locator('video[src]').getAttribute('src');
      const res = await page.request.get(src!);
      expect(res.status()).toBe(200);
      const file = join(OUT_DIR, 'downloads', `${info.project.name}-${label}.mp4`);
      writeFileSync(file, await res.body());
      const d = await decodedFrames(file);
      expect(d.frames).toBe(seconds * FPS);
      expect(d.fps).toBe(FPS);
      expect(d.hasAudio).toBe(true);
      // What the edit did to the sound or the light, measured on the decoded files (not on the plan).
      const measured: Record<string, number> = {};
      if (op === 'volume') {
        measured.sourceMeanDb = await meanVolumeDb(sourceFile);
        measured.editMeanDb = await meanVolumeDb(file);
        expect(measured.editMeanDb - measured.sourceMeanDb, 'louder by more than 4 dB').toBeGreaterThan(4);
      }
      if (op === 'adjust') {
        measured.sourceLuma = await meanLuma(sourceFile);
        measured.editLuma = await meanLuma(file);
        expect(measured.editLuma - measured.sourceLuma, 'brighter by more than 6 levels of mean luma').toBeGreaterThan(6);
      }
      // Free lane: the balance does not move and no ledger row is written for it.
      expect(await balanceOf(me.id)).toBe(before);
      expect((await ledgerOf(me.id)).length).toBe(ledgerBefore);
      await shot(page, `${info.project.name}-edit-${label}-done`);
      evidence(`${info.project.name}-edit-${label}`, { sentence, jobId: runBody.jobId, edits: q.quote!.edits, plan: q.quote!.plan, deliveredMs, decoded: d, measured, balance: before, ledgerRows: ledgerBefore });
    });
  }
});
