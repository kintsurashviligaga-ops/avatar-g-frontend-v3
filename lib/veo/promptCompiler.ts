/**
 * lib/veo/promptCompiler.ts — the Omni director's structured shot → one Veo prompt (docs/VEO_ENGINE.md §5).
 *
 * The order is Google's documented prompt anatomy: subject and action, setting, camera, then the look (lighting,
 * style, mood), then audio. Four rules from Google's Veo guides shape the output:
 *   • Image-to-video: when the clip animates from a first frame, "prompt for motion only". The frame already
 *     fixes who is in it, where, how it is lit, framed and graded; describing those again invites Veo to redraw
 *     them mid-clip. So the i2v prompt says "The subject …", keeps the camera MOVE, and drops subject, setting,
 *     lighting, style, and the shot size / angle / lens part of the camera clause.
 *   • Dialogue: Vertex's best practice is `Speaker says: line` — a colon, NO quotation marks. Quoted speech is
 *     what makes Veo burn the words into the frame as captions.
 *   • Sound: one sentence per cue, in Google's own labels (SFX: …, Ambient noise: …).
 *   • Negative prompt: describe what to exclude as nouns ("text, watermark"), never as instructions
 *     ("no text") — the negation word itself is a token that pulls the unwanted thing IN.
 *
 * Pure — no I/O. Blank fields, null dialogue entries and a nonsense maxChars degrade to "leave it out" or the
 * default rather than throwing.
 */
import { cameraPhrase } from './cinematography';
import type { CameraSpec, DialogueLine, ShotSpec } from './types';

/** Veo's prompt limit is in tokens; 1800 characters stays comfortably inside it for English prose. */
export const DEFAULT_MAX_PROMPT_CHARS = 1800;
export const MAX_NEGATIVE_PROMPT_CHARS = 800;

export type ShotSectionKey =
  | 'subject' | 'action' | 'setting' | 'camera' | 'lighting' | 'style' | 'mood' | 'framing'
  | 'dialogue' | 'sfx' | 'ambience';

/**
 * Lowest priority first. Subject, action, camera and dialogue are never dropped, and neither is the framing
 * hint: without it a 1:1 / 4:5 crop cuts the subject out of a native 16:9 / 9:16 frame.
 */
export const CLAMP_DROP_ORDER: readonly ShotSectionKey[] = ['mood', 'style', 'lighting', 'ambience', 'sfx', 'setting'];

/** Added to the negative prompt whenever a shot has dialogue — the caption failure mode the colon rule targets. */
export const DIALOGUE_NEGATIVE_TERMS = 'subtitles, captions, on-screen text';

export interface CompileShotPromptOptions {
  maxChars?: number;
  /** capabilities.framingHintFor(format) — the centred-subject clause for a 1:1 / 4:5 crop, or null. */
  framingHint?: string | null;
  /** The film-wide look, merged into the Style section (and into the negative prompt's style check). */
  styleGuide?: string;
  /** The user's negative prompt, raw — normalised by normalizeNegativePrompt(). */
  negativePrompt?: string | readonly string[];
}

export interface CompiledShotPrompt {
  prompt: string;
  negativePrompt?: string;
  /** Each section exactly as it appears in `prompt`, in prompt order (prompt = values joined by one space). */
  sections: Record<string, string>;
  /** Sections the clamp removed, in the order they were removed. */
  dropped: ShotSectionKey[];
}

function clean(text: string | null | undefined): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

function capitalizeAscii(text: string): string {
  // ASCII only: String#toUpperCase maps Georgian Mkhedruli to Mtavruli, which is not sentence case.
  return /^[a-z]/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Ends the text with exactly one sentence terminator (an existing ! ? … is kept). */
function terminate(text: string): string {
  const t = text.replace(/[\s,;:]+$/, '');
  if (!t) return '';
  return /[.!?…]["'’)\]]?$/.test(t) ? t : `${t}.`;
}

function sentence(text: string): string {
  return terminate(capitalizeAscii(clean(text)));
}

function withoutTerminal(text: string): string {
  return clean(text).replace(/[\s.,;:]+$/, '');
}

/** Double quotation marks of every script — Latin, curly, Georgian low-9, guillemets. */
const DOUBLE_QUOTES = /["“”„‟«»]/g;

const STANDALONE_OPENERS = new Set([
  'the', 'a', 'an', 'he', 'she', 'they', 'it', 'his', 'her', 'their', 'its', 'we', 'i', 'you',
  'this', 'that', 'these', 'those',
]);

/**
 * True when the action continues the subject as a predicate ("walks toward the window"), false when it is its
 * own sentence ("She walks…", "The subject turns…") and must not be glued onto a noun phrase.
 */
function continuesSubject(action: string): boolean {
  if (!/^[a-z]/.test(action)) return false;
  const first = action.split(/[\s,]/, 1)[0] ?? '';
  return !STANDALONE_OPENERS.has(first);
}

function dialogueSentence(d: DialogueLine | null | undefined): string {
  if (!d) return '';
  let line = clean(d.line).replace(DOUBLE_QUOTES, '').trim();
  // A line wrapped in single quotes loses them; apostrophes inside ("don't") stay.
  const wrapped = /^['‘](.*)['’]$/.exec(line);
  if (wrapped?.[1] !== undefined) line = wrapped[1].trim();
  if (!line) return '';
  // A colon in the name would break the `Speaker says:` pattern Veo keys on.
  const speaker = clean(clean(d.speaker).replace(/[:："“”„‟«»]/g, '')) || 'The subject';
  return `${speaker} says: ${terminate(line)}`;
}

function audioSentence(label: string, text: string | undefined): string {
  const t = withoutTerminal(clean(text).replace(DOUBLE_QUOTES, ''));
  return t ? `${label}: ${terminate(t)}` : '';
}

function labelled(label: string, text: string | undefined): string {
  const t = withoutTerminal(text ?? '');
  return t ? `${label}: ${terminate(t)}` : '';
}

function uniqueCaseless(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = withoutTerminal(v ?? '');
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

function motionOnly(camera: CameraSpec): CameraSpec {
  return { ...camera, shot: 'auto', angle: 'auto', lens: 'auto' };
}

function sanitizeMax(maxChars: number | undefined): number {
  return typeof maxChars === 'number' && Number.isFinite(maxChars) && maxChars > 0
    ? Math.floor(maxChars)
    : DEFAULT_MAX_PROMPT_CHARS;
}

/** A structured shot → the prompt, the normalised negative prompt, and the sections (for the UI and QA). */
export function compileShotPrompt(shot: ShotSpec, opts: CompileShotPromptOptions = {}): CompiledShotPrompt {
  const i2v = shot.hasStartImage === true;
  const pieces: Array<{ key: ShotSectionKey; text: string }> = [];
  const push = (key: ShotSectionKey, text: string) => {
    if (text) pieces.push({ key, text });
  };

  const subject = withoutTerminal(shot.subject);
  const action = withoutTerminal(shot.action);

  if (i2v) {
    if (action) push('action', sentence(continuesSubject(action) ? `The subject ${action}` : action));
  } else if (subject && action && continuesSubject(action)) {
    // "A woman in a red coat" + "walks toward the window" → one sentence; the pieces still join with a space.
    push('subject', capitalizeAscii(subject));
    push('action', terminate(action));
  } else {
    push('subject', sentence(subject));
    push('action', sentence(action));
  }

  if (!i2v) push('setting', labelled('Setting', shot.setting));
  push('camera', sentence(cameraPhrase(i2v ? motionOnly(shot.camera) : shot.camera)));
  if (!i2v) {
    push('lighting', labelled('Lighting', shot.lighting));
    const styles = uniqueCaseless([shot.style, opts.styleGuide]);
    if (styles.length > 0) push('style', `Style: ${terminate(styles.join('; '))}`);
  }
  push('mood', labelled('Mood', shot.mood));
  push('framing', sentence(clean(opts.framingHint)));

  const dialogue = (shot.audio?.dialogue ?? []).map(dialogueSentence).filter((s) => s.length > 0);
  push('dialogue', dialogue.join(' '));
  push('sfx', audioSentence('SFX', shot.audio?.sfx));
  push('ambience', audioSentence('Ambient noise', shot.audio?.ambience));

  const max = sanitizeMax(opts.maxChars);
  const render = () => pieces.map((p) => p.text).join(' ');
  const dropped: ShotSectionKey[] = [];
  for (const key of CLAMP_DROP_ORDER) {
    if (render().length <= max) break;
    const at = pieces.findIndex((p) => p.key === key);
    if (at >= 0) {
      pieces.splice(at, 1);
      dropped.push(key);
    }
  }
  // Still over budget means the protected core alone is longer than maxChars. It ships whole: a cut subject
  // breaks the character lock and a cut line is half a sentence spoken — both worse than a long prompt.

  // The caption guard goes first: it is short, and it is the failure Google's colon rule exists to prevent.
  const rawNegative: string[] = [];
  if (dialogue.length > 0) rawNegative.push(DIALOGUE_NEGATIVE_TERMS);
  const userNegative = opts.negativePrompt;
  if (typeof userNegative === 'string') rawNegative.push(userNegative);
  else if (userNegative) rawNegative.push(...userNegative);
  const negativePrompt = normalizeNegativePrompt(rawNegative, [shot.style, opts.styleGuide].filter(Boolean).join(' '));

  const sections: Record<string, string> = {};
  for (const p of pieces) sections[p.key] = p.text;
  return {
    prompt: render(),
    ...(negativePrompt ? { negativePrompt } : {}),
    sections,
    dropped,
  };
}

// ── Negative prompt ──────────────────────────────────────────────────────────────────────────────────────

/** Leading negations. `no\b` never eats "noise"/"noir"/"none"; `not\b` never eats "notebook". */
const NEGATION_RX = /^(?:please\s+)?(?:do\s+not|don['’]?t|never|not|no|avoid(?:ing)?|without|exclud(?:e|ing))\b[\s-]*/i;
const VERB_AFTER_NEGATION_RX =
  /^(?:show(?:ing)?|include|including|add(?:ing)?|use|using|render(?:ing)?|generat(?:e|ing)|hav(?:e|ing)|make|want|display(?:ing)?|put|creat(?:e|ing))\b\s*/i;
const DETERMINER_RX = /^(?:any|a|an|the|some)\s+/i;

/** Style families and the negative terms that would fight them (the style's own words included). */
const STYLE_CONFLICTS: ReadonlyArray<{ trigger: RegExp; conflicts: RegExp }> = [
  {
    trigger: /anime|manga|cartoon|animated|animation|illustrat|ანიმე|მულტ/i,
    conflicts: /\b(?:anime|manga|cartoon(?:ish|y)?|illustrat(?:ion|ions|ed)|drawing|drawn|animated|animation|2d)\b/i,
  },
  { trigger: /neon|cyberpunk|ნეონ|კიბერპანკ/i, conflicts: /\b(?:neon|cyberpunk)\b/i },
  { trigger: /vintage|retro|sepia|ვინტაჟ|რეტრო/i, conflicts: /\b(?:sepia|vintage|retro)\b/i },
  {
    trigger: /noir|monochrom|black[\s-]+and[\s-]+white|b&w|ნუარ/i,
    conflicts: /(?:\bnoir\b|\bmonochrom(?:e|atic)\b|\bblack[\s-]+and[\s-]+white\b|\bb&w\b|\bgr[ae]yscale\b|\bdesaturated\b)/i,
  },
];

function stripNegation(term: string): string {
  let t = term;
  for (let i = 0; i < 4; i += 1) {
    const next = t.replace(NEGATION_RX, '');
    if (next === t) break;
    t = next.replace(VERB_AFTER_NEGATION_RX, '');
  }
  return t.replace(DETERMINER_RX, '');
}

function normalizeTerm(raw: string): string {
  const t = clean(raw.replace(DOUBLE_QUOTES, ''))
    .replace(/^[\s\-–—*•·.:!?'`]+/, '')
    .replace(/[\s.:!?'`]+$/, '');
  return clean(stripNegation(t)).toLowerCase();
}

/**
 * A comma list of nouns: negation words stripped ("no text" → "text"), de-duplicated, terms that contradict the
 * chosen style removed (a negative "anime" on an Anime shot fights the look the user picked), and at most
 * 800 characters cut on a comma. Returns '' when nothing is left.
 */
export function normalizeNegativePrompt(
  raw: string | readonly string[] | null | undefined,
  style?: string | null,
): string {
  const chunks: readonly unknown[] = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  const conflicts = STYLE_CONFLICTS.filter((r) => r.trigger.test(style ?? '')).map((r) => r.conflicts);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const chunk of chunks) {
    if (typeof chunk !== 'string') continue;
    const pieces = chunk
      .split(/[,;\n\r|]+|[.!?](?:\s+|$)/)
      // "no text and no watermark" is two terms; "black and white" stays one.
      .flatMap((p) => p.split(/\s+(?:and|or|&)\s+(?=(?:no|not|never|without|avoid|don['’]?t|do\s+not)\b)|\s+or\s+/i));
    for (const piece of pieces) {
      const term = normalizeTerm(piece);
      if (!term || seen.has(term)) continue;
      if (conflicts.some((c) => c.test(term))) continue;
      seen.add(term);
      terms.push(term);
    }
  }
  let out = '';
  for (const term of terms) {
    const next = out ? `${out}, ${term}` : term;
    if (next.length > MAX_NEGATIVE_PROMPT_CHARS) {
      // A single pasted paragraph longer than the cap is cut on a word instead of vanishing.
      if (!out) out = term.slice(0, MAX_NEGATIVE_PROMPT_CHARS).replace(/\s+\S*$/, '');
      break;
    }
    out = next;
  }
  return out;
}

// ── Dialogue language ────────────────────────────────────────────────────────────────────────────────────

const SCRIPTS: ReadonlyArray<{ rx: RegExp; lang: string }> = [
  { rx: /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/, lang: 'ka' },
  { rx: /[԰-֏]/, lang: 'hy' },
  { rx: /[Ѐ-ӿ]/, lang: 'cyrillic' },
  { rx: /[Ͱ-Ͽ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]/, lang: 'non-latin' },
];

const LANGUAGE_NAMES: Record<string, { en: string; ka: string }> = {
  ka: { en: 'Georgian', ka: 'ქართული' },
  hy: { en: 'Armenian', ka: 'სომხური' },
  ru: { en: 'Russian', ka: 'რუსული' },
  uk: { en: 'Ukrainian', ka: 'უკრაინული' },
  az: { en: 'Azerbaijani', ka: 'აზერბაიჯანული' },
  tr: { en: 'Turkish', ka: 'თურქული' },
  de: { en: 'German', ka: 'გერმანული' },
  fr: { en: 'French', ka: 'ფრანგული' },
  es: { en: 'Spanish', ka: 'ესპანური' },
  it: { en: 'Italian', ka: 'იტალიური' },
  cyrillic: { en: 'Cyrillic script', ka: 'კირილიცა' },
  'non-latin': { en: 'a non-Latin script', ka: 'არალათინური დამწერლობა' },
};

/**
 * 'en', or the language a line is in: a non-English BCP-47 tag first, else the script. A non-Latin script
 * outranks an 'en' tag (the tag is then simply wrong); an untagged Latin-script line is taken as English.
 */
function lineLanguage(d: DialogueLine): string {
  const tag = clean(d.language).toLowerCase().split(/[-_]/)[0] ?? '';
  if (tag && tag !== 'en' && tag !== 'und') return tag;
  return SCRIPTS.find((s) => s.rx.test(d.line))?.lang ?? 'en';
}

/**
 * Veo's native speech is evaluated for English only. A non-English line still renders, but may come out
 * accented, garbled or in English — the UI says so before the user pays. null when every line is English.
 */
export function dialogueLanguageWarning(
  lines: readonly DialogueLine[] | null | undefined,
  locale: 'en' | 'ka' = 'en',
): string | null {
  let count = 0;
  const langs: string[] = [];
  for (const d of lines ?? []) {
    if (!d || !clean(d.line)) continue;
    const lang = lineLanguage(d);
    if (lang === 'en') continue;
    count += 1;
    if (!langs.includes(lang)) langs.push(lang);
  }
  if (count === 0) return null;
  const names = langs.map((l) => LANGUAGE_NAMES[l]?.[locale] ?? l).join(', ');
  if (locale === 'ka') {
    return `Veo-ს ჩაშენებული მეტყველება მხოლოდ ინგლისურზეა შეფასებული. ${count} რეპლიკა (${names}) შეიძლება ` +
      'აქცენტით ან დამახინჯებულად გაჟღერდეს — ასეთი რეპლიკებისთვის სჯობს ცალკე გახმოვანება.';
  }
  const subject = count === 1 ? 'One dialogue line is' : `${count} dialogue lines are`;
  return `Veo's native speech is evaluated for English only. ${subject} in ${names} and may come out accented ` +
    `or garbled — consider a separate voice-over for ${count === 1 ? 'it' : 'them'}.`;
}
