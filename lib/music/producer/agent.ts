/**
 * lib/music/producer/agent.ts — Agent G: "Create a sad piano track, 1 minute long, and add it to Scene 3 of my video."
 * Pure. Turns the sentence into ONE plan card with ONE price, and refuses BEFORE anything is charged when the place it
 * names does not exist (no film yet, or the film has fewer scenes).
 *
 *   step 1  make the track       (charged: the Music Producer price for that length)
 *   step 2  place it in the film (free: our own ffmpeg; scene offset, trim, 0.5 s fades, 6 dB under, dipped under speech)
 */
import { parseProducerAsk, type ProducerTarget } from './intent';
import { planCue, sceneWindow, type CueSpan } from './placement';
import { quoteProducer, type ProducerBook } from './price';
import { PRODUCER_LENGTHS, type ProducerLength, type ProducerSpec } from './spec';
import type { FilmTarget } from './videoTargets';

export type AgentMusicPlan =
  | {
    ok: true;
    spec: ProducerSpec;
    target: Exclude<ProducerTarget, null>;
    film: FilmTarget | null;
    span: CueSpan;
    credits: number;
    /** Where the cue lands, for the card ("0:16 – 0:24"). null for a montage hand-off. */
    window: { start: number; end: number } | null;
    notes: Array<'longer_than_scene' | 'shorter_than_film' | 'length_capped'>;
    /** A cheaper length that still covers the place (the user's own length is kept; this is only offered). */
    cheaper: { lengthSec: ProducerLength; credits: number } | null;
  }
  | { ok: true; spec: ProducerSpec; target: null; credits: number }
  | { ok: false; reason: 'not_music' | 'no_film' | 'no_scene'; scenes?: number };

export function planAgentMusic(text: string, ctx: { film: FilmTarget | null; book: ProducerBook }): AgentMusicPlan {
  const ask = parseProducerAsk(text);
  if (!ask) return { ok: false, reason: 'not_music' };
  const credits = quoteProducer('generate', ask.spec.lengthSec, ctx.book).credits;
  if (!ask.target) return { ok: true, spec: ask.spec, target: null, credits };
  const notes: Array<'longer_than_scene' | 'shorter_than_film' | 'length_capped'> = ask.notes.includes('length_capped') ? ['length_capped'] : [];
  if (ask.target.kind === 'montage') {
    return { ok: true, spec: ask.spec, target: ask.target, film: null, span: 'scene', credits, window: null, notes, cheaper: null };
  }
  if (!ctx.film) return { ok: false, reason: 'no_film' };
  const scenes = ctx.film.scenes;
  let window: { start: number; end: number } | null;
  let spec = ask.spec;
  if (ask.target.kind === 'scene') {
    window = sceneWindow(scenes, ask.target.scene);
    if (!window) return { ok: false, reason: 'no_scene', scenes: scenes.length };
  } else {
    const filmSec = scenes.reduce((n, s) => n + s.seconds, 0);
    window = { start: 0, end: filmSec };
    // A whole-film score with no length asked: the shortest length that covers the film (never looped).
    if (!/\d/.test(text)) {
      const fit = PRODUCER_LENGTHS.find((l) => l >= filmSec) ?? PRODUCER_LENGTHS[PRODUCER_LENGTHS.length - 1] as ProducerLength;
      spec = { ...spec, lengthSec: fit };
    }
  }
  const finalCredits = quoteProducer('generate', spec.lengthSec, ctx.book).credits;
  const cue = planCue({ scenes, target: ask.target, span: 'scene', trackSec: spec.lengthSec });
  if (cue.ok && cue.cue.notes.includes('trimmed_to_scene')) notes.push('longer_than_scene');
  if (cue.ok && cue.cue.notes.includes('track_shorter_than_film')) notes.push('shorter_than_film');
  const need = window.end - window.start;
  const fits = PRODUCER_LENGTHS.find((l) => l >= need);
  const cheaperCredits = fits != null ? quoteProducer('generate', fits, ctx.book).credits : null;
  const cheaper = fits != null && fits < spec.lengthSec && cheaperCredits != null && cheaperCredits < finalCredits ? { lengthSec: fits, credits: cheaperCredits } : null;
  return { ok: true, spec, target: ask.target, film: ctx.film, span: 'scene', credits: finalCredits, window, notes, cheaper };
}
