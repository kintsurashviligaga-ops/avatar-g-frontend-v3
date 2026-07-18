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

export function parseVideoEditCommand(text: string): VideoEditCommand | null {
  // Cap the input: a real command is short, and this keeps the few multi-word `.{0,40}` patterns strictly linear even
  // if someone pastes a pathologically long string into the (local, unbilled) editor box.
  const lc = (typeof text === 'string' ? text : '').slice(0, 2000).toLowerCase();
  if (!lc.trim()) return null;
  const cmd: VideoEditCommand = {};
  const grade: VideoGrade = {};
  const strong = has(lc, /\b(?:much|very|really|way|a lot|strong)\b|ძალიან|очень|сильно|намного|гораздо/);

  // ── timeline ops (single: first match wins) ──────────────────────────────────
  if (has(lc, /\b(?:split|cut|trim|slice)\b|გაჭერ|გაჭრ|ამოჭერ|разрежь|разрез|нарежь|обрежь/)) cmd.op = 'split';
  else if (has(lc, /\b(?:mute|silence)\b|დაადუმ|დადუმ|გააჩუმ|заглуши|без звука|приглуши/)) cmd.op = 'mute';
  else if (has(lc, /\b(?:reset|revert|undo all|start over)\b|გადატვირთ|თავიდან|საწყის|сброс|сброси|заново/)) cmd.op = 'reset';

  // ── brightness ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:brighter|brighten|lighter|lighten)\b|გაანათ|განათ|ნათელ|ярче|светл/)) grade.brightness = strong ? 165 : 135;
  else if (has(lc, /\b(?:darker|darken|dim)\b|დააბნელ|ბნელ|темнее|затемни|потемн/)) grade.brightness = strong ? 45 : 70;

  // ── contrast ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:more contrast|add contrast|contrasty|punchier)\b|კონტრასტ.{0,40}(?:მეტ|გაზ|დაამ)|(?:მეტ|გაზ|დაამ).{0,40}კონტრასტ|больше контраст|добавь контраст|контрастн/)) grade.contrast = strong ? 150 : 130;
  else if (has(lc, /\b(?:less contrast|flatter|flat)\b|ნაკლებ.{0,40}კონტრასტ|меньше контраст/)) grade.contrast = 75;

  // ── saturation ───────────────────────────────────────────────────────────────
  if (has(lc, /\b(?:desaturate|black and white|b&w|grayscale|greyscale|monochrome|mono)\b|შავ-?თეთრ|ნაცრისფერ|черно-?бел|чб|обесцвет/)) grade.saturation = 0;
  else if (has(lc, /\b(?:saturate|more colou?r|colou?rful|vivid|vibrant|pop|colou?rize)\b|გააფერად|ფერად|ფერებ|насыщен|ярче цвет|сочн/)) grade.saturation = strong ? 175 : 150;
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
  else if (has(lc, /\b(?:slower|slow down|slow it down|slo-?mo|slow motion)\b|ნელ|შეანელ|დაანელ|медленнее|замедл/)) cmd.speed = 0.5;

  // ── fade ───────────────────────────────────────────────────────────────
  const fadeIn = has(lc, /\bfade in\b|შემოსვლ.{0,40}მილევ|მილევ.{0,40}შემო|плавн.{0,40}появлен|появлен.{0,40}затухан/);
  const fadeOut = has(lc, /\bfade out\b|გასვლ.{0,40}მილევ|მილევ.{0,40}გას|плавн.{0,40}исчезн|затухан.{0,40}кон/);
  const fadeBoth = !fadeIn && !fadeOut && has(lc, /\bfade\b|მილევ|დაამილ|затухан|плавн.{0,40}переход/);
  if (fadeIn || fadeBoth) (cmd.fade ??= {}).inSec = 1;
  if (fadeOut || fadeBoth) (cmd.fade ??= {}).outSec = 1;

  return (cmd.op || cmd.speed !== undefined || cmd.grade || cmd.fade) ? cmd : null;
}
