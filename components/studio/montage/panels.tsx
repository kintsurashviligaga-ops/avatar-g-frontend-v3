'use client';

/**
 * components/studio/montage/panels.tsx — the editor's tool panels: Music, Text, Filters, Colour, Format,
 * Transition and a photo's Duration.
 *
 * One body per tool, drawn in the phone's bottom drawer and in the desktop's right column alike. Each panel
 * changes the edit live (the preview shows it at once) and „მზადაა" just closes it — there is no Apply step
 * to forget. Every control is a word with a line icon, never an emoji (docs/DESIGN.md §6).
 */
import { useId, type ReactNode } from 'react';
import { Check, Loader2, Minus, Music2, Plus, Trash2, Upload } from 'lucide-react';
import type { MontageAspect, MontageCaptionPos, MontageGrade, MontageTransition } from '@/lib/services/montage/montagePlan';
import { Slider, ToggleRow } from '../ui/controls';
import { ASPECTS, FILTERS, TRANSITIONS, aspectRatio, fmtClock, langOf, type Copy } from './copy';
import { MAX_CAPTION_CHARS, PHOTO_MAX_SEC, MIN_SHOT_SEC, type MediaSource } from './project';
import type { LibraryItem } from './useLibrary';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function PanelShell({ title, onDone, doneLabel, children, testId }: {
  title: string; onDone: () => void; doneLabel: string; children: ReactNode; testId: string;
}) {
  return (
    <section className="flex min-h-0 flex-col" data-testid={testId} aria-label={title}>
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h3 className="truncate text-[14px] font-semibold text-app-text">{title}</h3>
        <button
          type="button"
          onClick={onDone}
          aria-label={doneLabel}
          data-testid="montage-panel-done"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-text hover:bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <Check size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  );
}

/** A row of choices that behaves as one radio group. */
function Choice<T extends string>({ options, value, onChange, label, testId, render, className }: {
  options: readonly { id: T }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testId: string;
  render: (o: { id: T }, active: boolean) => ReactNode;
  /** Layout override; the default is one horizontally scrolling row (the phone drawer). */
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className={className ?? 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]'}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={o.id}
            onClick={() => onChange(o.id)}
            className={cx(
              'shrink-0 rounded-xl text-[12.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
              active ? 'text-app-text' : 'text-app-muted hover:text-app-text',
            )}
          >
            {render(o, active)}
          </button>
        );
      })}
    </div>
  );
}

// ── Music ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * „Start at" — where in the song the edit's first frame lands. A 44 px slider between two 44 px one-second steppers,
 * the position as m:ss, and (once the waveform is decoded) the song with the part that will play lit: before the start
 * dimmed, the edit's length from it in the accent. The arrow keys move it by 0.1 s, the steppers by a second.
 */
export function MusicStart(p: {
  t: Copy;
  startSec: number;
  /** The latest it may start (project.ts musicStartMax). */
  maxSec: number;
  /** The track's length; 0 when the browser could not measure it. */
  trackSec: number;
  /** The edit's length — how much of the song plays from the start. */
  editSec: number;
  peaks: readonly number[];
  onChange: (sec: number) => void;
}) {
  const { t } = p;
  const id = useId();
  const known = p.trackSec > 0;
  const from = known ? p.startSec / p.trackSec : 0;
  const to = known ? (p.startSec + p.editSec) / p.trackSec : 1;
  return (
    <div className="mt-3" data-testid="montage-music-start-control">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12.5px] font-medium text-app-text">{t.musicStart}</label>
        <span className="text-[12.5px] tabular-nums text-app-text" data-testid="montage-music-start-value">
          {fmtClock(p.startSec)}
          {known && <span className="text-app-muted"> / {fmtClock(p.trackSec)}</span>}
        </span>
      </div>
      {known && p.peaks.length > 0 && (
        <div className="mt-2 flex h-8 items-center gap-px overflow-hidden rounded-lg bg-app-elevated/60 px-1" aria-hidden="true" data-testid="montage-music-start-wave">
          {p.peaks.map((v, i) => {
            const x = (i + 0.5) / p.peaks.length;
            const lit = x >= from && x <= to;
            return (
              <span
                key={i}
                className={cx('min-w-0 flex-1 rounded-full', lit ? 'bg-app-accent' : 'bg-app-muted/35')}
                style={{ height: `${Math.round(v * 85)}%` }}
              />
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => p.onChange(p.startSec - 1)}
          disabled={p.startSec <= 0}
          aria-label={t.musicStartEarlier}
          data-testid="montage-music-start-earlier"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-text hover:bg-app-elevated disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        {/* `appearance-none` opts into the app's range styling: a 44 px grab strip around a 6 px track (globals.css). */}
        <input
          id={id}
          type="range"
          min={0}
          max={p.maxSec}
          step={0.1}
          value={Math.min(p.startSec, p.maxSec)}
          aria-valuetext={fmtClock(p.startSec)}
          onChange={(e) => p.onChange(parseFloat(e.target.value))}
          data-testid="montage-music-start"
          className="min-w-0 flex-1 appearance-none"
        />
        <button
          type="button"
          onClick={() => p.onChange(p.startSec + 1)}
          disabled={p.startSec >= p.maxSec}
          aria-label={t.musicStartLater}
          data-testid="montage-music-start-later"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-text hover:bg-app-elevated disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="text-[11.5px] leading-snug text-app-muted">{t.musicStartHint}</p>
    </div>
  );
}

export function MusicPanel(p: {
  t: Copy;
  music: MediaSource | null;
  library: { items: LibraryItem[]; loading: boolean; signedOut: boolean };
  originalSound: boolean;
  shorterThanEdit: boolean;
  /** Where the song starts, and what the start control needs to draw it. */
  startSec: number;
  startMaxSec: number;
  editSec: number;
  peaks: readonly number[];
  onStart: (sec: number) => void;
  onUpload: () => void;
  onPick: (item: LibraryItem) => void;
  onRemove: () => void;
  onToggleOriginal: () => void;
  onDone: () => void;
}) {
  const { t } = p;
  return (
    <PanelShell title={t.musicTitle} onDone={p.onDone} doneLabel={t.done} testId="montage-panel-music">
      {p.music ? (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-app-elevated px-3 py-2.5">
            <Music2 size={18} aria-hidden="true" className="shrink-0 text-app-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] text-app-text">{p.music.name}</p>
              {p.music.status === 'uploading' && <p className="text-[11.5px] text-app-muted">{t.uploading}</p>}
              {p.music.status === 'error' && <p className="text-[11.5px] text-app-danger">{p.music.error ?? t.failed}</p>}
              {p.music.status === 'ready' && p.shorterThanEdit && <p className="text-[11.5px] text-app-muted">{t.musicShorter}</p>}
            </div>
            <button
              type="button"
              onClick={p.onRemove}
              aria-label={t.removeMusic}
              data-testid="montage-music-remove"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted hover:bg-app-surface hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
          {p.music.status !== 'error' && (
            <MusicStart
              t={t}
              startSec={p.startSec}
              maxSec={p.startMaxSec}
              trackSec={p.music.durationSec}
              editSec={p.editSec}
              peaks={p.peaks}
              onChange={p.onStart}
            />
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={p.onUpload}
          data-testid="montage-music-upload"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-app-border/25 text-[13.5px] text-app-text hover:border-app-border/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <Upload size={16} aria-hidden="true" /> {t.uploadMusic}
        </button>
      )}

      <div className="mt-3" data-testid="montage-keep-sound">
        <ToggleRow on={p.originalSound} onChange={p.onToggleOriginal} label={t.keepClipSound} {...(p.music ? { hint: t.keepClipSoundHint } : {})} />
      </div>

      <h4 className="mb-1.5 mt-4 text-[12px] font-medium uppercase tracking-wide text-app-muted">{t.myMusic}</h4>
      {p.library.signedOut ? (
        <p className="text-[12.5px] text-app-muted">{t.signInLibrary}</p>
      ) : p.library.loading ? (
        <p className="flex items-center gap-2 text-[12.5px] text-app-muted"><Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> …</p>
      ) : p.library.items.length === 0 ? (
        <p className="text-[12.5px] text-app-muted">{t.myMusicEmpty}</p>
      ) : (
        <ul className="divide-y divide-app-border/10" data-testid="montage-my-music">
          {p.library.items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => p.onPick(it)}
                className="flex min-h-[44px] w-full items-center gap-2.5 text-left text-[13px] text-app-text hover:text-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              >
                <Music2 size={15} aria-hidden="true" className="shrink-0 text-app-muted" />
                <span className="min-w-0 flex-1 truncate">{it.prompt || it.id.slice(0, 8)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

// ── Text ─────────────────────────────────────────────────────────────────────────────────────────────

export function TextPanel(p: {
  t: Copy;
  hasClip: boolean;
  clipLabel: string;
  text: string;
  pos: MontageCaptionPos;
  onText: (s: string) => void;
  onPos: (pos: MontageCaptionPos) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const { t } = p;
  return (
    <PanelShell title={t.textTitle} onDone={p.onDone} doneLabel={t.done} testId="montage-panel-text">
      {!p.hasClip ? (
        <p className="text-[13px] text-app-muted">{t.textNeedsClip}</p>
      ) : (
        <>
          <p className="mb-1.5 text-[12px] text-app-muted">{p.clipLabel}</p>
          <textarea
            value={p.text}
            onChange={(e) => p.onText(e.target.value)}
            maxLength={MAX_CAPTION_CHARS}
            rows={2}
            placeholder={t.textPh}
            aria-label={t.textTitle}
            data-testid="montage-text-input"
            // 16 px: iOS zooms the page into any smaller field.
            className="w-full resize-none rounded-xl bg-app-elevated px-3 py-2.5 text-[16px] leading-snug text-app-text placeholder:text-app-muted/80 outline-none ring-1 ring-app-border/15 focus:ring-app-accent/60"
          />
          <div className="mt-1 flex justify-end text-[11px] tabular-nums text-app-muted">{p.text.length}/{MAX_CAPTION_CHARS}</div>
          <Choice
            label={t.textTitle}
            testId="montage-text-pos"
            options={[{ id: 'bottom' as const }, { id: 'center' as const }]}
            value={p.pos}
            onChange={p.onPos}
            render={(o, active) => (
              <span className={cx('flex min-h-[44px] items-center gap-2 rounded-xl px-3.5 ring-1', active ? 'bg-app-accent/15 ring-app-accent/50' : 'bg-app-elevated ring-app-border/15')}>
                <span aria-hidden="true" className="relative h-5 w-4 rounded-[3px] border border-current opacity-80">
                  <span className={cx('absolute inset-x-0.5 h-[2px] rounded bg-current', o.id === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-0.5')} />
                </span>
                {o.id === 'center' ? t.posCenter : t.posBottom}
              </span>
            )}
          />
          {p.text.trim() && (
            <button
              type="button"
              onClick={p.onRemove}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-app-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
            >
              <Trash2 size={15} aria-hidden="true" /> {t.removeText}
            </button>
          )}
        </>
      )}
    </PanelShell>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────────────────────────────

export function FiltersPanel(p: {
  t: Copy; locale: string; filterId: string; poster: string | null; onPick: (id: string, grade: MontageGrade) => void; onDone: () => void;
}) {
  const l = langOf(p.locale);
  return (
    <PanelShell title={p.t.filters} onDone={p.onDone} doneLabel={p.t.done} testId="montage-panel-filters">
      <Choice
        label={p.t.filters}
        testId="montage-filters"
        // A scrolling row in the phone drawer (CapCut's strip); a grid in the desktop column, all eight at a glance.
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible"
        options={FILTERS}
        value={p.filterId}
        onChange={(id) => { const f = FILTERS.find((x) => x.id === id); if (f) p.onPick(f.id, f.grade); }}
        render={(o, active) => {
          const f = FILTERS.find((x) => x.id === o.id)!;
          const css = `saturate(${f.grade.saturation}%) contrast(${f.grade.contrast}%) brightness(${f.grade.brightness}%)${f.grade.temperature > 0 ? ` sepia(${(f.grade.temperature / 100) * 0.35})` : f.grade.temperature < 0 ? ` hue-rotate(${(f.grade.temperature / 100) * 18}deg)` : ''}`;
          return (
            <span className="flex w-[68px] flex-col items-center gap-1.5 py-1">
              <span className={cx('block h-[68px] w-[68px] overflow-hidden rounded-xl bg-app-elevated ring-2', active ? 'ring-app-accent' : 'ring-transparent')}>
                {p.poster
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.poster} alt="" className="h-full w-full object-cover" style={{ filter: css }} />
                  : <span className="block h-full w-full bg-gradient-to-br from-[#3a2f28] via-[#1d2a33] to-[#0f1418]" style={{ filter: css }} />}
              </span>
              <span className="w-full truncate text-center">{f.label[l]}</span>
            </span>
          );
        }}
      />
      <p className="mt-2 text-[11.5px] text-app-muted">{p.t.appliesToAll}</p>
    </PanelShell>
  );
}

// ── Colour (Adjust) ──────────────────────────────────────────────────────────────────────────────────

export function AdjustPanel(p: { t: Copy; grade: MontageGrade; onChange: (g: MontageGrade) => void; onReset: () => void; onDone: () => void }) {
  const { t, grade } = p;
  const set = (k: keyof MontageGrade) => (v: number) => p.onChange({ ...grade, [k]: v });
  return (
    <PanelShell title={t.adjustTitle} onDone={p.onDone} doneLabel={t.done} testId="montage-panel-adjust">
      <div className="space-y-3">
        <Slider stacked label={t.brightness} min={50} max={150} value={grade.brightness} onChange={set('brightness')} />
        <Slider stacked label={t.contrast} min={50} max={200} value={grade.contrast} onChange={set('contrast')} />
        <Slider stacked label={t.saturation} min={0} max={200} value={grade.saturation} onChange={set('saturation')} />
        <Slider stacked label={t.temperature} min={-100} max={100} suffix="" value={grade.temperature} onChange={set('temperature')} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-app-muted">{t.appliesToAll}</p>
        <button
          type="button"
          onClick={p.onReset}
          className="inline-flex min-h-[44px] items-center px-2 text-[13px] text-app-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          {t.reset}
        </button>
      </div>
    </PanelShell>
  );
}

// ── Format ───────────────────────────────────────────────────────────────────────────────────────────

export function AspectChoice({ locale, value, onChange, label, size = 'md' }: {
  locale: string; value: MontageAspect; onChange: (a: MontageAspect) => void; label: string; size?: 'md' | 'lg';
}) {
  const l = langOf(locale);
  return (
    <Choice
      label={label}
      testId="montage-aspect"
      options={ASPECTS}
      value={value}
      onChange={onChange}
      // The start screen: three equal cards that always fit. The format panel: one scrolling row.
      {...(size === 'lg' ? { className: 'grid grid-cols-3 gap-2' } : {})}
      render={(o, active) => {
        const a = ASPECTS.find((x) => x.id === o.id)!;
        const r = aspectRatio(a.id);
        const box = size === 'lg' ? 30 : 26;
        const frame = (
          <span className="flex shrink-0 items-center justify-center" style={{ width: box, height: box }} aria-hidden="true">
            <span className="block rounded-[3px] border-2 border-current" style={{ width: r >= 1 ? box : box * r, height: r >= 1 ? box / r : box }} />
          </span>
        );
        if (size === 'lg') {
          return (
            <span className={cx(
              'flex h-full min-h-[104px] w-full flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-center ring-1',
              active ? 'bg-app-accent/15 ring-app-accent/50' : 'bg-app-elevated ring-app-border/15',
            )}>
              {frame}
              <span className="block text-[14px] font-semibold tabular-nums">{a.id}</span>
              <span className="block text-[11px] leading-tight text-app-muted">{a.where[l]}</span>
            </span>
          );
        }
        return (
          <span className={cx(
            'flex min-h-[52px] items-center gap-2.5 rounded-xl px-3 ring-1',
            active ? 'bg-app-accent/15 ring-app-accent/50' : 'bg-app-elevated ring-app-border/15',
          )}>
            {frame}
            <span className="min-w-0 text-left">
              <span className="block text-[13.5px] font-semibold tabular-nums">{a.id}</span>
              <span className="block truncate text-[11px] text-app-muted">{a.where[l]}</span>
            </span>
          </span>
        );
      }}
    />
  );
}

export function FormatPanel(p: { t: Copy; locale: string; aspect: MontageAspect; onChange: (a: MontageAspect) => void; onDone: () => void }) {
  return (
    <PanelShell title={p.t.formatTitle} onDone={p.onDone} doneLabel={p.t.done} testId="montage-panel-format">
      <AspectChoice locale={p.locale} value={p.aspect} onChange={p.onChange} label={p.t.formatTitle} />
      <p className="mt-2 text-[11.5px] text-app-muted">{p.t.formatHint}</p>
    </PanelShell>
  );
}

// ── Transition ───────────────────────────────────────────────────────────────────────────────────────

export function TransitionPanel(p: {
  t: Copy; locale: string; value: MontageTransition; clipLabel: string; onChange: (v: MontageTransition) => void; onApplyAll: () => void; onDone: () => void;
}) {
  const l = langOf(p.locale);
  return (
    <PanelShell title={p.t.transitionTitle} onDone={p.onDone} doneLabel={p.t.done} testId="montage-panel-transition">
      <p className="mb-2 text-[12px] text-app-muted">{p.clipLabel}</p>
      <Choice
        label={p.t.transitionTitle}
        testId="montage-transition-choice"
        options={TRANSITIONS}
        value={p.value}
        onChange={p.onChange}
        render={(o, active) => {
          const tr = TRANSITIONS.find((x) => x.id === o.id)!;
          return (
            <span className={cx('flex min-h-[44px] items-center rounded-xl px-3.5 ring-1', active ? 'bg-app-accent/15 ring-app-accent/50' : 'bg-app-elevated ring-app-border/15')}>
              {tr.label[l]}
            </span>
          );
        }}
      />
      <button
        type="button"
        onClick={p.onApplyAll}
        data-testid="montage-transition-all"
        className="mt-3 inline-flex min-h-[44px] items-center text-[13px] text-app-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
      >
        {p.t.applyAll}
      </button>
    </PanelShell>
  );
}

// ── Photo duration ───────────────────────────────────────────────────────────────────────────────────

export function DurationPanel(p: { t: Copy; value: number; onChange: (v: number) => void; onDone: () => void }) {
  return (
    <PanelShell title={p.t.durationTitle} onDone={p.onDone} doneLabel={p.t.done} testId="montage-panel-duration">
      <Slider
        stacked
        label={p.t.durationTitle}
        min={Math.max(0.5, MIN_SHOT_SEC)}
        max={PHOTO_MAX_SEC}
        step={0.5}
        suffix={` ${p.t.sec}`}
        value={p.value}
        onChange={p.onChange}
      />
    </PanelShell>
  );
}
