'use client';

/**
 * The foot of the Create screen: two tiles (length · tempo — ref4's tile row) and the big "♪✦ Create" pill with the
 * EXACT price on it (components/studio/ui/GenerateButton · lib/studio/musicQuote → lib/credits/quote — the number the route
 * charges). A fragment on purpose: the pill pins itself to the bottom of the scroll container (`stickyBottom`), and a
 * sticky element can only travel inside its parent, so its parent has to be the whole panel, not a wrapper of its own.
 *
 * A tile opens a small list upward. The length list shows each stop's price, so the cost of a longer track is known
 * before it is picked; with a cover attached the length is fixed (the route bills a cover as a flat 30 s) and the tile
 * says so instead of offering choices that would change nothing.
 */
import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown, Music4, Timer } from 'lucide-react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { MUSIC_DURATIONS, musicQuote, type MusicDuration } from '@/lib/studio/musicQuote';
import { MUSIC_TEMPOS, musicCreateCopy, tempoName, type MusicTempo } from './musicCreateCopy';
import { Dropdown, FloatingPanel, cx } from './primitives';

function Tile<T extends string | number>({
  testId, icon, caption, valueLabel, options, value, onPick, locked, lockedNote, listLabel,
}: {
  testId: string;
  icon: React.ReactNode;
  caption: string;
  valueLabel: string;
  options: ReadonlyArray<{ id: T; label: string; detail?: React.ReactNode }>;
  value: T;
  onPick: (v: T) => void;
  locked?: boolean;
  lockedNote?: string;
  listLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  return (
    <Dropdown open={open} onClose={close} className="min-w-0">
      <button
        ref={btn}
        type="button"
        data-testid={testId}
        data-locked={locked ? 'true' : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={locked || undefined}
        aria-label={`${caption}: ${valueLabel}${locked && lockedNote ? ` — ${lockedNote}` : ''}`}
        title={locked ? lockedNote : undefined}
        onClick={locked ? undefined : () => setOpen((v) => !v)}
        className={cx(
          'flex min-h-[48px] w-full min-w-0 touch-manipulation items-center gap-2 rounded-2xl bg-app-elevated/55 px-3.5 text-left text-[15px] text-app-text ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
          locked && 'cursor-not-allowed opacity-60 hover:bg-app-elevated/55',
        )}
      >
        <span aria-hidden="true" className="shrink-0 text-app-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate tabular-nums">{valueLabel}</span>
        {!locked && <ChevronDown size={14} aria-hidden="true" className={cx('shrink-0 text-app-muted transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <FloatingPanel label={listLabel} align="left" placement="top" testId={`${testId}-list`}>
          <div role="listbox" aria-label={listLabel}>
            {options.map((o) => {
              const on = o.id === value;
              return (
                <button
                  key={String(o.id)}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => { onPick(o.id); close(); }}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] text-app-text transition-colors hover:bg-app-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.detail != null && <span className="shrink-0 text-[12.5px] tabular-nums text-app-muted">{o.detail}</span>}
                  {on && <Check size={15} aria-hidden="true" className="shrink-0 text-app-accent" />}
                </button>
              );
            })}
          </div>
        </FloatingPanel>
      )}
    </Dropdown>
  );
}

export function CreateBar({
  locale, price, insufficient, onCreate, duration, onDuration, cover, tempo, onTempo,
}: {
  locale: string;
  /** The exact credits for this press (lib/studio/musicQuote). */
  price: number;
  /** The balance is known and below `price`: the tap opens the top-up instead of creating. */
  insufficient: boolean;
  onCreate: () => void;
  duration: MusicDuration;
  onDuration: (d: MusicDuration) => void;
  /** A melody reference is attached: the route bills a flat 30 s, so the length cannot be chosen. */
  cover: boolean;
  tempo: MusicTempo;
  onTempo: (t: MusicTempo) => void;
}) {
  const cc = musicCreateCopy(locale);
  const lengthName = (d: MusicDuration) => (d === 0 ? cc.lengthFull : `${d} ${cc.secondsShort}`);
  const shown: MusicDuration = cover ? 30 : duration;
  return (
    <>
      <div data-testid="music-tiles" className="grid grid-cols-2 gap-2">
        <Tile
          testId="music-tile-length"
          icon={<Timer size={16} />}
          caption={cc.tileLength}
          valueLabel={lengthName(shown)}
          listLabel={cc.length}
          locked={cover}
          lockedNote={cc.refCoverNote}
          value={shown}
          onPick={onDuration}
          options={MUSIC_DURATIONS.map((d) => ({ id: d, label: lengthName(d), detail: `${musicQuote({ duration: d })} ${cc.creditsShort}` }))}
        />
        <Tile
          testId="music-tile-tempo"
          icon={<Music4 size={16} />}
          caption={cc.tileTempo}
          valueLabel={tempoName(locale, tempo)}
          listLabel={cc.tempo}
          value={tempo}
          onPick={onTempo}
          options={MUSIC_TEMPOS.map((t) => ({ id: t, label: tempoName(locale, t) }))}
        />
      </div>
      <GenerateButton
        service="music.generate"
        testId="music-create"
        label={cc.create}
        credits={price}
        insufficient={insufficient}
        locale={locale}
        onClick={onCreate}
        stickyBottom
        icon={<Music4 size={20} strokeWidth={2.25} />}
      />
    </>
  );
}
