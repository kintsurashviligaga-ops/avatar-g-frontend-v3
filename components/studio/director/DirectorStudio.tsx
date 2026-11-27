'use client';

/**
 * components/studio/director/DirectorStudio.tsx — the Director's Workflow with its run (Phase 8.3, PR C).
 *
 * The board (DirectorBoard) plans and edits for free. "Create film ✦N" asks the server once whether this exact version can
 * be rendered and whether the balance covers the whole film (…/approve, nothing charged), then the runner
 * (lib/video/directorsWorkflow/runner) starts each scene through …/scene — charged when it starts — and polls the shared
 * status route, which refunds a failed scene. Each card shows its own state and preview; a failed scene re-renders alone.
 * Once every scene is delivered, the final cut (FinalCutPanel, PR D) joins the clips, with an optional whole-film music bed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { deliveredClips, quoteProject, runFilm, type DwPollResult, type DwProject, type DwQuote, type DwRuns, type DwScene, type DwStartResult } from '@/lib/video/directorsWorkflow';
import { DirectorBoard } from './DirectorBoard';
import { FinalCutPanel } from './FinalCutPanel';

type Lang = string;
const tr = (locale: Lang, ka: string, en: string, ru: string): string => (locale === 'en' ? en : locale === 'ru' ? ru : ka);

const json = async (res: Response): Promise<Record<string, unknown>> => ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? {};

/** The browser side of the runner: the scene route and the shared status route. */
export function fetchRunDeps(project: DwProject, signal?: AbortSignal) {
  const quote = quoteProject(project);
  const start = async (scene: DwScene, previousClipUrl: string | null): Promise<DwStartResult> => {
    const res = await fetch('/api/video/director-workflow/scene', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ project, sceneId: scene.id, expectedCredits: quote.scenes.find((s) => s.sceneId === scene.id)?.credits, previousClipUrl }),
    });
    const j = await json(res);
    return res.ok && typeof j.jobId === 'string' ? { ok: true, jobId: j.jobId, credits: Number(j.credits) || 0 } : { ok: false, error: String(j.error ?? res.status) };
  };
  const poll = async (jobId: string): Promise<DwPollResult> => {
    const res = await fetch(`/api/genjutsu/status?id=${encodeURIComponent(jobId)}`, { credentials: 'include', cache: 'no-store', signal });
    const j = await json(res);
    if (j.done === true && j.state === 'ready' && typeof j.videoUrl === 'string') return { state: 'ready', videoUrl: j.videoUrl };
    if (j.done === true && j.state === 'failed') return { state: 'failed', error: String(j.error ?? 'failed'), refunded: j.refunded === true };
    return { state: 'running' };
  };
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return { start, poll, wait };
}

export function DirectorStudio({ locale, onClose, deps = fetchRunDeps, initial }: {
  locale: Lang;
  /** A board to reopen (tests). */
  initial?: DwProject;
  onClose: () => void;
  /** Tests inject a fake network. */
  deps?: typeof fetchRunDeps;
}) {
  const [runs, setRuns] = useState<DwRuns>({});
  const [running, setRunning] = useState(false);
  // Phase 8.24: the approve call (balance + price check) takes a moment before the film starts running. During that
  // gap "Create film" used to stay pressable, so a double tap started the same film twice (two renders, two charges).
  const [approving, setApproving] = useState(false);
  const approvingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const approved = useRef<DwProject | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const delivered = (r: DwRuns): Record<string, string> =>
    Object.fromEntries(Object.values(r).filter((x) => x.state === 'done' && x.videoUrl).map((x) => [x.sceneId, x.videoUrl!]));

  const go = useCallback(async (project: DwProject, only?: string[]) => {
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    const prior = delivered(runs);
    try {
      await runFilm(project, { ...deps(project, ac.signal), signal: ac.signal, onUpdate: (r) => setRuns((old) => ({ ...old, ...r })) }, only, prior);
    } finally {
      setRunning(false);
    }
  }, [deps, runs]);

  const onApprove = useCallback(async (project: DwProject, quote: DwQuote) => {
    if (approvingRef.current || running) return;
    approvingRef.current = true;
    setApproving(true);
    setNotice(null);
    let res: Response | null;
    let j: Record<string, unknown>;
    try {
      res = await fetch('/api/video/director-workflow/approve', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project, expectedCredits: quote.totalCredits }),
      }).catch(() => null);
      j = res ? await json(res) : {};
    } finally {
      approvingRef.current = false;
      setApproving(false);
    }
    if (!res?.ok) {
      setNotice(j.error === 'insufficient_credits'
        ? tr(locale, `ბალანსი არ კმარა: საჭიროა ✦${quote.totalCredits}.`, `Not enough credits: the film needs ✦${quote.totalCredits}.`, `Недостаточно кредитов: нужно ✦${quote.totalCredits}.`)
        : j.error === 'price_changed'
          ? tr(locale, 'ფასი შეიცვალა. გადახედე ბარათებს.', 'The price changed. Check the cards.', 'Цена изменилась. Проверьте карточки.')
          : tr(locale, 'ფილმი ვერ დაიწყო. სცადე თავიდან.', 'Could not start the film. Try again.', 'Не удалось начать фильм. Попробуйте снова.'));
      return;
    }
    approved.current = project;
    setRuns({});
    await go(project);
  }, [go, locale, running]);

  const onRerun = useCallback((sceneId: string) => {
    const p = approved.current;
    if (!p || running) return;
    // The failed scene, and every scene after it that was waiting on it.
    const after = [...p.scenes].sort((a, b) => a.order - b.order);
    const from = after.findIndex((s) => s.id === sceneId);
    const ids = [sceneId];
    for (let i = from + 1; i < after.length && after[i]!.firstFrame === 'previous' && runs[after[i]!.id]?.state === 'blocked'; i += 1) ids.push(after[i]!.id);
    void go(p, ids);
  }, [go, running, runs]);

  // The final cut appears once every scene of the approved board has a clip (and nothing is rendering).
  const film = approved.current;
  const cutClips = film && !running && deliveredClips(film, runs)
    ? [...film.scenes].sort((a, b) => a.order - b.order).map((s) => ({ sceneId: s.id, url: runs[s.id]!.videoUrl! }))
    : null;

  return (
    <DirectorBoard locale={locale} onClose={onClose} initial={initial} onApprove={(p, q) => void onApprove(p, q)} runs={runs} running={running} approving={approving} notice={notice} onRerun={onRerun}
      after={film && cutClips ? <FinalCutPanel locale={locale} project={film} clips={cutClips} /> : null} />
  );
}
