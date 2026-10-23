'use client';

import { useRef } from 'react';
import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { LoadingLoop } from './LoadingLoop';

/**
 * THE loading card. One shape for every service that makes the user wait.
 *
 * ⚠️ WHY THIS MOVED OUT OF OmniStudio. It lived there and served exactly four kinds — image, music,
 * video, lipsync — so those four got a real progress experience while montage, dubbing, presentation,
 * 3D and the editor got a thin indeterminate bar with a single label, or nothing at all. Same product,
 * same wait, two completely different answers to "is this working?".
 *
 * A wait with no feedback is indistinguishable from a hang. That is the whole reason these renders felt
 * broken: a montage that takes four minutes behind a 2px bar with no number reads as frozen long before
 * it reads as slow.
 *
 * PERCENT AND A SHORT LABEL, NOTHING ELSE (MASTER TASK v3.1 §3.3, Phase 2 PR 3, GG's plan of 2026-10-23).
 * The card used to add a bar, a stage checklist and a "remaining ~m:ss" clock under the number. Three
 * readings of one guess disagreed with each other (the clock ran out while the bar still crawled), so the
 * number and the stage it is on are what stays. The loading loop (./LoadingLoop) is the picture, as before.
 *
 * THREE HONESTY RULES, all load-bearing:
 *
 *  1. NEVER 100% ON A GUESS. The estimate eases asymptotically toward 95% (a server's own percent is held
 *     under 100) and the card reads 100 only in `done`, when the caller has the real asset. A number that
 *     hits 100 and then sits there says "done" while the user waits, and the next thing they do is reload
 *     and lose the render.
 *  2. THE NUMBER NEVER GOES BACK. A server percent that arrives below the estimate already shown, or a
 *     poll that reports less than the last one, holds the number where it was.
 *  3. THE ESTIMATE IS PACED TO THE REAL WALL-CLOCK, per service. A number that runs out while the job is
 *     still running teaches the user to distrust every number the product shows them.
 *
 * When the pipeline reports its own stage (the v2 services publish one to the job row), that text takes
 * over the label — a real stage beats an interpolated guess.
 */

export type ProgressKind =
  | 'image' | 'music' | 'video' | 'lipsync'
  | 'remix' | 'montage' | 'dubbing' | 'presentation' | 'model3d' | 'editor';

type Lang = 'ka' | 'en' | 'ru';

/**
 * Stage narration per service.
 *
 * These are what the user reads while waiting, so they name the WORK, not the implementation: "mixing
 * the voices", not "ffmpeg pass 2". Each list is ordered and the card walks it in step with the number.
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
 * Wall-clock target per service, in seconds — what the estimated percentage is paced against.
 *
 * These are MEASURED, not guessed, and that matters: an estimate that runs out while the job continues
 * is worse than showing none, because it teaches the user that the product's numbers are decoration.
 * The 30s film is the extreme case at roughly seven minutes end to end (clip generation plus the ffmpeg
 * montage), so its number has to crawl rather than finish early and stall.
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
 * The eased curve the card prints, exported so any surface can pace its number the same way.
 *
 * Asymptotic toward 95: fast at the start, never arriving. That "never arriving" is the point — a number
 * that reaches its ceiling and stops moving looks IDENTICAL to a crashed render, and the user's next move
 * is to reload and lose the work.
 */
export function easedPct(elapsedSec: number, targetSec: number): number {
  const t = Math.max(1, targetSec);
  return Math.min(95, Math.round((1 - Math.exp(-Math.max(0, elapsedSec) / (t / 2.4))) * 100));
}

/**
 * A running job's number: never above 99 before the asset (rule 1), never below what it last showed (rule 2).
 * `pct` is this render's reading. While `active` is false (queued, finished, failed, stopped, or nothing measured)
 * the held peak is let go, so the next run of the same card starts from 0 instead of from the last job's number.
 */
export function useRisingPct(pct: number, active = true): number {
  const peak = useRef(0);
  if (!active) {
    peak.current = 0;
    return 0;
  }
  const next = Math.min(99, Math.max(0, Math.round(Number.isFinite(pct) ? pct : 0)));
  // Idempotent within a render (a max), so React rendering twice in development changes nothing.
  if (next > peak.current) peak.current = next;
  return peak.current;
}

/** m:ss — exported because the composer's inline status line formats the same clock. */
export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Terminal + queued wording, so this card can own EVERY state a job can be in, not just "running". */
const STATE_COPY: Record<Lang, { queued: (n: number) => string; done: string; failed: string; canceled: string; cancel: string; running: string }> = {
  ka: { queued: (n) => `რიგში: #${n}`, done: 'მზადაა', failed: 'ვერ მოხერხდა', canceled: 'შეჩერდა', cancel: 'გაუქმება', running: 'მიმდინარეობს' },
  en: { queued: (n) => `In queue: #${n}`, done: 'Ready', failed: 'Failed', canceled: 'Stopped', cancel: 'Cancel', running: 'In progress' },
  ru: { queued: (n) => `В очереди: #${n}`, done: 'Готово', failed: 'Не удалось', canceled: 'Остановлено', cancel: 'Отмена', running: 'В процессе' },
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
  kind, elapsed, status, locale, targetSec, pct: pctOverride, compact, measuredOnly = false,
  title, subtitle, state = 'running', queuePosition, error, onCancel, cancelLabel, children, loop = true,
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
   * A service-specific body, rendered under the number and its label.
   *
   * ⚠️ THIS EXISTS SO UNIFYING THE LOOK DOES NOT COST INFORMATION. The film console shows a nine-agent
   * crew grid and the remix console shows a weighted stage list; neither could survive being replaced by
   * this card wholesale. Sharing the SHELL — the card chrome, the loop, the live percentage and the cancel
   * button — is what makes every service look like one product. Sharing the BODY would just delete what
   * each service knows about itself.
   */
  children?: React.ReactNode;
  /** A stage the PIPELINE reported — takes over the headline, because it is real. */
  status?: string;
  locale: Lang;
  /** Override the eased target, e.g. a heavier image tier. */
  targetSec?: number;
  /** A real server-reported percentage. Beats the time-based estimate when present. */
  pct?: number;
  /** Fills its container and draws the loop as a small tile beside the number — for tight surfaces (the job tray, a panel). */
  compact?: boolean;
  /**
   * Print only what the server measured. A job the server runs and reports on (the tray's observed rows) has
   * no local clock worth easing: with no server percent the card shows no number (an indeterminate progressbar),
   * and the label is the server's stage or a plain "in progress". Off by default, so every studio that runs its
   * own work keeps the eased estimate it was designed with.
   */
  measuredOnly?: boolean;
  /**
   * Draw the loading loop while the job waits or runs (default). Off only where the loop is already on screen
   * right above this card (the film console tucked under its ResultCard), so one wait never shows two loops.
   */
  loop?: boolean;
}) {
  const stages = STAGES[locale][kind];
  const target = targetSec ?? PROGRESS_TARGET[kind];
  // Eased growth: fast at first, asymptotic toward 95%, so it never "finishes" ahead of the asset.
  const eased = easedPct(elapsed, target);
  const measured = typeof pctOverride === 'number' && Number.isFinite(pctOverride) && pctOverride > 0;
  const running = state === 'running';
  // No server percent on a measured-only card: nothing to print while it runs (Video Core round 3, no fake %).
  const unmeasured = measuredOnly && !measured && running;
  // The number on screen only rises (rule 2): a server percent below the estimate already shown holds it.
  const rising = useRisingPct(measured ? (pctOverride as number) : eased, running && !unmeasured);
  // Video's bands are deliberately uneven — clip generation dominates 50–85% of the real time, so an
  // even split would park the label on the wrong stage for minutes.
  const stageIdx = kind === 'video'
    ? (rising < 20 ? 0 : rising < 35 ? 1 : rising < 50 ? 2 : rising < 85 ? 3 : rising < 95 ? 4 : 5)
    : Math.min(stages.length - 1, Math.floor((rising / 100) * stages.length));
  const sc = STATE_COPY[locale] ?? STATE_COPY.ka;
  const working = running || state === 'queued';
  // 100 only when the work is over and the asset is in (rule 1). A queued job has not started, and a failed or
  // stopped one did not finish: none of them prints a number, the label says which it is.
  const shownPct: number | null = state === 'done' ? 100 : running && !unmeasured ? rising : null;
  const label = !running
    ? (state === 'queued' ? sc.queued(queuePosition ?? 1)
      : state === 'done' ? sc.done
      : state === 'failed' ? (error?.trim() ? error.trim().slice(0, 90) : sc.failed)
      : sc.canceled)
    : (status && status.trim() ? status.trim() : unmeasured ? sc.running : stages[stageIdx]);
  const tone = state === 'failed' ? 'text-red-500'
    : state === 'done' ? 'text-emerald-500'
    : state === 'canceled' ? 'text-app-muted'
    : 'text-app-accent';

  return (
    // `compact` fills its container (the tray is a fixed-width panel); otherwise the card is clamped so a
    // desktop bubble does not stretch a progress card to the full width of the conversation.
    <div data-testid="generation-progress" data-state={state} className={`${compact ? 'w-full' : 'w-full max-w-[min(86vw,440px)]'} space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/50 p-4 shadow-[0_10px_34px_rgba(0,0,0,0.20)]`}>
      {(title || subtitle) && (
        <div className="min-w-0">
          {title && <p className="truncate text-[12.5px] font-semibold text-app-text" title={title}>{title}</p>}
          {subtitle && <p className="truncate text-[10px] font-medium uppercase tracking-wider text-app-muted/70">{subtitle}</p>}
        </div>
      )}
      {/* THE loading picture (the owner's rule, 2026-10-17: every generation shows only this card): while the job
          waits or runs, the loop fills the card's head. No spinner anywhere on the card. Under reduced motion or
          Save-Data the loop is its still poster (./LoadingLoop). */}
      {loop && working && !compact && (
        <div aria-hidden="true" data-testid="generation-progress-loop" className="relative h-[150px] w-full overflow-hidden rounded-xl bg-black ring-1 ring-app-border/15">
          <LoadingLoop />
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-end gap-3">
          {/* A compact row (the job tray, a panel) carries the same loop as a small tile. */}
          {loop && working && compact && (
            <div aria-hidden="true" data-testid="generation-progress-loop" className="relative h-[52px] w-[30px] shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-app-border/15">
              <LoadingLoop />
            </div>
          )}
          {/* The progress itself: the number and its label, read out as one progressbar while the job runs. An
              unmeasured job is an indeterminate progressbar (no value); a terminal or queued one is plain text. */}
          <div
            className="min-w-0"
            data-progress={unmeasured ? 'indeterminate' : running ? (measured ? 'measured' : 'estimated') : state}
            {...(running ? {
              role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100,
              ...(shownPct !== null ? { 'aria-valuenow': shownPct } : {}),
              'aria-valuetext': shownPct !== null ? `${shownPct}% · ${label}` : label,
              'aria-label': title || label,
            } : {})}
          >
            {shownPct !== null && (
              <div className="flex items-baseline gap-1" data-testid="generation-progress-pct">
                <span className="text-[34px] font-bold leading-none tabular-nums text-app-text">{shownPct}</span>
                <span className="text-[17px] font-semibold text-app-muted">%</span>
              </div>
            )}
            <span className={`mt-1.5 inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12.5px] font-medium ${tone}`}>
              {running ? null
                : state === 'queued' ? <Clock size={13} className="shrink-0" aria-hidden="true" />
                : state === 'done' ? <Check size={13} className="shrink-0" aria-hidden="true" />
                : state === 'failed' ? <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
                : <X size={13} className="shrink-0" aria-hidden="true" />}
              <span className="truncate" data-testid="generation-progress-label">{label}</span>
            </span>
          </div>
        </div>
        {onCancel && working && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={cancelLabel || sc.cancel}
            title={cancelLabel || sc.cancel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-red-500/10 hover:text-red-500 motion-reduce:transition-none"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {children}
    </div>
  );
}
