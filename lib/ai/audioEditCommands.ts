/**
 * audioEditCommands — parse a natural-language audio command (ka / en / ru) into local Surgical-Editor AUDIO-lane
 * slider mutations. The in-editor Agent G box for the AUDIO lane previously only understood the Demucs actions
 * (isolate / splitter); this lets a typed/spoken command drive the SAME pitch / speed / fade / volume sliders a user
 * could set by hand ("fade in 2s", "მუსიკა ჩაუწიე -12dB-მდე" → duck the volume, "დაადუმე" → mute, "faster").
 *
 * Pure + deterministic (unit-tested); no DOM, no network. Targets are ABSOLUTE values on the editor's scales:
 * pitch −12…12 st (0 = none), speed 0.5…2× (1 = none), fade in/out 0…5 s, volume 0…2 (1 = 0 dB / 100%). A dB value
 * is converted linearly (10^(dB/20)) and clamped to [0, 2]. Returns null when nothing is recognised.
 */

export interface AudioEditCommand {
  pitch?: number;
  speed?: number;
  fade?: { inSec?: number; outSec?: number };
  volume?: number;
}

const has = (lc: string, re: RegExp) => re.test(lc);
const clampVol = (v: number) => Math.max(0, Math.min(2, v));
const dbToLinear = (db: number) => clampVol(Math.pow(10, db / 20));

export function parseAudioEditCommand(text: string): AudioEditCommand | null {
  const lc = (typeof text === 'string' ? text : '').slice(0, 2000).toLowerCase();
  if (!lc.trim()) return null;
  const cmd: AudioEditCommand = {};
  const strong = has(lc, /\b(?:much|very|a lot|way)\b|ძალიან|очень|сильно|гораздо|намного/);

  // ── volume / dB ────────────────────────────────────────────────────────────────
  const db = lc.match(/(-?\d{1,2}(?:\.\d)?)\s?db\b/); // explicit "-12dB", "6 db"
  if (db && db[1]) cmd.volume = dbToLinear(parseFloat(db[1]));
  else if (has(lc, /\bmute\b|silence|დაადუმ|დადუმ|გააჩუმ|заглуши|без звука|тишин/)) cmd.volume = 0;
  else if (has(lc, /\bnormal volume\b|ჩვეულებრივი ხმა|обычн\w* громкост/)) cmd.volume = 1;
  else if (has(lc, /\b(?:duck|attenuate)\b|ჩაუწიე|ჩაწიე.{0,6}ხმა|приглуши/)) cmd.volume = 0.25; // ≈ −12 dB
  else if (has(lc, /\b(?:quieter|softer|lower(?:\s+the)?\s+volume|turn (?:it )?down)\b|ხმა.{0,6}(?:დააწიე|ჩაწიე|დაწიე|შეამცირ)|тише|убав/)) cmd.volume = 0.5;
  else if (has(lc, /\b(?:louder|boost|raise(?:\s+the)?\s+volume|turn (?:it )?up)\b|ხმა.{0,6}(?:აწიე|გაზარდ|მოუმატ)|громче|прибав|усиль/)) cmd.volume = strong ? 2 : 1.6;

  // ── fade ────────────────────────────────────────────────────────────────
  const secNear = (re: RegExp): number | null => { const m = lc.match(re); return m && m[1] ? Math.max(0, Math.min(5, parseFloat(m[1]))) : null; };
  const fadeIn = has(lc, /\bfade[\s-]?in\b|ფეიდ.?ინ|შემოსვლ|появлен/);
  const fadeOut = has(lc, /\bfade[\s-]?out\b|ფეიდ.?აუტ|გასვლ|исчезн/);
  const fadeAny = !fadeIn && !fadeOut && has(lc, /\bfade\b|მილევ|დაამილ|ფეიდ|затухан|плавн/);
  if (fadeIn || fadeAny) (cmd.fade ??= {}).inSec = fadeIn ? (secNear(/fade[\s-]?in[^\d]{0,12}(\d+(?:\.\d)?)/) ?? 2) : 1.5;
  if (fadeOut || fadeAny) (cmd.fade ??= {}).outSec = fadeOut ? (secNear(/fade[\s-]?out[^\d]{0,12}(\d+(?:\.\d)?)/) ?? 2) : 1.5;

  // ── pitch (semitones) ────────────────────────────────────────────────────────────────
  const st = lc.match(/([+-]?\d{1,2})\s?(?:st\b|semitone|ნახევარტონ|полутон)/);
  if (st && st[1]) cmd.pitch = Math.max(-12, Math.min(12, parseInt(st[1], 10)));
  else if (has(lc, /\b(?:pitch up|higher pitch|raise.{0,6}pitch)\b|ტონ.{0,6}(?:აწ|მაღ|გაზარდ)|выше.{0,6}тон|повыси.{0,6}тон/)) cmd.pitch = strong ? 6 : 3;
  else if (has(lc, /\b(?:pitch down|lower pitch|drop.{0,6}pitch)\b|ტონ.{0,6}(?:ჩაწ|დაბ|დაწ)|ниже.{0,6}тон|понизь.{0,6}тон/)) cmd.pitch = strong ? -6 : -3;

  // ── speed ────────────────────────────────────────────────────────────────
  if (has(lc, /\bnormal speed\b|ჩვეულებრივი სიჩქარ|обычн\w* скорост/)) cmd.speed = 1;
  else if (has(lc, /\b(?:faster|speed up|quicker)\b|სწრაფ|აჩქარ|быстрее|ускор/)) cmd.speed = strong ? 2 : 1.5;
  else if (has(lc, /\b(?:slower|slow down|slo-?mo)\b|ნელ|შეანელ|медленнее|замедл/)) cmd.speed = 0.5;

  return (cmd.pitch !== undefined || cmd.speed !== undefined || cmd.fade || cmd.volume !== undefined) ? cmd : null;
}
