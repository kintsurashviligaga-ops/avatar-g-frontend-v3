// Master Prompt §7.1 — B2B marketing overlays via FFmpeg drawtext (the pragmatic, no-
// Chromium alternative to Remotion). Builds an animated overlay layer — sliding lower-third
// (title + website), a price-tag chip, a spec list, and a late CTA pill — as a single
// filter_complex, then burns it over the finished film. All expression/text values are
// SINGLE-QUOTED so commas inside expressions are literal, not filtergraph separators.
import 'server-only';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';

// Bundled at deploy via next.config outputFileTracingIncludes. process.cwd() = project root.
export const OVERLAY_FONT_PATH = join(process.cwd(), 'lib/pipeline/compositing/NotoSans-Regular.ttf');

export interface MarketingOverlay {
  overlayText?: string; // lower-third title
  priceTag?: string; // chip, top-right
  cta?: string; // pill, last 6s
  website?: string; // under the title
  specs?: string[]; // up to 3 bullet lines, top-left
}

const ACCENT = '0x00D2FF'; // brand cyan

/** Escape chars that break a drawtext value. `:` separates options (even inside single
 *  quotes — verified live), so it MUST be backslash-escaped; commas inside single quotes
 *  are already literal. `'` → typographic apostrophe (can't sit inside single quotes). */
function escText(s: string): string {
  return s
    .replace(/\\/g, '')
    .replace(/'/g, '’')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .slice(0, 120);
}

/** 0→1 ease progress over `dur` seconds starting at `start` (kept inside single quotes). */
function prog(start: number, dur = 0.5): string {
  return `min(max((t-${start})/${dur},0),1)`;
}

/**
 * Build the drawtext filter_complex chain, or null if there's nothing to draw.
 * PURE + deterministic → unit/locally testable without spawning ffmpeg.
 */
export function buildOverlayFilter(m: MarketingOverlay, durationSec: number, fontPath: string = OVERLAY_FONT_PATH): string | null {
  const ff = fontPath.replace(/\\/g, '/');
  const parts: string[] = [];

  if (m.overlayText) {
    // Sliding lower-third title (box slides in with the text).
    parts.push(
      `drawtext=fontfile='${ff}':text='${escText(m.overlayText)}':fontsize=46:fontcolor=white:box=1:boxcolor=black@0.58:boxborderw=18:x='48-(1-${prog(0.4)})*560':y=h-160:enable='gte(t,0.4)'`,
    );
  }
  if (m.website) {
    parts.push(
      `drawtext=fontfile='${ff}':text='${escText(m.website)}':fontsize=23:fontcolor=${ACCENT}:x='52-(1-${prog(0.55)})*560':y=h-98:enable='gte(t,0.55)'`,
    );
  }
  if (m.priceTag) {
    // Price chip drops in from above, top-right.
    parts.push(
      `drawtext=fontfile='${ff}':text='${escText(m.priceTag)}':fontsize=42:fontcolor=black:box=1:boxcolor=${ACCENT}@0.92:boxborderw=16:x=w-tw-52:y='-70+${prog(0.7)}*116':enable='gte(t,0.7)'`,
    );
  }
  (m.specs ?? []).slice(0, 3).forEach((s, i) => {
    const st = (1.0 + i * 0.18).toFixed(2);
    parts.push(
      `drawtext=fontfile='${ff}':text='${escText('•  ' + s)}':fontsize=25:fontcolor=white:box=1:boxcolor=black@0.42:boxborderw=11:x='48-(1-${prog(Number(st))})*560':y=${128 + i * 50}:enable='gte(t,${st})'`,
    );
  });
  if (m.cta) {
    // CTA pill rises up in the final 6 seconds, centred above the lower-third.
    const c = Math.max(0.6, durationSec - 6).toFixed(2);
    parts.push(
      `drawtext=fontfile='${ff}':text='${escText(m.cta)}':fontsize=40:fontcolor=black:box=1:boxcolor=white@0.96:boxborderw=24:x=(w-tw)/2:y='h-300+(1-${prog(Number(c))})*150':enable='gte(t,${c})'`,
    );
  }

  if (parts.length === 0) return null;
  return `[0:v]${parts.join(',')}[vout]`;
}

export interface OverlayResult {
  ok: boolean;
  error?: string;
  fontExists: boolean;
  fontPath: string;
}

/** Burn the marketing overlays from `inputPath` into `outputPath`. */
export async function applyMarketingOverlays(
  inputPath: string,
  outputPath: string,
  m: MarketingOverlay,
  durationSec = 30,
): Promise<OverlayResult> {
  const fontExists = existsSync(OVERLAY_FONT_PATH);
  const base = { fontExists, fontPath: OVERLAY_FONT_PATH };
  const filter = buildOverlayFilter(m, durationSec);
  if (!filter) return { ok: false, error: 'no overlay fields supplied', ...base };
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return { ok: false, error: 'ffmpeg-static binary missing', ...base };

  return new Promise<OverlayResult>((resolve) => {
    const args = [
      '-y',
      '-i', inputPath,
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
    ff.on('close', (code) => resolve({ ok: code === 0, error: code === 0 ? undefined : stderr.slice(-600), ...base }));
    ff.on('error', (e) => resolve({ ok: false, error: `spawn: ${e.message}`, ...base }));
  });
}
