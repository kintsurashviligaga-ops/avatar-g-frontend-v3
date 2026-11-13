'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { useSpeechState } from '@/lib/speech/useSpeech';
import { Loader2, Pause, Play, RotateCcw, Square, TextSelect, Volume2 } from 'lucide-react';
import { createReadAloud, readerSnapshot, type ReaderSnapshot } from '@/lib/voice/experience/readAloud';
const COPY = {
 ka: { title:'წაკითხვა',all:'სრულად წაკითხვა',selected:'მონიშნულის წაკითხვა',pause:'პაუზა',resume:'გაგრძელება',stop:'გაჩერება',retry:'თავიდან სცადე',speed:'წაკითხვის სიჩქარე',error:'წაკითხვა ვერ დაიწყო. დაასრულე ხმოვანი ზარი ან სცადე ხელახლა.',idle:'მზადაა',loading:'მზადდება',playing:'იკითხება',paused:'შეჩერებულია',completed:'დასრულდა' },
 en: { title:'Read aloud',all:'Read complete response',selected:'Read selection',pause:'Pause',resume:'Resume',stop:'Stop',retry:'Try again',speed:'Reading speed',error:'Reading could not start. End the voice call or try again.',idle:'Ready',loading:'Preparing',playing:'Reading',paused:'Paused',completed:'Completed' },
 ru: { title:'Чтение вслух',all:'Прочитать полностью',selected:'Прочитать выделенное',pause:'Пауза',resume:'Продолжить',stop:'Остановить',retry:'Повторить',speed:'Скорость чтения',error:'Не удалось начать. Завершите голосовой звонок или повторите.',idle:'Готово',loading:'Подготовка',playing:'Чтение',paused:'Пауза',completed:'Завершено' },
};
/** The speeds offered, as chips (Phase 7.5: a native <select> on a black square read as a different app). */
export const READ_ALOUD_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/**
 * One message's read-aloud row, in the app's own tokens (Phase 7.5, GG 2026-11-13: the row was white-on-black with its own
 * borders). Read · Pause/Resume · Stop as icon buttons with their names, the speed as chips, and a bar for how far the read
 * has gone (chunks read of chunks). Behaviour is unchanged: lib/voice/experience/readAloud still does the reading.
 */
export function ReadAloudControls({ text, selectedText, locale='ka' }: { text:string; selectedText?:string; locale?:'ka'|'en'|'ru' }) {
  const owner = `controls:${useId()}`;
  const speech = useSpeechState();
  const [speed, setSpeed] = useState(1);
  const [refused, setRefused] = useState(false);
  const reader = useMemo(() => createReadAloud(owner, locale), [owner, locale]);
  useEffect(() => () => reader.stop(), [reader, text]);
  const state: ReaderSnapshot = refused ? { status: 'error', chunk: 0, total: 0, speed, error: 'invalid_text' } : readerSnapshot(speech, owner, speed);
  const play = (t: string) => setRefused(!reader.play(t, speed));
  const t = COPY[locale];
  const active = ['playing', 'loading', 'paused'].includes(state.status);
  const pct = state.total > 0 ? Math.round((Math.min(state.chunk, state.total) / state.total) * 100) : 0;
  const btn = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-elevated px-3.5 text-[13px] font-semibold text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-40';
  const chip = (on: boolean) => `min-h-[44px] min-w-[44px] rounded-full px-2.5 text-[13px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${on ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40' : 'text-app-muted hover:bg-app-elevated/60'}`;
  return <section aria-label={t.title} data-live-guard="spend" data-testid="read-aloud" className="space-y-2 rounded-2xl bg-app-surface/60 p-2.5 text-app-text ring-1 ring-app-border/10">
    <div className="flex flex-wrap items-center gap-2">
      <button className={`${btn} bg-app-accent/15 text-app-accent ring-app-accent/30`} type="button" data-testid="read-aloud-all" onClick={() => play(text)}>
        {state.status === 'loading' ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Volume2 size={16} aria-hidden="true" />}{t.all}
      </button>
      {selectedText && <button className={btn} type="button" onClick={() => play(selectedText)}><TextSelect size={16} aria-hidden="true" />{t.selected}</button>}
      {state.status === 'error' && !refused
        ? <button className={btn} type="button" onClick={reader.retry}><RotateCcw size={16} aria-hidden="true" />{t.retry}</button>
        : <button className={btn} type="button" data-testid="read-aloud-pause" disabled={!active}
            onClick={() => (state.status === 'paused' ? reader.resume() : reader.pause())}>
            {state.status === 'paused' ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{state.status === 'paused' ? t.resume : t.pause}
          </button>}
      <button className={btn} type="button" data-testid="read-aloud-stop" disabled={!active && state.status !== 'error'} onClick={() => { setRefused(false); reader.stop(); }}><Square size={14} aria-hidden="true" />{t.stop}</button>
    </div>
    <div role="radiogroup" aria-label={t.speed} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[12px] text-app-muted">{t.speed}</span>
      {READ_ALOUD_SPEEDS.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={speed === n} data-testid={`read-aloud-speed-${n}`} className={chip(speed === n)}
          onClick={() => { setSpeed(n); reader.setSpeed(n); }}>{n}×</button>
      ))}
    </div>
    {state.total > 0 && (
      <div role="progressbar" aria-label={t.title} aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={Math.min(state.chunk, state.total)} data-testid="read-aloud-progress"
        className="h-1.5 overflow-hidden rounded-full bg-app-elevated">
        <div className="h-full rounded-full bg-app-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    )}
    <span role="status" className={`block text-[12px] ${state.status === 'error' ? 'text-app-warning' : 'text-app-muted'}`}>
      {state.status === 'error' ? t.error : t[state.status]}{state.total > 0 ? ` · ${state.chunk}/${state.total}` : ''}
    </span>
  </section>;
}
