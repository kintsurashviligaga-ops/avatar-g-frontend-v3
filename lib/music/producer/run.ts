/**
 * lib/music/producer/run.ts — one Music Producer press, end to end, with every side effect injected (tests mock them).
 *
 * 1. Work out the spec: as asked (generate), the parent's with a new style (restyle), or the parent's next 30 s (extend).
 * 2. buildProducerBrief → one Lyria call on Vertex (Clip for 30 s and every "Add 30 s", Pro for longer).
 * 3. Check the balance first; charge ONCE, only after a track came back (a miss is never charged).
 * 4. Extend: join parent + new part on a bar with a crossfade (ffmpeg), lyric lines of the new part shifted to where it starts.
 * 5. Save the MP3 privately with its recipe; a save miss refunds the charge.
 */
import { buildProducerBrief } from './brief';
import { ProducerError } from './errors';
import { extendSpec, planExtend, type ExtendPlan } from './extend';
import { lyricsFromCaption, type ProducerMeta } from './library';
import { syncLyrics, type LyricLine } from './lyricSync';
import type { ProducerAction, ProducerBook } from './price';
import { restyleSpec, type ProducerRequest } from './request';
import type { ProducerSpec } from './spec';

export interface ProducerTrack { base64: string; mime: string; caption: string | null }

export interface ProducerRunDeps {
  /** The caller's own saved recipe, or null (not found / not theirs). */
  loadRecipe(userId: string, id: string): Promise<ProducerMeta | null>;
  /** Owner-checked bytes of a saved track. */
  loadAudio(userId: string, path: string): Promise<Buffer>;
  /** One Lyria generateContent call (Vertex only). null = no track (any miss). */
  generate(input: string, model: string, signal: AbortSignal): Promise<ProducerTrack | null>;
  /** ffmpeg: parent cut on a bar + crossfade into the new part. */
  join(parent: Buffer, next: Buffer, plan: ExtendPlan): Promise<Buffer>;
  /** Seconds of an MP3 (0 = could not measure). */
  measure(bytes: Buffer): Promise<number>;
  hold(userId: string, credits: number): Promise<boolean>;
  charge(userId: string, credits: number, ref: string): Promise<boolean>;
  refund(userId: string, credits: number, ref: string): Promise<void>;
  save(userId: string, id: string, bytes: Buffer, mime: string): Promise<{ path: string; url: string }>;
  record(userId: string, id: string, url: string, meta: ProducerMeta): Promise<void>;
  newId(): string;
  now(): Date;
}

export interface ProducerResult { id: string; url: string; meta: ProducerMeta; charged: number }

/** Lines of the new part move to where it is heard: after the parent's cut, minus the crossfade. */
export function shiftLines(lines: readonly LyricLine[], by: number): LyricLine[] {
  return lines.map((l) => ({ ...l, start: +(l.start + by).toFixed(3), end: +(l.end + by).toFixed(3) }));
}

export async function runProducer(
  deps: ProducerRunDeps, userId: string, req: ProducerRequest, credits: number, book: ProducerBook,
  signal: AbortSignal = new AbortController().signal,
): Promise<ProducerResult> {
  // ── 1. spec ──
  let parent: ProducerMeta | null = null;
  if (req.action !== 'generate') {
    parent = await deps.loadRecipe(userId, req.parentId);
    if (!parent) throw new ProducerError('not_found', 'That track was not found.', 404);
  }
  let spec: ProducerSpec;
  let plan: ExtendPlan | null = null;
  if (req.action === 'generate') spec = req.spec;
  else if (req.action === 'restyle') spec = restyleSpec((parent as ProducerMeta).spec, (parent as ProducerMeta).lyrics, req.style);
  else {
    const p = parent as ProducerMeta;
    const check = planExtend(p.durationSec, p.bpm ?? p.spec.bpm);
    if (!check.ok) throw new ProducerError(check.reason, check.reason === 'too_long' ? 'The track is already as long as it can get (8 min).' : 'The track is too short to extend.');
    plan = check.plan;
    spec = extendSpec(p.spec, p.part);
  }
  const brief = buildProducerBrief(spec);
  const action: ProducerAction = req.action;

  // ── 2. balance, then the one provider call ──
  if (!(await deps.hold(userId, credits))) throw new ProducerError('insufficient_credits', 'Not enough credits for this track.', 402);
  const track = await deps.generate(brief.input, brief.model, signal);
  if (!track) throw new ProducerError('provider_unavailable', 'The track did not come back. Nothing was charged.', 502);
  let bytes: Buffer = Buffer.from(track.base64, 'base64');
  const partSec = await deps.measure(bytes);
  const sung = spec.vocals ? (spec.autoLyrics ? lyricsFromCaption(track.caption) : spec.lyrics) : '';
  let lines = syncLyrics(sung, brief.timeline, partSec > 0 ? partSec : spec.lengthSec);
  let durationSec = partSec;
  let lyrics = sung;

  // ── 3. extend: join on the beat ──
  if (plan && parent) {
    let joined: Buffer;
    try {
      joined = await deps.join(await deps.loadAudio(userId, parent.audioPath), bytes, plan);
    } catch {
      throw new ProducerError('join_failed', 'The new part could not be joined. Nothing was charged.', 502);
    }
    bytes = joined;
    const offset = +(plan.cutAtSec - plan.crossfadeSec).toFixed(3);
    lines = [...parent.lines.filter((l) => l.start < plan!.cutAtSec), ...shiftLines(lines, offset)];
    lyrics = [parent.lyrics, sung].filter(Boolean).join('\n\n');
    durationSec = (await deps.measure(bytes)) || plan.totalSec;
  }

  // ── 4. charge once, save, refund a save miss ──
  const id = deps.newId();
  const ref = `music-producer:${id}`;
  if (!(await deps.charge(userId, credits, ref))) throw new ProducerError('insufficient_credits', 'Not enough credits for this track.', 402);
  const meta: ProducerMeta = {
    v: 1, kind: 'music-producer', id, action, spec, model: brief.model, input: brief.input, lyrics, lines,
    timeline: brief.timeline, durationSec: +durationSec.toFixed(3), bpm: plan?.bpm ?? spec.bpm,
    part: plan ? (parent as ProducerMeta).part + 1 : 0, parentId: parent?.id ?? null, credits, book,
    audioPath: '', mime: 'audio/mpeg', createdAt: deps.now().toISOString(),
  };
  try {
    const saved = await deps.save(userId, id, bytes, plan ? 'audio/mpeg' : track.mime || 'audio/mpeg');
    meta.audioPath = saved.path;
    meta.mime = plan ? 'audio/mpeg' : track.mime || 'audio/mpeg';
    await deps.record(userId, id, saved.url, meta);
    return { id, url: saved.url, meta, charged: credits };
  } catch (e) {
    await deps.refund(userId, credits, `${ref}:refund`);
    if (e instanceof ProducerError) throw e;
    throw new ProducerError('not_configured', 'The track could not be saved. Your credits were returned.', 503);
  }
}
