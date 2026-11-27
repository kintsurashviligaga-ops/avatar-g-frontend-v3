'use client';

/**
 * Art Director control panel (Phase 8.4): 14 ratio tiles drawn to shape, size chips with their price, count 1/2/4,
 * style presets, "what to avoid" (best effort) and seed (best effort), and the live total. Pure UI: state is the parent's.
 */
import { ART_COUNTS, ART_RATIOS, NEGATIVE_CHIPS, STYLE_PRESETS, ratioValue, type ArtCount, type ArtRatio, type ArtSize } from '@/lib/image/artDirector/spec';
import { artLabel, type Lang } from '@/lib/image/artDirector/labels';
import { imageCredits, type ArtBook } from '@/lib/image/artDirector/price';

export interface ArtSettings {
  aspectRatio: ArtRatio;
  size: ArtSize;
  count: ArtCount;
  styleId: string | null;
  avoid: string[];
  seed: number | null;
}

export const DEFAULT_ART_SETTINGS: ArtSettings = { aspectRatio: '1:1', size: '1K', count: 4, styleId: null, avoid: [], seed: null };

const chip = (on: boolean) =>
  `inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${
    on ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/25 text-app-muted hover:bg-app-border/10'
  }`;

const T = {
  ratio: { ka: 'ფორმატი', en: 'Aspect ratio', ru: 'Формат' },
  size: { ka: 'გარჩევადობა', en: 'Resolution', ru: 'Разрешение' },
  count: { ka: 'რაოდენობა', en: 'Images', ru: 'Количество' },
  style: { ka: 'სტილი', en: 'Style', ru: 'Стиль' },
  none: { ka: 'არცერთი', en: 'None', ru: 'Нет' },
  total: { ka: 'სულ', en: 'Total', ru: 'Итого' },
} as const;

export function RatioTile({ ratio }: { ratio: ArtRatio }) {
  const v = ratioValue(ratio);
  const w = v >= 1 ? 22 : Math.max(3, 22 * v);
  const h = v >= 1 ? Math.max(3, 22 / v) : 22;
  return <span aria-hidden="true" className="inline-block rounded-[3px] border border-current" style={{ width: w, height: h }} />;
}

export function ControlPanel({ value, onChange, book, references, lang, sizes }: {
  value: ArtSettings;
  onChange: (next: ArtSettings) => void;
  book: ArtBook;
  references: number;
  lang: Lang;
  sizes: readonly ArtSize[];
}) {
  const set = <K extends keyof ArtSettings>(k: K, v: ArtSettings[K]) => onChange({ ...value, [k]: v });
  const per = imageCredits({ size: value.size, references, book });
  const toggleAvoid = (text: string) => set('avoid', value.avoid.includes(text) ? value.avoid.filter((a) => a !== text) : [...value.avoid, text]);
  return (
    <div data-testid="art-control-panel" className="space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/45 p-4">
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{T.ratio[lang]}</legend>
        <div className="grid grid-cols-7 gap-1.5 max-sm:grid-cols-5">
          {ART_RATIOS.map((r) => (
            <button key={r} type="button" aria-pressed={value.aspectRatio === r} data-testid={`art-ratio-${r}`}
              onClick={() => set('aspectRatio', r)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border text-[11px] ${value.aspectRatio === r ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/20 text-app-muted hover:bg-app-border/10'}`}>
              <RatioTile ratio={r} />{r}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{T.size[lang]}</legend>
          <div className="flex gap-1.5">
            {sizes.map((s) => (
              <button key={s} type="button" aria-pressed={value.size === s} data-testid={`art-size-${s}`} onClick={() => set('size', s)} className={chip(value.size === s)}>
                {s} <span className="tabular-nums text-app-muted">✦{imageCredits({ size: s, references, book })}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{T.count[lang]}</legend>
          <div className="flex gap-1.5">
            {ART_COUNTS.map((c) => (
              <button key={c} type="button" aria-pressed={value.count === c} data-testid={`art-count-${c}`} onClick={() => set('count', c)} className={chip(value.count === c)}>{c}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{T.style[lang]}</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!value.styleId} onClick={() => set('styleId', null)} className={chip(!value.styleId)}>{T.none[lang]}</button>
          {STYLE_PRESETS.map((s) => (
            <button key={s.id} type="button" aria-pressed={value.styleId === s.id} data-testid={`art-style-${s.id}`} onClick={() => set('styleId', s.id)} className={chip(value.styleId === s.id)}>{s.label[lang]}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{artLabel('avoid', lang)}</legend>
        <div className="flex flex-wrap gap-1.5">
          {NEGATIVE_CHIPS.map((n) => (
            <button key={n.id} type="button" aria-pressed={value.avoid.includes(n.text)} data-testid={`art-avoid-${n.id}`} onClick={() => toggleAvoid(n.text)} className={chip(value.avoid.includes(n.text))}>{n.label[lang]}</button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-[13px] text-app-muted">
        {artLabel('seed', lang)}
        <input type="number" min={0} max={2147483647} inputMode="numeric" data-testid="art-seed" value={value.seed ?? ''}
          onChange={(e) => set('seed', e.target.value === '' ? null : Math.max(0, Math.min(2147483647, Math.floor(Number(e.target.value)))))}
          className="w-32 rounded-lg border border-app-border/25 bg-transparent px-2 py-1 text-app-text" />
      </label>
      <p data-testid="art-total" className="text-[14px] font-semibold text-app-text tabular-nums">
        {per == null ? '—' : `${T.total[lang]}: ${value.count} × ${value.size} = ✦${per * value.count}`}
      </p>
    </div>
  );
}
