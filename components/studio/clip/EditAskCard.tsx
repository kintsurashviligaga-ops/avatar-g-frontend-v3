'use client';

/**
 * EditAskCard — an uploaded video, edited or extended by Gemini Omni Flash, asked before it is made (GG 2026-10-25 16:58Z;
 * card 17:04Z „კი, ორივე").
 *
 *   „the user's words, exactly as typed"
 *   [▶ the video]
 *   [Edit]  Extend            (+4  +6  [+8]  +10 when extending)
 *   720p ✦48   1080p ✦68
 *   Edit · 5 s · 720p · Gemini Omni Flash
 *   [Create ✦ 48]  [Cancel]
 *
 * The price is ON Create and moves with every chip (components/studio/clip/editOrder → lib/video/omniEdit, the route's own
 * functions). The frame is the video's own; the sound follows the words, as for the clip.
 */
import type { ReactNode } from 'react';
import { Loader2, Sparkle } from 'lucide-react';
import { creditsLabel } from '@/lib/credits/quote';
import type { DirectClipResolution } from '@/lib/video/directClip';
import { OMNI_EDIT_SECONDS, type OmniEditOp } from '@/lib/video/omniEdit';
import { ClipProgress } from './ClipProgress';
import { PromptQuote } from './PromptQuote';
import { clipCancelledText, clipFinishingText } from './clipOrder';
import { changeEdit, editOpAllowed, editPriceNote, editRunningText, editSpecLine, type EditAskState, type EditChange } from './editOrder';

const RESOLUTIONS: readonly DirectClipResolution[] = ['720p', '1080p'];
const OPS: readonly OmniEditOp[] = ['edit', 'extend'];

function words(locale: string) {
  const en = locale === 'en', ru = locale === 'ru';
  return {
    create: en ? 'Create' : ru ? 'Создать' : 'შექმნა',
    cancel: en ? 'Cancel' : ru ? 'Отмена' : 'გაუქმება',
    starting: en ? 'Starting…' : ru ? 'Запуск…' : 'იწყება…',
    what: en ? 'What to do' : ru ? 'Что сделать' : 'რა გავაკეთო',
    length: en ? 'New seconds' : ru ? 'Новые секунды' : 'ახალი წამები',
    quality: en ? 'Quality' : ru ? 'Качество' : 'ხარისხი',
    op: (op: OmniEditOp) => (op === 'extend' ? (en ? 'Extend' : ru ? 'Продлить' : 'გაგრძელება') : (en ? 'Edit' : ru ? 'Изменить' : 'რედაქტირება')),
    sec: (s: number) => (en ? `+${s} s` : ru ? `+${s} с` : `+${s} წმ`),
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

export function EditAskCard({
  ask, locale, onChange, onConfirm, onCancel,
}: {
  ask: EditAskState;
  locale: string;
  onChange: (next: EditAskState) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const w = words(locale);
  if (ask.phase === 'cancelled') {
    return <p className="mt-1 text-[12px] text-app-muted" data-testid="edit-cancelled">{clipCancelledText(locale)}</p>;
  }
  const editable = ask.phase === 'ask';
  const set = (change: EditChange) => { if (editable) onChange(changeEdit(ask, change)); };
  const resPrice = (r: DirectClipResolution) => changeEdit(ask, { resolution: r }).credits;

  return (
    <div className="mt-2 space-y-2.5" data-testid="edit-card" data-phase={ask.phase} data-op={ask.op} data-seconds={ask.seconds}>
      <PromptQuote text={ask.prompt} locale={locale} testId="edit-prompt" />

      <video
        data-testid="edit-video"
        src={ask.video.url}
        {...(ask.video.poster ? { poster: ask.video.poster } : {})}
        controls
        muted
        playsInline
        preload="metadata"
        className="max-h-44 max-w-full rounded-xl bg-black ring-1 ring-app-border/20"
      />

      <div className="space-y-1.5">
        {/* Once Create is accepted the chips go: the spec line says what is being made. */}
        {ask.phase !== 'running' && (<>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={w.what}>
            {OPS.map((op) => (
              <Chip key={op} on={ask.op === op} disabled={!editable || !editOpAllowed(op, ask.inputSec)} onClick={() => set({ op })} testId={`edit-op-${op}`}>
                {w.op(op)}
              </Chip>
            ))}
          </div>
          {ask.op === 'extend' && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={w.length}>
              {OMNI_EDIT_SECONDS.map((s) => (
                <Chip key={s} on={ask.seconds === s} disabled={!editable} onClick={() => set({ seconds: s })} testId={`edit-len-${s}`}>
                  {w.sec(s)}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={w.quality}>
            {RESOLUTIONS.map((r) => (
              <Chip key={r} on={ask.resolution === r} disabled={!editable} onClick={() => set({ resolution: r })} testId={`edit-res-${r}`}>
                {r} <span className="ml-1 opacity-70">✦ {resPrice(r)}</span>
              </Chip>
            ))}
          </div>
        </>)}
        <p data-testid="edit-spec" className="text-[12px] tabular-nums text-app-muted">{editSpecLine(ask, locale)}</p>
        <p data-testid="edit-price-note" className="text-[11.5px] leading-snug text-app-muted">{editPriceNote(ask, locale)}</p>
      </div>

      {ask.phase === 'running' ? (
        <ClipProgress
          testId="edit-running" step={ask.step ?? 'rendering'} since={ask.t0}
          label={ask.step === 'finishing' ? clipFinishingText(locale) : editRunningText(ask.op, locale)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!editable}
            data-testid="edit-confirm"
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
              data-testid="edit-cancel"
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
