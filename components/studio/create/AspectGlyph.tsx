/**
 * The shape of a ratio, drawn: a rounded outline whose longer side is `size` px and whose proportions are the ratio's.
 * Decorative (`aria-hidden`) — the ratio's text is always next to it. Used by the aspect chip and the aspect picker.
 */
export function AspectGlyph({ ratio, size = 18, on = false }: { ratio: string; size?: number; on?: boolean }) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio.trim());
  const w = m ? Number(m[1]) : 1;
  const h = m ? Number(m[2]) : 1;
  const bw = w >= h ? size : Math.max(4, Math.round((size * w) / h));
  const bh = h >= w ? size : Math.max(4, Math.round((size * h) / w));
  return (
    <span aria-hidden="true" className="flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        className={`block rounded-[3px] border-2 transition-colors ${on ? 'border-app-accent bg-app-accent/25' : 'border-current opacity-80'}`}
        style={{ width: bw, height: bh }}
      />
    </span>
  );
}
