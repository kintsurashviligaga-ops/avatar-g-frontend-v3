'use client';

/**
 * AgentAudioCard — the buttons under Agent G's "take the MP3 out of this" plan (lib/agent/media/audioExtract), in the
 * chat thread itself, next to AgentMontageCard and built the same way.
 *
 *   quoted   the plan's facts (source · size · MP3 192 kbps · rights)        [Start · free]  [Cancel]
 *   running  the job row's stage and percent                                 [Stop]
 *   failed   a refusal the user can answer with their own file               [Upload a file]
 *
 * Start is the user's confirmation, and for a source whose rights could not be checked it is also their word that the
 * file is theirs or licensed to them (the plan says so above the button). Nothing is fetched or decoded before it. The
 * result is the bubble's own player (Download, Save to Library).
 */
import { FileAudio, Globe, ShieldCheck, ShieldQuestion, Sparkle, Square, Upload, X } from 'lucide-react';
import { audioStageText, formatBytes, uploadOfferLabel, type AgentAudioState } from '@/lib/agent/media/audioChat';

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { start: string; cancel: string; stop: string; stopping: string; free: string; yourFile: string; own: string; unverified: string }> = {
  ka: { start: 'დაწყება', cancel: 'გაუქმება', stop: 'შეჩერება', stopping: 'ვაჩერებ…', free: 'უფასო', yourFile: 'შენი ფაილი', own: 'უფლება: შენია', unverified: 'უფლება შეუმოწმებელია' },
  en: { start: 'Start', cancel: 'Cancel', stop: 'Stop', stopping: 'Stopping…', free: 'free', yourFile: 'your file', own: 'rights: yours', unverified: 'rights unverified' },
  ru: { start: 'Начать', cancel: 'Отмена', stop: 'Остановить', stopping: 'Останавливаю…', free: 'бесплатно', yourFile: 'ваш файл', own: 'права: ваши', unverified: 'права не проверены' },
};

export function AgentAudioCard({
  state, locale, onStart, onCancel, onUpload,
}: {
  state: AgentAudioState;
  locale: string;
  onStart: () => void;
  /** Cancel a plan (nothing happens), or Stop a running extraction (its worker kills ffmpeg). */
  onCancel: () => void;
  /** The upload offer after a refusal: opens the file picker with the request ready in the composer. */
  onUpload: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const q = state.quote;
  const chip = 'inline-flex items-center gap-1 rounded-full bg-app-elevated px-2.5 py-1 text-[11.5px] text-app-text ring-1 ring-app-border/15 tabular-nums';

  if (state.phase === 'quoted' && q) {
    const rights = q.rights.status === 'licensed' ? (q.rights.license ?? '') : q.rights.status === 'own' ? t.own : t.unverified;
    return (
      <div className="mt-2 flex flex-col gap-2" data-testid="agent-audio-card" data-phase="quoted">
        <div className="flex flex-wrap gap-1.5">
          <span className={chip}><Globe size={12} aria-hidden="true" /> {q.source === 'file' ? t.yourFile : q.host}</span>
          {q.bytes ? <span className={chip}>{formatBytes(q.bytes, locale)}</span> : null}
          <span className={chip}><FileAudio size={12} aria-hidden="true" /> MP3 · {q.bitrateKbps} kbps</span>
          <span className={chip} data-testid="agent-audio-rights" data-rights={q.rights.status}>
            {q.rights.status === 'unverified' ? <ShieldQuestion size={12} aria-hidden="true" /> : <ShieldCheck size={12} aria-hidden="true" />} {rights}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStart}
            data-testid="agent-audio-start"
            data-price={q.credits}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90"
          >
            <Sparkle size={14} aria-hidden="true" />
            <span>{t.start}</span>
            <span aria-hidden="true">· {q.credits > 0 ? `✦ ${q.credits}` : t.free}</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            data-testid="agent-audio-cancel"
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
      <div className="mt-2 flex flex-col gap-2" data-testid="agent-audio-card" data-phase="running">
        <div className="flex items-center justify-between gap-3 text-[12px] text-app-muted">
          <span aria-live="polite">{stopping ? t.stopping : audioStageText(state.stage, locale)}</span>
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
              data-testid="agent-audio-stop"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-border/30 px-3.5 py-1.5 text-[12px] font-medium text-app-text transition-colors hover:bg-app-elevated/60"
            >
              <Square size={12} aria-hidden="true" /> {t.stop}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (state.phase === 'failed' && state.offerUpload) {
    return (
      <div className="mt-2" data-testid="agent-audio-card" data-phase="failed">
        <button
          type="button"
          onClick={onUpload}
          data-testid="agent-audio-upload"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90"
        >
          <Upload size={14} aria-hidden="true" /> {uploadOfferLabel(locale)}
        </button>
      </div>
    );
  }

  return null;
}
