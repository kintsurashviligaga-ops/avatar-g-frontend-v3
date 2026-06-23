// Master Prompt §7.1 — B2B marketing overlays. Vercel's ffmpeg-static is built WITHOUT
// libfreetype, so the `drawtext` filter does not exist there. Instead we render the overlay
// layer as an SVG→PNG via sharp (which bundles its own librsvg and honours an embedded
// @font-face, so it is identical local↔Vercel), then composite it with ffmpeg's UNIVERSAL
// scale2ref + fade + overlay filters (no external libs). Result: a premium, faded-in
// lower-third / price chip / spec bullets / CTA pill burned over the finished film.
import 'server-only';
import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { Resvg } from '@resvg/resvg-js';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { NOTO_SANS_B64 } from './font-data';
import { FIRAGO_REGULAR_B64, FIRAGO_MEDIUM_B64 } from './font-data-firago';

// Fonts passed to resvg EXPLICITLY as buffers — Vercel's librsvg ignores @font-face data
// URIs (renders tofu), but resvg honours explicit font buffers identically everywhere.
// CRITICAL: loadSystemFonts is false, so a script only renders if its font is bundled.
// FiraGO (Latin + Cyrillic + Georgian, geometric-humanist) is the cinematic caption family
// for en / ru / ka; the legacy Latin Noto Sans stays as a final fallback so nothing regresses.
const FONTS: Array<{ file: string; b64: string }> = [
  { file: 'overlay-firago-regular.ttf', b64: FIRAGO_REGULAR_B64 },
  { file: 'overlay-firago-medium.ttf', b64: FIRAGO_MEDIUM_B64 },
  { file: 'overlay-noto-sans.ttf', b64: NOTO_SANS_B64 },
];
// FiraGO Regular registers as family "FiraGO"; the Medium weight as "FiraGO Medium".
const FONT_TITLE = 'FiraGO Medium'; // headings / lower-third title / chips
const FONT_BODY = 'FiraGO';         // sub-lines / spec bullets

let cachedFontFiles: string[] | null = null;
/** Materialize the embedded fonts to /tmp once → return their paths for resvg's fontFiles. */
function overlayFontFiles(): string[] {
  if (cachedFontFiles && cachedFontFiles.every((p) => existsSync(p))) return cachedFontFiles;
  cachedFontFiles = FONTS.map(({ file, b64 }) => {
    const p = join(tmpdir(), file);
    if (!existsSync(p)) writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  });
  return cachedFontFiles;
}

export interface MarketingOverlay {
  overlayText?: string;
  priceTag?: string;
  cta?: string;
  website?: string;
  specs?: string[];
  /** Caption language → drives font shaping + casing. Auto-detected from the text
   *  (Georgian Unicode range) when omitted; set explicitly to force a script. */
  lang?: 'ka' | 'en' | 'ru';
}

const ACCENT = '#00D2FF';

/** Georgian Unicode ranges: Mkhedruli + Asomtavruli + Mtavruli + Nuskhuri. */
const GEORGIAN_RE = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
function hasGeorgian(...parts: Array<string | undefined>): boolean {
  return parts.some((p) => !!p && GEORGIAN_RE.test(p));
}

/** XML-escape an SVG text value (generous cap — Georgian copy runs longer than Latin). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .slice(0, 200);
}

/** Approx rendered text width in px for chip/scrim sizing. Georgian glyphs and tracked
 *  (letter-spaced) uppercase Latin both advance wider than plain Latin, so account for both. */
function textW(str: string, fontPx: number, opts?: { ka?: boolean; tracked?: boolean }): number {
  const adv = opts?.ka ? 0.62 : opts?.tracked ? 0.64 : 0.56;
  const tracking = opts?.tracked ? fontPx * 0.12 * Math.max(0, str.length - 1) : 0;
  return Math.round(str.length * fontPx * adv + tracking);
}

/** A line of caption text with a soft offset drop-shadow for legibility over ANY footage.
 *  Implemented as a duplicated dark copy (not feDropShadow) so it renders identically across
 *  resvg builds — the renderer fails open, so a portable technique avoids silent caption loss.
 *  `content` must already be esc()'d. */
function cinematicText(o: {
  x: number; y: number; size: number; family: string; fill: string; ls: number; lang: string; content: string;
}): string {
  const d = Math.max(1, Math.round(o.size * 0.05));
  const common = `font-size="${o.size}" font-family="${o.family}" letter-spacing="${o.ls}" xml:lang="${o.lang}"`;
  return (
    `<text x="${o.x + d}" y="${o.y + d}" ${common} fill="#000000" fill-opacity="0.55">${o.content}</text>` +
    `<text x="${o.x}" y="${o.y}" ${common} fill="${o.fill}">${o.content}</text>`
  );
}

/** Build the full cinematic caption SVG, scaled to the target video w×h.
 *  Language-aware: Georgian copy keeps its native case + FiraGO Georgian shaping; Latin/
 *  Cyrillic copy is set in tracked uppercase for a geometric film-title look. Everything sits
 *  inside an action-safe inset and carries a soft shadow so it lifts off any footage. */
export function buildOverlaySvg(m: MarketingOverlay, w: number, h: number): string {
  // Type scales by the SHORTER edge so captions read consistently on 16:9 and 9:16.
  const base = Math.min(w, h);
  const s = (px: number) => Math.round(px * (base / 1080));
  // Action-safe insets (~5% / 5.5%) so no element crosses the screen safe zone on any aspect.
  const safeX = Math.round(w * 0.05);
  const safeY = Math.round(h * 0.055);

  const ka = m.lang ? m.lang === 'ka' : hasGeorgian(m.overlayText, m.cta, m.website, ...(m.specs ?? []));
  const lang = ka ? 'ka' : m.lang === 'ru' ? 'ru' : 'en';
  // Latin/Cyrillic → tracked uppercase (geometric, cinematic). Georgian has no uppercase
  // mapping in this face → keep native case and a gentler track.
  const cased = (t: string) => (ka ? t : t.toUpperCase());
  const titleLS = ka ? s(1) : s(3);

  // Height the lower-third reserves (shared so the CTA can sit clear above it).
  const ltBlockH = m.overlayText ? (m.website ? s(96) : s(70)) : 0;

  const els: string[] = [];

  // ── defs: accent gradient + left→right scrim ───────────────────────────────
  els.push(
    `<defs>` +
      `<linearGradient id="ltAccent" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="#0077B6"/>` +
      `</linearGradient>` +
      `<linearGradient id="ltScrim" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="#05070D" stop-opacity="0.72"/>` +
        `<stop offset="1" stop-color="#05070D" stop-opacity="0"/>` +
      `</linearGradient>` +
    `</defs>`,
  );

  // ── Lower-third — accent bar + title + website, bottom-left, inside the safe zone ──
  if (m.overlayText) {
    const title = cased(m.overlayText);
    const titleSize = s(46);
    const subSize = s(23);
    const barW = s(6);
    const gap = s(20);
    const textX = safeX + barW + gap;
    const blockTop = h - safeY - ltBlockH;
    const scrimW = Math.min(
      Math.round(w * 0.7),
      textX + Math.max(textW(title, titleSize, { ka, tracked: !ka }), m.website ? textW(m.website, subSize) : 0) + s(48),
    );
    els.push(`<rect x="0" y="${blockTop - s(18)}" width="${scrimW}" height="${ltBlockH + s(36)}" fill="url(#ltScrim)"/>`);
    els.push(`<rect x="${safeX}" y="${blockTop}" width="${barW}" height="${ltBlockH}" rx="${Math.round(barW / 2)}" fill="url(#ltAccent)"/>`);
    const titleBaseline = blockTop + titleSize;
    els.push(cinematicText({ x: textX, y: titleBaseline, size: titleSize, family: FONT_TITLE, fill: '#ffffff', ls: titleLS, lang, content: esc(title) }));
    if (m.website) {
      els.push(cinematicText({ x: textX, y: titleBaseline + s(34), size: subSize, family: FONT_BODY, fill: ACCENT, ls: s(1), lang: 'en', content: esc(m.website) }));
    }
  } else if (m.website) {
    els.push(cinematicText({ x: safeX, y: h - safeY, size: s(26), family: FONT_BODY, fill: ACCENT, ls: s(1), lang: 'en', content: esc(m.website) }));
  }

  // ── Price chip — top-right, inside the safe zone ───────────────────────────
  if (m.priceTag) {
    const priceSize = s(40);
    const label = cased(m.priceTag);
    const cw = s(40) + textW(label, priceSize, { ka, tracked: !ka });
    const x = w - safeX - cw;
    els.push(`<rect x="${x}" y="${safeY}" width="${cw}" height="${s(70)}" rx="${s(16)}" fill="url(#ltAccent)"/>`);
    els.push(`<text x="${x + s(22)}" y="${safeY + s(48)}" font-size="${priceSize}" font-family="${FONT_TITLE}" letter-spacing="${titleLS}" fill="#04121C" xml:lang="${lang}">${esc(label)}</text>`);
  }

  // ── Spec bullets — top-left, inside the safe zone ──────────────────────────
  (m.specs ?? []).slice(0, 3).forEach((sp, i) => {
    els.push(cinematicText({ x: safeX, y: safeY + s(40) + i * s(50), size: s(26), family: FONT_BODY, fill: '#ffffff', ls: 0, lang, content: `•  ${esc(sp)}` }));
  });

  // ── CTA pill — centred, lifted clear ABOVE the lower-third (any aspect) ─────
  if (m.cta) {
    const ctaSize = s(34);
    const label = cased(m.cta);
    const cw = s(54) + textW(label, ctaSize, { ka, tracked: !ka });
    const x = Math.round((w - cw) / 2);
    const y = h - safeY - ltBlockH - s(36) - s(62);
    els.push(`<rect x="${x}" y="${y}" width="${cw}" height="${s(62)}" rx="${s(31)}" fill="#ffffff" fill-opacity="0.96"/>`);
    els.push(`<text x="${x + s(27)}" y="${y + s(42)}" font-size="${ctaSize}" font-family="${FONT_TITLE}" letter-spacing="${titleLS}" fill="#04121C" xml:lang="${lang}">${esc(label)}</text>`);
  }

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:lang="${lang}" xmlns="http://www.w3.org/2000/svg">${els.join('')}</svg>`;
}

/** Render the overlay layer to a transparent PNG (sharp + librsvg), or null if empty. */
export async function renderOverlayPng(m: MarketingOverlay, w: number, h: number): Promise<Buffer | null> {
  if (!m.overlayText && !m.priceTag && !m.cta && !m.website && !(m.specs && m.specs.length)) return null;
  try {
    const resvg = new Resvg(buildOverlaySvg(m, w, h), {
      font: { fontFiles: overlayFontFiles(), loadSystemFonts: false, defaultFontFamily: 'FiraGO' },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}

// ── MTV-style music info bug (v330) ────────────────────────────────────────
// A stylized lower-left "now playing" card baked over the first few seconds of a
// music video, inspired by classic music-network on-screen graphics. Composited with
// a timed opacity fade in/out by the filtergraph (see buildFilterComplex hasMusicBug).
export interface MusicBug {
  artist?: string;   // Selected avatar / cloned-voice character
  track?: string;    // Generation title / user theme
  theme?: string;    // Contextual theme/genre (e.g. "Tbilisi City Nights" / "სიყვარულზე")
  producer?: string; // Production identity, defaults to "MyAvatar.ge Originals"
  lang?: 'ka' | 'en' | 'ru';
}

export function hasMusicBugContent(m: MusicBug): boolean {
  return Boolean(m.artist || m.track || m.theme);
}

/** Build the MTV-style music info-bug SVG (lower-left), language-aware like the lower-third. */
export function buildMusicBugSvg(m: MusicBug, w: number, h: number): string {
  const base = Math.min(w, h);
  const s = (px: number) => Math.round(px * (base / 1080));
  const safeX = Math.round(w * 0.05);
  const safeY = Math.round(h * 0.055);
  const ka = m.lang ? m.lang === 'ka' : hasGeorgian(m.artist, m.track, m.theme);
  const lang = ka ? 'ka' : m.lang === 'ru' ? 'ru' : 'en';
  const cap = (t: string) => (ka ? t : t.toUpperCase());

  // Stack: TRACK (big) · Artist (accent) · Theme (muted) · producer tag.
  const rows: Array<{ size: number; family: string; fill: string; ls: number; text: string; lang: string }> = [];
  if (m.track) rows.push({ size: s(34), family: FONT_TITLE, fill: '#ffffff', ls: ka ? s(1) : s(2), text: cap(m.track), lang });
  if (m.artist) rows.push({ size: s(24), family: FONT_BODY, fill: ACCENT, ls: s(1), text: m.artist, lang });
  if (m.theme) rows.push({ size: s(21), family: FONT_BODY, fill: '#d7e3ec', ls: ka ? 0 : s(1), text: m.theme, lang });
  rows.push({ size: s(16), family: FONT_TITLE, fill: ACCENT, ls: s(2), text: (m.producer || 'MyAvatar.ge Originals').toUpperCase(), lang: 'en' });

  const gap = s(14);
  const heights = rows.map((r) => r.size + gap);
  const blockH = heights.reduce((a, b) => a + b, 0);
  const barW = s(5);
  const textX = safeX + barW + s(16);
  const top = h - safeY - blockH;

  const els: string[] = [];
  els.push(
    `<defs>` +
      `<linearGradient id="bugAccent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="#0077B6"/></linearGradient>` +
      `<linearGradient id="bugScrim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05070D" stop-opacity="0.66"/><stop offset="1" stop-color="#05070D" stop-opacity="0"/></linearGradient>` +
    `</defs>`,
  );
  // soft scrim + accent bar
  els.push(`<rect x="0" y="${top - s(14)}" width="${Math.round(w * 0.62)}" height="${blockH + s(26)}" fill="url(#bugScrim)"/>`);
  els.push(`<rect x="${safeX}" y="${top}" width="${barW}" height="${blockH - gap}" rx="${Math.round(barW / 2)}" fill="url(#bugAccent)"/>`);
  let y = top;
  for (const r of rows) {
    y += r.size;
    els.push(cinematicText({ x: textX, y, size: r.size, family: r.family, fill: r.fill, ls: r.ls, lang: r.lang, content: esc(r.text) }));
    y += gap;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:lang="${lang}" xmlns="http://www.w3.org/2000/svg">${els.join('')}</svg>`;
}

/** Rasterise the music info bug to a transparent PNG (resvg), or null if empty. */
export async function renderMusicBugPng(m: MusicBug, w: number, h: number): Promise<Buffer | null> {
  if (!hasMusicBugContent(m)) return null;
  try {
    const resvg = new Resvg(buildMusicBugSvg(m, w, h), {
      font: { fontFiles: overlayFontFiles(), loadSystemFonts: false, defaultFontFamily: 'FiraGO' },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}

export interface OverlayResult {
  ok: boolean;
  error?: string;
}

/** Read a video's pixel dimensions from `ffmpeg -i` stderr (no ffprobe in ffmpeg-static). */
function probeDimensions(bin: string, inputPath: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const ff = spawn(bin, ['-hide_banner', '-i', inputPath]); // no output → exits non-zero, prints stream info
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('close', () => {
      const mm = stderr.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
      resolve(mm && mm[1] && mm[2] ? { w: parseInt(mm[1], 10), h: parseInt(mm[2], 10) } : null);
    });
    ff.on('error', () => resolve(null));
  });
}

/** Burn the marketing overlays from `inputPath` into `outputPath`. */
export async function applyMarketingOverlays(
  inputPath: string,
  outputPath: string,
  m: MarketingOverlay,
  width = 1920,
  height = 1080,
): Promise<OverlayResult> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return { ok: false, error: 'ffmpeg-static binary missing' };

  // Render the overlay PNG at the ACTUAL video size (probed) so a plain overlay aligns
  // pixel-perfectly — this avoids scale2ref, which drops the video stream on some
  // ffmpeg-static (Linux) builds while working on others (Mac).
  const dims = (await probeDimensions(bin, inputPath)) ?? { w: width, h: height };
  const png = await renderOverlayPng(m, dims.w, dims.h);
  if (!png) return { ok: false, error: 'no overlay content supplied' };

  const dir = await mkdtemp(join(tmpdir(), 'ovl-'));
  const pngPath = join(dir, 'overlay.png');
  await writeFile(pngPath, png);
  try {
    return await new Promise<OverlayResult>((resolve) => {
      // Plain overlay — the most universal ffmpeg filter, present in every build.
      const args = [
        '-y',
        '-i', inputPath,
        '-i', pngPath,
        '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto[vout]',
        '-map', '[vout]',
        '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ];
      const ff = spawn(bin, args);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d.toString(); });
      ff.on('close', (code) => resolve({ ok: code === 0, error: code === 0 ? undefined : stderr.slice(-600) }));
      ff.on('error', (e) => resolve({ ok: false, error: `spawn: ${e.message}` }));
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** True when the overlay has at least one field worth drawing. */
export function hasOverlayContent(m: MarketingOverlay): boolean {
  return Boolean(m.overlayText || m.priceTag || m.cta || m.website || (m.specs && m.specs.length));
}

/**
 * Download a finished film master, burn the marketing overlays in, re-host to Supabase, and
 * return the new URL. FAIL-OPEN: any miss → null and the caller keeps the original master.
 * Overlays can only ever improve a B2B film, never break it.
 */
export async function overlayMasterUrl(videoUrl: string, m: MarketingOverlay): Promise<string | null> {
  if (!videoUrl || !hasOverlayContent(m)) return null;
  const dir = await mkdtemp(join(tmpdir(), 'master-ovl-'));
  const inPath = join(dir, 'master.mp4');
  const outPath = join(dir, 'master-overlaid.mp4');
  try {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    await writeFile(inPath, Buffer.from(await r.arrayBuffer()));
    const res = await applyMarketingOverlays(inPath, outPath, m); // probes the master's real dims
    if (!res.ok) return null;
    const out = await readFile(outPath);
    const path = `films/overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('uploads', path, out.toString('base64'), 'video/mp4', 604_800)) ?? null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
