/**
 * videoEditCommands — parse a natural-language editing command (ka / en / ru) into local Surgical-Editor mutations.
 *
 * The in-editor "Agent G — command by text" box for the VIDEO lane used to understand only split + mute. This lets a
 * typed/spoken command actually drive the SAME grade / speed / fade / timeline controls a user could set by hand
 * ("gaanatle" → brighten, "დაამატე კონტრასტი" → more contrast, "speed up", "fade in", "split", "mute", "reset").
 *
 * Pure + deterministic (unit-tested); no DOM, no network. Grade values are ABSOLUTE targets on the editor's scales:
 * saturation/contrast/brightness 0–200 (100 = neutral), temperature −100…100 (0 = neutral). Returns null when nothing
 * is recognised so the caller can surface a "didn't catch that" hint.
 */

export interface VideoGrade { saturation?: number; contrast?: number; brightness?: number; temperature?: number }
export interface VideoEditCommand {
  op?: 'split' | 'mute' | 'reset';
  speed?: number;
  grade?: VideoGrade;
  fade?: { inSec?: number; outSec?: number };
}

const has = (lc: string, re: RegExp) => re.test(lc);

// This slider parser cannot represent prohibitions or their scope. Reject the whole command, including mixed
// positive/negative clauses, so a forbidden edit never becomes an affirmative mutation. Unicode boundaries matter:
// ASCII \b does not delimit Georgian/Cyrillic words (and bare "не" would also match "медленнее").
const NEGATION = /(?:^|[^\p{L}\p{N}_])(?:not|no|never|don['’]?t|without|არ|არა|აღარ|ნუ|ვერ|не|нет|нельзя|никогда)(?=$|[^\p{L}\p{N}_])/u;
// Trim/crop need a range/aspect contract, not split-at-playhead. Reject unsupported compound requests atomically.
const UNSUPPORTED_EDIT = /\b(?:trim|crop|aspect|portrait|landscape)\b|ამოჭერ|ამოჭრ|მოაჭერ|მოაჭრ|მოჭერ|მოჭრ|შეამოკლ|обреж|обрез|кадрир|\d\s*:\s*\d/u;
const TIME_PARAMETER = /(?:\d+(?:\.\d+)?|ერთი|ორი|სამი|ოთხი|ხუთი|ექვსი|შვიდი|რვა)\s*(?:წამ|წუთ|sec|second|сек|мин)|\b\d+(?:\.\d+)?\s*s\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:seconds?|minutes?)\b/u;

export function parseVideoEditCommand(text: string): VideoEditCommand | null {
  // Never execute a truncated prefix: a prohibition could occur beyond the cap. Reject before lowercasing/scanning.
  if (typeof text !== 'string' || text.length > 2000) return null;
  const lc = text.toLowerCase();
  if (!lc.trim()) return null;
  if (has(lc, NEGATION) || has(lc, UNSUPPORTED_EDIT) || has(lc, TIME_PARAMETER)) return null;
  const cmd: VideoEditCommand = {};
  const grade: VideoGrade = {};
  const strong = has(lc, /\b(?:much|very|really|way|a lot|strong)\b|ძალიან|очень|сильно|намного|гораздо/);

  // Only one timeline op fits this return type; never silently drop a second requested mutation.
  const split = has(lc, /\b(?:split|cut|slice)\b|გაჭერ|გაჭრ|разрежь|разрез|нарежь/);
  const mute = has(lc, /\b(?:mute|silence)\b|დაადუმ|დადუმ|გააჩუმ|заглуши|без звука|приглуши/);
  const reset = has(lc, /\b(?:reset|revert|undo all|start over)\b|გადატვირთ|თავიდან\s+დაიწყ|დაიწყ\p{L}*\s+თავიდან|საწყის\p{L}*\s+(?:მდგომარეობ|დააბრუნ)|сброс|сброси|заново/u);
  if (Number(split) + Number(mute) + Number(reset) > 1) return null;
  if (split) cmd.op = 'split';
  else if (mute) cmd.op = 'mute';
  else if (reset) cmd.op = 'reset';

  // ── brightness ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:brighter|brighten|lighter|lighten)\b|გაანათ|განათ|ნათელ|ярче|светл/)) grade.brightness = strong ? 165 : 135;
  else if (has(lc, /\b(?:darker|darken|dim)\b|დააბნელ|ბნელ|темнее|затемни|потемн/)) grade.brightness = strong ? 45 : 70;

  // ── contrast ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:more contrast|add contrast|contrasty|punchier)\b|კონტრასტ.{0,40}(?:მეტ|გაზ|დაამ)|(?:მეტ|გაზ|დაამ).{0,40}კონტრასტ|больше контраст|добавь контраст|контрастн/)) grade.contrast = strong ? 150 : 130;
  else if (has(lc, /\b(?:less contrast|flatter|flat)\b|ნაკლებ.{0,40}კონტრასტ|меньше контраст/)) grade.contrast = 75;

  // ── saturation ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:desaturate|black and white|b&w|grayscale|greyscale|monochrome|mono)\b|შავ-?თეთრ|ნაცრისფერ|черно-?бел|чб|обесцвет/)) grade.saturation = 0;
  else if (has(lc, /\b(?:saturate|more colou?r|colou?rful|vivid|vibrant|pop|colou?rize)\b|გააფერად|ფერად|насыщен|ярче цвет|сочн/)) grade.saturation = strong ? 175 : 150;
  else if (has(lc, /\b(?:less colou?r|muted colou?rs?|pastel)\b|ნაკლებ.{0,40}ფერ|приглуши цвет/)) grade.saturation = 60;

  // ── temperature ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:warmer|warm|golden)\b|თბილ|теплее|тёпл|тепл/)) grade.temperature = strong ? 70 : 45;
  else if (has(lc, /\b(?:cooler|colder|cold|bluer)\b|ცივ|прохладн|холодн|синее/)) grade.temperature = strong ? -70 : -45;

  if (Object.keys(grade).length) cmd.grade = grade;

  // ── speed ───────────────────────────────────────────────────────────────
  if (has(lc, /\bnormal speed\b|ჩვეულებრივ.{0,40}სიჩქარ|обычн.{0,40}скорост/)) cmd.speed = 1;
  else if (has(lc, /\b2x\b|\b(?:double|twice)\b|ორმაგ/)) cmd.speed = 2;
  else if (has(lc, /\b(?:faster|speed up|speed it up|quicker|accelerate)\b|სწრაფ|აჩქარ|დააჩქარ|быстрее|ускор/)) cmd.speed = strong ? 2 : 1.5;
  else if (has(lc, /\b0\.5x\b|\bhalf speed\b|ნახევარ.{0,40}სიჩქარ/)) cmd.speed = 0.5;
  else if (has(lc, /\b(?:slower|slow down|slow it down|slo-?mo|slow motion)\b|(?:^|[^\p{L}])(?:ნელა|ნელი|ნელად|შეანელ\p{L}*|შენელ\p{L}*|დაანელ\p{L}*)(?=$|[^\p{L}])|медленнее|замедл/u)) cmd.speed = 0.5;

  // ── fade ───────────────────────────────────────────────────────────────
  const fadeIn = has(lc, /\bfade in\b|შემოსვლ.{0,40}მილევ|მილევ.{0,40}შემო|плавн.{0,40}появлен|появлен.{0,40}затухан/);
  const fadeOut = has(lc, /\bfade out\b|გასვლ.{0,40}მილევ|მილევ.{0,40}გას|плавн.{0,40}исчезн|затухан.{0,40}кон/);
  const fadeBoth = !fadeIn && !fadeOut && has(lc, /\bfade\b|მილევ|დაამილ|затухан|плавн.{0,40}переход/);
  if (fadeIn || fadeBoth) (cmd.fade ??= {}).inSec = 1;
  if (fadeOut || fadeBoth) (cmd.fade ??= {}).outSec = 1;

  return (cmd.op || cmd.speed !== undefined || cmd.grade || cmd.fade) ? cmd : null;
}
