import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedSupabase } from './guard';
import {
  OUT_DIR, balanceOf, decodedFrames, evidence, ledgerOf, liveUser, logExpensive, longCall, noteTransportCut, paced, putOwnUpload, rest, rows,
  signInToken,
} from './_live';

/**
 * JOB RECOVERY AND THE STORYBOARD'S APPROVAL, on the real server and the real queue (no browser).
 *
 * Recovery: a 20 s montage is queued and its worker starts rendering; then the worker is made to look dead the way a
 * crashed function looks to the queue — its lease taken from it and lapsed (one compare-and-set on the row's
 * `params._exec`, exactly the write lib/orchestrator/jobLease makes; nothing else on the row is touched). Its next
 * heartbeat finds another owner and it stops. The per-minute sweep (GET /api/agent/media/sweep with the cron secret,
 * the call Vercel Cron makes) then claims the job as attempt 2, renders it within its own invocation and delivers it:
 * exactly 600 decoded frames, nothing charged. What the owner was told meanwhile is read from the task route, as the
 * studio reads it: the stage and percent of each attempt, never moving backwards within one. The sweep refuses a call
 * without the secret or with a wrong one.
 *
 * Approval: POST /api/video/director/runs with a board's storyboard and the approval of its revision (fixtures/
 * director-approval.json, kept true by fixtures/directorApproval.test.ts) — first with shot 2's text edited after the
 * tap (Russian), then with an approval of another revision (Georgian). Both are refused 400 `revision_mismatch`
 * before anything is stored or charged, in the language asked for. A VALID approval is never sent: it would start a
 * run, and a run calls the paid video provider. A user the gate does not let in gets 404.
 */
const FPS = 30;
const DEAD = 'vc-e2e-dead-worker';
// Every stage a montage job shows (lib/orchestrator/jobLease claim; lib/services/montage/montagePipeline PCT; the QC).
const STAGES = new Set(['queued', 'starting', 'retrying', 'resolve', 'bridge', 'normalize', 'stitch', 'music', 'qc', 'completed']);

interface Exec { kind: string; v: number; attempt: number; maxAttempts: number; owner: string | null; leaseUntil: number | null }
interface Row { id: string; status: string; current_stage: string | null; pct: number | null; params: Record<string, unknown> & { _exec?: Exec }; signed_url: string | null; result: Record<string, unknown> | null; error: string | null }
const readRow = async (id: string): Promise<Row | undefined> =>
  (await rows<Row>(`generation_jobs?id=eq.${encodeURIComponent(id)}&select=id,status,current_stage,pct,params,signed_url,result,error`))[0];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe('Video Core live — a dead worker\'s render is finished by the sweep; a changed storyboard is refused', () => {
  test.beforeAll(() => { assertIsolatedSupabase(process.env); });

  test('job recovery: the lease lapses mid-render → the sweep takes it as attempt 2 → the full master, nothing charged', async ({ request }, info) => {
    test.setTimeout(900_000);
    const me = liveUser('desktop');
    const token = await signInToken(me.email);
    const auth = { Authorization: `Bearer ${token}` };
    const base = String(info.project.use.baseURL ?? 'http://localhost:3000');
    const balance = await balanceOf(me.id);
    const ledgerRows = (await ledgerOf(me.id)).length;

    // The cron door first: no secret, a wrong one.
    const noSecret = await request.get('/api/agent/media/sweep');
    const wrongSecret = await request.get('/api/agent/media/sweep', { headers: { Authorization: 'Bearer not-the-cron-secret' } });
    expect(noSecret.status()).toBe(403);
    expect(wrongSecret.status()).toBe(403);

    const files = await Promise.all(['long-a.mp4', 'long-b.mp4', 'long-beat.mp3'].map((f) => putOwnUpload(me.id, f, `recovery-${f}`)));
    await paced(me.id, 2);
    logExpensive(me.id);
    const quote = await request.post('/api/agent/media/montage', {
      headers: auth,
      data: { action: 'quote', files: files.map((f) => f.path), names: ['long-a.mp4', 'long-b.mp4', 'long-beat.mp3'], prompt: 'Cut these to the music, 20 seconds long' },
    });
    const q = (await quote.json()) as { ok: boolean; quote?: { totalSec: number; credits: number }; request?: unknown; token?: string; error?: string; message?: string };
    expect(q.ok, `quote refused: ${quote.status()} ${q.error} ${q.message}`).toBe(true);
    expect(q.quote).toMatchObject({ totalSec: 20, credits: 0 });
    logExpensive(me.id);
    const ran = await request.post('/api/agent/media/montage', { headers: auth, data: { action: 'run', request: q.request, token: q.token, prompt: 'Cut these to the music, 20 seconds long' } });
    const runBody = (await ran.json()) as { ok?: boolean; jobId?: string; status?: string; error?: string };
    expect(ran.status(), JSON.stringify(runBody)).toBe(200);
    const jobId = runBody.jobId!;
    expect(jobId).toBeTruthy();

    // Attempt 1, as the owner sees it, until the worker is past its first stage.
    const seen: Array<{ t: number; status: string; stage: string | null; pct: number; attempt: number | null }> = [];
    const readTask = async () => {
      const r = await request.get(`/api/tasks?id=${encodeURIComponent(jobId)}`, { headers: auth });
      const t = ((await r.json().catch(() => ({}))) as { task?: { status: string; stage: string | null; pct: number; attempt: number | null } }).task;
      if (t) seen.push({ t: Date.now(), status: t.status, stage: t.stage, pct: t.pct, attempt: t.attempt });
      return t;
    };
    const t1 = Date.now();
    for (;;) {
      const t = await readTask();
      if (t && t.status === 'running' && t.attempt === 1 && t.stage && !['queued', 'starting'].includes(t.stage)) break;
      if (t && /^(completed|failed|cancelled)$/.test(t.status)) throw new Error(`the job ended before it could be interrupted: ${JSON.stringify(t)}`);
      expect(Date.now() - t1, 'attempt 1 never got past its start').toBeLessThan(120_000);
      await sleep(700);
    }

    // The worker "dies": its lease is taken and lapsed, by compare-and-set on the version it holds.
    let stolen: Exec | null = null;
    for (let i = 0; i < 10 && !stolen; i++) {
      const row = (await readRow(jobId))!;
      const exec = row.params._exec!;
      expect(row.status).toBe('processing');
      expect(exec.attempt).toBe(1);
      const next: Exec = { ...exec, owner: DEAD, leaseUntil: Date.now() - 1_000, v: exec.v + 1 };
      const r = await rest(`generation_jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.processing&params->_exec->>v=eq.${exec.v}`, 'service', {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ params: { ...row.params, _exec: next } }),
      });
      if (r.status === 200 && Array.isArray(r.body) && r.body.length === 1) stolen = next;
      else await sleep(200); // the worker's heartbeat moved the version first: read again
    }
    expect(stolen, 'the lease could not be taken from the worker').not.toBeNull();
    const stolenAt = Date.now();

    // The sweep, as Vercel Cron calls it. It works the job inside this one invocation, so the call lasts the render.
    const sweep = longCall('GET', new URL('/api/agent/media/sweep', base).href, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` }, timeoutMs: 620_000 });
    // Nothing else may claim it: the owner's task read would start a worker for a job nobody holds, so the task route is
    // read again only once the row shows the sweep's claim (attempt 2, another owner).
    for (;;) {
      const exec = (await readRow(jobId))!.params._exec!;
      if (exec.attempt === 2 && exec.owner && exec.owner !== DEAD) break;
      expect(Date.now() - stolenAt, 'the sweep did not claim the job').toBeLessThan(120_000);
      await sleep(250);
    }
    let settled = false;
    void sweep.then(() => { settled = true; });
    for (;;) {
      const t = await readTask();
      if (t && /^(completed|failed)$/.test(t.status)) break;
      if (Date.now() - stolenAt >= 620_000) {
        // What the queue and the workers left behind, so a stall is diagnosed from the log (artifacts are not readable).
        const stuck = await readRow(jobId);
        const trail = await rows<{ created_at: string; props: Record<string, unknown> }>(
          `analytics_events?event_name=eq.audit.agent_g.media&props->>jobId=eq.${encodeURIComponent(jobId)}&select=created_at,props&order=created_at.asc`,
        );
        const sw = settled ? await sweep : null;
        console.log('[recovery-stall]', JSON.stringify({
          row: stuck && { status: stuck.status, stage: stuck.current_stage, pct: stuck.pct, exec: stuck.params._exec, error: stuck.error },
          audit: trail.map((a) => ({ at: a.created_at, ...a.props })),
          progress: seen.slice(-15).map((s) => ({ ms: s.t - t1, status: s.status, stage: s.stage, pct: s.pct, attempt: s.attempt })),
          sweep: sw && { status: sw.status, ms: sw.ms, transport: sw.transport ?? null, body: JSON.stringify(sw.body).slice(0, 600) },
        }));
        throw new Error('attempt 2 never finished (see [recovery-stall] above)');
      }
      await sleep(settled ? 250 : 1_000);
    }
    const sw = await sweep;
    if (sw.status === 0) {
      noteTransportCut({ spec: 'recovery', call: 'sweep', client: 'node', connectionLivedMs: sw.ms, error: sw.transport ?? 'no answer', server: { job: (await readRow(jobId))?.status } });
      info.annotations.push({ type: 'transport-cut', description: `sweep: ${sw.transport} after ${sw.ms} ms` });
    } else {
      expect(sw.status, JSON.stringify(sw.body).slice(0, 300)).toBe(200);
      expect(sw.body.worked).toMatchObject({ jobId, result: { ran: true, outcome: 'delivered' } });
    }

    // The job: delivered on the second attempt, full length, frame-exact.
    const row = (await readRow(jobId))!;
    expect(row.status, String(row.error)).toBe('completed');
    expect(row.params._exec).toMatchObject({ attempt: 2, owner: null });
    const master = await request.get(row.signed_url!);
    expect(master.status()).toBe(200);
    mkdirSync(join(OUT_DIR, 'downloads'), { recursive: true });
    const file = join(OUT_DIR, 'downloads', 'recovered-montage.mp4');
    writeFileSync(file, await master.body());
    const d = await decodedFrames(file);
    expect(d.frames).toBe(20 * FPS);
    expect(d.fps).toBe(FPS);
    expect(d.hasAudio).toBe(true);

    // What the owner was told: every stage a real one; within an attempt the percent never goes back; the end is 100.
    // A retry starts the render again (the chat says so: „The server stalled, so I am starting the edit again"): its
    // claim keeps the last percent under the stage 'retrying', and its own count starts at its first leg.
    for (const s of seen) if (s.status !== 'completed') expect(STAGES.has(String(s.stage)), `unknown stage ${s.stage}`).toBe(true);
    for (const attempt of [1, 2]) {
      const pcts = seen.filter((s) => s.attempt === attempt && s.status === 'running' && s.stage !== 'retrying').map((s) => s.pct);
      expect(pcts.length, `the owner saw attempt ${attempt} running`).toBeGreaterThan(0);
      for (let i = 1; i < pcts.length; i++) expect(pcts[i]!, `attempt ${attempt}'s percent went back: ${pcts.join(',')}`).toBeGreaterThanOrEqual(pcts[i - 1]!);
    }
    expect(seen[seen.length - 1]).toMatchObject({ status: 'completed', pct: 100 });

    // Free lane; the audit trail names both attempts.
    expect(await balanceOf(me.id)).toBe(balance);
    expect((await ledgerOf(me.id)).length).toBe(ledgerRows);
    const audit = await rows<{ props: { phase?: string; outcome?: string; attempt?: number; detail?: string } }>(
      `analytics_events?event_name=eq.audit.agent_g.media&props->>jobId=eq.${encodeURIComponent(jobId)}&select=props&order=created_at.asc`,
    );
    evidence('recovery-sweep', {
      jobId, quote: q.quote, sweepWithoutSecret: noSecret.status(), sweepWrongSecret: wrongSecret.status(),
      sweep: { status: sw.status, ms: sw.ms, transport: sw.transport ?? null, worked: sw.body.worked ?? null },
      progress: seen.map((s) => ({ ms: s.t - t1, status: s.status, stage: s.stage, pct: s.pct, attempt: s.attempt })),
      decoded: d, exec: row.params._exec, balance, audit: audit.map((a) => a.props),
    });
  });

  test('storyboard approval: an edited shot and a stale revision are refused before anything is stored or charged', async ({ request, playwright }, info) => {
    const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'director-approval.json'), 'utf8')) as {
      storyboard: { shots: Array<{ prompt: string }> } & Record<string, unknown>;
      approval: { fingerprint: string; revision: number } & Record<string, unknown>;
    };
    const admin = liveUser('desktop');
    const token = await signInToken(admin.email);
    const since = new Date(Date.now() - 1_000).toISOString();
    const ledgerRows = (await ledgerOf(admin.id)).length;

    const edited = JSON.parse(JSON.stringify(fixture.storyboard)) as typeof fixture.storyboard;
    edited.shots[1]!.prompt = 'Другая лампа, синяя';
    const a = await request.post('/api/video/director/runs', { headers: { Authorization: `Bearer ${token}` }, data: { storyboard: edited, storyboardApproval: fixture.approval, locale: 'ru' } });
    const aBody = (await a.json()) as { error?: string; reason?: string; revision?: number; fingerprint?: string; message?: string };
    expect(a.status(), JSON.stringify(aBody)).toBe(400);
    expect(aBody).toMatchObject({ error: 'revision_mismatch', reason: 'scripts_differ', revision: fixture.approval.revision, fingerprint: fixture.approval.fingerprint });
    expect(aBody.message).toMatch(/тексты сцен/);
    expect(aBody.message).toMatch(/Ничего не отрендерено и не списано/);

    const stale = { ...fixture.approval, fingerprint: '0123456789abcdef' };
    const b = await request.post('/api/video/director/runs', { headers: { Authorization: `Bearer ${token}` }, data: { storyboard: fixture.storyboard, storyboardApproval: stale, locale: 'ka' } });
    const bBody = (await b.json()) as { error?: string; reason?: string; message?: string };
    expect(b.status(), JSON.stringify(bBody)).toBe(400);
    expect(bBody).toMatchObject({ error: 'revision_mismatch', reason: 'board_changed' });
    expect(bBody.message).toMatch(/სთორიბორდი დადასტურების შემდეგ შეიცვალა/);

    // An ordinary user is not let in at all (VIDEO_DIRECTOR_RUNS=admin). A clean context: no session cookie to fall back on.
    const clean = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    const other = liveUser('other');
    const c = await clean.post('/api/video/director/runs', { headers: { Authorization: `Bearer ${await signInToken(other.email)}` }, data: { storyboard: edited, storyboardApproval: fixture.approval, locale: 'en' } });
    expect(c.status()).toBe(404);
    await clean.dispose();

    // Nothing stored, nothing charged: no job for the admin since, no ledger row.
    const jobs = await rows(`generation_jobs?user_id=eq.${admin.id}&created_at=gte.${encodeURIComponent(since)}&select=id`);
    expect(jobs).toEqual([]);
    expect((await ledgerOf(admin.id)).length).toBe(ledgerRows);
    evidence('director-approval', {
      editedShot: { status: a.status(), reason: aBody.reason, message: aBody.message },
      staleRevision: { status: b.status(), reason: bBody.reason, message: bBody.message },
      ordinaryUser: c.status(), jobsSince: jobs.length,
    });
  });
});
