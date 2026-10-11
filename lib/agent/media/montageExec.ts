/**
 * lib/agent/media/montageExec.ts — Agent G cuts the user's clips to their music, as a real job.
 *
 * The first media execution Agent G does itself (PROJECT_MASTER Section F, slice 1). The request side, in four calls:
 *
 *   quote   the caller's own files only → probe each (clip or track?) → list them (the manifest, ./montageManifest) →
 *           find the track's beat → plan the cuts, one shot at least for EVERY clip, or refuse naming the clip and the
 *           cause → price it. Spends nothing and writes nothing; returns the plan (manifest inside) and a signed quote
 *           (./quoteToken) whose fingerprint covers the manifest.
 *   run     only with that quote, which the USER confirmed in the chat: one queued job row under the quote's job id
 *           (so a second run of the same quote reports the first instead of queueing again) → credits charged when the
 *           edit costs any → answered at once. The render itself is the worker's (./montageWorker): it holds a lease
 *           on the row, re-checks the manifest, renews the lease while the montage lane renders, QCs the master (A/V,
 *           and that every clip of the manifest really shows in it) and delivers it. A worker that dies
 *           is replaced (one retry); a job that cannot finish is failed and its charge paid back exactly once.
 *   status  the owner reads where the job is; a job no worker has (yet, or any more) is handed to one.
 *   cancel  the owner stops a queued or running job; its worker kills its ffmpeg at the next heartbeat.
 *
 * Execution foundation (owner, 2026-10-09 11:15Z): the queue is lib/orchestrator/jobLease on generation_jobs (no new
 * table); every state change is a compare-and-set; the refund a failure owes is written WITH the failure (the outbox
 * entry) and paid by whoever gets there first, through lib/orchestrator/ledger refundDebitByRef, which pays back only
 * what the ledger shows was debited under the ref, so a debt can never mint credits.
 *
 * No new pipeline and no free-form commands: the only operation is the montage lane, its request is built here from
 * probed numbers and checked by the lane's own validator, and ffmpeg only ever reads files through
 * lib/video/ffmpegExec (public hosts, media types, size caps). Every effect is injected (./montageLive binds the live
 * ones), so every rule below is unit-tested without ffmpeg, storage, the ledger or a network.
 */
import type { BannerProbe, StreamDurations } from '@/lib/video/probeBanner';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { bodyFingerprint, produceRef } from '@/lib/orchestrator/idemRef';
import {
  MAX_SHOTS,
  MAX_SHOT_SEC,
  MAX_TOTAL_SEC,
  MIN_SHOT_SEC,
  timelineDuration,
  type MontageAspect,
  type MontageRequest,
} from '@/lib/services/montage/montagePlan';
import { planBeatCuts, type BeatGrid, type CutPlan, type CutProblem, type EnergyEnvelope, type RampResult } from '@/lib/services/montage/beatPlan';
import { planJoin, type JoinPlan } from '@/lib/services/montage/joinPlan';
import { minePlanParams } from '@/lib/agent/params';
import { cancel, claimable, enqueue, failPending, release, settled, type LeaseRow, type LeaseStore } from '@/lib/orchestrator/jobLease';
import {
  MAX_CLIPS,
  MAX_FILES,
  aspectFromClips,
  montageBody,
  pickTracks,
  rampOf,
  soundOf,
  sortInputs,
  wantsBeatCuts,
  type SoundMode,
  type TrackInfo,
} from './montageAsk';
import {
  buildManifest,
  checkManifest,
  cleanName,
  clipOrder,
  parseAgentRequest,
  parseNames,
  type AgentMontageRequest,
  type MontageManifestItem,
} from './montageManifest';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from './quoteToken';
import { selectSources } from './sourceSelect';
import { TAP, approvalParams, withNote, type RunApproval } from '@/lib/agent/approval';

/**
 * What an Agent G montage costs, in credits. The owner chose FREE on 2026-10-09 (decision card in the Master Task
 * thread), the same as Montage Studio (lib/catalog video.editing has no pricing key): no provider is called, only the
 * function's own ffmpeg. A non-zero price turns on the reserve → refund path below, which is tested with one.
 */
export const MONTAGE_PRICE_CREDITS = 0;

export type FileRef = { ok: true; url: string } | { ok: false; reason: 'not_yours' | 'unreadable' };

/** generation_jobs rows of Agent G montages carry this queue kind in params._exec. */
export const MONTAGE_KIND = 'agent-montage';

export interface AuditEvent {
  userId: string;
  /** montage: ./montageExec; audio_extract: ./audioExtract; media_edit: ./editExec; media_analyze: ./analyzeExec;
   *  agent_run: a multi-step run (lib/agent/run); studio_run: a studio generation a Live call started on the user's
   *  spoken yes (app/api/agent/approvals). */
  op: 'montage' | 'audio_extract' | 'media_edit' | 'media_analyze' | 'agent_run' | 'studio_run';
  phase: 'quote' | 'run' | 'cancel' | 'refund' | 'approve' | 'resume' | 'step' | 'analyze';
  outcome: 'ok' | 'refused' | 'failed' | 'replayed' | 'cancelled' | 'retried' | 'lost';
  jobId?: string;
  /** The multi-step run this belongs to: the run itself, or the run a step's job was started by. */
  runId?: string;
  /** The capability that ran (lib/agent/capabilities id); filled from `op` by the live audit when absent. */
  toolId?: string;
  /** How the user said yes to what this started (lib/agent/contracts AgentApproval channel). */
  approval?: 'tap' | 'panel-button' | 'voice-transcript';
  files?: number;
  credits?: number;
  durationSec?: number;
  attempt?: number;
  detail?: string;
}

export interface MontageExecDeps {
  /** A file reference the caller sent → a URL ffmpeg may read. Only the caller's own upload or Library item. */
  resolveFile(ref: string, userId: string): Promise<FileRef>;
  probe(url: string): Promise<BannerProbe | null>;
  /** The track's length, beat and (for speed ramps) how strong the music is along it; `energy` absent = no ramp by it. */
  analyzeTrack(url: string): Promise<{ probe: BannerProbe; grid: BeatGrid | null; energy?: EnergyEnvelope } | null>;
  /** The montage lane. Aborting `signal` kills the ffmpeg of the leg that is running; `onStage` reports each leg. */
  render(req: MontageRequest, opts: { jobId: string; signal: AbortSignal; onStage: (step: string, pct: number) => Promise<unknown> }): Promise<MontageOutcome>;
  /**
   * The per-clip QC's eyes: tiny grey frames (`size`² bytes each) of `url` at each of `timesSec`, null where none was
   * read; `fit` conforms each frame to the master's frame first, as the lane conformed the clip. Null = unreadable.
   * Aborting `signal` kills its ffmpeg.
   */
  grabFrames(url: string, timesSec: readonly number[], opts: { size: number; fit?: { w: number; h: number }; signal?: AbortSignal }): Promise<Array<Uint8Array | null> | null>;
  /** The real length of a file's picture and sound streams (the master's A/V check). Null = unreadable. */
  streamDurations(url: string, opts?: { signal?: AbortSignal }): Promise<StreamDurations | null>;
  /** generation_jobs as a lease queue (lib/orchestrator/jobLease). */
  store: LeaseStore;
  billing: {
    reserve(userId: string, credits: number, ref: string): Promise<{ proceed: boolean; charged: boolean; reason: string }>;
    /** Pay back what the ledger shows was debited under `ref` (at most `credits`), once. 'nothing' = no debit to pay back. */
    refund(userId: string, ref: string, credits: number): Promise<'refunded' | 'nothing' | 'error'>;
  };
  audit(ev: AuditEvent): Promise<void>;
  /** The quote-signing key; empty = quotes cannot be made (fail closed). */
  key(): string;
  now(): number;
  newId(): string;
  /** Calls `tick` every `ms` until the returned function is called (the worker's heartbeat). */
  every(ms: number, tick: () => Promise<void>): () => void;
}

export type MontageErrorCode =
  | 'bad_input' | 'too_many_files' | 'media_not_yours' | 'unreadable' | 'no_clip' | 'no_track' | 'several_tracks'
  | 'too_many_clips' | 'plan_failed' | 'not_configured' | 'invalid_request' | 'quote_invalid' | 'quote_changed'
  | 'quote_expired' | 'in_progress' | 'already_failed' | 'jobs_unavailable' | 'insufficient_credits'
  | 'billing_unavailable' | 'render_failed' | 'qc_failed' | 'cancelled' | 'not_found' | 'not_running'
  // Not every clip can get a shot (the quote refuses instead of leaving one out; ./montageManifest):
  | 'clip_too_short' | 'music_too_short' | 'target_too_short'
  // An asked length is binding (Media Studio v2.0 §D): the clips cannot fill it, or one edit cannot be that long.
  | 'footage_too_short' | 'target_too_long'
  // The list of files a run or a worker holds is not the quoted one, or misses a clip:
  | 'manifest_invalid'
  // The finished master does not show every clip (per-clip QC): not delivered.
  | 'clip_missing'
  // The user's words name a picture that is not there („ბოლო შვიდი" of five), or leave none (./sourceSelect).
  | 'selection_invalid';

/** The numbers behind a refusal, so the chat can say the cause and the way out (./montageChat errorText). */
export interface MontageRefusalDetail {
  /** clip_too_short: the shortest shot this edit can cut, and each named file's length (same order as `files`). */
  minShotSec?: number;
  durationsSec?: number[];
  /** music_too_short / target_too_short: how many clips must each get one shot, and the seconds that takes. */
  clips?: number;
  neededSec?: number;
  /** music_too_short: how much music there is from where it starts, and where it starts. */
  musicSec?: number;
  fromSec?: number;
  /** target_too_short / footage_too_short / target_too_long / music_too_short (an asked length): the length asked for. */
  targetSec?: number;
  /** footage_too_short: how long the clips are together, each used once. */
  footageSec?: number;
  /** target_too_long: the longest edit one job renders. */
  maxSec?: number;
  /** selection_invalid: how many pictures were sent, and the positions (1-based) or count the words named. */
  pictures?: number;
  asked?: number[];
}

export interface MontageError {
  ok: false;
  error: MontageErrorCode;
  message: string;
  /** Which of the caller's files (0-based, in the order sent = manifest indices) the error is about. */
  files?: number[];
  detail?: MontageRefusalDetail;
  jobId?: string;
}

/** What renders an Agent G montage: the platform's own ffmpeg lane, no model, no provider. */
export interface MontageEngine {
  id: 'ffmpeg-montage';
  label: 'FFmpeg montage';
  free: boolean;
}

export interface MontageQuote {
  jobId: string;
  credits: number;
  totalSec: number;
  shots: number;
  /** Videos in the edit (photos are counted apart, in `stills`). */
  clips: number;
  /** Photos in the edit, each a still shot; absent when there are none. */
  stills?: number;
  aspect: MontageAspect;
  beatSynced: boolean;
  bpm: number | null;
  musicStartSec: number;
  /**
   * What the edit sounds like (GG 2026-10-11 17:38Z): the music alone, the clips' own sound with the music beneath it,
   * the clips' own sound alone (no music sent), or nothing. A narration, when there is one, is laid over any of them.
   */
  sound: SoundMode;
  /** How the cuts are made: on the music's beat, or each clip WHOLE as one stretch in the order sent (./joinPlan). */
  cutting: 'beat' | 'whole';
  /** The manifest index of the music track; null = a montage without music. */
  musicFile: number | null;
  /** The music ends before the edit does (own sound leads, so it is not refused): the master second it stops at. */
  musicEndsSec?: number;
  /**
   * The narration the user recorded: its file, its length, the master second it starts at, and `cutSec`, how much of
   * its end the edit is too short to hold (absent = all of it is heard).
   */
  voice?: { file: number; durationSec: number; startSec: number; cutSec?: number };
  /** No length was asked and the clips together run past one edit: each clip gives this share of itself, from its middle. */
  shortened?: { footageSec: number; maxSec: number; share: number };
  /** The words asked for speed ramps, which follow the music: with no music sent there is nothing to ramp by. */
  rampWithoutMusic?: boolean;
  /**
   * The speed ramps the words asked for („ააჩქარე და შეანელე სადაც საჭიროა"): how many shots slow down and speed up,
   * chosen by the music under them. Absent = none asked.
   */
  ramp?: RampResult;
  /** Every file sent, in the order sent: what the card lists, and what the run and the worker are held to. */
  manifest: MontageManifestItem[];
  /** The manifest indices of the videos in the order they appear in the edit (always the user's order). */
  clipOrder: number[];
  /**
   * The user's source selection („მარტო ბოლო შვიდი", ./sourceSelect), when the words made one: indices are positions in
   * the files SENT (0-based). The manifest above lists only the used files; the excluded ones are in no shot, no
   * signed request and no render graph. Absent = every file sent is used.
   */
  selection?: { sent: number; used: number[]; excluded: number[]; excludedNames: string[]; phrase: string };
  engine: MontageEngine;
  /**
   * @deprecated Always empty: every clip gets at least one shot, or the quote fails (clip_too_short, music_too_short,
   * target_too_short). Still sent so a card built before the manifest keeps working.
   */
  unusedFiles: number[];
  expiresAt: number;
}

export type QuoteResult = { ok: true; quote: MontageQuote; request: AgentMontageRequest; token: string } | MontageError;

/** Where a job is, as its owner sees it. */
export type JobView =
  | { ok: true; jobId: string; status: 'queued' | 'running'; stage: string | null; pct: number; attempt: number }
  | { ok: true; jobId: string; status: 'completed'; videoUrl: string; durationSec: number; aspect: string }
  | { ok: true; jobId: string; status: 'failed'; error: MontageErrorCode };

export type RunResult = (JobView & { replay: boolean }) | MontageError;

const err = (error: MontageErrorCode, message: string, extra: Partial<MontageError> = {}): MontageError =>
  ({ ok: false, error, message, ...extra });

const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };

export interface QuoteInput {
  userId: string;
  files: unknown;
  prompt?: unknown;
  aspect?: unknown;
  targetSec?: unknown;
  /** Where the music starts, in seconds into the track; read from the prompt when absent (lib/agent/params). */
  musicFromSec?: unknown;
  /** The files' original names, parallel to `files` (optional; a name falls back to the file reference's base name). */
  names?: unknown;
}

const positive = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
const r3 = (n: number) => Number(n.toFixed(3));

/** A plan that cannot give every clip a shot → the refusal that names the files and the cause (never a plan without them). */
function refusalOf(problem: CutProblem | undefined, error: string | undefined, clips: readonly number[], track: number | null, clipSec: readonly number[]): MontageError {
  const trackFiles = track !== null ? [track] : [];
  switch (problem?.kind) {
    case 'clip_too_short': {
      const files = problem.clips.map((c) => clips[c]!);
      return err('clip_too_short', `File ${files.map((f) => f + 1).join(', ')} is shorter than one ${problem.minShotSec}s shot, so it cannot be in the edit. Use a longer clip or remove it.`, {
        files, detail: { minShotSec: problem.minShotSec, durationsSec: problem.clips.map((c) => r3(clipSec[c] ?? 0)) },
      });
    }
    case 'music_too_short':
      if (problem.targetSec) {
        return err('music_too_short', `The music from ${problem.fromSec}s lasts ${problem.musicSec}s; the ${problem.targetSec}s asked needs it until ${r3(problem.fromSec + problem.targetSec)}s. Start the music earlier, use a longer track, or ask for a shorter edit.`, {
          files: trackFiles, detail: { clips: problem.clips, musicSec: problem.musicSec, fromSec: problem.fromSec, neededSec: problem.neededSec, targetSec: problem.targetSec },
        });
      }
      return err('music_too_short', `The music from ${problem.fromSec}s lasts ${problem.musicSec}s; one shot for each of the ${problem.clips} clips needs ${problem.neededSec}s. Start the music earlier, use a longer track, or remove a clip.`, {
        files: trackFiles, detail: { clips: problem.clips, musicSec: problem.musicSec, fromSec: problem.fromSec, neededSec: problem.neededSec },
      });
    case 'footage_too_short':
      return err('footage_too_short', `The ${problem.clips} clips together last ${problem.footageSec}s, each used once; the ${problem.targetSec}s asked needs more. Add clips or ask for a shorter edit.`, {
        files: [...clips], detail: { clips: problem.clips, footageSec: problem.footageSec, targetSec: problem.targetSec },
      });
    case 'target_too_long':
      return err('target_too_long', `One edit is at most ${problem.maxSec}s; ${problem.targetSec}s was asked.`, {
        detail: { targetSec: problem.targetSec, maxSec: problem.maxSec },
      });
    case 'target_too_short':
      return err('target_too_short', `One shot for each of the ${problem.clips} clips needs ${problem.neededSec}s; the length asked is ${problem.targetSec}s. Ask for a longer edit or remove a clip.`, {
        files: [...clips], detail: { clips: problem.clips, targetSec: problem.targetSec, neededSec: problem.neededSec },
      });
    case 'too_many_clips':
      return err('too_many_clips', `At most ${problem.maxShots} clips in one edit.`);
    default:
      return err('plan_failed', error ?? 'No edit fits these files.');
  }
}

/** Analyse, plan and price. Spends nothing, writes nothing but an audit event. */
export async function quoteMontage(deps: MontageExecDeps, input: QuoteInput): Promise<QuoteResult> {
  const { userId } = input;
  const refuse = async (e: MontageError): Promise<MontageError> => {
    await deps.audit({ userId, op: 'montage', phase: 'quote', outcome: 'refused', detail: e.error });
    return e;
  };
  const files = Array.isArray(input.files) ? input.files : null;
  if (!files || !files.length || files.some((f) => typeof f !== 'string' || !f.trim() || f.length > 2048)) {
    return refuse(err('bad_input', 'Send the clips, photos and sound files as file references.'));
  }
  if (files.length > MAX_FILES) return refuse(err('too_many_files', `At most ${MAX_FILES} files: up to ${MAX_CLIPS} clips or photos, a music track and a narration.`));
  const names = parseNames(input.names, files.length);
  if (!names.ok) return refuse(err('bad_input', `The file names do not match the files: ${names.error}.`));
  if (!deps.key()) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  // ── the caller's own files only ────────────────────────────────────────────────────────────────────────────────
  const urls: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const r = await deps.resolveFile((files[i] as string).trim(), userId);
    if (!r.ok) {
      return refuse(r.reason === 'not_yours'
        ? err('media_not_yours', `File ${i + 1} is not yours.`, { files: [i] })
        : err('unreadable', `File ${i + 1} cannot be read.`, { files: [i] }));
    }
    urls.push(r.url);
  }

  // ── analyse: which is a clip, a photo or a sound file, how long is each ─────────────────────────────────────────
  let probes: Array<BannerProbe | null> = [];
  for (const url of urls) probes.push(await deps.probe(url));

  // ── the user's source selection (Media Studio v2.0 §C): applied before the manifest, so an excluded file is in no
  // shot, no signed request and no render graph. Numbers count the pictures in the order sent, never a sound file. ──
  const prompt = typeof input.prompt === 'string' ? input.prompt.slice(0, 2000) : '';
  let sentFiles = files as string[];
  let sentNames = names.names;
  let selectionInfo: MontageQuote['selection'];
  const all = sortInputs(probes, Number.POSITIVE_INFINITY);
  if (all.ok) {
    const sel = selectSources(prompt, all.clips.length);
    if (sel.mode === 'invalid') {
      return refuse(err('selection_invalid', sel.reason === 'out_of_range'
        ? `The words "${sel.phrase}" name a file that is not there: ${all.clips.length} pictures were sent.`
        : `The words "${sel.phrase}" leave no picture to edit.`, { detail: { pictures: all.clips.length, asked: sel.asked } }));
    }
    if (sel.mode === 'subset') {
      const keepSent = new Set([...sel.keep.map((k) => all.clips[k]!), ...all.audios]);
      const used = files.map((_, i) => i).filter((i) => keepSent.has(i));
      const excluded = sel.excluded.map((k) => all.clips[k]!);
      selectionInfo = {
        sent: files.length, used, excluded, phrase: sel.phrase.slice(0, 120),
        excludedNames: excluded.map((i) => cleanName(names.names?.[i], (files[i] as string).trim())),
      };
      sentFiles = used.map((i) => files[i] as string);
      sentNames = sentNames ? used.map((i) => sentNames![i]!) : null;
      urls.splice(0, urls.length, ...used.map((i) => urls[i]!));
      probes = used.map((i) => probes[i]!);
    }
  }
  // After a source selection the plan's file numbers are positions in the USED files: say them as the files sent.
  const asSent = (e: MontageError): MontageError =>
    (selectionInfo && e.files ? { ...e, files: e.files.map((i) => selectionInfo!.used[i] ?? i) } : e);
  const sorted = sortInputs(probes);
  if (!sorted.ok) {
    const message: Record<typeof sorted.error, string> = {
      unreadable: 'Some files could not be read as video, photo or audio.',
      no_clip: 'Attach at least one video clip or photo.',
      several_tracks: 'Attach at most two sound files: one music track and one narration.',
      too_many_clips: `At most ${MAX_CLIPS} clips and photos in one edit.`,
    };
    return refuse(asSent(err(sorted.error, message[sorted.error], sorted.files ? { files: sorted.files } : {})));
  }

  // ── the sound: which file is the music, which the narration, and what the edit sounds like ────────────────────
  // GG 2026-10-11 17:38Z: no music sent is a montage with the clips' own sound, never a refusal; „თავისი ხმაც" keeps
  // that sound under a track; a recording of the user's voice is laid over the edit (./montageAsk pickTracks, soundOf).
  type TrackAnalysis = NonNullable<Awaited<ReturnType<MontageExecDeps['analyzeTrack']>>>;
  const analysed = new Map<number, TrackAnalysis>();
  const tracks: TrackInfo[] = [];
  for (const i of sorted.audios) {
    const a = await deps.analyzeTrack(urls[i]!);
    if (!a || !(a.probe.durationSec > 0)) {
      return refuse(asSent(err('unreadable', sorted.audios.length > 1 ? `Sound file ${i + 1} could not be read.` : 'The sound file could not be read.', { files: [i] })));
    }
    analysed.set(i, a);
    tracks.push({ index: i, name: cleanName(sentNames?.[i], sentFiles[i]!.trim()), durationSec: a.probe.durationSec, grid: a.grid });
  }
  const picked = pickTracks(prompt, tracks);
  const music = picked.music !== null ? analysed.get(picked.music)! : null;
  const voice = picked.voice !== null ? analysed.get(picked.voice)! : null;
  const sound = soundOf(prompt, music !== null);

  // ── the manifest: every file sent, in the order sent; files = manifest = pictures + at most a track and a narration
  const soundProbe = new Map(tracks.map((t) => [t.index, { durationSec: t.durationSec }]));
  const manifest = buildManifest(sentFiles, sentNames, probes.map((p, i) => soundProbe.get(i) ?? p!), picked.music, sorted.stills, picked.voice);
  const counted = checkManifest(manifest);
  if (!counted.ok || manifest.length !== sentFiles.length || counted.videos.length + counted.stills.length !== sorted.clips.length
    || counted.stills.length !== sorted.stills.length || counted.audio !== picked.music || counted.voice !== picked.voice) {
    return refuse(err('manifest_invalid', `The files could not be listed: ${counted.ok ? 'the count does not match' : counted.error}.`));
  }

  // ── plan ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const clipProbes = sorted.clips.map((i) => probes[i]!);
  // The user's words name the length, the music start and the frame („20 წამიანი", „მუსიკა 5 წამიდან", „9:16"): the same
  // reader the chat uses to decide that a message changes this plan (lib/agent/params), so the card and the edit never
  // disagree. A plan changed in the chat comes back with the change on a later line, and a later line wins.
  const said = prompt ? minePlanParams(prompt) : {};
  const askedSec = positive(input.targetSec) ?? said.durationSec;
  // Not capped here: an asked length past one edit is refused by the planner (target_too_long), never cut silently.
  const target = askedSec;
  const musicFromSec = music ? (positive(input.musicFromSec) ?? said.musicStartSec) : undefined;
  // „ააჩქარე … შეანელე" on a montage: single shots change speed where the music calls for it; the cuts stay on the beat.
  const rampMode = prompt ? rampOf(prompt) : null;
  const stillOf = sorted.clips.map((i) => sorted.stills.includes(i));
  // With the music alone the cuts follow its beat (the montage as it always was). Where the clips' own sound plays, a
  // clip is one stretch in the order sent (./joinPlan: a beat-long slice of speech is noise), unless the words ask
  // for the beat or for speed ramps, which follow the music.
  const onBeat = music !== null && (sound === 'music' || rampMode !== null || wantsBeatCuts(prompt));
  const planFor = (targetSec: number | undefined): CutPlan | JoinPlan => (onBeat && music
    ? planBeatCuts({
      clipDurationsSec: clipProbes.map((p) => p.durationSec),
      // A photo is one still shot (beatPlan `stills`): never too short, shown once.
      ...(sorted.stills.length ? { stills: stillOf } : {}),
      musicSec: music.probe.durationSec,
      grid: music.grid,
      ...(targetSec ? { targetSec } : {}),
      ...(musicFromSec ? { musicFromSec } : {}),
      ...(rampMode ? { ramp: { mode: rampMode, energy: music.energy ?? null } } : {}),
      ...LIMITS,
    })
    : planJoin({
      clipDurationsSec: clipProbes.map((p) => p.durationSec),
      ...(sorted.stills.length ? { stills: stillOf } : {}),
      ...(targetSec ? { targetSec } : {}),
      ...LIMITS,
    }));
  let plan = planFor(target);
  // A narration longer than the edit: with no length asked, the edit grows to hold it when the pictures can fill it
  // (photos stretch, clips play longer); otherwise the card says how much of its end is not heard.
  const voiceEnd = voice ? voice.probe.durationSec : 0;
  if (plan.ok && voice && !target && plan.totalSec + 0.25 < voiceEnd) {
    const longer = planFor(Math.min(voiceEnd, MAX_TOTAL_SEC));
    if (longer.ok) plan = longer;
  }
  // Every clip gets a shot, or there is no plan: the refusal names the files and the cause (beatPlan CutProblem).
  if (!plan.ok) return refuse(asSent(refusalOf(plan.problem, plan.error, sorted.clips, picked.music, clipProbes.map((p) => p.durationSec))));
  // The join plan does not read the music: it starts where the words say, and under the clips' own sound a track
  // shorter than the edit just ends (the card says where); one that has nothing left from that second is refused.
  const musicStartSec = onBeat ? plan.musicStartSec : r3(musicFromSec ?? 0);
  let musicEndsSec: number | undefined;
  if (music && !onBeat) {
    const left = music.probe.durationSec - musicStartSec;
    if (!(left >= MIN_SHOT_SEC)) {
      return refuse(asSent(err('music_too_short', `The music lasts ${r3(music.probe.durationSec)}s; it cannot start at ${musicStartSec}s.`, {
        files: [picked.music!], detail: { clips: sorted.clips.length, musicSec: r3(Math.max(0, left)), fromSec: musicStartSec, neededSec: r3(plan.totalSec) },
      })));
    }
    if (left + 0.05 < plan.totalSec) musicEndsSec = r3(left);
  }
  const voiceCutSec = voice && voiceEnd > plan.totalSec + 0.25 ? r3(voiceEnd - plan.totalSec) : 0;

  const aspect: MontageAspect =
    input.aspect === '9:16' || input.aspect === '16:9' || input.aspect === '1:1'
      ? input.aspect
      : said.aspect ?? aspectFromClips(clipProbes);
  const body = montageBody(
    { ...plan, musicStartSec },
    sorted.clips.map((i, c) => ({ url: urls[i]!, source: i, ...(stillOf[c] ? { still: true } : {}) })),
    { mode: sound, ...(music ? { musicUrl: urls[picked.music!]! } : {}), ...(voice ? { voiceUrl: urls[picked.voice!]! } : {}) },
    aspect,
    manifest,
  );
  // The same reader the run and the worker use: the lane's validation, the manifest, every shot's file, coverage.
  const parsed = parseAgentRequest(body);
  if (!parsed.ok) {
    return refuse(parsed.code === 'manifest_invalid'
      ? asSent(err('manifest_invalid', `Not every file is in the plan: ${parsed.error}.`, parsed.missing?.length ? { files: parsed.missing } : {}))
      : err('plan_failed', parsed.error));
  }
  const request = parsed.request;

  // ── price + sign ───────────────────────────────────────────────────────────────────────────────────────────────
  const jobId = deps.newId();
  const credits = MONTAGE_PRICE_CREDITS;
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: bodyFingerprint(request), c: credits, x: expiresAt }, deps.key());
  if (!token) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  const quote: MontageQuote = {
    jobId,
    credits,
    totalSec: timelineDuration(request.shots),
    shots: request.shots.length,
    clips: sorted.clips.length - sorted.stills.length,
    ...(sorted.stills.length ? { stills: sorted.stills.length } : {}),
    aspect,
    beatSynced: plan.beatSynced,
    bpm: plan.bpm,
    musicStartSec: music ? musicStartSec : 0,
    sound,
    cutting: onBeat ? 'beat' : 'whole',
    musicFile: picked.music,
    ...(musicEndsSec !== undefined ? { musicEndsSec } : {}),
    ...(voice ? { voice: { file: picked.voice!, durationSec: r3(voice.probe.durationSec), startSec: 0, ...(voiceCutSec ? { cutSec: voiceCutSec } : {}) } } : {}),
    ...('shortened' in plan && plan.shortened ? { shortened: plan.shortened } : {}),
    ...(rampMode && !music ? { rampWithoutMusic: true } : {}),
    ...(plan.ramp ? { ramp: plan.ramp } : {}),
    manifest: request.manifest,
    clipOrder: clipOrder(request.shots),
    ...(selectionInfo ? { selection: selectionInfo } : {}),
    engine: { ...MONTAGE_ENGINE, free: credits === 0 },
    unusedFiles: [],
    expiresAt,
  };
  await deps.audit({
    userId, op: 'montage', phase: 'quote', outcome: 'ok', jobId, files: request.manifest.length, credits, durationSec: quote.totalSec,
    ...(selectionInfo ? { detail: `selection: used ${selectionInfo.used.length} of ${selectionInfo.sent}, excluded ${selectionInfo.excluded.map((i) => i + 1).join(',')}` } : {}),
  });
  return { ok: true, quote, request, token };
}

/** The engine every Agent G montage names on its card. */
export const MONTAGE_ENGINE = { id: 'ffmpeg-montage', label: 'FFmpeg montage' } as const;

export interface RunInput {
  userId: string;
  request: unknown;
  token: unknown;
  /** The user's own words, kept on the job for the Library card. */
  prompt?: unknown;
  /** The multi-step run (lib/agent/run) this job is a step of: kept on the row (`_parent`) and in its audit. Server-set only. */
  parent?: string;
  /** How the user said yes (lib/agent/approval, parsed by the route): kept on the row (`_approval`) and in the audit. Absent = the Start tap. */
  approval?: RunApproval;
}

export const CANCELLED = 'cancelled by the user';

/** The error column of a failed row → the code the chat speaks. Rows are written `<code>: <detail>`. */
export function codeOfRowError(error: string | null): MontageErrorCode {
  const e = error ?? '';
  if (/^cancel/i.test(e)) return 'cancelled';
  for (const code of ['qc_failed', 'clip_missing', 'manifest_invalid', 'insufficient_credits', 'billing_unavailable', 'invalid_request'] as const) {
    if (e.startsWith(code)) return code;
  }
  return 'render_failed';
}

/** The owner's view of a row. */
export function viewOf(row: LeaseRow): JobView {
  if (row.status === 'completed') {
    const r = row.result ?? {};
    const url = typeof r.videoUrl === 'string' ? r.videoUrl : row.signedUrl ?? '';
    return {
      ok: true, jobId: row.id, status: 'completed', videoUrl: url,
      durationSec: typeof r.durationSec === 'number' ? r.durationSec : 0, aspect: typeof r.aspect === 'string' ? r.aspect : '',
    };
  }
  if (row.status === 'failed') return { ok: true, jobId: row.id, status: 'failed', error: codeOfRowError(row.error) };
  return {
    ok: true, jobId: row.id, status: row.status === 'pending' ? 'queued' : 'running',
    stage: row.stage, pct: row.pct, attempt: row.exec?.attempt ?? 0,
  };
}

/** The run a job is a step of (`params._parent`, written by the server when a run queues it), for its audit rows. */
export function runIdOf(row: Pick<LeaseRow, 'params'>): { runId: string } | Record<string, never> {
  const p = row.params._parent;
  return typeof p === 'string' && p ? { runId: p } : {};
}

/** The charge a row claims, if any. A claim, not a fact: the refund pays back only what the ledger shows. */
export function reserveOf(row: LeaseRow): { ref: string; credits: number } | null {
  const r = row.params._reserve as { ref?: unknown; credits?: unknown } | undefined;
  return r && typeof r.ref === 'string' && typeof r.credits === 'number' && r.credits > 0 ? { ref: r.ref, credits: r.credits } : null;
}

/** Pay a final row's debt (its refund), then clear it. Safe to call by everyone, any number of times. */
export async function payDebt(deps: MontageExecDeps, row: LeaseRow): Promise<void> {
  if (!row.exec?.owe) return;
  const reserve = reserveOf(row);
  const paid = reserve ? await deps.billing.refund(row.userId, reserve.ref, reserve.credits) : 'nothing';
  if (paid === 'error') {
    await deps.audit({ userId: row.userId, op: 'montage', phase: 'refund', outcome: 'failed', jobId: row.id, credits: reserve?.credits, detail: 'refund did not land; the sweep retries it' });
    return;
  }
  await settled(deps.store, row.id);
  await deps.audit({ userId: row.userId, op: 'montage', phase: 'refund', outcome: 'ok', jobId: row.id, credits: reserve?.credits, detail: paid });
}

/**
 * Queue a quote the user confirmed. Never twice for one quote; charges (when the edit costs anything) only after its
 * row exists, holding the row from the workers until the charge landed. The render is the worker's.
 */
export async function enqueueMontageJob(deps: MontageExecDeps, input: RunInput): Promise<RunResult> {
  const { userId } = input;
  const approval = input.approval ?? TAP;
  // The request with its manifest: every file quoted, each video with at least one shot (./montageManifest). The token
  // below signs this whole object, so the manifest a run stores is exactly the one the user was quoted.
  const parsed = parseAgentRequest(input.request);
  if (!parsed.ok) {
    if (parsed.code === 'invalid_request') return err('invalid_request', parsed.error);
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'refused', detail: `manifest_invalid: ${parsed.error}`.slice(0, 200) });
    return err('manifest_invalid', `The edit does not hold every quoted file: ${parsed.error}. Ask again for a fresh quote.`, parsed.missing?.length ? { files: parsed.missing } : {});
  }
  const { request, manifest } = parsed;

  const check = verifyQuote(input.token, deps.key(), { userId, fingerprint: bodyFingerprint(request), now: deps.now() });
  if (!check.ok) {
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'refused', detail: `quote_${check.reason}` });
    if (check.reason === 'expired') return err('quote_expired', 'This quote has expired. Ask again for a fresh one.');
    if (check.reason === 'changed') return err('quote_changed', 'The edit differs from the one quoted.');
    return err('quote_invalid', 'This quote is not valid.');
  }
  const { j: jobId, c: credits } = check.claims;
  const totalSec = timelineDuration(request.shots);
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 500) : '';
  const ref = produceRef('agent-montage', jobId);

  // ── one job per quote: the insert is the idempotency check ───────────────────────────────────────────────────────
  const put = await enqueue(deps.store, {
    id: jobId,
    userId,
    serviceType: 'film',
    kind: MONTAGE_KIND,
    hold: credits > 0,
    params: {
      subtype: 'montage',
      via: 'agent-g',
      shots: request.shots.length,
      aspect: request.aspect,
      orientation: request.aspect === '9:16' ? 'vertical' : 'landscape',
      durationSec: totalSec,
      ...(prompt ? { prompt } : {}),
      // The signed request (manifest inside) and the manifest itself: the worker re-checks one against the other.
      _job: { request, manifest },
      ...(credits > 0 ? { _reserve: { ref, credits } } : {}),
      ...(input.parent ? { _parent: input.parent } : {}),
      ...approvalParams(approval),
    },
  });
  if (put === 'error') return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
  if (put === 'exists') {
    const row = await deps.store.read(jobId);
    if (!row || row.userId !== userId) return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
    const view = viewOf(row);
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'replayed', jobId, detail: view.status, ...(input.parent ? { runId: input.parent } : {}) });
    if (view.status === 'failed') return err('already_failed', 'This edit already ran and did not finish. Ask again for a fresh quote.', { jobId });
    return { ...view, replay: true };
  }

  // ── pay, when it costs anything; the row is held from the workers until then ────────────────────────────────────
  if (credits > 0) {
    const r = await deps.billing.reserve(userId, credits, ref);
    if (!r.proceed) {
      const code = r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
      await failPending(deps.store, jobId, code);
      await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'refused', jobId, credits, detail: code });
      return err(code, code === 'insufficient_credits' ? 'Not enough credits for this edit.' : 'Billing is unavailable; nothing was charged.', { jobId });
    }
    if (!(await release(deps.store, jobId))) {
      // Cancelled while it was being charged (the cancel owes the refund and paid it), or the store is down.
      const row = await deps.store.read(jobId);
      if (row?.status === 'failed') return { ...viewOf(row), replay: false };
      return err('jobs_unavailable', 'The job could not be started; anything charged is paid back by the sweep.', { jobId });
    }
  }
  await deps.audit({
    userId, op: 'montage', phase: 'run', outcome: 'ok', jobId, files: manifest.length, credits, durationSec: totalSec,
    approval: approval.channel, detail: withNote('queued', approval), ...(input.parent ? { runId: input.parent } : {}),
  });
  return { ok: true, jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
}

/** A pending row no worker took within this long is handed to one by the owner's status read. */
export const KICK_AFTER_MS = 15_000;

/** Where the owner's job is, and whether it needs a worker now (none took it, or its worker stopped renewing). */
export async function montageJobStatus(
  deps: MontageExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ view: JobView; needsWorker: boolean } | MontageError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const row = jobId ? await deps.store.read(jobId) : null;
  if (!row || row.userId !== input.userId || row.exec?.kind !== MONTAGE_KIND) return err('not_found', 'No such edit.');
  const now = deps.now();
  const needsWorker = claimable(row, now) && (row.status === 'processing' || now - row.createdAt >= KICK_AFTER_MS);
  return { view: viewOf(row), needsWorker };
}

/** The owner stops a queued or running edit. Its worker kills the render at its next heartbeat; a charge is paid back now. */
export async function cancelMontageJob(
  deps: MontageExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ ok: true } | MontageError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const before = jobId ? await deps.store.read(jobId) : null;
  if (!before || before.exec?.kind !== MONTAGE_KIND) return err('not_found', 'No such edit.');
  const r = await cancel(deps.store, jobId, input.userId, CANCELLED, reserveOf(before) !== null);
  if (!r.ok) return r.reason === 'final' ? err('not_running', 'This edit is no longer running.', { jobId }) : err('not_found', 'No such edit.');
  await deps.audit({ userId: input.userId, op: 'montage', phase: 'cancel', outcome: 'cancelled', jobId });
  await payDebt(deps, r.row);
  return { ok: true };
}
