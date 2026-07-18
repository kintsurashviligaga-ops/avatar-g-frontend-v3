/**
 * photoEditSliders — parse a natural-language colour-grade command (ka / en / ru) into Surgical-Editor PHOTO-lane
 * slider mutations. The in-editor Agent G box for the PHOTO lane understood only the AI actions (remove_bg / upscale
 * / colorize / face_restore); this lets a typed/spoken command drive the SAME brightness / contrast / saturation /
 * temperature sliders a user could set by hand ("brighten", "more contrast", "შავ-თეთრი" → grayscale, "warmer",
 * "brightness 150%"). Pure + deterministic (unit-tested); no DOM.
 *
 * Values are ABSOLUTE on the editor's Grade scales: brightness / contrast / saturation 0–200 (100 = neutral),
 * temperature −100…100 (0 = neutral). An explicit "N%" adjacent to a parameter keyword sets that value directly;
 * otherwise a standard increment is applied. Returns null when nothing is recognised.
 */

export interface PhotoSliderCommand {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
}

const has = (lc: string, re: RegExp) => re.test(lc);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** An explicit numeric value sitting next to a parameter keyword (either order), e.g. "brightness 150%". */
const near = (lc: string, kw: string): number | null => {
  // separator excludes +/- so a signed value ("temperature -30") keeps its sign for the capture group
  const m = lc.match(new RegExp(`(?:${kw})[^\\d+-]{0,12}([+-]?\\d{1,3})|([+-]?\\d{1,3})\\s?%?\\s?(?:${kw})`, 'i'));
  const raw = m ? (m[1] ?? m[2]) : null;
  return raw != null ? parseInt(raw, 10) : null;
};

export function parsePhotoEditSliders(text: string): PhotoSliderCommand | null {
  const lc = (typeof text === 'string' ? text : '').slice(0, 2000).toLowerCase();
  if (!lc.trim()) return null;
  const cmd: PhotoSliderCommand = {};
  const strong = has(lc, /\b(?:much|very|a lot|way)\b|ძალიან|очень|сильно|гораздо|намного/);

  // ── brightness (0–200) ────────────────────────────────────────────────────────────────
  const bKw = 'brightness|სიკაშკაშ|яркост';
  if (has(lc, new RegExp(bKw, 'i')) && near(lc, bKw) != null) cmd.brightness = clamp(near(lc, bKw)!, 0, 200);
  else if (has(lc, /\b(?:brighten|brighter|lighter|lighten)\b|გააღიავ|გაანათ|განათ|ნათელ|ярче|светл/)) cmd.brightness = strong ? 160 : 130;
  else if (has(lc, /\b(?:darken|darker|dim)\b|დააბნელ|ბნელ|დაამუქ|темнее|затемни|потемн/)) cmd.brightness = strong ? 45 : 70;

  // ── contrast (0–200) ────────────────────────────────────────────────────────────────
  const cKw = 'contrast|კონტრასტ|контраст';
  if (has(lc, new RegExp(cKw, 'i')) && near(lc, cKw) != null) cmd.contrast = clamp(near(lc, cKw)!, 0, 200);
  else if (has(lc, /\b(?:more contrast|add contrast|contrasty|punchier)\b|კონტრასტ.{0,10}(?:მოუმატ|გაზ|დაუმ)|(?:მოუმატ|გაზ).{0,10}კონტრასტ|контрастнее|больше контраст/)) cmd.contrast = strong ? 150 : 130;
  else if (has(lc, /\b(?:less contrast|flatter|flat)\b|კონტრასტ.{0,10}(?:დაუწ|ნაკლ|შეამც)|меньше контраст/)) cmd.contrast = 75;

  // ── saturation (0–200) — NOTE colorize/გააფერად is an AI action (photoActions), handled BEFORE this parser ──
  const sKw = 'saturation|გაჯერ';
  if (has(lc, /\b(?:black and white|b&w|grayscale|greyscale|monochrome|desaturate)\b|შავ-?თეთრ|ნაცრისფერ|черно-?бел|\bчб\b|обесцвет/)) cmd.saturation = 0;
  else if (has(lc, new RegExp(sKw, 'i')) && near(lc, sKw) != null) cmd.saturation = clamp(near(lc, sKw)!, 0, 200);
  else if (has(lc, /\b(?:saturate|more colou?rs?|vivid|vibrant|colou?rful|pop)\b|ფერ.{0,10}(?:მოუმატ|გაზ)|(?:მოუმატ).{0,10}ფერ|насыщеннее|ярче цвет|сочнее/)) cmd.saturation = strong ? 175 : 150;
  else if (has(lc, /\b(?:less colou?r|muted colou?rs?|pastel)\b|ფერ.{0,10}(?:დაუწ|ნაკლ)|приглуши цвет/)) cmd.saturation = 60;

  // ── temperature (−100…100) ────────────────────────────────────────────────────────────────
  const tKw = 'temperature|ტემპერატ|температур';
  if (has(lc, new RegExp(tKw, 'i')) && near(lc, tKw) != null) cmd.temperature = clamp(near(lc, tKw)!, -100, 100);
  else if (has(lc, /\b(?:warmer|warm|golden)\b|გაათბ|თბილ|теплее|тёпл|тепл/)) cmd.temperature = strong ? 70 : 45;
  else if (has(lc, /\b(?:cooler|colder|cold|bluer)\b|გააცив|ცივ|холоднее|прохладн|синее/)) cmd.temperature = strong ? -70 : -45;

  return (cmd.brightness !== undefined || cmd.contrast !== undefined || cmd.saturation !== undefined || cmd.temperature !== undefined) ? cmd : null;
}
