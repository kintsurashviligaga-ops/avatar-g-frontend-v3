'use client';

/**
 * components/studio3d/Studio3dCard.tsx — the 3D Studio inside the chat (Phase 8.8, flag STUDIO_3D_V2; wired into the chat
 * by PR C). Two faces:
 *   1. compose: From text / From a picture / Retexture, the words, "High detail", and the price of every paid step
 *      before the tap (✦8 picture + ✦14 model for text, ✦14 or ✦20 from a photo, ✦8 + ✦13 retexture);
 *   2. the job: the live steps (✓ done, spinner now, ○ next), the reference picture with "Yes, build the 3D model",
 *      then the viewer with Wireframe / Full screen and the downloads.
 */
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { journeyQuote } from '@/lib/studio3d/price';
import { stepLabel, t, lang as toLang, type Lang } from '@/lib/studio3d/labels';
import type { Studio3dStep } from '@/lib/studio3d/pipeline';
import type { JobView } from '@/lib/studio3d/server/service';
import { useStudio3dJob } from './useStudio3dJob';
import { stashPendingEdit, PENDING_EDIT_EVENT } from '@/lib/studio/pendingEdit';
import { dispatchSceneAction, isSceneGlbUrl } from '@/lib/studio/scene3d';
import { clampStlMm, STL_MM } from '@/lib/studio3d/spec';

/** "Use in Video": the free turntable clip goes to Montage on the timeline, inside the open studio. */
export function sendToVideo(turntableUrl: string): boolean {
  if (!stashPendingEdit(turntableUrl, 'video')) return false;
  window.dispatchEvent(new Event(PENDING_EDIT_EVENT));
  return true;
}

/** "Add to scene": the model goes into the 3D scene (lib/studio/scene3d). False when no scene is mounted. */
export function addToScene(glbUrl: string, label: string): boolean {
  if (!isSceneGlbUrl(glbUrl)) return false;
  dispatchSceneAction({ type: 'open_scene' });
  return dispatchSceneAction({ type: 'place_object', url: glbUrl, ...(label ? { label: label.slice(0, 60) } : {}) });
}

export const downloadHref = (id: string, format: 'glb' | 'obj' | 'stl', mm?: number) =>
  `/api/studio3d/${id}/download?format=${format}${format === 'stl' ? `&mm=${clampStlMm(mm)}` : ''}`;

const Studio3dViewer = dynamic(() => import('./Studio3dViewer'), {
  ssr: false,
  loading: () => <div aria-hidden="true" data-testid="studio3d-viewer-skeleton" className="h-[min(56vh,320px)] w-full rounded-xl bg-app-elevated/40 motion-safe:animate-pulse sm:h-[440px]" />,
});

type Mode = 'text' | 'image' | 'retexture';

const FLOW: Record<Mode, Studio3dStep[]> = {
  text: ['check', 'reference', 'awaiting_approval', 'queued', 'shape', 'texture', 'export', 'done'],
  image: ['check', 'queued', 'shape', 'texture', 'export', 'done'],
  retexture: ['check', 'reference', 'awaiting_approval', 'queued', 'texture', 'export', 'done'],
};

const ERRORS: Record<string, Record<Lang, string>> = {
  user_busy: { ka: t('busy', 'ka'), en: t('busy', 'en'), ru: t('busy', 'ru') },
  daily_cap: { ka: t('dailyCap', 'ka'), en: t('dailyCap', 'en'), ru: t('dailyCap', 'ru') },
  blocked: { ka: t('blocked', 'ka'), en: t('blocked', 'en'), ru: t('blocked', 'ru') },
  insufficient_credits: { ka: 'კრედიტი არ გყოფნის', en: 'Not enough credits', ru: 'Недостаточно кредитов' },
};
const chip = 'inline-flex h-9 items-center rounded-full bg-app-bg/70 px-3 text-[13px]';
const errorText = (code: string, l: Lang) => ERRORS[code]?.[l] ?? stepLabel('failed', l);

export function priceLine(mode: Mode, high: boolean, l: Lang): string {
  const parts = journeyQuote(mode, high).map((q) => `✦${q.credits}`);
  const total = journeyQuote(mode, high).reduce((s, q) => s + q.credits, 0);
  const free = l === 'ka' ? 'გადმოწერა და ვიდეო უფასოა' : l === 'ru' ? 'скачивание и видео бесплатно' : 'downloads and video are free';
  return `${parts.join(' + ')}${parts.length > 1 ? ` = ✦${total}` : ''} · ${free}`;
}

export interface Studio3dCardProps {
  locale?: string;
  /** Prefill from the chat (Agent G intent / attached photo / an earlier model). */
  initial?: { mode?: Mode; prompt?: string; imageUrl?: string; meshUrl?: string; high?: boolean };
  job?: JobView;
  fetchImpl?: typeof fetch;
}

export default function Studio3dCard({ locale, initial, job: initialJob, fetchImpl }: Studio3dCardProps) {
  const l = toLang(locale);
  const { state, create, approve, cancel } = useStudio3dJob(initialJob, fetchImpl);
  const [mode, setMode] = useState<Mode>(initial?.mode ?? (initial?.imageUrl ? 'image' : 'text'));
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [high, setHigh] = useState(!!initial?.high);
  const [mm, setMm] = useState<number>(STL_MM.default);
  const [note, setNote] = useState('');
  const job = state.status === 'job' ? state.job : null;

  const canSend = useMemo(() => {
    if (state.status === 'sending') return false;
    if (mode === 'image') return !!initial?.imageUrl;
    if (mode === 'retexture') return !!initial?.meshUrl && prompt.trim().length >= 3;
    return prompt.trim().length >= 3;
  }, [state.status, mode, prompt, initial]);

  if (!job) {
    const modes: Mode[] = initial?.meshUrl ? ['text', 'image', 'retexture'] : ['text', 'image'];
    return (
      <section aria-label={t('title', l)} data-studio3d-card="compose" className="space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/30 p-3">
        <div role="tablist" className="flex gap-1.5">
          {modes.map((m) => (
            <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)}
              className="h-9 rounded-full px-3 text-[13px] aria-selected:bg-app-accent aria-selected:text-white">
              {t(m === 'text' ? 'fromText' : m === 'image' ? 'fromImage' : 'retexture', l)}
            </button>
          ))}
        </div>
        {mode === 'image' && initial?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage link, sized by CSS
          <img src={initial.imageUrl} alt="" className="h-28 w-28 rounded-lg object-cover" />
        )}
        {mode === 'image' && !initial?.imageUrl && (
          <p className="text-[13px] text-app-text/70">{l === 'ka' ? 'მიამაგრე ფოტო ჩატში' : l === 'ru' ? 'Прикрепите фото в чате' : 'Attach a photo in the chat'}</p>
        )}
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={600} rows={2}
          aria-label={t('title', l)} className="w-full resize-none rounded-xl bg-app-bg/60 p-2 text-[14px]" />
        {mode !== 'retexture' && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} /> {t('high', l)}
          </label>
        )}
        <p data-studio3d-price="" className="text-[12px] text-app-text/70">{priceLine(mode, high && mode !== 'retexture', l)}</p>
        {state.status === 'error' && <p role="alert" className="text-[13px] text-red-500">{errorText(state.code, l)}</p>}
        <button type="button" disabled={!canSend} aria-busy={state.status === 'sending'}
          onClick={() => create({ mode, prompt, ...(initial?.imageUrl ? { imageUrl: initial.imageUrl } : {}), ...(initial?.meshUrl ? { meshUrl: initial.meshUrl } : {}), detail: high ? 'high' : 'standard' })}
          className="h-11 w-full rounded-full bg-app-accent text-[14px] font-medium text-white disabled:opacity-50">
          {t('title', l)}
        </button>
      </section>
    );
  }

  const flow = FLOW[job.mode];
  const at = job.step === 'starting' ? flow.indexOf('queued') + 0.5 : flow.indexOf(job.step);
  return (
    <section aria-label={t('title', l)} data-studio3d-card="job" data-step={job.step} className="space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/30 p-3">
      <ol className="space-y-1 text-[13px]" aria-live="polite">
        {flow.filter((s) => s !== 'done').map((s, i) => {
          const state = job.step === 'failed' ? (i < Math.max(0, at) ? 'done' : 'off') : i < at || job.step === 'done' ? 'done' : i === Math.floor(at) ? 'now' : 'next';
          return (
            <li key={s} data-state={state} className="flex items-center gap-2">
              <span aria-hidden="true">{state === 'done' ? '✓' : state === 'now' ? '◌' : '○'}</span>
              {stepLabel(s, l)}
            </li>
          );
        })}
      </ol>

      {job.step === 'failed' && <p role="alert" className="text-[13px] text-red-500">{errorText(job.error ?? '', l)} · {stepLabel('failed', l)}</p>}

      {job.referenceUrl && job.step !== 'done' && (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage link
        <img src={job.referenceUrl} alt={stepLabel('reference', l)} className="max-h-64 rounded-xl object-contain" />
      )}

      {job.step === 'awaiting_approval' && (
        <div className="flex gap-2">
          <button type="button" onClick={() => approve(job.id)} className="h-11 flex-1 rounded-full bg-app-accent text-[14px] font-medium text-white">
            {t('approve', l)} · ✦{job.quote[job.quote.length - 1]?.credits}
          </button>
          <button type="button" onClick={() => cancel(job.id)} className="h-11 rounded-full px-4 text-[14px]">✕</button>
        </div>
      )}

      {job.step === 'done' && job.model && (
        <>
          <Studio3dViewer url={job.model.glbUrl} locale={l} />
          <div className="flex flex-wrap items-center gap-2" data-studio3d-downloads="">
            <a href={downloadHref(job.id, 'glb')} download className={chip}>{t('download', l)} GLB</a>
            <a href={downloadHref(job.id, 'obj')} download className={chip}>{t('download', l)} OBJ</a>
            <span className="inline-flex items-center gap-1">
              <a href={downloadHref(job.id, 'stl', mm)} download className={chip}>{t('download', l)} STL</a>
              <label className="inline-flex items-center gap-1 text-[12px] text-app-text/70">
                <input type="number" inputMode="numeric" min={STL_MM.min} max={STL_MM.max} value={mm}
                  onChange={(e) => setMm(clampStlMm(e.target.value))} aria-label={t('stlHeight', l)}
                  className="h-9 w-16 rounded-lg bg-app-bg/60 px-2 text-[13px]" /> mm
              </label>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {job.model.turntableUrl && (
              <button type="button" className={chip} onClick={() => setNote(sendToVideo(job.model!.turntableUrl!) ? '' : stepLabel('failed', l))}>
                🎬 {t('useInVideo', l)} · {t('free', l)}
              </button>
            )}
            <button type="button" className={chip} onClick={() => setNote(addToScene(job.model!.glbUrl, '') ? '' : (l === 'ka' ? 'სცენა არ არის გახსნილი' : l === 'ru' ? 'Сцена не открыта' : 'No scene is open'))}>
              {t('addToScene', l)}
            </button>
          </div>
          {note && <p role="status" className="text-[12px] text-app-text/70">{note}</p>}
        </>
      )}
    </section>
  );
}
