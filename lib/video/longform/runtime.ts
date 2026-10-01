/**
 * lib/video/longform/runtime.ts — the REAL dependencies of the long-form tick (server only).
 *
 *   store     Supabase (service role): claim_longform_jobs / claim_longform_scenes + row patches (rows.ts mapping)
 *   engine    lib/veo/engine.createVeoClip inside the platform budget guard; pollVeoClip + hosting in `renders`;
 *             the last frame of a clip via ffmpeg-static (stitch.buildLastFrameArgs)
 *   billing   lib/orchestrator/ledger: deductCredits per ACT, refundCredits per SCENE — both made idempotent here by
 *             reading the ledger first (netDebitedForRef / an existing credit under the refund ref)
 *   stitcher  stitch.buildStitchPlan executed with ffmpeg-static, the film uploaded to `renders`
 *   director  lib/ai/llmText adapted to director.DirectorGenerate (for the job-creation path; not used by the tick)
 *
 * Nothing here runs unless the route's LONGFORM_VIDEO_ENABLED gate passes. Every provider call goes through the same
 * engine and guard the rest of the product uses — this module adds no new provider integration.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deductCredits, netDebitedForRef, refundCredits } from '@/lib/orchestrator/ledger';
import { createSignedAssetUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { costPerSecondUsd, resolutionFor, resolveModel } from '@/lib/veo/capabilities';
import { createVeoClip, pollVeoClip, veoTransport, type CreateVeoClipResult } from '@/lib/veo/engine';
import { hostGcsVideo } from '@/lib/veo/deliver';
import { downloadGeminiVideo } from '@/lib/veo/geminiTransport';
import { isGoogleOnly } from '@/lib/veo/policy';
import { llmText } from '@/lib/ai/llmText';
import type { DirectorGenerate } from './director';
import { LONGFORM_SCENE_SEC } from './plan';
import { jobFromRow, jobPatchToColumns, sceneFromRow, scenePatchToColumns, type Row } from './rows';
import { buildLastFrameArgs, buildProbeArgs, buildStitchPlan, DEFAULT_MAX_UPLOAD_BYTES, parseProbe, type StitchClip } from './stitch';
import type {
  LongformBilling,
  LongformEngine,
  LongformStitcher,
  LongformStore,
  LongformTickDeps,
  PollResult,
  ReserveOutcome,
  SubmitResult,
} from './tick';

const exec = promisify(execFile);
const BUCKET = 'renders';
/** 7 days — V4 signing's own maximum, and what every other hosted clip in the product uses. */
const WEEK_SEC = 604_800;
const MIN_CLIP_BYTES = 1_024;

type Svc = ReturnType<typeof createServiceRoleClient>;

// ── Store ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ supabase-js RETURNS `{ error }`, it never throws (the `studio` bucket outage of 2026-09-29 hid behind exactly
 * that). Every write here checks `error` and throws, so the tick counts the failure instead of carrying on with a
 * row it believes it wrote.
 */
export function createSupabaseLongformStore(svc: Svc): LongformStore {
  const must = (error: { message?: string } | null, what: string) => {
    if (error) throw new Error(`${what}: ${error.message ?? 'unknown error'}`);
  };
  return {
    async claimJobs(limit, leaseSec) {
      const { data, error } = await svc.rpc('claim_longform_jobs', { p_limit: limit, p_lease_seconds: leaseSec });
      must(error, 'claim_longform_jobs');
      return ((data ?? []) as Row[]).map(jobFromRow);
    },
    async loadScenes(jobId) {
      const { data, error } = await svc.from('longform_scenes').select('*').eq('job_id', jobId).order('ordinal', { ascending: true });
      must(error, 'load longform_scenes');
      return ((data ?? []) as Row[]).map(sceneFromRow);
    },
    async claimScenes(jobId, ordinals) {
      const { data, error } = await svc.rpc('claim_longform_scenes', { p_job_id: jobId, p_ordinals: ordinals });
      must(error, 'claim_longform_scenes');
      return ((data ?? []) as Row[]).map((r) => {
        const s = sceneFromRow(r);
        return { ordinal: s.ordinal, attempts: s.attempts, submittedAt: s.submittedAt ?? Date.now() };
      });
    },
    async patchScene(jobId, ordinal, patch) {
      const cols = scenePatchToColumns(patch);
      if (!Object.keys(cols).length) return;
      const { error } = await svc.from('longform_scenes').update(cols).eq('job_id', jobId).eq('ordinal', ordinal);
      must(error, `update scene ${ordinal}`);
    },
    async patchJob(jobId, patch) {
      const cols = jobPatchToColumns(patch);
      if (!Object.keys(cols).length) return;
      const { error } = await svc.from('longform_jobs').update(cols).eq('id', jobId);
      must(error, 'update longform_jobs');
    },
    async releaseJob(jobId) {
      const { error } = await svc.from('longform_jobs').update({ lease_until: null }).eq('id', jobId);
      must(error, 'release longform_jobs');
    },
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A definitive refusal books $0 against the budget; an `ambiguous` one keeps the estimate (a job MAY exist). */
function submitActualCost(result: unknown): number | undefined {
  const outcome = (result as CreateVeoClipResult | null)?.outcome;
  return outcome && !outcome.ok && outcome.reason !== 'ambiguous' ? 0 : undefined;
}

const ffmpegBin = (): string | null => (typeof ffmpegStatic === 'string' && ffmpegStatic ? ffmpegStatic : null);

/** A clip URL ffmpeg may open: https and public (our own signed storage URLs pass; metadata IPs never do). */
const fetchableClip = (url: string | null | undefined): url is string => !!url && /^https:\/\//i.test(url) && isPublicHttpUrl(url);

async function hostVideoBuffer(buf: Buffer, path: string): Promise<{ url: string; bytes: number } | null> {
  if (buf.byteLength < MIN_CLIP_BYTES) return null;
  const url = await uploadBufferAndSign(BUCKET, path, buf, 'video/mp4', WEEK_SEC);
  return url ? { url, bytes: buf.byteLength } : null;
}

export function createVeoLongformEngine(): LongformEngine {
  return {
    async submit(input, ctx): Promise<SubmitResult> {
      const transport = veoTransport();
      const tier = input.tier ?? 'standard';
      const model = resolveModel(transport ?? 'gemini', tier);
      const resolution = input.request.resolution ?? resolutionFor(LONGFORM_SCENE_SEC);
      try {
        // ⚠️ Inside the platform budget guard, priced at the exact tier × resolution × audio rate — a Veo call outside
        // it is spend the daily envelope never sees (the lib/agent/videoQueue lesson).
        const result = await guardedCall(
          {
            service: 'video',
            model,
            units: LONGFORM_SCENE_SEC,
            unitCostUsd: costPerSecondUsd(model, resolution, input.request.generateAudio !== false, transport ?? undefined),
            userId: ctx.userId,
            promptSummary: `longform ${ctx.jobId} #${ctx.ordinal}`,
            actualCost: submitActualCost,
          },
          () => createVeoClip(input),
        );
        return { report: { kind: 'outcome', outcome: result.outcome }, transport: result.transport, model: result.model };
      } catch (err) {
        if (err instanceof BudgetExceededError) return { report: { kind: 'budget_refused', reason: err.reason } };
        throw err; // the tick treats a throw as ambiguous (never re-submitted)
      }
    },

    async poll(operation, ctx): Promise<PollResult> {
      const r = await pollVeoClip(operation);
      if (r.state === 'processing') return { state: 'processing' };
      if (r.state === 'filtered') return { state: 'filtered', reason: r.reason || 'safety' };
      if (r.state === 'failed') return { state: 'failed', reason: r.reason || 'failed' };
      const video = r.videos[0];
      if (!video) return { state: 'failed', reason: 'no video in the finished operation' };
      // A path FIXED per operation: a re-poll after a delivery miss re-signs one object instead of re-uploading.
      const opKey = createHash('sha256').update(operation).digest('hex').slice(0, 16);
      const path = `longform/${ctx.jobId}/s${String(ctx.ordinal).padStart(2, '0')}-${opKey}.mp4`;
      if (video.kind === 'gcs') {
        const url = await hostGcsVideo(video, path);
        return url ? { state: 'delivered', url, path, bytes: null } : { state: 'undeliverable' };
      }
      const existing = await createSignedAssetUrl(BUCKET, path, WEEK_SEC);
      if (existing) return { state: 'delivered', url: existing, path, bytes: null };
      const buf = video.kind === 'bytes' ? Buffer.from(video.base64, 'base64') : await downloadGeminiVideo(video.uri).catch(() => null);
      const hosted = buf ? await hostVideoBuffer(buf, path) : null;
      return hosted ? { state: 'delivered', url: hosted.url, path, bytes: hosted.bytes } : { state: 'undeliverable' };
    },

    async extractLastFrame(clipUrl, ctx) {
      const bin = ffmpegBin();
      if (!bin || !fetchableClip(clipUrl)) return null;
      const dir = await mkdtemp(join(tmpdir(), 'longform-frame-'));
      try {
        const out = join(dir, 'last.jpg');
        await exec(bin, buildLastFrameArgs(clipUrl, out), { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 1 << 22 });
        const jpg = await readFile(out);
        if (jpg.byteLength < 1_000) return null;
        return await uploadBufferAndSign(BUCKET, `longform/${ctx.jobId}/seed-${String(ctx.ordinal).padStart(2, '0')}.jpg`, jpg, 'image/jpeg', WEEK_SEC);
      } catch {
        return null;
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}

// ── Billing ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Is there already a credit-back under exactly this ref? (Read-only; the money RPCs stay in ledger.ts.) */
async function ledgerHasCredit(svc: Svc, userId: string, ref: string): Promise<boolean | null> {
  const { data, error } = await svc.from('credit_ledger').select('delta').eq('user_id', userId).eq('metadata->>ref', ref).gt('delta', 0).limit(1);
  if (error) return null;
  return Array.isArray(data) && data.length > 0;
}

export function createLedgerLongformBilling(svc: Svc): LongformBilling {
  return {
    async reserveAct(userId, ref, credits): Promise<ReserveOutcome> {
      if (!(credits > 0)) return 'ok';
      // ⚠️ IDEMPOTENT BY READING THE LEDGER FIRST. A tick can die between the debit and marking the act's scenes;
      // the retry must find the debit, not depend on how deduct_credits answers a replayed ref.
      const already = await netDebitedForRef(userId, ref);
      if (already === null) return 'unavailable';
      if (already >= credits) return 'ok';
      const r = await deductCredits(userId, credits - already, ref);
      if (r.ok) return 'ok';
      return r.reason === 'insufficient' ? 'insufficient' : 'unavailable';
    },
    async refundScene(userId, chargeRef, credits, refundRef) {
      if (!(credits > 0)) return true;
      const done = await ledgerHasCredit(svc, userId, refundRef);
      if (done === null) return false;
      if (done) return true;
      // ⚠️ CAPPED BY THE LEDGER, NOT THE ROW: never more than the act debit has left un-refunded.
      const net = await netDebitedForRef(userId, chargeRef);
      if (net === null) return false;
      const amount = Math.min(Math.round(credits), net);
      if (!(amount > 0)) return true; // nothing left under this act's ref to give back
      return (await refundCredits(userId, amount, refundRef)).ok;
    },
  };
}

// ── Stitcher ─────────────────────────────────────────────────────────────────────────────────────────────────

async function probeClip(bin: string, url: string): Promise<ReturnType<typeof parseProbe> | null> {
  try {
    await exec(bin, buildProbeArgs(url), { timeout: 20_000, killSignal: 'SIGKILL', maxBuffer: 1 << 22 });
    return null; // `ffmpeg -i` with no output always exits non-zero; a zero exit means it printed nothing useful
  } catch (e) {
    const stderr = String((e as { stderr?: string } | null)?.stderr ?? '');
    return stderr ? parseProbe(stderr) : null;
  }
}

/** Probe with a small concurrency so 30 clips do not open 30 connections at once. */
async function probeAll(bin: string, clips: Array<{ url: string }>, concurrency = 4): Promise<Array<ReturnType<typeof parseProbe> | null>> {
  const out: Array<ReturnType<typeof parseProbe> | null> = new Array(clips.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, clips.length) }, async () => {
      while (next < clips.length) {
        const i = next++;
        out[i] = await probeClip(bin, clips[i]!.url);
      }
    }),
  );
  return out;
}

export function createFfmpegLongformStitcher(opts: { maxUploadBytes?: number } = {}): LongformStitcher {
  const maxUploadBytes = opts.maxUploadBytes ?? (Number(process.env.LONGFORM_MAX_UPLOAD_BYTES) || DEFAULT_MAX_UPLOAD_BYTES);
  return {
    async stitch(job, delivered, budgetMs) {
      const bin = ffmpegBin();
      if (!bin) return { ok: false, reason: 'ffmpeg-static is not bundled with this function', retryable: false };
      const usable = delivered.filter((c) => fetchableClip(c.url));
      if (usable.length !== delivered.length) return { ok: false, reason: 'a delivered clip URL is not fetchable', retryable: false };
      const probes = await probeAll(bin, usable);
      const clips: StitchClip[] = usable.map((c, i) => ({
        source: c.url,
        durationSec: probes[i]?.durationSec ?? LONGFORM_SCENE_SEC,
        bytes: c.bytes,
        probe: probes[i] ?? null,
      }));
      const musicUrl = job.options.musicUrl;
      const dir = await mkdtemp(join(tmpdir(), 'longform-stitch-'));
      try {
        const planned = buildStitchPlan({
          clips,
          workDir: dir,
          outName: 'film.mp4',
          music: musicUrl && fetchableClip(musicUrl) ? { source: musicUrl, durationSec: job.options.musicDurationSec ?? null } : null,
          maxUploadBytes,
          // ⚠️ No resumable (TUS) upload path exists yet: a film the size guard cannot fit is refused, not uploaded.
          resumableUploadAvailable: false,
        });
        if (!planned.ok) return { ok: false, reason: `${planned.reason}: ${planned.detail}`, retryable: false };
        const plan = planned.plan;
        if (plan.concatList) await writeFile(plan.concatList.path, plan.concatList.content, 'utf8');
        await exec(bin, plan.argv, { timeout: Math.max(30_000, budgetMs - 15_000), killSignal: 'SIGKILL', maxBuffer: 1 << 26 });
        const size = (await stat(plan.outPath)).size;
        if (size > maxUploadBytes) return { ok: false, reason: `needs_resumable_upload: the film is ${size} bytes`, retryable: false };
        const path = `longform/${job.id}/film.mp4`;
        const url = await uploadBufferAndSign(BUCKET, path, await readFile(plan.outPath), 'video/mp4', WEEK_SEC);
        return url ? { ok: true, url, path, bytes: size } : { ok: false, reason: 'upload failed', retryable: true };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message.slice(0, 300) : 'stitch failed', retryable: true };
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}

// ── Director LLM ─────────────────────────────────────────────────────────────────────────────────────────────

/** The same call runPromptAgent makes (Google-only JSON when VIDEO_GOOGLE_ONLY, VEO_DIRECTOR_MODEL honoured). */
export const llmDirectorGenerate: DirectorGenerate = async (prompt, opts) => {
  const directorModel = (process.env.VEO_DIRECTOR_MODEL || '').trim() || undefined;
  return llmText({
    system: opts.system,
    user: prompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    timeoutMs: Number(process.env.PROMPT_AGENT_TIMEOUT_MS) || 86_000,
    ...(isGoogleOnly() ? { googleOnly: true, json: true, ...(directorModel ? { geminiModel: directorModel } : {}) } : {}),
  });
};

// ── All together ─────────────────────────────────────────────────────────────────────────────────────────────

/** The tick's production dependencies. Throws when the service-role client cannot be built (no env). */
export function createLongformTickDeps(): LongformTickDeps {
  const svc = createServiceRoleClient();
  return {
    store: createSupabaseLongformStore(svc),
    engine: createVeoLongformEngine(),
    billing: createLedgerLongformBilling(svc),
    stitcher: createFfmpegLongformStitcher(),
    now: () => Date.now(),
    // console.warn, not .info/.log: production builds strip those (next.config removeConsole).
    log: (line) => console.warn(line),
  };
}
