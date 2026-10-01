'use client';

/**
 * The studio (brief §5–6, Phase 2.2): every Higgsfield model in the registry, from a Georgian screen, through
 * the one money path — estimate → the price ON the button → the user's tap is the confirmation → reserve →
 * submit → progress → result (also filed into the Library) → a refund and a plain-language reason on failure.
 *
 *   - The price the button shows is the price `start()` sends as `confirmedGel`; if the server's fresh quote
 *     differs it answers 409 price_changed and the NEW price waits for another tap (hooks/useStudioGeneration).
 *   - Above CONFIRM_ABOVE_GEL the dock asks once more before spending.
 *   - A start whose answer was lost is never re-sent — the job list (GET /api/generate) shows it if it exists.
 *   - Typing does not re-price: models price by duration / size / sound, not by the words, so the estimate key
 *     leaves the prompt out. The server re-quotes at start anyway.
 *
 * Layout: the five services as top tabs, motion and remix after a divider (the "rail"), the stage, and the
 * prompt dock. Georgian first; mobile first (44 px targets, safe-area, the dock never covers the stage).
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowRight, ChevronDown, Film, FolderOpen, ImageIcon, Mic, Move, Music2, UserCircle2, Wand2 } from 'lucide-react';
import { useStudioGeneration, type StudioJobView, type StudioPrice } from '@/hooks/useStudioGeneration';
import { useUpload } from '@/components/studio/ui/useUpload';
import { describeServiceError } from '@/components/studio/ui/serviceError';
import { creditsUpdated, CREDITS_UPDATED_EVENT } from '@/lib/billing/creditsUpdated';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { createBrowserClient } from '@/lib/supabase/browser';
import type { ParamSpec } from '@/lib/providers/paramSpec';
import {
  CONFIRM_ABOVE_GEL,
  carryMedia,
  carryOver,
  chipSpecs,
  durationChoices,
  mediaSpecs,
  missing,
  modelsForTab,
  promptSpec,
  requestKey,
  requestParams,
  type MediaValues,
  type ParamValues,
  type StudioModel,
  type StudioTab,
} from '@/lib/studio/ui/dock';
import { ELSEWHERE, FLOW, HERO, MODE_LABEL, PARAM_LABEL, T, TAB_LABEL, TIER_LABEL, VALUE_LABEL, langOf, tx, type Lang } from './copy';
import { JobCard } from './JobCard';
import { MediaSlots } from './MediaSlots';
import { Sheet } from './Sheet';

const MAIN_TABS: StudioTab[] = ['video', 'image', 'avatar', 'music', 'voice'];
const MORE_TABS: StudioTab[] = ['motion', 'remix'];
const TAB_ICON: Record<StudioTab, typeof Film> = {
  video: Film, image: ImageIcon, avatar: UserCircle2, music: Music2, voice: Mic, motion: Move, remix: Wand2,
};
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);
const TAB_KEY = 'myavatar:studio:tab';
const POLL_MS = 4_000;

type JobView = StudioJobView;

const modelLabel = (m: StudioModel, lang: Lang) => (lang === 'ka' ? m.label_ka : m.label_en);

function valueLabel(spec: ParamSpec, v: unknown, lang: Lang): string {
  const byValue = VALUE_LABEL[spec.key]?.[String(v)];
  if (byValue) return tx(byValue, lang);
  if (spec.key === 'duration' && typeof v === 'number') return `${v} ${tx(T.seconds, lang)}`;
  return String(v);
}

function summary(model: StudioModel, params: ParamValues, lang: Lang): string {
  return chipSpecs(model)
    .filter((p) => params[p.key] !== undefined)
    .map((p) => valueLabel(p, params[p.key], lang))
    .join(' · ');
}

export interface StudioV2Props {
  locale: string;
}

export function StudioV2({ locale }: StudioV2Props) {
  const lang = langOf(locale);
  const gen = useStudioGeneration();
  const genRef = useRef(gen);
  genRef.current = gen;
  const { upload, busy: uploading, error: uploadError, clearError } = useUpload(locale);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [models, setModels] = useState<StudioModel[] | null>(null);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [tab, setTab] = useState<StudioTab>('video');
  const [modelByTab, setModelByTab] = useState<Partial<Record<StudioTab, string>>>({});
  const [prompt, setPrompt] = useState('');
  const [params, setParams] = useState<ParamValues>({});
  const [media, setMedia] = useState<MediaValues>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<null | 'model' | 'params'>(null);
  const [confirmHigh, setConfirmHigh] = useState(false);
  const [priced, setPriced] = useState<{ key: string; price: StudioPrice } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  /* ── auth ─────────────────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    try {
      const sb = createBrowserClient();
      sb.auth.getUser().then(({ data }) => { if (alive) setAuthed(!!data.user); }).catch(() => { if (alive) setAuthed(false); });
      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { if (alive) setAuthed(!!s?.user); });
      unsubscribe = () => sub?.subscription?.unsubscribe();
    } catch {
      setAuthed(false);
    }
    return () => { alive = false; unsubscribe?.(); };
  }, []);

  /* ── models (our registry, Georgian labels; only what this deployment enables) ─────────────── */
  const loadModels = useCallback(async () => {
    setModelsFailed(false);
    try {
      const res = await fetch('/api/studio/models', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { models?: StudioModel[] };
      setModels(Array.isArray(j.models) ? j.models : []);
    } catch {
      setModelsFailed(true);
      setModels([]);
    }
  }, []);
  useEffect(() => { void loadModels(); }, [loadModels]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as StudioTab | null;
      if (saved && (MAIN_TABS.includes(saved) || MORE_TABS.includes(saved))) setTab(saved);
    } catch { /* private mode */ }
  }, []);
  const chooseTab = useCallback((t: StudioTab) => {
    setTab(t);
    setConfirmHigh(false);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode */ }
  }, []);

  const tabModels = useMemo(() => (models ? modelsForTab(models, tab) : []), [models, tab]);
  const model = useMemo(
    () => tabModels.find((m) => m.id === modelByTab[tab]) ?? tabModels[0] ?? null,
    [tabModels, modelByTab, tab],
  );

  // A model switch keeps what still fits (16:9 stays 16:9; a first frame stays a first frame).
  const shownModelId = useRef<string | null>(null);
  useEffect(() => {
    if (!model || shownModelId.current === model.id) return;
    shownModelId.current = model.id;
    setParams((p) => carryOver(model, p));
    setMedia((m) => carryMedia(model, m));
    setConfirmHigh(false);
  }, [model]);

  /* ── the request and its price ────────────────────────────────────────────────────────────── */
  const need = useMemo(() => (model ? missing(model, prompt, media) : []), [model, prompt, media]);
  const body = useMemo(() => (model ? requestParams(model, prompt, params, media) : {}), [model, prompt, params, media]);
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const priceKey = useMemo(() => {
    if (!model) return '';
    const { prompt: _words, ...rest } = body; // the words do not change the price; the server re-quotes anyway
    return requestKey(model.id, rest);
  }, [model, body]);
  const priceKeyRef = useRef(priceKey);
  priceKeyRef.current = priceKey;
  const price = priced && priced.key === priceKey ? priced.price : null;

  const estimateSeq = useRef(0);
  useEffect(() => {
    if (!authed || !model || need.length || (priced && priced.key === priceKey)) {
      setEstimating(false);
      return;
    }
    const seq = ++estimateSeq.current;
    const key = priceKey;
    const t = setTimeout(async () => {
      setEstimating(true);
      const p = await genRef.current.estimate(model.id, bodyRef.current);
      if (seq !== estimateSeq.current) return; // a newer request owns the button
      setEstimating(false);
      if (p) setPriced({ key, price: p });
    }, 450);
    return () => clearTimeout(t);
  }, [authed, model, need.length, priceKey, priced]);

  /* ── balance ──────────────────────────────────────────────────────────────────────────────── */
  const refreshBalance = useCallback(async (force: boolean) => {
    if (!authed) { setBalance(null); return; }
    try {
      const b = await useCreditsBalance.getState().get(force);
      if (typeof b === 'number') setBalance(b);
    } catch { /* the header shows its own */ }
  }, [authed]);
  useEffect(() => { void refreshBalance(false); }, [refreshBalance]);
  useEffect(() => {
    const on = () => void refreshBalance(true);
    window.addEventListener(CREDITS_UPDATED_EVENT, on);
    return () => window.removeEventListener(CREDITS_UPDATED_EVENT, on);
  }, [refreshBalance]);

  /* ── jobs: the list survives a reload; active ones are polled ─────────────────────────────── */
  const upsertJob = useCallback((job: JobView) => {
    setJobs((prev) => {
      const i = prev.findIndex((j) => j.id === job.id);
      if (i === -1) return [job, ...prev];
      const next = prev.slice();
      next[i] = { ...prev[i], ...job };
      return next;
    });
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/generate?limit=12', { cache: 'no-store' });
      if (!res.ok) return;
      const j = (await res.json()) as { jobs?: JobView[] };
      if (Array.isArray(j.jobs)) setJobs(j.jobs);
    } catch { /* keep what is on screen */ }
  }, []);
  useEffect(() => {
    if (authed) void loadJobs();
    else if (authed === false) setJobs([]);
  }, [authed, loadJobs]);

  // The hook polls the job it started; mirror it into the list.
  const hookJob = gen.state.job;
  useEffect(() => {
    if (!hookJob) return;
    upsertJob(hookJob);
    if (TERMINAL.has(hookJob.status) && hookJob.status !== 'completed') creditsUpdated(); // refunded
  }, [hookJob, upsertJob]);

  // Every other active job (older ones, one started in another tab) is polled here.
  const hookPolling = gen.state.phase === 'running' ? hookJob?.id ?? null : null;
  useEffect(() => {
    const active = jobs.filter((j) => !TERMINAL.has(j.status) && j.id !== hookPolling).slice(0, 4);
    if (!active.length) return;
    const t = setTimeout(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { setTick((x) => x + 1); return; }
      const updates = await Promise.all(active.map(async (j) => {
        try {
          const res = await fetch(`/api/generate/${j.id}`, { cache: 'no-store' });
          if (!res.ok) return null;
          return ((await res.json()) as { job?: JobView }).job ?? null;
        } catch { return null; }
      }));
      let refunded = false;
      for (const u of updates) {
        if (!u) continue;
        upsertJob(u);
        if (TERMINAL.has(u.status) && u.status !== 'completed') refunded = true;
      }
      if (refunded) creditsUpdated();
      setTick((x) => x + 1);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [jobs, tick, hookPolling, upsertJob]);

  /* ── what the hook says after a start ─────────────────────────────────────────────────────── */
  const { phase, errorCode, price: hookPrice } = gen.state;
  useEffect(() => {
    if (errorCode === 'price_changed' && hookPrice) {
      // The NEW price goes on the button and waits for another tap — never accepted on the user's behalf.
      setPriced({ key: priceKeyRef.current, price: hookPrice });
    }
    if (phase === 'failed' && !gen.state.job && errorCode === 'provider_unavailable') {
      // The request may or may not have reached us. It is never re-sent from here; if it started, the list shows it.
      setNotice(tx(T.lost, lang));
      const t = setTimeout(() => void loadJobs(), 4_000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, errorCode, hookPrice, gen.state.job, lang, loadJobs]);

  /* ── actions ──────────────────────────────────────────────────────────────────────────────── */
  const starting = phase === 'starting';

  const onGenerate = useCallback(async () => {
    if (!authed) { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); return; }
    if (!model) return;
    if (need.length) {
      if (need[0] === 'prompt') promptRef.current?.focus();
      return;
    }
    if (!price || estimating || starting) return;
    if (balance !== null && balance < price.credits) {
      window.dispatchEvent(new CustomEvent('myavatar:open-credits'));
      return;
    }
    if (price.gel > CONFIRM_ABOVE_GEL && !confirmHigh) { setConfirmHigh(true); return; }
    setConfirmHigh(false);
    setNotice(null);
    // The hook sends the last price it quoted. It must be the one on the button — otherwise price again.
    if (genRef.current.state.price?.gel !== price.gel) { setPriced(null); return; }
    const job = await genRef.current.start(model.id, bodyRef.current, prompt.trim() || undefined);
    if (job) {
      upsertJob(job);
      creditsUpdated();
    }
  }, [authed, model, need, price, estimating, starting, balance, confirmHigh, prompt, upsertJob]);

  const onCancel = useCallback(async (id: string) => {
    setCancelling(id);
    try {
      const res = await fetch(`/api/generate/${id}`, { method: 'DELETE' });
      const j = (await res.json().catch(() => ({}))) as { job?: JobView; error?: string };
      if (res.ok && j.job) { upsertJob(j.job); creditsUpdated(); }
      else setNotice(describeServiceError(j.error ?? 'cannot_cancel', locale, tx(T.failed, lang)));
    } catch {
      setNotice(describeServiceError('cannot_cancel', locale, tx(T.failed, lang)));
    } finally {
      setCancelling(null);
    }
  }, [upsertJob, locale, lang]);

  const addFiles = useCallback(async (spec: ParamSpec, files: File[]) => {
    clearError();
    for (const f of files) {
      const path = await upload(f);
      if (!path) break;
      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f);
        setPreviews((p) => ({ ...p, [path]: url }));
      }
      setMedia((m) => (spec.kind === 'media'
        ? { ...m, [spec.key]: path }
        : { ...m, [spec.key]: [...((m[spec.key] as string[] | undefined) ?? []), path].slice(0, spec.max ?? 5) }));
      if (spec.kind === 'media') break;
    }
  }, [upload, clearError]);

  const removeMedia = useCallback((key: string, value: string) => {
    setMedia((m) => {
      const cur = m[key];
      const next = { ...m };
      if (Array.isArray(cur)) {
        const rest = cur.filter((v) => v !== value);
        if (rest.length) next[key] = rest; else delete next[key];
      } else delete next[key];
      return next;
    });
  }, []);

  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => () => { Object.values(previewsRef.current).forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }); }, []);

  /** The first photo field of the current model (image_url, else image_urls). */
  const photoSpec = useMemo(() => (model ? mediaSpecs(model).find((p) => p.media === 'image') ?? null : null), [model]);

  const useAsReference = useCallback((url: string) => {
    if (!photoSpec) return;
    setMedia((m) => (photoSpec.kind === 'media'
      ? { ...m, [photoSpec.key]: url }
      : { ...m, [photoSpec.key]: [...((m[photoSpec.key] as string[] | undefined) ?? []), url].slice(0, photoSpec.max ?? 5) }));
  }, [photoSpec]);

  const animate = useCallback((url: string, job: JobView) => {
    const i2v = models?.find((m) => m.mode === 'image-to-video');
    if (!i2v) return;
    chooseTab('video');
    setModelByTab((s) => ({ ...s, video: i2v.id }));
    setMedia((m) => ({ ...m, image_url: url }));
    if (job.promptOriginal) setPrompt(job.promptOriginal);
    promptRef.current?.focus();
  }, [models, chooseTab]);

  const onPaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!photoSpec) return;
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    void addFiles(photoSpec, files);
  }, [photoSpec, addFiles]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    setDragging(false);
    if (!model) return;
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    e.preventDefault();
    for (const spec of mediaSpecs(model)) {
      const fits = files.filter((f) => f.type.startsWith(`${spec.media}/`));
      if (fits.length) { void addFiles(spec, fits); return; }
    }
  }, [model, addFiles]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void onGenerate();
    }
  }, [onGenerate]);

  // Auto-grow the prompt from two lines (a Georgian placeholder wraps on a phone) up to 160 px.
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 56), 160)}px`;
  }, [prompt, tab]);

  /* ── render ───────────────────────────────────────────────────────────────────────────────── */
  const elsewhere = !tabModels.length ? ELSEWHERE[tab] : undefined;
  const hero = HERO[tab];
  const chips = model ? chipSpecs(model) : [];
  const hasPromptField = model ? !!promptSpec(model) : false;

  const button = (() => {
    if (authed === false) return { label: tx(T.signIn, lang), enabled: true, lime: true };
    if (authed === null || !model) return { label: '…', enabled: false, lime: false };
    if (need.length) return { label: tx(T.generate, lang), enabled: true, lime: false };
    if (starting) return { label: tx(T.starting, lang), enabled: false, lime: true };
    if (!price || estimating) return { label: tx(T.pricing, lang), enabled: false, lime: false };
    if (balance !== null && balance < price.credits) return { label: `${tx(T.topUp, lang)} · ${price.display}`, enabled: true, lime: false };
    return { label: `${tx(T.generate, lang)} · ${price.display}`, enabled: true, lime: true };
  })();

  const hint = (() => {
    if (uploadError) return uploadError;
    if (notice) return notice;
    if (authed && need.length) return tx(T.need[need[0]!] ?? T.need.prompt!, lang);
    if (errorCode === 'price_changed' && price) return `${tx(T.newPrice, lang)}: ${price.display}`;
    if (errorCode && errorCode !== 'price_changed' && phase !== 'running') {
      if (errorCode === 'invalid_input' && gen.state.issues.length) {
        const k = gen.state.issues[0]!.path.split('.')[0]!;
        return `${PARAM_LABEL[k] ? tx(PARAM_LABEL[k]!, lang) : k}: ${describeServiceError('invalid_input', locale, tx(T.failed, lang))}`;
      }
      return describeServiceError(errorCode, locale, tx(T.failed, lang));
    }
    if (price && balance !== null && balance < price.credits) return tx(T.notEnough, lang);
    return null;
  })();

  const modelOf = (id: string) => models?.find((m) => m.id === id);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* Services: five tabs, then motion / remix after a divider. Scrolls sideways on a phone. */}
      <nav aria-label={tx(T.studio, lang)} className="shrink-0 border-b border-app-border/10">
        <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...MAIN_TABS, ...MORE_TABS].map((t, i) => {
            const Icon = TAB_ICON[t];
            const on = t === tab;
            return (
              <span key={t} className="flex shrink-0 items-center">
                {i === MAIN_TABS.length ? <span className="mx-1.5 h-5 w-px bg-app-border/15" aria-hidden="true" /> : null}
                <button type="button" onClick={() => chooseTab(t)} aria-pressed={on}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium transition-colors ${on ? 'bg-app-accent/15 text-app-accent' : i >= MAIN_TABS.length ? 'text-app-muted hover:bg-app-elevated hover:text-app-text' : 'text-app-text/80 hover:bg-app-elevated hover:text-app-text'}`}>
                  <Icon size={16} aria-hidden="true" /> {tx(TAB_LABEL[t], lang)}
                </button>
              </span>
            );
          })}
          <Link href={`/${locale}/library`}
            className="ml-auto inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <FolderOpen size={15} aria-hidden="true" /> {tx(T.library, lang)}
          </Link>
        </div>
      </nav>

      {/* Stage */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
          {modelsFailed ? (
            <div role="alert" className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-app-border/10 bg-app-surface p-4 text-[14px] text-app-text">
              {tx(T.modelsUnavailable, lang)}
              <button type="button" onClick={() => void loadModels()} className="min-h-[40px] rounded-full border border-app-border/15 px-4 text-[13px]">{tx(T.retry, lang)}</button>
            </div>
          ) : null}

          {elsewhere ? (
            <section className="rounded-3xl border border-app-border/10 bg-app-surface p-6">
              <h1 className="font-display text-[22px] font-bold text-app-text">{tx(TAB_LABEL[tab], lang)}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-app-muted">{tx(elsewhere.body, lang)}</p>
              <Link href={elsewhere.href(locale)}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-lime px-5 text-[15px] font-bold text-brand-on-lime transition-transform hover:scale-[1.02] active:scale-[0.98]">
                {tx(elsewhere.cta, lang)} <ArrowRight size={16} />
              </Link>
            </section>
          ) : jobs.length === 0 && models ? (
            <section className="relative overflow-hidden rounded-3xl px-2 py-8 text-center sm:py-12">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(51,143,232,0.12),transparent_60%)]" aria-hidden="true" />
              <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-app-text sm:text-[38px]">
                {tx(hero.title, lang)} <span className="text-app-accent">{tx(hero.accent, lang)}</span>
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-app-muted">{tx(hero.sub, lang)}</p>
              <p className="mt-5 inline-flex items-center rounded-full border border-app-border/10 px-3 py-1 text-[12px] font-medium tracking-wide text-app-muted">{tx(FLOW, lang)}</p>
            </section>
          ) : null}

          {jobs.length > 0 ? (
            <section aria-label={tx(T.recent, lang)} className={elsewhere ? 'mt-8' : ''}>
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{tx(T.recent, lang)}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {jobs.map((j) => {
                  const m = modelOf(j.modelId);
                  return (
                    <JobCard
                      key={j.id}
                      job={j}
                      modelLabel={m ? modelLabel(m, lang) : j.modelId}
                      lang={lang}
                      locale={locale}
                      cancelling={cancelling === j.id}
                      onCancel={onCancel}
                      onAnimate={models?.some((x) => x.mode === 'image-to-video') ? animate : undefined}
                      onUseAsReference={photoSpec && !elsewhere ? useAsReference : undefined}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* Prompt dock */}
      {model && !elsewhere ? (
        <div className="shrink-0 border-t border-app-border/10 bg-app-bg/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div
            className={`mx-auto max-w-3xl rounded-[28px] border bg-app-surface p-3 transition-colors focus-within:border-app-accent/50 focus-within:ring-4 focus-within:ring-app-accent/10 ${dragging ? 'border-dashed border-app-accent' : 'border-app-border/15'}`}
            onDragOver={(e) => { if (mediaSpecs(model).length) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <MediaSlots model={model} media={media} previews={previews} busy={uploading} lang={lang} onAdd={(s, f) => void addFiles(s, f)} onRemove={removeMedia} />
            {hasPromptField ? (
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); if (notice) setNotice(null); }}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                rows={2}
                maxLength={2500}
                aria-label={tx(PARAM_LABEL.prompt!, lang)}
                placeholder={tx(T.placeholder[tab] ?? T.placeholder.video!, lang)}
                className="block min-h-[56px] w-full resize-none !border-0 !bg-transparent px-1.5 py-2 text-[16px] leading-snug text-app-text !shadow-none !outline-none !ring-0 [scrollbar-width:thin] placeholder:text-app-muted/70"
              />
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setSheet('model')}
                className="inline-flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full border border-app-border/15 px-3 text-[13px] text-app-text transition-colors hover:bg-app-elevated">
                <span className="truncate">{modelLabel(model, lang).split(' — ')[0]}</span>
                <ChevronDown size={14} className="shrink-0 text-app-muted" />
              </button>
              {chips.length ? (
                <button type="button" onClick={() => setSheet('params')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-border/15 px-3 text-[13px] text-app-text transition-colors hover:bg-app-elevated">
                  <span className="tabular-nums">{summary(model, params, lang)}</span>
                  <ChevronDown size={14} className="text-app-muted" />
                </button>
              ) : null}

              <div className="w-full sm:ml-auto sm:w-auto">
                {confirmHigh && price ? (
                  <div className="flex flex-wrap items-center gap-2" role="group">
                    <span className="text-[13px] text-app-text">{tx(T.confirmHigh, lang)} <b className="tabular-nums">{price.display}</b></span>
                    <button type="button" onClick={() => void onGenerate()}
                      className="min-h-[44px] rounded-full bg-brand-lime px-4 text-[14px] font-bold text-brand-on-lime">{tx(T.confirmYes, lang)}</button>
                    <button type="button" onClick={() => setConfirmHigh(false)}
                      className="min-h-[44px] rounded-full border border-app-border/15 px-4 text-[14px] text-app-text">{tx(T.confirmNo, lang)}</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onGenerate()}
                    disabled={!button.enabled}
                    data-testid="studio-generate"
                    className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold tabular-nums transition-all sm:w-auto ${button.lime && button.enabled ? 'bg-brand-lime text-brand-on-lime shadow-[0_0_24px_rgba(197,255,0,0.25)] hover:scale-[1.02] active:scale-[0.98]' : 'bg-app-elevated text-app-text/80'} disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    {button.label}
                  </button>
                )}
              </div>
            </div>
          </div>
          <p aria-live="polite" className={`mx-auto mt-1.5 max-w-3xl px-2 text-[12.5px] leading-snug ${hint && (uploadError || errorCode || notice) ? 'text-app-danger' : 'text-app-muted'}`}>
            {hint ?? ' '}
            {errorCode === 'insufficient_credits' || (price && balance !== null && balance < price.credits) ? (
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('myavatar:open-credits'))} className="ml-2 font-semibold text-app-accent underline-offset-2 hover:underline">
                {tx(T.topUp, lang)}
              </button>
            ) : null}
          </p>
        </div>
      ) : null}

      {/* Model picker */}
      <Sheet open={sheet === 'model'} title={tx(T.model, lang)} closeLabel={tx(T.close, lang)} onClose={() => setSheet(null)}>
        <div className="space-y-4">
          {Array.from(new Set(tabModels.map((m) => m.mode))).map((mode) => (
            <div key={mode}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{MODE_LABEL[mode] ? tx(MODE_LABEL[mode]!, lang) : mode}</p>
              <div className="space-y-1.5">
                {tabModels.filter((m) => m.mode === mode).map((m) => {
                  const on = m.id === model?.id;
                  return (
                    <button key={m.id} type="button" aria-pressed={on}
                      onClick={() => { setModelByTab((s) => ({ ...s, [tab]: m.id })); setSheet(null); }}
                      className={`flex min-h-[56px] w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${on ? 'border-app-accent/50 bg-app-accent/10' : 'border-app-border/10 hover:bg-app-elevated'}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-app-text">{modelLabel(m, lang)}</span>
                        {lang === 'ka' ? <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">{m.description_ka}</span> : null}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${m.tier === 'pro' ? 'bg-brand-gold/15 text-brand-gold' : m.tier === 'fast' ? 'bg-app-accent/10 text-app-accent' : 'bg-app-elevated text-app-muted'}`}>
                        {tx(TIER_LABEL[m.tier], lang)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Parameters */}
      <Sheet open={sheet === 'params'} title={tx(T.settings, lang)} closeLabel={tx(T.close, lang)} onClose={() => setSheet(null)}>
        <div className="space-y-5">
          {model ? chips.map((spec) => {
            const options: unknown[] = spec.kind === 'enum' ? spec.options ?? [] : spec.kind === 'bool' ? [true, false] : durationChoices(spec);
            return (
              <div key={spec.key}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{PARAM_LABEL[spec.key] ? tx(PARAM_LABEL[spec.key]!, lang) : spec.key}</p>
                <div className={`grid gap-2 ${options.length > 4 ? 'grid-cols-4' : options.length === 4 ? 'grid-cols-4' : options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {options.map((v) => {
                    const on = params[spec.key] === v;
                    return (
                      <button key={String(v)} type="button" aria-pressed={on}
                        onClick={() => setParams((p) => ({ ...p, [spec.key]: v }))}
                        className={`min-h-[44px] rounded-xl px-2 text-[13px] font-medium tabular-nums transition-colors ${on ? 'bg-app-text text-app-bg' : 'bg-app-elevated text-app-text hover:bg-app-elevated/70'}`}>
                        {valueLabel(spec, v, lang)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }) : null}
          {price ? (
            <p className="rounded-2xl bg-app-elevated px-4 py-3 text-[13px] text-app-text">
              {tx(T.generate, lang)} · <b className="tabular-nums">{price.display}</b>
              <span className="text-app-muted"> ({price.credits} {lang === 'en' ? 'credits' : lang === 'ru' ? 'кред.' : 'კრედიტი'})</span>
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

export default StudioV2;
