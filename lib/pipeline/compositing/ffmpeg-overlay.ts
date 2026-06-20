// Master Prompt §7.1 — B2B marketing overlays. Vercel's ffmpeg-static is built WITHOUT
// libfreetype, so the `drawtext` filter does not exist there. Instead we render the overlay
// layer as an SVG→PNG via sharp (which bundles its own librsvg and honours an embedded
// @font-face, so it is identical local↔Vercel), then composite it with ffmpeg's UNIVERSAL
// scale2ref + fade + overlay filters (no external libs). Result: a premium, faded-in
// lower-third / price chip / spec bullets / CTA pill burned over the finished film.
import 'server-only';
import { spawn } from 'child_process';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import { NOTO_SANS_B64 } from './font-data';

export interface MarketingOverlay {
  overlayText?: string;
  priceTag?: string;
  cta?: string;
  website?: string;
  specs?: string[];
}

const ACCENT = '#00D2FF';

/** XML-escape an SVG text value. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .slice(0, 140);
}

/** Approx text width in px for chip sizing (NotoSans averages ~0.54em). */
function textW(s: string, fontPx: number): number {
  return Math.round(s.length * fontPx * 0.56);
}

/** Build the full overlay SVG, scaled to the target video w×h (positions adapt to aspect). */
export function buildOverlaySvg(m: MarketingOverlay, w: number, h: number): string {
  const s = (px: number) => Math.round(px * (h / 1080)); // scale to height
  const els: string[] = [];

  // Lower-third — title + website, bottom-left.
  if (m.overlayText) {
    const y = h - s(154);
    const bw = Math.min(Math.round(w * 0.62), s(40) + textW(m.overlayText, s(44)) + s(40));
    els.push(`<rect x="${s(40)}" y="${y}" width="${bw}" height="${s(100)}" rx="${s(14)}" fill="#000000" fill-opacity="0.58"/>`);
    els.push(`<text x="${s(64)}" y="${y + s(58)}" font-size="${s(44)}" font-family="NotoX" fill="#ffffff">${esc(m.overlayText)}</text>`);
    if (m.website) els.push(`<text x="${s(66)}" y="${y + s(88)}" font-size="${s(22)}" font-family="NotoX" fill="${ACCENT}">${esc(m.website)}</text>`);
  } else if (m.website) {
    els.push(`<text x="${s(48)}" y="${h - s(56)}" font-size="${s(26)}" font-family="NotoX" fill="${ACCENT}">${esc(m.website)}</text>`);
  }

  // Price chip — top-right.
  if (m.priceTag) {
    const cw = s(40) + textW(m.priceTag, s(40));
    const x = w - cw - s(40);
    els.push(`<rect x="${x}" y="${s(40)}" width="${cw}" height="${s(70)}" rx="${s(14)}" fill="${ACCENT}"/>`);
    els.push(`<text x="${x + s(22)}" y="${s(40) + s(48)}" font-size="${s(40)}" font-family="NotoX" fill="#000000">${esc(m.priceTag)}</text>`);
  }

  // Spec bullets — top-left.
  (m.specs ?? []).slice(0, 3).forEach((sp, i) => {
    els.push(`<text x="${s(44)}" y="${s(126) + i * s(50)}" font-size="${s(26)}" font-family="NotoX" fill="#ffffff">•  ${esc(sp)}</text>`);
  });

  // CTA pill — bottom-right.
  if (m.cta) {
    const cw = s(50) + textW(m.cta, s(34));
    const x = w - cw - s(40);
    const y = h - s(112);
    els.push(`<rect x="${x}" y="${y}" width="${cw}" height="${s(62)}" rx="${s(31)}" fill="#ffffff" fill-opacity="0.96"/>`);
    els.push(`<text x="${x + s(26)}" y="${y + s(42)}" font-size="${s(34)}" font-family="NotoX" fill="#000000">${esc(m.cta)}</text>`);
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><style>@font-face{font-family:'NotoX';src:url(data:font/ttf;base64,${NOTO_SANS_B64});}text{font-family:'NotoX';}</style></defs>${els.join('')}</svg>`;
}

/** Render the overlay layer to a transparent PNG (sharp + librsvg), or null if empty. */
export async function renderOverlayPng(m: MarketingOverlay, w: number, h: number): Promise<Buffer | null> {
  if (!m.overlayText && !m.priceTag && !m.cta && !m.website && !(m.specs && m.specs.length)) return null;
  try {
    return await sharp(Buffer.from(buildOverlaySvg(m, w, h))).png().toBuffer();
  } catch {
    return null;
  }
}

export interface OverlayResult {
  ok: boolean;
  error?: string;
}

/** Burn the marketing overlays from `inputPath` into `outputPath`. */
export async function applyMarketingOverlays(
  inputPath: string,
  outputPath: string,
  m: MarketingOverlay,
  width = 1920,
  height = 1080,
): Promise<OverlayResult> {
  const png = await renderOverlayPng(m, width, height);
  if (!png) return { ok: false, error: 'no overlay content supplied' };
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return { ok: false, error: 'ffmpeg-static binary missing' };

  const dir = await mkdtemp(join(tmpdir(), 'ovl-'));
  const pngPath = join(dir, 'overlay.png');
  await writeFile(pngPath, png);
  try {
    return await new Promise<OverlayResult>((resolve) => {
      // Scale the overlay PNG to the real video size, then composite. scale2ref + overlay
      // are core ffmpeg filters (no libfreetype) so this runs on Vercel's ffmpeg-static.
      const filter =
        '[1:v][0:v]scale2ref=w=iw:h=ih[ov0][vid];' +
        '[vid][ov0]overlay=0:0:format=auto[vout]';
      const args = [
        '-y',
        '-i', inputPath,
        '-i', pngPath,
        '-filter_complex', filter,
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
