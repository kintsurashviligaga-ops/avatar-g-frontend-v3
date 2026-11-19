/**
 * lib/services/montage/smart/captionSvg.ts — one caption frame as an SVG (Phase 8.7). PURE string building; the server
 * rasterises it with resvg + the embedded FiraGO (lib/pipeline/compositing/ffmpeg-overlay overlayFontFiles), the only
 * text path that works in production (ffmpeg-static has no libfreetype, the lambda has no system fonts).
 *
 * The frame is FULL size and transparent, so the frames concatenate into one overlay stream (./captions concatList).
 * Each line is one <text> centred on the frame, its words as <tspan>s, so a lit word is just another fill. The outline
 * is paint-order="stroke" (drawn behind the fill in one pass, as the existing subtitle cards do).
 *
 * FONTS: only FiraGO Regular and FiraGO Medium are embedded; a style asking for 800 draws with Medium (the boldest
 * there is). Box width cannot be measured without a layout engine, so the box is sized from the character count
 * (0.56 em per character, FiraGO's average for Georgian and Latin) — generous rather than tight.
 */
import { CAPTION_STYLES, displayText, hasGeorgian, type CaptionCard, type CaptionFrame, type CaptionPos, type CaptionStyleId } from './captions';
import { captionCenterY, type SafeZone } from './templates';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DEFAULT_SAFE: SafeZone = { top: 0.06, bottom: 0.08, left: 0.05, right: 0.05 };

export function buildCaptionFrameSvg(o: {
  card: CaptionCard;
  frame: Pick<CaptionFrame, 'active'>;
  style: CaptionStyleId;
  pos?: CaptionPos;
  w: number;
  h: number;
  safe?: SafeZone;
}): string {
  const st = CAPTION_STYLES[o.style] ?? CAPTION_STYLES.standard;
  const { w, h } = o;
  const size = Math.max(14, Math.round(Math.min(w, h) * st.sizeShare));
  const lineH = Math.round(size * 1.22);
  const lines = o.card.lines;
  const blockH = lineH * lines.length;
  const cy = Math.round(h * captionCenterY(o.pos ?? st.defaultPos, o.safe ?? DEFAULT_SAFE, blockH / h));
  const top = cy - blockH / 2;
  const ka = o.card.words.some((x) => hasGeorgian(x.text));
  const family = st.weight >= 600 ? 'FiraGO Medium' : 'FiraGO';
  const stroke = st.stroke ? Math.max(2, Math.round(size * 0.12)) : 0;
  const parts: string[] = [];
  lines.forEach((idx, li) => {
    const y = Math.round(top + lineH * li + size * 0.95);
    const shown = idx.map((wi) => displayText(o.card.words[wi]!.text, st));
    if (st.box) {
      const chars = shown.reduce((s, t) => s + [...t].length, 0) + Math.max(0, shown.length - 1);
      const bw = Math.min(w * 0.96, Math.round(chars * size * 0.56 + size * 0.9));
      parts.push(`<rect x="${Math.round((w - bw) / 2)}" y="${Math.round(top + lineH * li)}" width="${bw}" height="${lineH}" rx="${Math.round(size * 0.3)}" fill="${st.box}"/>`);
    }
    const spans = idx.map((wi, k) => {
      const lit = st.activeFill && o.frame.active >= 0 && (st.fillAdvances ? wi <= o.frame.active : wi === o.frame.active);
      const fill = lit ? st.activeFill! : st.fill;
      return `<tspan fill="${fill}">${k ? ' ' : ''}${esc(shown[k]!)}</tspan>`;
    }).join('');
    const strokeAttr = stroke ? ` stroke="${st.stroke}" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke"` : '';
    parts.push(`<text x="${Math.round(w / 2)}" y="${y}" text-anchor="middle" font-size="${size}" font-family="${family}"${strokeAttr}>${spans}</text>`);
  });
  const lang = ka ? 'ka' : 'en';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xml:lang="${lang}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/** The fully transparent frame shown between cards. */
export const blankFrameSvg = (w: number, h: number): string => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"></svg>`;
