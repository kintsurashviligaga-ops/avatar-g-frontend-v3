'use client';

/**
 * ModelPicker — the one way a person chooses a model, on every surface: a compact chip with the current model (or any
 * trigger the surface already has — the image prompt card's "Model … ▾" row, the video panel's Model row) that opens the
 * studio's BottomSheet with the catalogue's rows for that service (lib/providers/catalogue).
 *
 * A row: the model's name · a small speed/quality badge · one line on what it is for. A row this surface cannot run is in
 * the list too, dimmed under „სხვა მოდელები“, saying WHY in words („ჯერ არ არის ჩართული“, „სტუდია β-ში“) — never a dead tap,
 * never silently missing. A radio group: one Tab stop, arrows move among the rows a tap may choose, Home/End jump; picking
 * closes the sheet.
 *
 * ⚠️ NO PRICE. The price of a model is the server's quote for the id the request carries, shown on the Generate button. A
 * number here would be a second price that can drift from the one charged.
 *
 * What may be picked is lib/studio/modelPick's call (`pickerRows`), from the catalogue and GET /api/studio/catalogue — asked
 * only once the sheet opens, so a person who never opens it costs no request.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Cpu, Lock } from 'lucide-react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { catalogueLang, type CatalogueService, type ModelRunner } from '@/lib/providers/catalogue';
import type { ModelTier } from '@/lib/providers/types';
import { pickerRows, type CatalogueStatus, type PickBlock, type PickerRow } from '@/lib/studio/modelPick';
import { useCatalogueStatus } from './useCatalogueStatus';

type L3 = { ka: string; en: string; ru: string };

export const MODEL_PICKER_COPY = {
  title: { ka: 'მოდელი', en: 'Model', ru: 'Модель' },
  close: { ka: 'დახურვა', en: 'Close', ru: 'Закрыть' },
  others: { ka: 'სხვა მოდელები', en: 'Other models', ru: 'Другие модели' },
  tier: {
    fast: { ka: 'სწრაფი', en: 'Fast', ru: 'Быстро' },
    standard: { ka: 'ბალანსი', en: 'Balanced', ru: 'Баланс' },
    pro: { ka: 'მაქს. ხარისხი', en: 'Max quality', ru: 'Макс. качество' },
  } satisfies Record<ModelTier, L3>,
  block: {
    unverified: { ka: 'მალე', en: 'Coming soon', ru: 'Скоро' },
    not_enabled: { ka: 'ჯერ არ არის ჩართული', en: 'Not enabled yet', ru: 'Пока не включена' },
    studio_off: { ka: 'ჯერ არ არის ჩართული', en: 'Not enabled yet', ru: 'Пока не включена' },
    not_configured: { ka: 'ამ წუთას მიუწვდომელია', en: 'Unavailable right now', ru: 'Сейчас недоступна' },
    busy: { ka: 'დაკავებულია — სცადე მოგვიანებით', en: 'Busy — try again shortly', ru: 'Занята — попробуйте позже' },
    checking: { ka: 'მოწმდება…', en: 'Checking…', ru: 'Проверяем…' },
  } satisfies Record<Exclude<PickBlock, 'elsewhere'>, L3>,
  /** Where a row of another runner can be used. */
  elsewhere: {
    studio: { ka: 'სტუდია β-ში', en: 'In Studio β', ru: 'В Студии β' },
    film: { ka: 'ვიდეოს ხელსაწყოში', en: 'In the Video tool', ru: 'В инструменте «Видео»' },
    image: { ka: 'სურათის ხელსაწყოში', en: 'In the Image tool', ru: 'В инструменте «Изображение»' },
    music: { ka: 'მუსიკის ხელსაწყოში', en: 'In the Music tool', ru: 'В инструменте «Музыка»' },
  } satisfies Record<ModelRunner, L3>,
} as const;

/** The words for why a row cannot be picked here. */
export function blockLabel(row: PickerRow, locale: string): string | null {
  const lang = catalogueLang(locale);
  if (!row.block) return null;
  if (row.block === 'elsewhere') return MODEL_PICKER_COPY.elsewhere[row.entry.wire.runner][lang];
  return MODEL_PICKER_COPY.block[row.block][lang];
}

export interface ModelPickerProps {
  service: CatalogueService;
  locale: string;
  /** The model the request will name (lib/studio/modelPick effectivePick). */
  value: string;
  onChange: (id: string) => void;
  /** The routes this surface can run — rows of the others are shown disabled, saying where they run. */
  runners: readonly ModelRunner[];
  /** 'runnable' hides the other surfaces' rows (Studio β lists only its own). */
  include?: 'all' | 'runnable';
  /** The availability the surface already knows (Studio β's own list); otherwise GET /api/studio/catalogue on open. */
  status?: CatalogueStatus | null;
  /** Controlled open — for a surface whose own row or button is the trigger (`trigger="none"`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: 'chip' | 'none';
  /** Above the list, inside the sheet (the video panel's documentary / music-video switch). */
  header?: ReactNode;
  title?: string;
  testId?: string;
}

export function ModelPicker(p: ModelPickerProps) {
  const lang = catalogueLang(p.locale);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = p.open ?? ownOpen;
  const setOpen = (v: boolean) => { if (p.open === undefined) setOwnOpen(v); p.onOpenChange?.(v); };
  const fetched = useCatalogueStatus(p.service, open && p.status === undefined);
  const status = p.status === undefined ? fetched : p.status;
  const rows = useMemo(
    () => pickerRows(p.service, { runners: p.runners, status, include: p.include ?? 'all' }),
    [p.service, p.runners, status, p.include],
  );
  const current = rows.find((r) => r.entry.id === p.value)?.entry;
  const title = p.title ?? MODEL_PICKER_COPY.title[lang];
  const testId = p.testId ?? 'model-picker';

  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const open_ = rows.map((r) => r.selectable);
  const checkedAt = rows.findIndex((r) => r.entry.id === p.value && r.selectable);
  const tabAt = checkedAt >= 0 ? checkedAt : open_.indexOf(true);
  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= rows.length; k++) {
      const i = (from + dir * k + rows.length) % rows.length;
      if (open_[i]) { refs.current[i]?.focus(); return; }
    }
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i, 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i, -1); }
    else if (e.key === 'Home') { e.preventDefault(); move(-1, 1); }
    else if (e.key === 'End') { e.preventDefault(); move(rows.length, -1); }
  };
  const firstBlocked = rows.findIndex((r) => !r.selectable);

  return (
    <>
      {(p.trigger ?? 'chip') === 'chip' && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${title}: ${current?.label[lang] ?? ''}`}
          data-testid={`${testId}-chip`}
          data-model={p.value}
          className="inline-flex min-h-[44px] max-w-full touch-manipulation items-center gap-2 rounded-full bg-app-elevated px-3.5 text-[14px] font-medium text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <Cpu size={16} aria-hidden="true" className="shrink-0 text-app-muted" />
          <span className="min-w-0 truncate">{current?.label[lang] ?? title}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-app-muted" />
        </button>
      )}
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} closeLabel={MODEL_PICKER_COPY.close[lang]} testId={testId}>
        <div className="space-y-3 px-1 pb-2">
          {p.header}
          <div role="radiogroup" aria-label={title} className="space-y-1">
            {rows.map((r, i) => {
              const on = r.entry.id === p.value && r.selectable;
              const why = blockLabel(r, p.locale);
              return (
                <div key={r.entry.id}>
                  {i === firstBlocked && i > 0 && (
                    <p aria-hidden="true" className="px-2 pb-1 pt-3 text-[12px] font-medium uppercase tracking-wide text-app-muted">
                      {MODEL_PICKER_COPY.others[lang]}
                    </p>
                  )}
                  <button
                    ref={(el) => { refs.current[i] = el; }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={!r.selectable || undefined}
                    tabIndex={i === tabAt ? 0 : -1}
                    data-model={r.entry.id}
                    data-blocked={r.block ?? undefined}
                    onClick={r.selectable ? () => { p.onChange(r.entry.id); setOpen(false); } : undefined}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={`flex min-h-[64px] w-full touch-manipulation flex-col justify-center gap-1 rounded-2xl px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${
                      on ? 'bg-app-accent/12 ring-1 ring-app-accent/40'
                        : r.selectable ? 'bg-app-elevated/60 ring-1 ring-app-border/10 hover:bg-app-elevated'
                          : 'cursor-not-allowed bg-app-elevated/25 ring-1 ring-app-border/10'
                    }`}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${on ? 'text-app-accent' : r.selectable ? 'text-app-text' : 'text-app-text/70'}`}>
                        {r.entry.label[lang]}
                      </span>
                      {r.entry.tier && (
                        <span data-tier={r.entry.tier} className="shrink-0 rounded-full bg-app-border/15 px-2 py-0.5 text-[11px] font-medium text-app-muted">
                          {MODEL_PICKER_COPY.tier[r.entry.tier][lang]}
                        </span>
                      )}
                      {on && <Check size={16} aria-hidden="true" className="shrink-0 text-app-accent" />}
                    </span>
                    <span className={`block text-[12.5px] leading-snug ${r.selectable ? 'text-app-muted' : 'text-app-muted/80'}`}>{r.entry.bestFor[lang]}</span>
                    {why && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-app-muted" data-testid="model-block">
                        <Lock size={12} aria-hidden="true" className="shrink-0" />
                        {why}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
