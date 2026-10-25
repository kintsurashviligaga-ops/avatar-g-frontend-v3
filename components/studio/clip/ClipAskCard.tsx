'use client';

/**
 * ClipAskCard — the video service's one clip, asked before it is made (GG 2026-10-25: „like Gemini's Veo").
 *
 *   „the user's words, exactly as typed"
 *   [photo] [photo]           the first frame, or the references
 *   4 s  6 s  [8 s]  10 s     9:16  16:9      (10 s: 720p ✦69 · 1080p ✦102)
 *   8 s · 9:16 · 1080p · 1080×1920 · Veo 3.1 Fast
 *   [Create ✦ 75]  [Cancel]
 *
 * The price is ON Create and moves with every chip (components/studio/clip/clipOrder → lib/video/directClip, the route's
 * own functions). No switch for sound, music, subtitles or a narrator: the engine's sound follows the prompt.
 */
import type { ReactNode } from 'react';
import { Loader2, Sparkle } from 'lucide-react';
import { creditsLabel } from '@/lib/credits/quote';
import type { DirectClipAspect, DirectClipResolution } from '@/lib/video/directClip';
import {
  changeClip, clipCancelledText, clipLengthsFor, clipPhotoNote, clipRunningText, clipSpecLine, type ClipAskState, type ClipChange,
} from './clipOrder';

const ASPECTS: readonly DirectClipAspect[] = ['9:16', '16:9'];
const RESOLUTIONS: readonly DirectClipResolution[] = ['720p', '1080p'];

function words(locale: string) {
  const en = locale === 'en', ru = locale === 'ru';
  return {
    create: en ? 'Create' : ru ? 'Создать' : 'შექმნა',
    cancel: en ? 'Cancel' : ru ? 'Отмена' : 'გაუქმება',
    starting: en ? 'Starting…' : ru ? 'Запуск…' : 'იწყება…',
    length: en ? 'Length' : ru ? 'Длина' : 'სიგრძე',
    format: en ? 'Format' : ru ? 'Формат' : 'ფორმატი',
    quality: en ? 'Quality' : ru ? 'Качество' : 'ხარისხი',
    sec: (s: number) => (en ? `${s} s` : ru ? `${s} с` : `${s} წმ`),
  };
}

function Chip({ on, disabled, onClick, children, testId }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      data-testid={testId}
      className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-[12.5px] font-medium tabular-nums transition-colors disabled:opacity-40 ${on
        ? 'bg-app-text text-app-bg'
        : 'border border-app-border/30 text-app-text hover:bg-app-elevated/60'}`}
    >
      {children}
    </button>
  );
}

export function ClipAskCard({
  ask, locale, onChange, onConfirm, onCancel,
}: {
  ask: ClipAskState;
  locale: string;
  onChange: (next: ClipAskState) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const w = words(locale);
  if (ask.phase === 'cancelled') {
    return <p className="mt-1 text-[12px] text-app-muted" data-testid="clip-cancelled">{clipCancelledText(locale)}</p>;
  }
  const editable = ask.phase === 'ask';
  const set = (change: ClipChange) => { if (editable) onChange(changeClip(ask, change)); };
  const lengths = clipLengthsFor(ask.photos.length);
  const note = clipPhotoNote(ask.photos.length, locale);
  const resPrice = (r: DirectClipResolution) => changeClip(ask, { resolution: r }).credits;

  return (
    <div className="mt-2 space-y-2.5" data-testid="clip-card" data-phase={ask.phase} data-seconds={ask.seconds} data-aspect={ask.aspect}>
      <blockquote data-testid="clip-prompt" className="whitespace-pre-wrap break-words rounded-2xl bg-app-elevated/70 px-3.5 py-2.5 text-[13.5px] leading-snug text-app-text">
        „{ask.prompt}“
      </blockquote>

      {ask.photos.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5" data-testid="clip-photos">
            {ask.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-app-border/20" />
            ))}
          </div>
          {note && <p className="text-[11.5px] leading-snug text-app-muted">{note}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={w.length}>
          {([4, 6, 8, 10] as const).map((s) => (
            <Chip key={s} on={ask.seconds === s} disabled={!editable || !lengths.includes(s)} onClick={() => set({ seconds: s })} testId={`clip-len-${s}`}>
              {w.sec(s)}
            </Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-app-border/20" aria-hidden="true" />
          {ASPECTS.map((a) => (
            <Chip key={a} on={ask.aspect === a} disabled={!editable} onClick={() => set({ aspect: a })} testId={`clip-aspect-${a.replace(':', 'x')}`}>
              {a}
            </Chip>
          ))}
        </div>
        {ask.seconds === 10 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={w.quality}>
            {RESOLUTIONS.map((r) => (
              <Chip key={r} on={ask.resolution === r} disabled={!editable} onClick={() => set({ resolution: r })} testId={`clip-res-${r}`}>
                {r} <span className="ml-1 opacity-70">✦ {resPrice(r)}</span>
              </Chip>
            ))}
          </div>
        )}
        <p data-testid="clip-spec" className="text-[12px] tabular-nums text-app-muted">{clipSpecLine(ask, locale)}</p>
      </div>

      {ask.phase === 'running' ? (
        <p data-testid="clip-running" className="inline-flex items-center gap-2 text-[12.5px] text-app-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          {clipRunningText(ask, locale)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!editable}
            data-testid="clip-confirm"
            data-price={ask.credits}
            data-live-guard="spend"
            aria-label={`${w.create} — ${creditsLabel(ask.credits, locale)}`}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {ask.phase === 'starting' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkle size={14} aria-hidden="true" />}
            <span>{ask.phase === 'starting' ? w.starting : w.create}</span>
            <span className="tabular-nums" aria-hidden="true">✦ {ask.credits}</span>
          </button>
          {editable && (
            <button
              type="button"
              onClick={onCancel}
              data-testid="clip-cancel"
              className="inline-flex min-h-[40px] items-center rounded-full border border-app-border/30 px-4 py-2 text-[12.5px] font-medium text-app-text transition-colors hover:bg-app-elevated/60"
            >
              {w.cancel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
