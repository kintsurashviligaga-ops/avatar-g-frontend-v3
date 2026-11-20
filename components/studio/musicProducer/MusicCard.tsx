'use client';

/**
 * The Music Card (Phase 8.5): waveform player, scrolling lyrics synced by section, and the honest actions —
 * "Add 30 s (new section, same style)", "Restyle (new take)" (new genre / mood / instruments, same lyrics, structure and
 * tempo), "Use in Video" (a Director's Workflow scene, the whole film, or Montage), Download. No stems: not offered (GG 2026-11-15).
 */
import { useRef, useState, type ReactNode } from 'react';
import { WaveformPlayer, type PlayerHandle } from './WaveformPlayer';
import { LyricsPane } from './LyricsPane';
import { chip } from './ProducerControls';
import { LABELS } from '@/lib/music/producer/labels';
import { specSummary } from '@/lib/music/producer/brief';
import { GENRES, MAX_MOODS, MOODS, type ProducerLang } from '@/lib/music/producer/spec';
import type { ProducerMeta } from '@/lib/music/producer/library';
import type { StyleChange } from '@/lib/music/producer/request';
import { MAX_TOTAL_SEC } from '@/lib/music/producer/extend';

export interface MusicCardTrack { id: string; url: string; meta: ProducerMeta }

const T = {
  download: { ka: 'ჩამოტვირთვა', en: 'Download', ru: 'Скачать' },
  apply: { ka: 'შექმნა', en: 'Make the new take', ru: 'Создать дубль' },
  cancel: { ka: 'გაუქმება', en: 'Cancel', ru: 'Отмена' },
  part: { ka: 'ნაწილი', en: 'part', ru: 'часть' },
} as const;

export function MusicCard({ track, lang, busy, extendCredits, restyleCredits, onExtend, onRestyle, onUseInVideo, peaks, footer, actions = true }: {
  track: MusicCardTrack;
  lang: ProducerLang;
  busy: boolean;
  extendCredits: number;
  restyleCredits: number;
  onExtend: (id: string) => void;
  onRestyle: (id: string, style: StyleChange) => void;
  onUseInVideo?: (track: MusicCardTrack) => void;
  peaks?: number[];
  /** Rendered under the card (the Use in Video sheet). */
  footer?: ReactNode;
  /** false = player and lyrics only (Agent G's plan card shows the result; the actions live in the Music Producer). */
  actions?: boolean;
}) {
  const player = useRef<PlayerHandle>(null);
  const [time, setTime] = useState(0);
  const [restyling, setRestyling] = useState(false);
  const [style, setStyle] = useState<StyleChange>({ genre: track.meta.spec.genre, moods: track.meta.spec.moods });
  const m = track.meta;
  const canExtend = m.durationSec + 30 <= MAX_TOTAL_SEC;
  const moods = style.moods ?? [];
  return (
    <article data-testid={`mp-card-${track.id}`} className="space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/60 p-4 shadow-xl shadow-black/10">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold text-app-text">{specSummary(m.spec, lang)}</h3>
        {m.part > 0 && <span className="shrink-0 text-[12px] text-app-muted">+{m.part} {T.part[lang]}</span>}
      </header>
      <WaveformPlayer ref={player} url={track.url} durationSec={m.durationSec} peaks={peaks} onTime={setTime} label={specSummary(m.spec, lang)} />
      <LyricsPane lines={m.lines} time={time} onSeek={(s) => player.current?.seek(s)} lang={lang} />

      {actions && <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="mp-extend" disabled={busy || !canExtend} title={LABELS.extendTip[lang]}
          onClick={() => onExtend(track.id)} className={chip(false)}>
          {LABELS.extend[lang]} <span className="tabular-nums">✦{extendCredits}</span>
        </button>
        <button type="button" data-testid="mp-restyle" disabled={busy} title={LABELS.restyleTip[lang]} aria-expanded={restyling}
          onClick={() => setRestyling((v) => !v)} className={chip(restyling)}>
          {LABELS.restyle[lang]} <span className="tabular-nums">✦{restyleCredits}</span>
        </button>
        <button type="button" data-testid="mp-use-in-video" disabled={busy || !onUseInVideo} onClick={() => onUseInVideo?.(track)} className={chip(false)}>
          {LABELS.useInVideo[lang]}
        </button>
        <a data-testid="mp-download" href={track.url} download={`myavatar-${track.id}.mp3`} className={chip(false)}>{T.download[lang]}</a>
      </div>}

      {restyling && (
        <div data-testid="mp-restyle-panel" className="space-y-2 rounded-xl border border-app-border/15 bg-app-bg/40 p-3">
          <p className="text-[12px] text-app-muted">{LABELS.restyleTip[lang]}</p>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <button key={g.id} type="button" aria-pressed={style.genre === g.id} data-testid={`mp-restyle-genre-${g.id}`}
                onClick={() => setStyle({ ...style, genre: g.id })} className={chip(style.genre === g.id)}>{g.label[lang]}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((x) => {
              const on = moods.includes(x.id);
              return <button key={x.id} type="button" aria-pressed={on} disabled={!on && moods.length >= MAX_MOODS}
                onClick={() => setStyle({ ...style, moods: on ? moods.filter((y) => y !== x.id) : [...moods, x.id] })} className={chip(on)}>{x.label[lang]}</button>;
            })}
          </div>
          <div className="flex gap-2">
            <button type="button" data-testid="mp-restyle-go" disabled={busy}
              onClick={() => { setRestyling(false); onRestyle(track.id, style); }}
              className="rounded-full bg-app-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">{T.apply[lang]} · ✦{restyleCredits}</button>
            <button type="button" onClick={() => setRestyling(false)} className={chip(false)}>{T.cancel[lang]}</button>
          </div>
        </div>
      )}
      {footer}
    </article>
  );
}
