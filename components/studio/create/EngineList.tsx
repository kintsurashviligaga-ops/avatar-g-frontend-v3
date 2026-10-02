'use client';

/**
 * EngineList — the engines the music route can really run, as a radio group. ONE list, two shapes: a compact `menu`
 * (the model pill's dropdown) and a `table` with the price per length (the desktop "Engines & prices" pane — ref6's
 * "more models" table that doubles as the picker).
 *
 * What it will and will not do is lib/studio/musicEngines' call, not this component's: a row the server would refuse (no
 * key · breaker open · MusicGen for a song · status not loaded) is `aria-disabled` with its reason in words and carries no
 * handler; a reference track fixes the engine (MusicGen's melody model / MiniMax), which locks every row. Prices are the
 * shared quote at each length — the same on every engine, because every engine bills by length only.
 */
import { Check } from 'lucide-react';
import {
  chainNames, engineChoices, engineCopy, type EngineChoice, type MusicEnginePref, type MusicEnginesStatus,
} from '@/lib/studio/musicEngines';
import { musicQuote } from '@/lib/studio/musicQuote';
import { musicCreateCopy } from './musicCreateCopy';
import { cx } from './primitives';

export function EngineList({
  locale, status, pref, onPick, instrumental, reference, variant = 'menu', testId,
}: {
  locale: string;
  status: MusicEnginesStatus | null;
  /** The effective pick (lib/studio/musicEngines effectiveEnginePref). */
  pref: MusicEnginePref;
  onPick: (p: MusicEnginePref) => void;
  instrumental: boolean;
  /** A reference track is attached: it runs on its own engine, so the pick does not apply. */
  reference: 'cover' | 'voice' | null;
  variant?: 'menu' | 'table';
  testId?: string;
}) {
  const ec = engineCopy(locale);
  const cc = musicCreateCopy(locale);
  const rows = engineChoices(status, { instrumental });
  const fixed = reference ? (reference === 'cover' ? ec.cover.name : ec.voice.name) : null;

  const nameOf = (id: MusicEnginePref) => (id === 'auto' ? ec.auto.name : ec.engines[id].name);
  const roleOf = (id: MusicEnginePref) => (id === 'auto' ? ec.auto.role(chainNames(status, locale)) : ec.engines[id].role);

  const row = (c: EngineChoice) => {
    const on = !fixed && pref === c.id;
    const locked = !!fixed || !c.selectable;
    const reason = fixed ? null : c.blocked ? ec.blocked[c.blocked] : null;
    return (
      <button
        key={c.id}
        type="button"
        role="radio"
        aria-checked={on}
        aria-disabled={locked || undefined}
        data-testid={`engine-${c.id}`}
        data-blocked={c.blocked ?? undefined}
        onClick={locked ? undefined : () => onPick(c.id)}
        className={cx(
          'flex w-full min-w-0 touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
          variant === 'table' ? 'min-h-[52px]' : 'min-h-[56px]',
          on ? 'bg-app-accent/12 ring-1 ring-app-accent/35' : 'hover:bg-app-elevated/60',
          locked && !on && 'cursor-not-allowed opacity-55 hover:bg-transparent',
        )}
      >
        <span
          aria-hidden="true"
          className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1', on ? 'bg-app-accent text-app-bg ring-app-accent' : 'ring-app-border/30')}
        >
          {on && <Check size={12} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-app-text">{nameOf(c.id)}</span>
          <span className={cx('block text-[12px] leading-snug', reason ? 'text-app-warning' : 'text-app-muted')}>{reason ?? roleOf(c.id)}</span>
        </span>
        {variant === 'table' && (
          <span className="ml-auto hidden shrink-0 gap-4 text-[13px] tabular-nums text-app-text/90 sm:flex">
            {([30, 60, 90] as const).map((s) => (
              <span key={s} className="w-9 text-right">{musicQuote({ duration: s })}</span>
            ))}
          </span>
        )}
      </button>
    );
  };

  return (
    <div data-testid={testId} className="min-w-0">
      {fixed && (
        <p role="note" className="mb-1.5 rounded-xl bg-app-accent/10 px-3 py-2 text-[12.5px] leading-snug text-app-accent ring-1 ring-app-accent/20">
          {cc.engineFixed(fixed)}
        </p>
      )}
      {variant === 'table' && (
        <div aria-hidden="true" className="mb-1 hidden items-center gap-3 px-3 text-[11px] font-medium uppercase tracking-wide text-app-muted sm:flex">
          <span className="w-5 shrink-0" />
          <span className="flex-1">{cc.engine}</span>
          <span className="flex shrink-0 gap-4">
            {([30, 60, 90] as const).map((s) => <span key={s} className="w-9 text-right">{s}{cc.secondsShort}</span>)}
          </span>
        </div>
      )}
      <div role="radiogroup" aria-label={cc.engineSheetTitle} className="space-y-0.5">
        {rows.map(row)}
      </div>
      {variant === 'table' && (
        <div className="mt-2 space-y-1 px-3 text-[11.5px] leading-snug text-app-muted">
          <p>{ec.priceNote} ({cc.creditsShort})</p>
          <p>{ec.settleNote}</p>
        </div>
      )}
    </div>
  );
}
