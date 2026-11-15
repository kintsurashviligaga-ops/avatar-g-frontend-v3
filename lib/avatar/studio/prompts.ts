/**
 * lib/avatar/studio/prompts.ts — what the two engines are told. Pure, client-safe.
 *
 * Neither engine has a tone, gesture, rate or pitch PARAMETER (checked 2026-11-15): tone and pace are words in the
 * prompt. Live gets them as a speaking style; Omni gets them as a voice line plus acting direction.
 *
 * VERBATIM. A presenter must say the script, not paraphrase it. Live is a conversational model, so its system
 * instruction makes it a teleprompter reader that never greets, answers or comments; the take is then checked against
 * the script (timing.checkTake) and redone once, free, when words were skipped or invented.
 */
import { PACE_TEXT, TONE_ACTING, TONE_VOICE, type Pace, type Presenter, type Tone } from './catalog';
import type { ScriptLang } from './scriptScenes';

/** The green the key expects (broadcast chroma green). */
export const CHROMA_GREEN = '#00B140';

const LANG_NAME: Record<ScriptLang, string> = { ka: 'Georgian', en: 'English', ru: 'Russian' };

export type StudioBackground =
  | { kind: 'studio' }
  | { kind: 'green' }
  /** An uploaded or generated image (Omni: described in words; Live: composited behind the key). */
  | { kind: 'image'; description?: string };

export interface LivePromptInput { tone: Tone; pace: Pace; lang: ScriptLang }

export function liveSystemInstruction(p: LivePromptInput): string {
  const lang = LANG_NAME[p.lang];
  return [
    `You are a professional video presenter reading from a teleprompter, in ${lang}.`,
    'Every message you receive is a script. Read it aloud EXACTLY as written, word for word, from the first word to the last.',
    'Do not greet, introduce yourself, answer, explain, summarise, translate or add anything before or after the script.',
    'Do not read stage directions, brackets or symbols aloud. Say numbers the way a native speaker says them.',
    `Speak in a ${TONE_VOICE[p.tone]} voice, at ${PACE_TEXT[p.pace]}.`,
    'Look into the camera. When the script ends, stop speaking and stay silent.',
  ].join(' ');
}

/** The one user turn of a Live take: the scene's words, fenced so the model reads rather than replies. */
export function liveScriptTurn(text: string): string {
  return `SCRIPT:\n${text.trim()}\nEND OF SCRIPT`;
}

export interface OmniTurnInput {
  presenter: Presenter;
  /** The words of THIS turn (≤ 10 s; omniTurns). */
  line: string;
  lang: ScriptLang;
  tone: Tone;
  pace: Pace;
  background: StudioBackground;
  format: '16:9' | '9:16';
  /** The scene's stage direction, if any (never spoken). */
  direction?: string;
  /** 0 = the first turn (generate); later turns extend the same shot. */
  turn: number;
}

function backgroundLine(b: StudioBackground): string {
  if (b.kind === 'green') return `Behind the presenter is a perfectly flat, evenly lit chroma-key green backdrop (${CHROMA_GREEN}) with no shadows, texture or objects, and nothing green on the presenter.`;
  if (b.kind === 'image') return b.description ? `The background is ${b.description}, softly out of focus.` : 'Keep the background exactly as in the first frame, softly out of focus.';
  return 'Keep the background exactly as in the first frame.';
}

/**
 * One Omni turn. The first frame is the presenter's built-in face, so the prompt never describes the face or invents
 * a new person; it directs the delivery. The line is quoted once and marked as said once (an Omni clip that repeats the
 * line was a 2026-10-26 production bug).
 */
export function omniTurnPrompt(p: OmniTurnInput): string {
  const lang = LANG_NAME[p.lang];
  const parts = [
    p.turn === 0
      ? `A ${p.format === '9:16' ? 'vertical' : 'widescreen'} studio presenter video. The person in the first frame is the presenter, framed from the chest up, facing the camera.`
      : 'Continue the same shot without a cut: the same presenter, framing, light and background.',
    `The presenter says, once, in ${lang}, clearly and with natural lip movement: «${p.line.trim()}»`,
    `Voice: ${TONE_VOICE[p.tone]}, at ${PACE_TEXT[p.pace]}.`,
    `Acting: ${TONE_ACTING[p.tone]}.`,
    p.direction ? `Direction: ${p.direction}.` : '',
    backgroundLine(p.background),
    'Static camera, steady soft key light. No music, no captions, no text on screen, no other people.',
  ];
  return parts.filter(Boolean).join(' ');
}
