'use client';

/**
 * Virtual Studio (Phase 8.6): paste a script → the storyboard of ~30 s scenes with each scene's price → Make (one scene)
 * or Make all → a Presenter Card per scene → Join into one presentation (+ SRT, filed in the Library) → Use in Video
 * (Montage, or a ready scene for the Director's Workflow). AVATAR_STUDIO_V2 only.
 *
 * The plan and every price are computed here with the SAME pure code the server runs (buildStudioPlan / sceneToMake);
 * the server rebuilds them and refuses a price that moved (409, nothing charged). Network calls go through `api`, so
 * tests inject mocks and no test can spend.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { buildStudioPlan, type StudioRequest } from '@/lib/avatar/studio/plan';
import { sceneToMake, type PublicSceneJob } from '@/lib/avatar/studio/sceneRun';
import { BACKGROUND_CREDITS, type StudioBook } from '@/lib/avatar/studio/price';
import { LIVE_PRESENTERS, presenterById, type VoiceId } from '@/lib/avatar/studio/catalog';
import { PresenterCard, type PresenterCardScene } from './PresenterCard';
import { StudioControls } from './StudioControls';
import { UseInVideoSheet } from './UseInVideoSheet';
import { stashPendingEdit } from '@/lib/studio/pendingEdit';
import type { StudioClip } from '@/lib/avatar/studio/videoHandoff';
import { t, type StudioLang } from './labels';

export interface ApiResult { status: number; data: Record<string, unknown> }
export interface StudioApi {
  post: (url: string, body: unknown) => Promise<ApiResult>;
  get: (url: string) => Promise<ApiResult>;
}

const asJson = async (r: Response): Promise<ApiResult> => ({ status: r.status, data: ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown> });
export const fetchApi: StudioApi = {
  post: (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(asJson),
  get: (url) => fetch(url, { cache: 'no-store' }).then(asJson),
};

interface SceneSlot {
  job: PublicSceneJob | null;
  busy: boolean;
  take: number;
  /** The user's edited words for this scene (Edit script). */
  text?: string;
  error?: string;
}

interface Final { url: string; srt: string; durationSec: number; savedToLibrary: boolean }

/** The studio page's Montage: the clip rides over in this tab (lib/studio/pendingEdit) and the studio opens it once. */
export function openMontageInStudio(url: string, lang: StudioLang) {
  stashPendingEdit(url, 'video');
  window.location.assign(`/${lang}/dashboard`);
}

const newProjectId = () => `vs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POLL_LIMIT = 200;

function errorText(res: ApiResult, lang: StudioLang): string {
  const code = res.data.error;
  if (code === 'price_changed') return t('priceChanged', lang);
  if (code === 'insufficient_credits') return t('low', lang);
  return typeof res.data.message === 'string' ? res.data.message : t('refunded', lang);
}

const fileToDataUrl = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(f);
});

export function VirtualStudio({ lang, book, api = fetchApi, pollMs = 4000, initialScript = '', initialRequest, compact = false, onOpenMontage, onCharged }: {
  lang: StudioLang;
  book: StudioBook;
  api?: StudioApi;
  pollMs?: number;
  initialScript?: string;
  /** Agent G's card: the request it read from the chat line (script, presenter, voice, format). */
  initialRequest?: StudioRequest;
  /** Inside a chat bubble: no page title. */
  compact?: boolean;
  /** "Use in Video" → Montage. The chat opens its own Montage; the page hands the clip to the studio. */
  onOpenMontage?: (url: string) => void;
  /** A scene was accepted and charged (the chat's credit toast). */
  onCharged?: (credits: number) => void;
}) {
  const first = LIVE_PRESENTERS[0]!;
  const [req, setReq] = useState<StudioRequest>(initialRequest ?? { script: initialScript, presenterId: first.id, voiceId: first.defaultVoice, tone: 'friendly', pace: 'natural' });
  const [using, setUsing] = useState<Omit<StudioClip, 'at'> | null>(null);
  const [slots, setSlots] = useState<Record<number, SceneSlot>>({});
  const [final, setFinal] = useState<Final | null>(null);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const projectId = useRef(newProjectId());
  const reqRef = useRef(req);
  reqRef.current = req;

  const built = useMemo(() => buildStudioPlan(req, { book }), [req, book]);
  const plan = built.ok ? built.plan : null;

  const patchSlot = useCallback((i: number, p: Partial<SceneSlot>) => setSlots((s) => ({ ...s, [i]: { job: null, busy: false, take: 0, ...s[i], ...p } })), []);

  // A new script or presenter starts a new project: the old cards no longer match the storyboard.
  const changeRequest = (r: StudioRequest) => {
    const cur = reqRef.current;
    if (r.script !== cur.script || r.presenterId !== cur.presenterId) { setSlots({}); setFinal(null); projectId.current = newProjectId(); }
    setReq(r);
  };

  const uploadBackground = useCallback(async (f: File): Promise<string | null> => {
    const res = await api.post('/api/avatar/studio/background', { kind: 'upload', dataUrl: await fileToDataUrl(f) });
    if (res.status !== 200 || typeof res.data.path !== 'string') { setNotice(errorText(res, lang)); return null; }
    return res.data.path;
  }, [api, lang]);

  /** Live + "Generate": the image is made once (charged then), and the request then names it like an upload. */
  const ensureBackground = useCallback(async (r: StudioRequest): Promise<StudioRequest | null> => {
    const bg = r.background;
    if (bg?.kind !== 'generate' || presenterById(r.presenterId)?.engine !== 'live') return r;
    const res = await api.post('/api/avatar/studio/background', { kind: 'generate', prompt: bg.prompt, format: r.format ?? '16:9' });
    if (res.status !== 200 || typeof res.data.path !== 'string') { setNotice(errorText(res, lang)); return null; }
    const next: StudioRequest = { ...r, background: { kind: 'upload', path: res.data.path } };
    setReq(next);
    return next;
  }, [api, lang]);

  // Refs, not state: "Make all" runs with the `slots` of the moment it started, so a scene the user started or finished
  // by hand meanwhile would otherwise be made (and charged) a second time. Same for two taps in one frame.
  const inFlight = useRef(new Set<number>());
  const readyRef = useRef(new Set<number>());

  const poll = useCallback(async (i: number, job: PublicSceneJob) => {
    let cur = job;
    for (let n = 0; cur.state === 'processing' && n < POLL_LIMIT; n++) {
      await sleep(pollMs);
      const res = await api.get(`/api/avatar/studio/scene?job=${encodeURIComponent(cur.id)}`);
      if (res.status === 200 && res.data.job) cur = res.data.job as PublicSceneJob;
      else if (res.status !== 200) break;
    }
    if (cur.state === 'ready') readyRef.current.add(i);
    patchSlot(i, { job: cur, busy: false, error: cur.state === 'failed' ? t('refunded', lang) : undefined });
  }, [api, pollMs, lang, patchSlot]);

  const makeSceneOnce = useCallback(async (i: number, opts: { take?: number; text?: string; request?: StudioRequest } = {}) => {
    let r: StudioRequest | null = opts.request ?? reqRef.current;
    const slot = slots[i];
    const take = opts.take ?? slot?.take ?? 0;
    const text = opts.text ?? slot?.text;
    patchSlot(i, { busy: true, error: undefined, take, text });
    r = await ensureBackground(r);
    const b = r && buildStudioPlan(r, { book });
    if (!r || !b || !b.ok) { patchSlot(i, { busy: false, error: b && !b.ok ? b.detail : undefined }); return; }
    const scene = sceneToMake(b.plan, i, book, text);
    if (!scene.ok) { patchSlot(i, { busy: false, error: scene.reason }); return; }
    const res = await api.post('/api/avatar/studio/scene', { projectId: projectId.current, request: r, sceneIndex: i, expectedCredits: scene.credits, text, take });
    if (res.status !== 200 || !res.data.job) { patchSlot(i, { busy: false, error: errorText(res, lang) }); return; }
    const job = res.data.job as PublicSceneJob;
    onCharged?.(job.credits);
    patchSlot(i, { job });
    setFinal(null);
    await poll(i, job);
  }, [slots, book, api, lang, ensureBackground, patchSlot, poll, onCharged]);

  const makeScene = useCallback(async (i: number, opts: { take?: number; text?: string; request?: StudioRequest } = {}) => {
    if (inFlight.current.has(i)) return;
    inFlight.current.add(i);
    readyRef.current.delete(i);
    try { await makeSceneOnce(i, opts); } finally { inFlight.current.delete(i); }
  }, [makeSceneOnce]);

  const makeAll = async () => {
    if (!plan) return;
    // One after another: a Live take is recorded in real time, and the balance is checked before each charge.
    for (const s of plan.scenes) {
      if (readyRef.current.has(s.index) || inFlight.current.has(s.index) || slots[s.index]?.job?.state === 'ready') continue;
      await makeScene(s.index);
    }
  };

  const join = async () => {
    if (!plan) return;
    const ids = plan.scenes.map((s) => slots[s.index]?.job).filter((j): j is PublicSceneJob => j?.state === 'ready').map((j) => j.id);
    setJoining(true);
    const res = await api.post('/api/avatar/studio/stitch', { projectId: projectId.current, jobIds: ids });
    setJoining(false);
    if (res.status === 200 && typeof res.data.url === 'string') setFinal({ url: res.data.url, srt: String(res.data.srt ?? ''), durationSec: Number(res.data.durationSec ?? 0), savedToLibrary: res.data.savedToLibrary === true });
    else setNotice(errorText(res, lang));
  };

  const allReady = !!plan && plan.scenes.length > 0 && plan.scenes.every((s) => slots[s.index]?.job?.state === 'ready');
  const anyBusy = Object.values(slots).some((s) => s.busy);
  const bgExtra = plan && plan.presenter.engine === 'live' && req.background?.kind === 'generate' ? BACKGROUND_CREDITS[book] : 0;

  return (
    <section data-testid="virtual-studio" data-ui-surface className="mx-auto max-w-4xl space-y-5 p-4">
      {!compact && <h1 className="text-[20px] font-semibold text-app-text">{t('title', lang)}</h1>}
      {!req.script.trim() && initialRequest && <p data-testid="vs-no-script" className="text-[13px] text-app-muted">{t('noScript', lang)}</p>}
      <label className="block text-[12px] text-app-muted">{t('script', lang)}
        <textarea data-testid="vs-script" value={req.script} rows={8} placeholder={t('scriptHint', lang)}
          onChange={(e) => changeRequest({ ...req, script: e.target.value })}
          className="mt-1 block w-full rounded-xl border border-app-border bg-app-bg p-3 text-[14px] text-app-text" />
      </label>
      <StudioControls value={req} onChange={changeRequest} lang={lang} book={book} onUploadBackground={uploadBackground} />
      {notice && <p data-testid="vs-notice" className="text-[13px] text-app-warning">{notice}</p>}
      {!built.ok && req.script.trim() && <p data-testid="vs-plan-error" className="text-[13px] text-app-warning">{built.detail}</p>}
      {plan && plan.warnings.includes('live_wide_pillared') && <p className="text-[12px] text-app-muted">{t('pillared', lang)}</p>}

      {plan && (
        <div data-testid="vs-storyboard" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-app-text">{t('storyboard', lang)} · {plan.scenes.length}</h2>
            <div className="flex items-center gap-2 text-[13px]">
              <span data-testid="vs-total" className="text-app-muted">{t('total', lang)} ✦{plan.quote.total}</span>
              <button type="button" data-testid="vs-make-all" disabled={anyBusy || allReady} onClick={makeAll}
                className="rounded-full bg-app-accent px-4 py-2 font-semibold text-white disabled:opacity-40">{t('makeAll', lang)}</button>
            </div>
          </div>
          {plan.scenes.map((s) => {
            const slot = slots[s.index];
            const job = slot?.job;
            const made = sceneToMake(plan, s.index, book, slot?.text);
            const price = (made.ok ? made.credits : plan.quote.scenes[s.index]?.credits ?? 0) + (s.index === 0 && !slots[0]?.job ? bgExtra : 0);
            const presenter = presenterById(job?.presenterId ?? plan.presenter.id) ?? plan.presenter;
            const card: PresenterCardScene | null = job?.state === 'ready' && job.url ? {
              sceneIndex: s.index, url: job.url, text: job.text, timings: job.timings, timingSource: job.timingSource,
              warnings: job.warnings, durationSec: job.durationSec, engine: job.engine, voiceId: job.voiceId, dub: job.dub,
            } : null;
            return (
              <div key={s.index} data-testid={`vs-scene-${s.index}`} className="space-y-2 rounded-2xl border border-app-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] text-app-muted">{t('scene', lang)} {s.index + 1} · ≈{Math.round(s.estSec)} {t('sec', lang)}{s.direction ? ` · ${s.direction}` : ''}</div>
                    {!card && <p className="mt-1 line-clamp-3 text-[14px] text-app-text">{slot?.text ?? s.text}</p>}
                  </div>
                  {!card && (
                    <button type="button" data-testid={`vs-make-${s.index}`} disabled={slot?.busy} aria-busy={!!slot?.busy} onClick={() => makeScene(s.index)}
                      className="shrink-0 rounded-full border border-app-accent px-3 py-1.5 text-[13px] text-app-text disabled:opacity-40">
                      {slot?.busy ? t('working', lang) : `${t('make', lang)} · ✦${price}`}
                    </button>
                  )}
                </div>
                {slot?.error && <p data-testid={`vs-error-${s.index}`} role="alert" className="text-[12px] text-app-warning">{slot.error}</p>}
                {slot?.busy && !(card && job) && (
                  <div data-testid={`vs-recording-${s.index}`} role="status" aria-live="polite"
                    className={`ag-shimmer w-full rounded-2xl bg-app-elevated/70 ${plan.format === '9:16' ? 'mx-auto aspect-[9/16] max-w-[240px]' : 'aspect-video'}`}>
                    <span className="sr-only">{t('working', lang)}</span>
                  </div>
                )}
                {card && job && (
                  <PresenterCard scene={card} lang={lang} busy={slot?.busy} gender={presenter.gender}
                    onRegenerate={() => makeScene(s.index, { take: (slot?.take ?? 0) + 1 })}
                    onChangeVoice={(v: VoiceId) => { const r = { ...req, voiceId: v }; setReq(r); void makeScene(s.index, { take: (slot?.take ?? 0) + 1, request: r }); }}
                    onEditScript={(text) => makeScene(s.index, { take: (slot?.take ?? 0) + 1, text })}
                    onUseInVideo={() => setUsing({ key: `${projectId.current}:${s.index}`, url: job.url!, durationSec: job.durationSec ?? s.estSec, title: `${t('scene', lang)} ${s.index + 1}`, text: job.text, format: plan.format })} />
                )}
              </div>
            );
          })}
          <button type="button" data-testid="vs-join" disabled={!allReady || joining || anyBusy} onClick={join}
            className="w-full rounded-full bg-app-accent/15 px-4 py-2.5 text-[14px] font-semibold text-app-accent disabled:opacity-40">
            {joining ? t('joining', lang) : t('join', lang)}
          </button>
        </div>
      )}

      {final && (
        <div data-testid="vs-final" className="space-y-2">
          <video src={final.url} controls playsInline className="aspect-video w-full rounded-2xl bg-black" />
          {final.srt && (
            <a data-testid="vs-srt" download="presentation.srt" href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent(final.srt)}`}
              className="inline-block rounded-full border border-app-border px-3 py-1.5 text-[13px] text-app-text">{t('srt', lang)}</a>
          )}
          {plan && (
            <button type="button" data-testid="vs-final-use" onClick={() => setUsing({ key: `${projectId.current}:all`, url: final.url, durationSec: final.durationSec, title: t('wholePresentation', lang), text: plan.scenes.map((x) => x.text).join(' '), format: plan.format })}
              className="ml-2 inline-block rounded-full bg-app-accent/15 px-3 py-1.5 text-[13px] font-semibold text-app-accent">{t('useInVideo', lang)}</button>
          )}
          {final.savedToLibrary && <p data-testid="vs-in-library" className="text-[12px] text-app-muted">{t('library', lang)}</p>}
        </div>
      )}
      {using && <UseInVideoSheet clip={using} lang={lang} onOpenMontage={(u) => { setUsing(null); (onOpenMontage ?? ((x: string) => openMontageInStudio(x, lang)))(u); }} onClose={() => setUsing(null)} />}
    </section>
  );
}
