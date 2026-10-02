'use client';

/**
 * ImageModelsTable — "Models & prices" (ref6's table under the result): every model variant the image route can really run, with
 * its price, and the row that is selected IS the picker — choosing a row sets that size on the Create screen.
 *
 * The rows are built from lib/studio/imageCreate (`IMAGE_ENGINES` × `IMAGE_TIERS`) and priced by `engine.perImage()` — the quote the
 * route charges with — so a price here can never differ from the Generate button's. Today that is ONE engine (Auto) at three sizes,
 * and the sizes are the real variants: NanoBanana V2 at 1K and 2K, NanoBanana Pro at 4K. A second engine, when a route can take it,
 * adds its rows by being added to the array.
 */
import { Check } from 'lucide-react';
import { IMAGE_ENGINES, IMAGE_TIERS, imageLang, type ImageEngineId, type ImgQuality } from '@/lib/studio/imageCreate';
import { imageCreateCopy } from './imageCreateCopy';

export function ImageModelsTable({
  locale, model = 'auto', onModel, quality, onQuality,
}: {
  locale: string;
  model?: ImageEngineId;
  onModel?: (id: ImageEngineId) => void;
  quality: ImgQuality;
  onQuality: (q: ImgQuality) => void;
}) {
  const c = imageCreateCopy(locale);
  const lang = imageLang(locale);
  const rows = IMAGE_ENGINES.flatMap((engine) => IMAGE_TIERS.map((tier) => ({ engine, tier })));

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
          {rows.map(({ engine, tier }) => {
            const on = engine.id === model && tier.quality === quality;
            return (
              <button
                key={`${engine.id}-${tier.quality}`}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-model={engine.id}
                data-quality={tier.quality}
                onClick={() => { onModel?.(engine.id); onQuality(tier.quality); }}
                onKeyDown={onKeyDown}
                className={`grid min-h-[60px] w-full touch-manipulation grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60 ${on ? 'bg-app-accent/10' : 'hover:bg-app-elevated/60'}`}
              >
                <span className="min-w-0">
                  <span className={`flex items-center gap-1.5 text-[14.5px] font-medium leading-tight ${on ? 'text-app-accent' : 'text-app-text'}`}>
                    <span className="truncate">{engine.name[lang]} · {tier.res}</span>
                    {on && <Check size={14} aria-hidden="true" className="shrink-0" />}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">Nano Banana {tier.family} · {tier.note[lang]}</span>
                </span>
                <span className="text-right text-[13.5px] font-medium tabular-nums text-app-text">{c.creditsPerImage(engine.perImage())}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[12.5px] leading-snug text-app-muted">{c.priceNote}</p>
    </section>
  );
}
