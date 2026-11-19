/**
 * lib/avatar/studio/plan.ts — a Virtual Studio request checked and turned into a scene plan with its price. Pure,
 * client-safe: the panel shows this plan (storyboard + total) before anything is charged, and the route rebuilds it
 * server-side from the same input so the browser can never set a price.
 *
 * REFUSED BEFORE ANY CHARGE: an unknown presenter or voice, a custom face (built-in faces only, GG 2026-10-22,
 * lib/avatar/curated), a script that is empty or too long, more than MAX_SCENES scenes.
 */
import { curatedAvatarFace, CUSTOM_AVATAR_GAP } from '@/lib/avatar/curated';
import { presenterById, voiceById, type Pace, type Presenter, type StudioFormat, type Tone, type Voice, TONES, PACES } from './catalog';
import { estimateSeconds, omniTurns, splitScript, type ScriptLang, type ScriptScene } from './scriptScenes';
import { quotePresentation, type MarginGate, type OmniRes, type PresentationQuote, type StudioBook } from './price';
import type { StudioBackground } from './prompts';

import { clampVoiceAdjust, NO_ADJUST, type VoiceAdjust } from './voiceAdjust';

/** Omni: one generate + up to three extends = 40 s. */
export const OMNI_MAX_TURNS = 4;
export const OMNI_SCENE_MAX_SEC = 36;

export interface StudioRequest {
  script: string;
  presenterId: string;
  /** Live: the named voice it speaks in. Omni: a named voice means a dub ("Studio voice, lips approximate"); null keeps Omni's own voice. */
  voiceId?: string | null;
  /** The dubbed Studio voice only (D6): exact speed 0.8–1.25 and pitch −4…+4 semitones. Ignored otherwise. */
  voiceSpeed?: number;
  voicePitch?: number;
  tone?: Tone;
  pace?: Pace;
  format?: StudioFormat;
  resolution?: OmniRes;
  background?: { kind: 'studio' } | { kind: 'green' } | { kind: 'upload'; path: string } | { kind: 'generate'; prompt: string };
}

export interface PlannedScene extends ScriptScene {
  /** Omni: the ≤ 10 s lines it is said in. Live: one take, so a single entry. */
  turns: string[];
}

export interface StudioPlan {
  presenter: Presenter;
  voice: Voice | null;
  dub: boolean;
  /** The Studio voice's speed and pitch; always NO_ADJUST unless `dub`. */
  voiceAdjust: VoiceAdjust;
  tone: Tone;
  pace: Pace;
  format: StudioFormat;
  resolution: OmniRes;
  lang: ScriptLang;
  background: StudioBackground;
  /** Live 16:9 only: how the portrait take reaches the wide frame. */
  compose: 'none' | 'key' | 'pillar';
  scenes: PlannedScene[];
  quote: PresentationQuote;
  warnings: string[];
}

export type StudioPlanResult =
  | { ok: true; plan: StudioPlan }
  | { ok: false; reason: 'unknown_presenter' | 'unknown_voice' | 'empty' | 'too_long' | 'too_many_scenes' | 'bad_background' | typeof CUSTOM_AVATAR_GAP; detail: string };

export function buildStudioPlan(req: StudioRequest, opts: { book: StudioBook; gate?: MarginGate }): StudioPlanResult {
  const presenter = presenterById(req.presenterId);
  if (!presenter) return { ok: false, reason: 'unknown_presenter', detail: 'pick one of the built-in presenters' };
  if (presenter.engine === 'omni' && !curatedAvatarFace(presenter.face)) {
    return { ok: false, reason: CUSTOM_AVATAR_GAP, detail: 'only built-in faces can present' };
  }
  const wantsVoice = req.voiceId !== undefined && req.voiceId !== null;
  const voice = wantsVoice ? voiceById(req.voiceId) : presenter.engine === 'live' ? voiceById(presenter.defaultVoice) : null;
  if (wantsVoice && !voice) return { ok: false, reason: 'unknown_voice', detail: 'pick one of the listed voices' };
  const tone: Tone = req.tone && TONES.includes(req.tone) ? req.tone : 'friendly';
  const pace: Pace = req.pace && PACES.includes(req.pace) ? req.pace : 'natural';
  const format: StudioFormat = req.format === '9:16' || req.format === '16:9' ? req.format : presenter.nativeFormat;
  const resolution: OmniRes = req.resolution === '1080p' ? '1080p' : '720p';

  const bg = req.background ?? { kind: 'studio' as const };
  let background: StudioBackground;
  if (bg.kind === 'green') background = { kind: 'green' };
  else if (bg.kind === 'upload') {
    if (typeof bg.path !== 'string' || !bg.path.trim()) return { ok: false, reason: 'bad_background', detail: 'the background upload is missing' };
    // Omni's first frame is the presenter's face, so an image cannot sit behind a cinematic presenter: describe it instead.
    if (presenter.engine === 'omni') return { ok: false, reason: 'bad_background', detail: 'a cinematic presenter takes a described background, not an image' };
    background = { kind: 'image' };
  } else if (bg.kind === 'generate') {
    const prompt = typeof bg.prompt === 'string' ? bg.prompt.trim().slice(0, 400) : '';
    if (!prompt) return { ok: false, reason: 'bad_background', detail: 'describe the background to generate' };
    background = { kind: 'image', description: prompt };
  } else background = { kind: 'studio' };

  // Omni chains at most 4 turns (40 s); 36 s leaves room for turns that do not pack to a full 10 s.
  const split = splitScript(req.script, { pace, maxSec: presenter.engine === 'omni' ? OMNI_SCENE_MAX_SEC : undefined });
  if (!split.ok) return { ok: false, reason: split.reason, detail: split.detail };

  const warnings: string[] = [];
  const dub = presenter.engine === 'omni' && voice !== null;
  if (dub) warnings.push('studio_voice_lips_approximate');
  if (voice && voice.gender !== presenter.gender) warnings.push('voice_gender_differs');
  let compose: StudioPlan['compose'] = 'none';
  if (presenter.engine === 'live' && format !== presenter.nativeFormat) {
    compose = background.kind === 'green' ? 'key' : 'pillar';
    if (background.kind === 'studio') warnings.push('live_wide_pillared');
  }
  if (presenter.engine === 'live' && background.kind === 'image' && format === presenter.nativeFormat) {
    // A portrait Live take keeps its own studio; the image is only used when composing the wide frame.
    warnings.push('live_background_wide_only');
  }

  const scenes: PlannedScene[] = split.scenes.map((s) => ({
    ...s,
    turns: presenter.engine === 'omni' ? omniTurns(s.text, pace) : [s.text],
  }));
  const over = scenes.find((s) => s.turns.length > OMNI_MAX_TURNS);
  if (over) return { ok: false, reason: 'too_long', detail: `scene ${over.index + 1} needs ${over.turns.length} Omni turns; the limit is ${OMNI_MAX_TURNS}` };
  const quote = quotePresentation(
    scenes.map((s) => ({
      engine: presenter.engine,
      sec: s.estSec,
      resolution,
      dub,
      turnSecs: presenter.engine === 'omni' ? s.turns.map((t) => estimateSeconds(t, pace, split.lang)) : undefined,
    })),
    { book: opts.book, generateBackground: bg.kind === 'generate' && presenter.engine === 'live', gate: opts.gate },
  );
  const voiceAdjust = dub ? clampVoiceAdjust({ speed: req.voiceSpeed, pitch: req.voicePitch }) : NO_ADJUST;
  return { ok: true, plan: { presenter, voice, dub, voiceAdjust, tone, pace, format, resolution, lang: split.lang, background, compose, scenes, quote, warnings } };
}
