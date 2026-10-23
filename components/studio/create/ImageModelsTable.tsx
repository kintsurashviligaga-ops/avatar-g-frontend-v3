'use client';

/**
 * ImageModelsTable — "Models & prices" (ref6's table under the result): the PICKED model (the Create panel's ModelPicker — the
 * same browser pick, lib/studio/modelPick) and its price per image. One row: the render takes no size and every size cost the
 * same, so the rows per size (1K / 2K / 4K, Nano Banana V2 / Pro) are gone (GG 2026-10-23, "Hide"). The model itself is chosen
 * in one place only: the panel's model row.
 *
 * Priced by `imageCredits(1)` — the quote the route charges with — so a price here can never differ from the Generate button's.
 */
import { imageCredits, imageLang, imageModelFor } from '@/lib/studio/imageCreate';
import { catalogueEntry } from '@/lib/providers/catalogue';
import { useModelPick } from '@/lib/studio/modelPick';
import { imageCreateCopy } from './imageCreateCopy';

export function ImageModelsTable({
  locale, model: modelProp,
}: {
  locale: string;
  /** The picked model; by default the browser's pick (the panel's ModelPicker writes it). */
  model?: string;
}) {
  const c = imageCreateCopy(locale);
  const lang = imageLang(locale);
  const [stored] = useModelPick('image');
  // A Higgsfield pick is priced by the server for that model, on its own Generate button: a Google row and price beside it
  // would describe a model the user did not pick.
  const higgsfield = !modelProp && catalogueEntry(stored)?.wire.runner === 'studio';
  const model = imageModelFor(modelProp ?? stored);

  if (higgsfield) return null;
  return (
    <section data-testid="models-prices" aria-labelledby="models-prices-heading" className="min-w-0 space-y-2.5">
      <h2 id="models-prices-heading" className="text-[15px] font-semibold text-app-text">{c.modelsPrices}</h2>
      <div className="overflow-hidden rounded-3xl bg-app-elevated/30 ring-1 ring-app-border/10">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-app-border/10 px-4 py-2.5 text-[12px] font-medium uppercase tracking-wide text-app-muted" aria-hidden="true">
          <span>{c.colModel}</span><span>{c.colPrice}</span>
        </div>
        <div data-model={model.id} className="grid min-h-[60px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-medium leading-tight text-app-text">{model.label[lang]}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">{model.bestFor[lang]}</span>
          </span>
          <span className="text-right text-[13.5px] font-medium tabular-nums text-app-text">{c.creditsPerImage(imageCredits(1))}</span>
        </div>
      </div>
      <p className="text-[12.5px] leading-snug text-app-muted">{c.priceNote}</p>
    </section>
  );
}
