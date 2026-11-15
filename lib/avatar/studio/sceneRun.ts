/**
 * lib/avatar/studio/sceneRun.ts — one Virtual Studio scene, end to end, with every side effect injected (tests mock them).
 *
 * START (POST /api/avatar/studio/scene), after the route rebuilt the plan and matched the price the card showed:
 *   balance → ONE debit under `avatar-studio:<project>:<scene>:<take>` (deductCreditsOnce: a double press is one charge) →
 *   - Live: record the take now (≈ the scene's length + a few seconds), check it was said verbatim, retake once FREE if
 *     not, trim the idle frames, compose 16:9 when asked, time the karaoke from the transcript, save. Ready in one call.
 *   - Omni: submit turn 0 (the built-in face as the first frame) and return `processing`.
 * POLL (GET …/scene?job=…): Omni only. A finished turn is followed by the next as a continuation of the same interaction
 *   (`previous_interaction_id`, the documented way Omni keeps speaking); the last turn's file is the whole scene (an
 *   extend returns input + continuation). Then Chirp word times → karaoke, the verbatim check (one free retake), save.
 * Any miss before delivery refunds the debit by its ref. A take that is still not verbatim after the free retake is
 * DELIVERED with a `not_verbatim` warning, never silently refunded: Chirp's Georgian is Preview, so a "miss" may be the
 * recognizer's, and the card's Regenerate button is one tap away.
 */
import type { Presenter, Voice } from './catalog';
import { presenterById, voiceById } from './catalog';
import { liveTakeSetup, liveTakeTurn, type TakeResult } from './liveTake';
import { omniTurnPrompt, type StudioBackground } from './prompts';
import { StudioError } from './errors';
import type { StudioPlan } from './plan';
import { estimateSeconds, omniTurns, splitScript, type ScriptLang } from './scriptScenes';
import { quoteScene, type MarginGate, type StudioBook } from './price';
import { alignTimings, checkTake, estimateWordTimings, fromChunks, scriptWords, type RecognizedWord, type WordTiming } from './timing';
import type { Pace, Tone } from './catalog';

export interface OmniSubmitArgs { prompt: string; aspect: '16:9' | '9:16'; resolution: '720p' | '1080p'; seconds: number; face: string; previous?: { id: string; model: string } }
export type OmniStart = { ok: true; id: string; model: string } | { ok: false; reason: string };
export type OmniPoll = { state: 'processing' } | { state: 'delivering' } | { state: 'ready'; url: string } | { state: 'failed'; reason: string };

export interface SceneDeps {
  hold(userId: string, credits: number): Promise<boolean>;
  charge(userId: string, credits: number, ref: string): Promise<boolean>;
  refund(userId: string, credits: number, ref: string): Promise<void>;
  /** One recorded Live take through our relay. null = no take (any miss). */
  liveTake(setup: Record<string, unknown>, turn: Record<string, unknown>, signal: AbortSignal): Promise<TakeResult | null>;
  /** ffmpeg: cut the take to its speech window (stream copy) and, when `compose` is set, onto the 16:9 frame. */
  finishLive(take: TakeResult, compose: StudioPlan['compose'], background: string | null): Promise<{ bytes: Buffer; durationSec: number }>;
  omniSubmit(args: OmniSubmitArgs): Promise<OmniStart>;
  omniPoll(id: string, hostPath: string): Promise<OmniPoll>;
  fetchBytes(url: string): Promise<Buffer>;
  measure(bytes: Buffer): Promise<number>;
  /** Chirp 3 word offsets on the clip's audio. null = no words (the card falls back to estimated timing). */
  words(bytes: Buffer, lang: ScriptLang): Promise<{ words: RecognizedWord[]; heard: string } | null>;
  save(userId: string, path: string, bytes: Buffer, mime: string): Promise<string>;
  saveJob(userId: string, job: SceneJob): Promise<void>;
  loadJob(userId: string, id: string): Promise<SceneJob | null>;
  newId(): string;
  now(): Date;
}

export interface SceneJob {
  v: 1;
  kind: 'avatar-studio-scene';
  id: string;
  projectId: string;
  sceneIndex: number;
  take: number;
  engine: 'live' | 'omni';
  presenterId: string;
  voiceId: string | null;
  text: string;
  direction: string;
  turns: string[];
  turn: number;
  interaction: { id: string; model: string } | null;
  tone: Tone;
  pace: Pace;
  lang: ScriptLang;
  format: '16:9' | '9:16';
  resolution: '720p' | '1080p';
  background: StudioBackground;
  backgroundUrl: string | null;
  compose: StudioPlan['compose'];
  credits: number;
  ref: string;
  /** The free retake was used. */
  retaken: boolean;
  state: 'processing' | 'ready' | 'failed';
  url?: string;
  path?: string;
  durationSec?: number;
  timings?: WordTiming[];
  timingSource?: 'chirp' | 'live' | 'estimated';
  wer?: number;
  warnings: string[];
  reason?: string;
  createdAt: string;
}

/** The scene as it will be made (the user's edited text wins) and its price. Pure: the route and the card agree on it. */
export function sceneToMake(plan: StudioPlan, index: number, book: StudioBook, text?: string, gate?: MarginGate):
  | { ok: true; text: string; direction: string; turns: string[]; estSec: number; credits: number }
  | { ok: false; reason: string } {
  const base = plan.scenes[index];
  if (!base) return { ok: false, reason: 'scene_missing' };
  let words = base.text;
  if (text !== undefined && text.trim() !== base.text) {
    const re = splitScript(text, { pace: plan.pace, maxSec: plan.presenter.engine === 'omni' ? 36 : undefined });
    if (!re.ok) return { ok: false, reason: re.reason };
    if (re.scenes.length !== 1) return { ok: false, reason: 'edited_scene_too_long' };
    words = re.scenes[0]!.text;
  }
  const estSec = estimateSeconds(words, plan.pace, plan.lang);
  const turns = plan.presenter.engine === 'omni' ? omniTurns(words, plan.pace) : [words];
  if (turns.length > 4) return { ok: false, reason: 'edited_scene_too_long' };
  const credits = quoteScene({
    engine: plan.presenter.engine, sec: estSec, resolution: plan.resolution, dub: plan.dub,
    turnSecs: plan.presenter.engine === 'omni' ? turns.map((t) => estimateSeconds(t, plan.pace, plan.lang)) : undefined,
  }, book, gate).credits;
  return { ok: true, text: words, direction: base.direction, turns, estSec, credits };
}

export const debitRef = (projectId: string, scene: number, take: number) => `avatar-studio:${projectId}:${scene}:${take}`;
export const scenePath = (userId: string, job: Pick<SceneJob, 'projectId' | 'sceneIndex' | 'take'>, suffix: string) =>
  `avatar-studio/${userId}/${job.projectId}/scene-${job.sceneIndex}-take-${job.take}${suffix}`;

/** Ownership of a saved scene/background path: the caller's own Studio folder only. */
export function ownsStudioPath(path: string, userId: string): boolean {
  return path.startsWith(`avatar-studio/${userId}/`) && !path.includes('..') && /^[A-Za-z0-9._/-]+$/.test(path);
}

const presenterOf = (job: SceneJob): Presenter => {
  const p = presenterById(job.presenterId);
  if (!p) throw new StudioError('invalid_request', 'Unknown presenter.');
  return p;
};

function omniPrompt(job: SceneJob, turn: number): string {
  return omniTurnPrompt({
    presenter: presenterOf(job), line: job.turns[turn]!, lang: job.lang, tone: job.tone, pace: job.pace,
    background: job.background, format: job.format, direction: job.direction || undefined, turn,
  });
}

async function submitTurn(deps: SceneDeps, job: SceneJob, turn: number): Promise<OmniStart> {
  const seconds = Math.min(10, Math.max(4, Math.ceil(estimateSeconds(job.turns[turn]!, job.pace, job.lang) + 0.5)));
  return deps.omniSubmit({
    prompt: omniPrompt(job, turn), aspect: job.format, resolution: job.resolution, seconds, face: presenterOf(job).face,
    ...(turn > 0 && job.interaction ? { previous: job.interaction } : {}),
  });
}

export interface StartInput {
  projectId: string;
  sceneIndex: number;
  take: number;
  plan: StudioPlan;
  scene: { text: string; direction: string; turns: string[] };
  credits: number;
  /** A signed URL of the background image (upload or generated), when the plan has one. */
  backgroundUrl: string | null;
}

export async function startScene(deps: SceneDeps, userId: string, input: StartInput, signal: AbortSignal = new AbortController().signal): Promise<SceneJob> {
  const { plan } = input;
  const ref = debitRef(input.projectId, input.sceneIndex, input.take);
  const job: SceneJob = {
    v: 1, kind: 'avatar-studio-scene', id: deps.newId(), projectId: input.projectId, sceneIndex: input.sceneIndex, take: input.take,
    engine: plan.presenter.engine, presenterId: plan.presenter.id, voiceId: plan.voice?.id ?? null,
    text: input.scene.text, direction: input.scene.direction, turns: input.scene.turns, turn: 0, interaction: null,
    tone: plan.tone, pace: plan.pace, lang: plan.lang, format: plan.format, resolution: plan.resolution,
    background: plan.background, backgroundUrl: input.backgroundUrl, compose: plan.compose,
    credits: input.credits, ref, retaken: false, state: 'processing', warnings: [...plan.warnings], createdAt: deps.now().toISOString(),
  };
  if (plan.dub) throw new StudioError('not_configured', 'The studio voice for cinematic presenters comes in the next update.', 501);
  if (!(await deps.hold(userId, input.credits))) throw new StudioError('insufficient_credits', 'Not enough credits for this scene.', 402);
  if (!(await deps.charge(userId, input.credits, ref))) throw new StudioError('insufficient_credits', 'Not enough credits for this scene.', 402);

  try {
    if (job.engine === 'live') return await recordLive(deps, userId, job, plan.voice as Voice, signal);
    const started = await submitTurn(deps, job, 0);
    if (!started.ok) throw new StudioError(started.reason === 'filtered' ? 'filtered' : 'provider_unavailable', 'The scene could not start. Nothing was charged.', 502);
    job.interaction = { id: started.id, model: started.model };
    await deps.saveJob(userId, job);
    return job;
  } catch (e) {
    await deps.refund(userId, input.credits, `${ref}:refund`);
    throw e instanceof StudioError ? e : new StudioError('provider_unavailable', 'The scene could not be made. Nothing was charged.', 502);
  }
}

async function recordLive(deps: SceneDeps, userId: string, job: SceneJob, voice: Voice, signal: AbortSignal): Promise<SceneJob> {
  const presenter = presenterOf(job);
  const setup = liveTakeSetup(presenter, voice ?? voiceById(presenter.defaultVoice)!, { tone: job.tone, pace: job.pace, lang: job.lang });
  let take = await deps.liveTake(setup, liveTakeTurn(job.text), signal);
  if (!take) throw new StudioError('provider_unavailable', 'The presenter did not answer. Nothing was charged.', 502);
  let verdict = checkTake(job.text, take.heard);
  if (!verdict.ok) {
    job.retaken = true;
    const again = await deps.liveTake(setup, liveTakeTurn(job.text), signal);
    if (again) {
      const v2 = checkTake(job.text, again.heard);
      if (v2.wer <= verdict.wer) { take = again; verdict = v2; }
    }
  }
  const done = await deps.finishLive(take, job.compose, job.backgroundUrl);
  const path = scenePath(userId, job, '.mp4');
  job.url = await deps.save(userId, path, done.bytes, 'video/mp4');
  job.path = path;
  job.durationSec = done.durationSec;
  job.timings = take.chunks.length ? fromChunks(take.chunks, done.durationSec) : estimateWordTimings(scriptWords(job.text), 0, done.durationSec);
  job.timingSource = take.chunks.length ? 'live' : 'estimated';
  job.wer = verdict.wer;
  if (!verdict.ok) job.warnings.push('not_verbatim');
  job.state = 'ready';
  await deps.saveJob(userId, job);
  return job;
}

/** One poll of an Omni scene. Never charges; refunds a failure once (the job records it). */
export async function pollScene(deps: SceneDeps, userId: string, job: SceneJob): Promise<SceneJob> {
  if (job.state !== 'processing' || job.engine !== 'omni' || !job.interaction) return job;
  const fail = async (reason: string) => {
    job.state = 'failed';
    job.reason = reason;
    await deps.refund(userId, job.credits, `${job.ref}:refund`);
    await deps.saveJob(userId, job);
    return job;
  };
  const p = await deps.omniPoll(job.interaction.id, scenePath(userId, job, `-r${job.retaken ? 1 : 0}-t${job.turn}.mp4`));
  if (p.state === 'processing' || p.state === 'delivering') return job;
  if (p.state === 'failed') return fail(p.reason);
  if (job.turn + 1 < job.turns.length) {
    const next = await submitTurn(deps, job, job.turn + 1);
    if (!next.ok) return fail(next.reason);
    job.turn += 1;
    job.interaction = { id: next.id, model: next.model };
    await deps.saveJob(userId, job);
    return job;
  }
  // The whole scene is in the last turn's file.
  let bytes: Buffer;
  try { bytes = await deps.fetchBytes(p.url); } catch { return job; } // a transient miss: the next poll retries
  const durationSec = (await deps.measure(bytes)) || job.turns.reduce((s, t) => s + estimateSeconds(t, job.pace, job.lang), 0);
  const heard = await deps.words(bytes, job.lang).catch(() => null);
  const verdict = checkTake(job.text, heard?.heard ?? null);
  if (!verdict.ok && heard && !job.retaken) {
    // One free retake of the whole chain.
    job.retaken = true;
    job.turn = 0;
    const again = await submitTurn(deps, job, 0);
    if (!again.ok) return fail(again.reason);
    job.interaction = { id: again.id, model: again.model };
    await deps.saveJob(userId, job);
    return job;
  }
  const path = scenePath(userId, job, '.mp4');
  job.url = await deps.save(userId, path, bytes, 'video/mp4');
  job.path = path;
  job.durationSec = durationSec;
  const script = scriptWords(job.text);
  job.timings = heard ? alignTimings(script, heard.words, durationSec) : estimateWordTimings(script, 0, durationSec);
  job.timingSource = heard ? 'chirp' : 'estimated';
  job.wer = verdict.wer;
  if (!verdict.ok) job.warnings.push(heard ? 'not_verbatim' : 'timing_estimated');
  job.state = 'ready';
  await deps.saveJob(userId, job);
  return job;
}

/** What the browser sees of a job (no ref, no interaction ids). */
export function publicJob(job: SceneJob) {
  return {
    id: job.id, sceneIndex: job.sceneIndex, take: job.take, engine: job.engine, state: job.state, text: job.text,
    turn: job.turn, turns: job.turns.length, url: job.url ?? null, durationSec: job.durationSec ?? null,
    timings: job.timings ?? null, timingSource: job.timingSource ?? null, warnings: job.warnings, reason: job.reason ?? null,
    credits: job.credits, voiceId: job.voiceId, presenterId: job.presenterId,
  };
}
export type PublicSceneJob = ReturnType<typeof publicJob>;
