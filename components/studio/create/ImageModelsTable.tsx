'use client';

/**
 * ImageModelsTable — "Models & prices" (ref6's table under the result): the sizes of the PICKED model (the Create panel's
 * ModelPicker — the same browser pick, lib/studio/modelPick) with what each really renders on and its price; the row that is
 * selected IS the size chip — choosing a row sets that size on the Create screen. A size the model does not have (Nano Banana
 * Pro has no 1K) is not offered. The model itself is chosen in one place only: the panel's model row.
 *
 * Priced by `imageCredits(1)` — the quote the route charges with — so a price here can never differ from the Generate button's.
 */
import { Check } from 'lucide-react';
import { IMAGE_TIERS, imageCredits, imageLang, imageModelFor, imageVariant, type ImgQuality } from '@/lib/studio/imageCreate';
import { useModelPick } from '@/lib/studio/modelPick';
import { imageCreateCopy } from './imageCreateCopy';

export function ImageModelsTable({
  locale, model: modelProp, quality, onQuality,
}: {
  locale: string;
  /** The picked model; by default the browser's pick (the panel's ModelPicker writes it). */
  model?: string;
  quality: ImgQuality;
  onQuality: (q: ImgQuality) => void;
}) {
  const c = imageCreateCopy(locale);
  const lang = imageLang(locale);
  const [stored] = useModelPick('image');
  const model = imageModelFor(modelProp ?? stored);
  const rows = IMAGE_TIERS.map((tier) => ({ tier, variant: imageVariant(model.id, tier.quality) })).filter((r) => r.variant.native);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const step = keys[e.key];
    if (!step) return;
    e.preventDefault();
    const radios = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = radios.indexOf(e.currentTarget);
    radios[(at + step + radios.length) % radios.length]?.focus();
  };

  return (
    <section data-testid="models-prices" aria-labelledby="models-prices-heading" className="min-w-0 space-y-2.5">
      <h2 id="models-prices-heading" className="text-[15px] font-semibold text-app-text">{c.modelsPrices}</h2>
      <div className="overflow-hidden rounded-3xl bg-app-elevated/30 ring-1 ring-app-border/10">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-app-border/10 px-4 py-2.5 text-[12px] font-medium uppercase tracking-wide text-app-muted" aria-hidden="true">
          <span>{c.colModel}</span><span>{c.colPrice}</span>
        </div>
        <div role="radiogroup" aria-label={c.modelsPrices} className="divide-y divide-app-border/10">
          {rows.map(({ tier, variant }) => {
            const on = tier.quality === quality;
            return (
              <button
                key={`${model.id}-${tier.quality}`}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-model={model.id}
                data-quality={tier.quality}
                onClick={() => onQuality(tier.quality)}
                onKeyDown={onKeyDown}
                className={`grid min-h-[60px] w-full touch-manipulation grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60 ${on ? 'bg-app-accent/10' : 'hover:bg-app-elevated/60'}`}
              >
                <span className="min-w-0">
                  <span className={`flex items-center gap-1.5 text-[14.5px] font-medium leading-tight ${on ? 'text-app-accent' : 'text-app-text'}`}>
                    <span className="truncate">{model.label[lang]} · {variant.res}</span>
                    {on && <Check size={14} aria-hidden="true" className="shrink-0" />}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">Nano Banana {variant.family} · {tier.note[lang]}</span>
                </span>
                <span className="text-right text-[13.5px] font-medium tabular-nums text-app-text">{c.creditsPerImage(imageCredits(1))}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[12.5px] leading-snug text-app-muted">{c.priceNote}</p>
    </section>
  );
}
