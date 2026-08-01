'use client';

import { AlertTriangle, Check, Clock, Loader2, X } from 'lucide-react';

/**
 * THE loading card. One shape for every service that makes the user wait.
 *
 * ⚠️ WHY THIS MOVED OUT OF OmniStudio. It lived there and served exactly four kinds — image, music,
 * video, lipsync — so those four got a real progress experience (a big live percentage, the stage being
 * worked on, a checklist of what is done and what is left, and an estimate of the time remaining) while
 * montage, dubbing, presentation, 3D and the editor got a thin indeterminate bar with a single label,
 * or nothing at all. Same product, same wait, two completely different answers to "is this working?".
 *
 * A wait with no feedback is indistinguishable from a hang. That is the whole reason these renders felt
 * broken: a montage that takes four minutes behind a 2px bar with no number reads as frozen long before
 * it reads as slow.
 *
 * TWO HONESTY RULES, both load-bearing:
 *
 *  1. THE BAR NEVER REACHES 100% ON A GUESS. It eases asymptotically toward 95% and completes only when
 *     the caller swaps the card for the real asset. A bar that hits 100% and then sits there is worse
 *     than no bar — it says "done" while the user waits, and the next thing they do is reload and lose
 *     the render.
 *  2. THE ESTIMATE IS PACED TO THE REAL WALL-CLOCK, per service. A number that expires while the job is
 *     still running teaches the user to distrust every number the product shows them.
 *
 * When the pipeline reports its own stage (the v2 services publish one to the job row), that text takes
 * over the headline — a real stage beats an interpolated guess.
 */

export type ProgressKind =
  | 'image' | 'music' | 'video' | 'lipsync'
  | 'remix' | 'montage' | 'dubbing' | 'presentation' | 'model3d' | 'editor';

type Lang = 'ka' | 'en' | 'ru';

/**
 * Stage narration per service.
 *
 * These are what the user reads while waiting, so they name the WORK, not the implementation: "mixing
 * the voices", not "ffmpeg pass 2". Each list is ordered and the card walks it in step with the bar.
 */
export const STAGES: Record<Lang, Record<ProgressKind, string[]>> = {
  ka: {
    image: ['აღწერას ვიაზრებ…', 'კადრს ვხატავ…', 'დეტალებს ვამატებ…', 'ვასრულებ…'],
    music: ['იდეას ვამუშავებ…', 'მელოდიას ვაკომპონებ…', 'ხმებს ვურევ…', 'ვასრულებ…'],
    video: ['სცენარს ვშლი…', 'აუდიო & SFX…', 'ხმა…', 'ვიდეო კადრები…', 'მასტერინგი…', 'გრაფიკა…'],
    lipsync: ['ფოტოს ვამზადებ…', 'ავატარი ცოცხლდება…', 'ვასრულებ…'],
    remix: ['ვიდეოს ვამზადებ…', 'ცვლილებას ვამუშავებ…', 'ვასრულებ…'],
    montage: ['კადრებს ვამზადებ…', 'გადასვლებს ვაწყობ…', 'ხმას ვურევ…', 'ვასრულებ…'],
    dubbing: ['ხმას ვაცალკევებ…', 'ტექსტს ვშიფრავ…', 'ვთარგმნი…', 'ხმას ვქმნი…', 'ვასინქრონებ…', 'ვურევ…'],
    presentation: ['გეგმას ვაწყობ…', 'სლაიდებს ვწერ…', 'ვხატავ…', 'ვასრულებ…'],
    model3d: ['რეფერენსს ვამზადებ…', 'ფორმას ვაშენებ…', 'ტექსტურას ვადებ…', 'ვასრულებ…'],
    editor: ['ფაილებს ვამზადებ…', 'მონტაჟს ვაწყობ…', 'ვარენდერებ…', 'ვასრულებ…'],
  },
  en: {
    image: ['Reading your prompt…', 'Painting the frame…', 'Adding details…', 'Finishing up…'],
    music: ['Shaping the idea…', 'Composing the melody…', 'Mixing the voices…', 'Finishing up…'],
    video: ['Scripting…', 'Audio SFX…', 'Voice…', 'Video clips…', 'Mastering…', 'Graphics…'],
    lipsync: ['Preparing the photo…', 'Bringing the avatar to life…', 'Finishing up…'],
    remix: ['Preparing the video…', 'Applying the change…', 'Finishing up…'],
    montage: ['Preparing the shots…', 'Building the transitions…', 'Mixing the audio…', 'Finishing up…'],
    dubbing: ['Extracting the audio…', 'Transcribing…', 'Translating…', 'Synthesising the voice…', 'Syncing…', 'Mixing…'],
    presentation: ['Outlining…', 'Writing the slides…', 'Rendering…', 'Finishing up…'],
    model3d: ['Preparing the reference…', 'Building the mesh…', 'Texturing…', 'Finishing up…'],
    editor: ['Uploading the clips…', 'Assembling the edit…', 'Rendering…', 'Finishing up…'],
  },
  ru: {
    image: ['Читаю запрос…', 'Рисую кадр…', 'Добавляю детали…', 'Завершаю…'],
    music: ['Формирую идею…', 'Сочиняю мелодию…', 'Свожу голоса…', 'Завершаю…'],
    video: ['Сценарий…', 'Аудио и SFX…', 'Голос…', 'Видео-клипы…', 'Мастеринг…', 'Графика…'],
    lipsync: ['Готовлю фото…', 'Оживляю аватар…', 'Завершаю…'],
    remix: ['Готовлю видео…', 'Применяю изменение…', 'Завершаю…'],
    montage: ['Готовлю кадры…', 'Строю переходы…', 'Свожу звук…', 'Завершаю…'],
    dubbing: ['Извлекаю звук…', 'Расшифровываю…', 'Перевожу…', 'Синтезирую голос…', 'Синхронизирую…', 'Свожу…'],
    presentation: ['Составляю план…', 'Пишу слайды…', 'Рисую…', 'Завершаю…'],
    model3d: ['Готовлю референс…', 'Строю модель…', 'Накладываю текстуру…', 'Завершаю…'],
    editor: ['Загружаю клипы…', 'Собираю монтаж…', 'Рендерю…', 'Завершаю…'],
  },
};

/**
 * Wall-clock target per service, in seconds — what the "remaining" figure is paced against.
 *
 * These are MEASURED, not guessed, and that matters: an estimate that runs out while the job continues
 * is worse than showing none, because it teaches the user that the product's numbers are decoration.
 * The 30s film is the extreme case at roughly seven minutes end to end (clip generation plus the ffmpeg
 * montage), so its bar has to crawl rather than finish early and stall.
 */
export const PROGRESS_TARGET: Record<ProgressKind, number> = {
  image: 65,
  music: 150,
  video: 440,
  // ⚠️ WAS 70. LipsyncStudio's own comment records the measurement — "a live production test showed
  // SadTalker renders take ~6 min (cold start + render)" — and both surfaces poll for TEN minutes. At
  // 70s the bar pegged at 95% after about a minute and a half and the remaining figure hit zero, then
  // the user waited another four minutes staring at a full bar. That is the single most convincing way
  // to make a working render look hung.
  lipsync: 360,
  remix: 120,
  montage: 200,   // conform pass per source + the N-input stitch + the music mux
  dubbing: 280,   // seven legs, one TTS call per line of dialogue
  presentation: 140, // outline + up to 12 sequential image calls + rasterisation
  model3d: 420,   // reconstruction is the slowest thing in the product
  editor: 150,
};

/**
 * The eased curve the card draws, exported so any surface can pace a bar the same way.
 *
 * Asymptotic toward 95: fast at the start, never arriving. That "never arriving" is the point — a bar
 * that reaches its ceiling and stops incrementing looks IDENTICAL to a crashed render, and the user's
 * next move is to reload and lose the work.
 */
export function easedPct(elapsedSec: number, targetSec: number): number {
  const t = Math.max(1, targetSec);
  return Math.min(95, Math.round((1 - Math.exp(-Math.max(0, elapsedSec) / (t / 2.4))) * 100));
}

/** m:ss — exported because the composer's inline status line formats the same clock. */
export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Terminal + queued wording, so this card can own EVERY state a job can be in, not just "running". */
const STATE_COPY: Record<Lang, { queued: (n: number) => string; done: string; failed: string; canceled: string; cancel: string }> = {
  ka: { queued: (n) => `რიგში: #${n}`, done: 'მზადაა', failed: 'ვერ მოხერხდა', canceled: 'შეჩერდა', cancel: 'გაუქმება' },
  en: { queued: (n) => `In queue: #${n}`, done: 'Ready', failed: 'Failed', canceled: 'Stopped', cancel: 'Cancel' },
  ru: { queued: (n) => `В очереди: #${n}`, done: 'Готово', failed: 'Не удалось', canceled: 'Остановлено', cancel: 'Отмена' },
};

/**
 * ⚠️ ONE JOB WAS BEING DRAWN BY THREE DIFFERENT COMPONENTS, and which one you saw depended on WHICH
 * DEVICE YOU USED. The device that submitted a render has a chat bubble for it and got this card — a big
 * live percentage, a stage headline, a checklist, a time estimate. Every other device (and this one after
 * a reload) fell to JobTray's own row: a 7px icon, a 1.5px rail and a 10.5px caption. Nothing responsive
 * about it — there is not one breakpoint class in either file — just two implementations of the same idea
 * that were never meant to be compared, and the user compared them.
 *
 * So this card now owns EVERY state a job can be in, and the tray renders it in `compact` form instead of
 * its own markup. One visual language, whichever device you are holding.
 */
export type ProgressState = 'running' | 'queued' | 'done' | 'failed' | 'canceled';

export function GenerationProgress({
  kind, elapsed, status, locale, targetSec, pct: pctOverride, compact,
  title, subtitle, state = 'running', queuePosition, error, onCancel, cancelLabel, children,
}: {
  kind: ProgressKind;
  /** Seconds since the run started. */
  elapsed: number;
  /** The job's own label — shown above the percentage when the tray renders a job it does not own. */
  title?: string;
  /** Which state to draw. Anything but 'running' replaces the animated headline with a terminal line. */
  state?: ProgressState;
  /** Position in the local queue, for `state === 'queued'`. */
  queuePosition?: number;
  /** Failure reason, for `state === 'failed'`. */
  error?: string;
  /** Second line under the title — the film/remix consoles name the specific pipeline here. */
  subtitle?: string;
  /** Renders a cancel affordance when supplied. */
  onCancel?: () => void;
  /** Overrides the card's own wording — a caller that already localises "Stop" keeps its label. */
  cancelLabel?: string;
  /**
   * A service-specific body, rendered in place of the generic stage checklist.
   *
   * ⚠️ THIS EXISTS SO UNIFYING THE LOOK DOES NOT COST INFORMATION. The film console shows a nine-agent
   * crew grid and the remix console shows a weighted stage list; both are richer than a checklist and
   * neither could survive being replaced by this card wholesale. Sharing the SHELL — the card chrome, the
   * live percentage, the bar, the clock and the cancel button — is what makes every service look like one
   * product. Sharing the BODY would just delete what each service knows about itself.
   */
  children?: React.ReactNode;
  /** A stage the PIPELINE reported — takes over the headline, because it is real. */
  status?: string;
  locale: Lang;
  /** Override the eased target, e.g. a heavier image tier. */
  targetSec?: number;
  /** A real server-reported percentage. Beats the time-based estimate when present. */
  pct?: number;
  /** Drops the stage checklist — for tight surfaces like an in-chat panel. */
  compact?: boolean;
}) {
  const stages = STAGES[locale][kind];
  const target = targetSec ?? PROGRESS_TARGET[kind];
  // Eased growth: fast at first, asymptotic toward 95%, so it never "finishes" ahead of the asset.
  const eased = easedPct(elapsed, target);
  const pct = typeof pctOverride === 'number' && Number.isFinite(pctOverride) && pctOverride > 0
    ? Math.min(99, Math.round(pctOverride))
    : eased;
  // Video's bands are deliberately uneven — clip generation dominates 50–85% of the real time, so an
  // even split would park the label on the wrong stage for minutes.
  const stageIdx = kind === 'video'
    ? (pct < 20 ? 0 : pct < 35 ? 1 : pct < 50 ? 2 : pct < 85 ? 3 : pct < 95 ? 4 : 5)
    : Math.min(stages.length - 1, Math.floor((pct / 100) * stages.length));
  const sc = STATE_COPY[locale] ?? STATE_COPY.ka;
  const running = state === 'running';
  // Terminal states show 100 — the work IS over — while `running` keeps the honest sub-95 estimate.
  const shownPct = state === 'done' ? 100 : state === 'queued' ? 0 : running ? pct : 100;
  const headline = !running
    ? (state === 'queued' ? sc.queued(queuePosition ?? 1)
      : state === 'done' ? sc.done
      : state === 'failed' ? (error?.trim() ? error.trim().slice(0, 90) : sc.failed)
      : sc.canceled)
    : (status && status.trim() ? status.trim() : stages[stageIdx]);
  const remaining = Math.max(0, Math.round(target - elapsed));
  const remLabel = locale === 'en' ? 'remaining' : locale === 'ru' ? 'осталось' : 'დარჩა';
  const tone = state === 'failed' ? 'text-red-500'
    : state === 'done' ? 'text-emerald-500'
    : state === 'canceled' ? 'text-app-muted'
    : 'text-app-accent';
  const bar = state === 'failed' ? 'bg-red-500'
    : state === 'done' ? 'bg-emerald-500'
    : state === 'canceled' ? 'bg-app-border/50'
    : 'bg-gradient-to-r from-app-accent/75 to-app-accent';

  return (
    // `compact` fills its container (the tray is a fixed-width panel); otherwise the card is clamped so a
    // desktop bubble does not stretch a progress card to the full width of the conversation.
    <div className={`${compact ? 'w-full' : 'w-full max-w-[min(86vw,440px)]'} space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/50 p-4 shadow-[0_10px_34px_rgba(0,0,0,0.20)]`}>
      {(title || subtitle) && (
        <div className="min-w-0">
          {title && <p className="truncate text-[12.5px] font-semibold text-app-text" title={title}>{title}</p>}
          {subtitle && <p className="truncate text-[10px] font-medium uppercase tracking-wider text-app-muted/70">{subtitle}</p>}
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[34px] font-bold leading-none tabular-nums text-app-text">{shownPct}</span>
            <span className="text-[17px] font-semibold text-app-muted">%</span>
          </div>
          <span className={`mt-1.5 inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12.5px] font-medium ${tone}`}>
            {running ? <Loader2 size={13} className="shrink-0 animate-spin" />
              : state === 'queued' ? <Clock size={13} className="shrink-0" />
              : state === 'done' ? <Check size={13} className="shrink-0" />
              : state === 'failed' ? <AlertTriangle size={13} className="shrink-0" />
              : <X size={13} className="shrink-0" />}
            <span className="truncate">{headline}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-end gap-2">
          {running && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted/70">{remLabel}</p>
              <p className="text-[15px] font-semibold tabular-nums text-app-text">{remaining > 0 ? `~${fmtClock(remaining)}` : '…'}</p>
            </div>
          )}
          {onCancel && (running || state === 'queued') && (
            <button
              type="button"
              onClick={onCancel}
              aria-label={cancelLabel || sc.cancel}
              title={cancelLabel || sc.cancel}
              className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-app-border/15">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${bar}`}
          style={{ width: `${state === 'queued' ? 8 : Math.max(6, shownPct)}%` }}
        />
      </div>

      {children}

      {!children && !compact && running && (
        <ul className="space-y-1.5 pt-0.5">
          {stages.map((s, i) => {
            const state = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
            return (
              <li key={i} className={`flex items-center gap-2.5 text-[12.5px] ${state === 'pending' ? 'text-app-muted/45' : state === 'active' ? 'font-medium text-app-text' : 'text-app-muted'}`}>
                {state === 'done' ? (
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-app-accent/15"><Check size={12} className="text-app-accent" /></span>
                ) : state === 'active' ? (
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-app-accent/15"><Loader2 size={12} className="animate-spin text-app-accent" /></span>
                ) : (
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"><span className="h-[13px] w-[13px] rounded-full border border-app-border/30" /></span>
                )}
                <span className="truncate">{s}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
