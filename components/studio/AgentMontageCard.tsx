'use client';

/**
 * AgentMontageCard — the buttons under Agent G's montage plan (lib/agent/media, slice 1), in the chat thread itself.
 *
 *   quoted   the plan's numbers (shots · length · beat · format · price)      [Start ✦ price]  [Cancel]
 *   running  the job row's stage and percent                                  [Stop]
 *
 * Start is the user's confirmation: nothing renders before it (the quote spent nothing). The card is one decision: once
 * started, cancelled or finished, its buttons go; the result is the bubble's own video (Download, Share, Library).
 */
import { Music2, Scissors, Sparkle, Square, X } from 'lucide-react';
import { priceLabel, stageText, type AgentMontageState } from '@/lib/agent/media/montageChat';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { start: string; cancel: string; stop: string; stopping: string; shots: string; sec: string; noBeat: string }> = {
  ka: { start: 'დაწყება', cancel: 'გაუქმება', stop: 'შეჩერება', stopping: 'ვაჩერებ…', shots: 'კადრი', sec: 'წმ', noBeat: 'ბითის გარეშე' },
  en: { start: 'Start', cancel: 'Cancel', stop: 'Stop', stopping: 'Stopping…', shots: 'shots', sec: 's', noBeat: 'no steady beat' },
  ru: { start: 'Начать', cancel: 'Отмена', stop: 'Остановить', stopping: 'Останавливаю…', shots: 'кадров', sec: 'с', noBeat: 'без бита' },
};

export function AgentMontageCard({
  state, locale, onStart, onCancel,
}: {
  state: AgentMontageState;
  locale: string;
  onStart: () => void;
  /** Cancel a plan (nothing happens), or Stop a running edit (the server stops it between steps). */
  onCancel: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const q = state.quote;

  if (state.phase === 'quoted' && q) {
    const price = priceLabel(q.credits, locale);
    const chip = 'inline-flex items-center gap-1 rounded-full bg-app-elevated px-2.5 py-1 text-[11.5px] text-app-text ring-1 ring-app-border/15 tabular-nums';
    return (
      <div className="mt-2 flex flex-col gap-2" data-testid="agent-montage-card" data-phase="quoted">
        <div className="flex flex-wrap gap-1.5">
          <span className={chip}><Scissors size={12} aria-hidden="true" /> {q.shots} {t.shots}</span>
          <span className={chip}>{Math.round(q.totalSec * 10) / 10} {t.sec}</span>
          <span className={chip}><Music2 size={12} aria-hidden="true" /> {q.beatSynced && q.bpm ? `${Math.round(q.bpm)} BPM` : t.noBeat}</span>
          <span className={chip}>{q.aspect}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStart}
            data-testid="agent-montage-start"
            data-price={q.credits}
            aria-label={`${t.start} — ${price}`}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90"
          >
            <Sparkle size={14} aria-hidden="true" />
            <span>{t.start}</span>
            <span className="tabular-nums" aria-hidden="true">{q.credits > 0 ? price : `· ${price}`}</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            data-testid="agent-montage-cancel"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-app-border/30 px-4 py-2 text-[12.5px] font-medium text-app-text transition-colors hover:bg-app-elevated/60"
          >
            <X size={13} aria-hidden="true" /> {t.cancel}
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'running') {
    const pct = typeof state.pct === 'number' ? Math.max(0, Math.min(100, state.pct)) : null;
    const stopping = state.stage === 'stopping';
    return (
      <div className="mt-2 flex flex-col gap-2" data-testid="agent-montage-card" data-phase="running">
        <div className="flex items-center justify-between gap-3 text-[12px] text-app-muted">
          <span aria-live="polite">{stopping ? t.stopping : stageText(state.stage, locale)}</span>
          {pct !== null ? <span className="tabular-nums">{pct}%</span> : null}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-elevated" role="progressbar" aria-valuemin={0} aria-valuemax={100} {...(pct !== null ? { 'aria-valuenow': pct } : {})}>
          <div className={`h-full rounded-full bg-app-accent transition-[width] duration-700 ${pct === null ? 'w-1/4 motion-safe:animate-pulse' : ''}`} style={pct !== null ? { width: `${Math.max(4, pct)}%` } : undefined} />
        </div>
        {!stopping ? (
          <div>
            <button
              type="button"
              onClick={onCancel}
              data-testid="agent-montage-stop"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-border/30 px-3.5 py-1.5 text-[12px] font-medium text-app-text transition-colors hover:bg-app-elevated/60"
            >
              <Square size={12} aria-hidden="true" /> {t.stop}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
