/**
 * lib/text/wrapCaption.ts — how a burned-in caption breaks into lines. Pure, so the export AND the editor's preview
 * use the same function and draw the same lines.
 *
 * ⚠️ resvg draws a <text> on ONE line. A caption longer than the frame ran off both edges of the export while the
 * editor's preview (CSS) wrapped it — the user approved one picture and got another. Now the export wraps here
 * (lib/pipeline/compositing/ffmpeg-overlay buildTextLayerSvg), and the montage preview renders exactly these lines
 * (components/studio/montage/Preview) instead of letting the browser choose its own breaks.
 *
 * Glyph width is ESTIMATED (measured on a rendered FiraGO Georgian line: ≈ 0.66 em a glyph, a space ≈ 0.3 em), on
 * the generous side, so a line breaks a little early rather than clipping. Everything scales with `fs`, so the
 * same text breaks at the same words at any size — which is what lets a small preview match a 1280 px export.
 */

const GLYPH_EM = 0.66;
const SPACE_EM = 0.3;
/** A caption is a line or a few, not a paragraph over the picture. */
export const CAPTION_MAX_LINES = 4;

export type CaptionPosition = 'top-left' | 'top-right' | 'bottom-center' | 'center';

/** Distance from the frame edge to a corner tag / the bottom baseline. */
export function captionPad(fs: number): number {
  return Math.round(fs * 0.7) + 12;
}

/** Widest a line may be: a centred caption keeps a 6 % side margin (at least the pad); a corner tag uses the pad. */
export function captionMaxWidth(position: CaptionPosition, fs: number, w: number): number {
  const pad = captionPad(fs);
  const side = position === 'top-left' || position === 'top-right' ? pad : Math.max(pad, Math.round(w * 0.06));
  return Math.max(fs * 2, w - side * 2);
}

export function wrapCaption(text: string, fs: number, maxW: number, maxLines = CAPTION_MAX_LINES): string[] {
  const em = (s: string) => [...s].reduce((a, ch) => a + (ch === ' ' ? SPACE_EM : GLYPH_EM), 0) * fs;
  const out: string[] = [];
  for (const para of text.replace(/\r/g, '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (em(next) <= maxW) { line = next; continue; }
      if (line) out.push(line);
      // A single word wider than the frame is split by characters.
      let rest = word;
      while (em(rest) > maxW && [...rest].length > 1) {
        const chars = [...rest];
        let n = chars.length - 1;
        while (n > 1 && em(chars.slice(0, n).join('')) > maxW) n -= 1;
        out.push(chars.slice(0, n).join(''));
        rest = chars.slice(n).join('');
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s*\S?$/, '')}…`;
  return kept;
}
