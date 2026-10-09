'use client';
/**
 * DirectorRunOverlay — the approved storyboard rendered by the V1–V6 director run (lib/video/director/run.ts), shot by
 * shot, with the user's decision when a shot fails. Shown instead of the studio's own film render only when
 * GET /api/video/director says director runs are on for this user (VIDEO_DIRECTOR_RUNS).
 *
 * It starts the run (POST /api/video/director/runs — the server checks every rule and freezes the board), then steps
 * it (POST …/advance every few seconds) while it is `running`. Each shot is charged just before its own submit and
 * refunded if it delivers no clip; all of that is decided on the server — this component only shows it.
 *
 * ⚠️ A FAILED SHOT STOPS EVERYTHING (V5): the overlay shows Google's reason and the three answers — retry the same
 * shot, edit the storyboard (back to the board; the run ends), or cancel. There is no skip, and nothing is retried on
 * its own. A board the rules refuse is shown with every problem and an Edit button; nothing is "fixed" here (V6).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirectorRunView } from '@/lib/video/director/run';
import type { ShotDecision, Storyboard } from '@/lib/video/director/types';

/** How often a running run is stepped. Veo takes about a minute per clip; faster polling only spends quota. */
const STEP_MS = 5_000;
/** After this many network failures in a row the overlay says so (and keeps trying). */
const QUIET_FAILURES = 3;

type Lang = string;
const tr = (locale: Lang, ka: string, en: string, ru: string): string => (locale === 'en' ? en : locale === 'ru' ? ru : ka);

export function useDirectorRunsEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/video/director', { credentials: 'include', signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => setEnabled(Boolean(j && typeof j === 'object' && (j as { enabled?: unknown }).enabled === true)))
      .catch(() => { /* offline / aborted → the studio's own flow */ });
    return () => ac.abort();
  }, []);
  return enabled;
}

type Phase =
  | { kind: 'starting' }
  | { kind: 'refused'; message: string; problems: string[] }
  | { kind: 'run'; view: DirectorRunView };

const STATUS: Record<DirectorRunView['shots'][number]['status'], [string, string, string]> = {
  pending: ['რიგში', 'Queued', 'В очереди'],
  submitting: ['იწყება', 'Starting', 'Запуск'],
  rendering: ['მზადდება', 'Rendering', 'Рендерится'],
  done: ['მზადაა', 'Done', 'Готово'],
  failed: ['ვერ შედგა', 'Failed', 'Не удалось'],
};

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export function DirectorRunOverlay({ storyboard, locale, onEdit, onClose }: {
  /** The board the user approved, as the director's Storyboard (lib/video/director/fromStudio). */
  storyboard: Storyboard;
  locale: Lang;
  /** Back to the board to change it; the run (if any) has ended. */
  onEdit: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [deciding, setDeciding] = useState(false);
  const [offline, setOffline] = useState(false);
  // "Stop after this shot": a shot already at Google is never abandoned mid-render, so the stop lands between shots.
  const [stopping, setStopping] = useState(false);
  const stopRef = useRef(false);
  const started = useRef(false);
  const failures = useRef(0);

  // Start the run once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { status, json } = await postJson('/api/video/director/runs', { storyboard });
        if (status === 201 && json?.run) return setPhase({ kind: 'run', view: json.run as DirectorRunView });
        setPhase({
          kind: 'refused',
          message: typeof json?.message === 'string' ? json.message : tr(locale, 'რენდერი ვერ დაიწყო.', 'The render could not start.', 'Рендер не запустился.'),
          problems: Array.isArray(json?.problems) ? (json.problems as unknown[]).map(String) : [],
        });
      } catch {
        setPhase({ kind: 'refused', message: tr(locale, 'კავშირი ვერ დამყარდა.', 'Could not reach the server.', 'Нет связи с сервером.'), problems: [] });
      }
    })();
  }, [storyboard, locale]);

  const runId = phase.kind === 'run' ? phase.view.id : null;
  const running = phase.kind === 'run' && phase.view.state === 'running';

  // Step the run while it is running.
  useEffect(() => {
    if (!runId || !running) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const between = phase.kind === 'run' && phase.view.shots[phase.view.currentIndex]?.status === 'pending';
        const url = stopRef.current && between ? `/api/video/director/runs/${runId}/decision` : `/api/video/director/runs/${runId}/advance`;
        const { status, json } = await postJson(url, stopRef.current && between ? { decision: 'cancel' } : {});
        if (cancelled) return;
        if (status === 200 && json?.run) {
          failures.current = 0;
          setOffline(false);
          setPhase({ kind: 'run', view: json.run as DirectorRunView });
          return;
        }
        throw new Error(String(status));
      } catch {
        if (cancelled) return;
        failures.current += 1;
        if (failures.current >= QUIET_FAILURES) setOffline(true);
        // Re-arm with the same view: the effect runs again on the next state change only, so nudge it.
        setPhase((p) => (p.kind === 'run' ? { kind: 'run', view: { ...p.view } } : p));
      }
    }, STEP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, running, phase]);

  const decide = useCallback(async (decision: ShotDecision) => {
    if (!runId) return;
    setDeciding(true);
    try {
      const { status, json } = await postJson(`/api/video/director/runs/${runId}/decision`, { decision });
      if (status === 200 && json?.run) {
        if (decision === 'edit') return onEdit();
        setPhase({ kind: 'run', view: json.run as DirectorRunView });
      }
    } finally {
      setDeciding(false);
    }
  }, [runId, onEdit]);

  const view = phase.kind === 'run' ? phase.view : null;
  const doneCount = view ? view.shots.filter((s) => s.status === 'done').length : 0;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-app-bg/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} role="dialog" aria-modal="true" aria-labelledby="director-run-title">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <div className="px-4 py-3">
          <h2 id="director-run-title" className="text-[15px] font-semibold tracking-tight text-app-text">{tr(locale, 'რეჟისორის რენდერი', 'Director render', 'Режиссёрский рендер')}</h2>
          <p className="truncate text-[12px] text-app-muted">
            {storyboard.title}
            {view ? ` · ${doneCount}/${view.totalShots} · ${view.quoteCredits} ${tr(locale, 'კრედიტი', 'credits', 'кредитов')}` : ''}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
          {phase.kind === 'starting' && <p className="text-[13px] text-app-muted">{tr(locale, 'სცენარი მოწმდება და იწყება…', 'Checking the storyboard and starting…', 'Проверяем раскадровку и запускаем…')}</p>}

          {phase.kind === 'refused' && (
            <div className="rounded-2xl bg-app-elevated p-4 ring-1 ring-app-border/15">
              <p className="text-[13px] font-medium text-app-text">{phase.message}</p>
              {phase.problems.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-app-muted">
                  {phase.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </div>
          )}

          {view && (
            <ol className="space-y-2">
              {view.shots.map((shot) => (
                <li key={shot.shotId} className="rounded-2xl bg-app-elevated p-3 ring-1 ring-app-border/15" data-testid="director-shot" data-status={shot.status}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] text-app-text">{shot.order}. {shot.description}</span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-app-muted">{shot.durationSeconds}s · {tr(locale, ...STATUS[shot.status])}{shot.attempt > 1 ? ` · #${shot.attempt}` : ''}</span>
                  </div>
                  {shot.clipUrl && (
                    <video src={shot.clipUrl} controls playsInline preload="metadata" className="mt-2 w-full rounded-xl bg-black" />
                  )}
                </li>
              ))}
            </ol>
          )}

          {view?.pendingDecision && (
            <div className="mt-3 rounded-2xl bg-app-elevated p-4 ring-1 ring-app-border/25" role="alert">
              <p className="text-[13px] font-medium text-app-text">
                {tr(locale, `სცენა ${view.pendingDecision.shotIndex + 1} ვერ შედგა. შემდეგი სცენები არ დაიწყება, სანამ არ აირჩევ.`, `Shot ${view.pendingDecision.shotIndex + 1} failed. Nothing more is rendered until you choose.`, `Сцена ${view.pendingDecision.shotIndex + 1} не удалась. Дальше ничего не рендерится, пока вы не выберете.`)}
              </p>
              <p className="mt-1 text-[12.5px] text-app-muted">{view.pendingDecision.error.message}</p>
            </div>
          )}

          {view?.state === 'completed' && <p className="mt-3 text-[13px] font-medium text-app-text">{tr(locale, 'ყველა სცენა მზადაა.', 'All shots are ready.', 'Все сцены готовы.')}</p>}
          {view?.state === 'cancelled' && <p className="mt-3 text-[13px] text-app-muted">{tr(locale, 'რენდერი შეწყდა. მზა სცენები შენახულია ზემოთ.', 'The render stopped. Finished shots are kept above.', 'Рендер остановлен. Готовые сцены сохранены выше.')}</p>}
          {offline && running && <p className="mt-3 text-[12px] text-app-muted">{tr(locale, 'კავშირი წყდება; ვცდილობ ისევ…', 'The connection keeps dropping; still trying…', 'Связь прерывается; пробуем снова…')}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-app-border/10 px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          {view?.pendingDecision ? (
            <>
              <button type="button" disabled={deciding} onClick={() => void decide('retry')} className="min-h-[44px] flex-1 rounded-full bg-app-accent px-4 text-[13.5px] font-semibold text-app-bg disabled:opacity-50">
                {tr(locale, 'თავიდან ცდა', 'Retry this shot', 'Повторить сцену')}
              </button>
              <button type="button" disabled={deciding} onClick={() => void decide('edit')} className="min-h-[44px] rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-text disabled:opacity-50">
                {tr(locale, 'სცენარის შეცვლა', 'Edit storyboard', 'Изменить раскадровку')}
              </button>
              <button type="button" disabled={deciding} onClick={() => void decide('cancel')} className="min-h-[44px] rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-muted disabled:opacity-50">
                {tr(locale, 'გაუქმება', 'Cancel', 'Отменить')}
              </button>
            </>
          ) : phase.kind === 'refused' ? (
            <>
              <button type="button" onClick={onEdit} className="min-h-[44px] flex-1 rounded-full bg-app-accent px-4 text-[13.5px] font-semibold text-app-bg">
                {tr(locale, 'სცენარის შეცვლა', 'Edit storyboard', 'Изменить раскадровку')}
              </button>
              <button type="button" onClick={onClose} className="min-h-[44px] rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-muted">
                {tr(locale, 'დახურვა', 'Close', 'Закрыть')}
              </button>
            </>
          ) : running ? (
            <button type="button" disabled={stopping} onClick={() => { stopRef.current = true; setStopping(true); }} className="min-h-[44px] w-full rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-muted disabled:opacity-50">
              {stopping
                ? tr(locale, 'ჩერდება ამ სცენის შემდეგ…', 'Stopping after this shot…', 'Остановка после этой сцены…')
                : tr(locale, 'შეჩერება ამ სცენის შემდეგ', 'Stop after this shot', 'Остановить после этой сцены')}
            </button>
          ) : (
            <button type="button" disabled={phase.kind === 'starting'} onClick={onClose} className="min-h-[44px] w-full rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-text disabled:opacity-50">
              {tr(locale, 'დახურვა', 'Close', 'Закрыть')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
