'use client';

/**
 * GenjutsuPanel — the VFX module of the video tool: motion transfer, object / location / style swaps and VFX
 * transformations, with NO prompt required (one tap on a preset), a multi-reference dropzone (up to 40 photos that keep
 * the character and the product identical), a 3–30 s source video, and the price ON the Generate button.
 *
 * LAYOUT, in Higgsfield's mobile grammar (docs ref4 / ref5): the hero card (the chosen effect, a „Change" button) → the
 * presets (a snap-scrolling rail on a phone, a grid on a desktop) → the Scene · Motion · Swap segmented control → the
 * source-video card → the references dropzone with its "Using 3 of 12" line → an optional detail line → format / quality /
 * length → the engines & prices list → the full-width „Generate ✦ N" pill, pinned to the bottom of the panel.
 *
 * ⚠️ WHAT IS REAL, AND SAID SO. A mode is offered only when GET /api/genjutsu/capabilities says it is OPEN (a route wired
 * end to end); otherwise the whole mode is shown, inert, with a plain "soon" line and a button that is off — nothing is
 * faked and nothing silently falls back to another engine. The price is never a guess: Scene's comes from
 * lib/genjutsu/pricing (the function the server charges with), Motion / Swap's from the studio saga's live quote.
 *
 * Self-contained: it owns its uploads, its job and its result card, so it asks OmniStudio for nothing but `locale`.
 */
import { Clapperboard, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { creditsUpdated } from '@/lib/billing/creditsUpdated';
import { ENGINES, modelLabel, qualityFor } from '@/lib/genjutsu/engines';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';
import { getPreset } from '@/lib/genjutsu/presets';
import { selectReferences } from '@/lib/genjutsu/selection';
import { USER_PROMPT_MAX_CHARS } from '@/lib/genjutsu/limits';
import { toLang, type GenjutsuAspect, type GenjutsuOp, type GenjutsuQuality } from '@/lib/genjutsu/types';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { LiveStatus, generationAnnouncement } from '@/components/studio/ui/LiveStatus';
import { ResultCard, type ResultState } from '@/components/studio/ui/ResultCard';
import { Segmented } from '@/components/studio/ui/Segmented';
import { describeGenerationFailure, describeServiceError } from '@/components/studio/ui/serviceError';
import { TEXTAREA, CHIP_BASE, CHIP_OFF, CHIP_ON } from '@/components/studio/ui/tokens';
import { uploadErrorText, uploadFileToStorage } from '@/components/studio/ui/useUpload';
import {
  buildRequestBody, fetchBalanceCredits, fetchCapabilities, requestQuote, startGeneration, type ApiIssue, type Capabilities,
} from './api';
import { copyFor, issueText } from './copy';
import { EnginesList } from './EnginesList';
import { HeroCard } from './HeroCard';
import { checkVideoFile, formatSeconds, judgeDuration, probeVideo } from './media';
import { ModeTabs } from './ModeTabs';
import { PresetCarousel } from './PresetCarousel';
import { ReferenceDropzone } from './ReferenceDropzone';
import { SourceVideoCard, type SourceVideo } from './SourceVideoCard';
import { useGenjutsuJob } from './useGenjutsuJob';
import { useReferencePhotos } from './useReferencePhotos';

/** ChatChrome publishes the session on <html data-authed> — read synchronously, at the moment of a tap. */
const isGuest = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.authed === '0';
const fire = (name: string): void => { try { window.dispatchEvent(new CustomEvent(name)); } catch { /* non-DOM */ } };

/** A source video's frame, from its pixels — what the job card is shaped like while the render runs. */
const aspectOfVideo = (w: number, h: number): '9:16' | '16:9' => (h > w ? '9:16' : '16:9');

type CapsState = { status: 'loading' } | { status: 'ready'; ops: Capabilities } | { status: 'error' };

export interface GenjutsuPanelProps {
  locale: string;
}

export function GenjutsuPanel({ locale }: GenjutsuPanelProps) {
  const c = copyFor(locale);
  const lang = toLang(locale);

  // ── what the user chose ──
  const [op, setOp] = useState<GenjutsuOp>('scene');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [userText, setUserText] = useState('');
  const [aspect, setAspect] = useState<GenjutsuAspect>('9:16');
  const [quality, setQuality] = useState<GenjutsuQuality>(ENGINES.scene.defaultQuality);
  const [keepSound, setKeepSound] = useState(true);
  const refs = useReferencePhotos();
  const [video, setVideo] = useState<(SourceVideo & { aspect: '9:16' | '16:9' }) | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // ── what the server says ──
  const [caps, setCaps] = useState<CapsState>({ status: 'loading' });
  const [balance, setBalance] = useState<number | null>(null);
  const [quote, setQuote] = useState<{ sig: string; credits: number; gel: number | null } | null>(null);
  const [_quoting, setQuoting] = useState(false);
  const [override, setOverride] = useState<{ key: string; credits: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A guest sees the whole panel (and may build a request); signing in is asked for at the moment of Generate.
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setGuest(el.dataset.authed === '0');
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['data-authed'] });
    return () => mo.disconnect();
  }, []);

  const refreshBalance = useCallback(() => { void fetchBalanceCredits().then(setBalance); }, []);
  const { job, begin, reset } = useGenjutsuJob(locale, () => { creditsUpdated(); refreshBalance(); });

  useEffect(() => {
    let live = true;
    void fetchCapabilities().then((ops) => { if (live) setCaps(ops ? { status: 'ready', ops } : { status: 'error' }); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!isGuest()) refreshBalance();
    const on = () => { if (!isGuest()) refreshBalance(); };
    window.addEventListener('myavatar:credits-updated', on);
    return () => window.removeEventListener('myavatar:credits-updated', on);
  }, [refreshBalance]);

  // ── derived: the engine, the preset, WHICH photos it receives ──
  const engine = ENGINES[op];
  const preset = getPreset(presetId);
  const selection = useMemo(
    () => selectReferences(refs.photos.map((p) => ({ id: p.id, role: p.role })), engine.maxRefs),
    [refs.photos, engine.maxRefs],
  );
  const usedIds = useMemo(() => new Set(selection.used.map((u) => u.id)), [selection]);
  const open: Record<GenjutsuOp, boolean | null> = {
    scene: caps.status === 'loading' ? null : caps.status === 'ready' ? caps.ops.scene.open : false,
    motion: caps.status === 'loading' ? null : caps.status === 'ready' ? caps.ops.motion.open : false,
    swap: caps.status === 'loading' ? null : caps.status === 'ready' ? caps.ops.swap.open : false,
  };
  const opOpen = open[op];
  const locked = opOpen === false;
  const hasCharacter = selection.used.some((u) => u.role === 'character');
  const needsCharacter = engine.requiresRole === 'character' && refs.photos.length > 0 && !refs.photos.some((p) => p.role === 'character');
  const hasWords = !!preset || userText.trim().length > 0;
  const q = qualityFor(op, quality);
  const engineName = modelLabel(op, q, lang);

  // ── the price ──
  const quoteSig = !guest && op !== 'scene' && opOpen === true && hasWords && video?.path && selection.used.length > 0 && (engine.requiresRole !== 'character' || hasCharacter)
    ? JSON.stringify([op, q, presetId, keepSound, video.path, selection.used.map((u) => `${u.id}:${u.role}`)])
    : null;
  const localCredits = op === 'scene' ? genjutsuCredits({ op, refsUsed: selection.used.length, quality: q }) : null;
  const overrideKey = `${op}:${q}`;
  const price: number | null = op === 'scene'
    ? (override?.key === overrideKey ? override.credits : localCredits)
    : quote && quote.sig === quoteSig ? quote.credits : null;
  const insufficient = balance !== null && price !== null && balance < price;

  // Provider-quoted ops: ask the server for the live price once the inputs are complete (the photo the engine will use is
  // uploaded for it — and only that one). A stale answer never overwrites a newer one.
  useEffect(() => {
    if (!quoteSig || !video?.path) { setQuote(null); setQuoting(false); return; }
    let stale = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      const up = await refs.ensureUploaded(selection.used.map((u) => u.id));
      if (stale) return;
      if (!up.ok) { setQuoting(false); return; }
      const res = await requestQuote(buildRequestBody({
        op, presetId, prompt: '', aspect, quality: q, keepSound, video: { path: video.path!, durationSec: video.durationSec, sizeBytes: video.sizeBytes },
        references: selection.used.map((u) => ({ ref: up.paths[u.id]!, role: u.role })), referencesTotal: refs.photos.length,
      }));
      if (stale) return;
      setQuoting(false);
      if (res.ok && res.quote.credits !== null) setQuote({ sig: quoteSig, credits: res.quote.credits, gel: res.quote.gel });
      else { setQuote(null); if (!res.ok && res.status === 423) setCaps((s) => (s.status === 'ready' ? { status: 'ready', ops: { ...s.ops, [op]: { open: false, state: 'soon' } } } : s)); }
    }, 350);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSig]);

  // ── changing the mode resets only what no longer applies ──
  const changeOp = useCallback((next: GenjutsuOp) => {
    setOp(next);
    setQuality((cur) => qualityFor(next, cur));
    setNotice(null);
  }, []);

  // ── the source video: checked, measured, uploaded ──
  const pickVideo = useCallback(async (file: File) => {
    setVideoError(null);
    setNotice(null);
    const refusal = checkVideoFile(file);
    if (refusal) { setVideoError(refusal === 'type' ? c.video.type : c.video.size); return; }
    setVideoBusy(true);
    const meta = await probeVideo(file);
    const verdict = meta ? judgeDuration(meta.durationSec) : 'unreadable';
    if (!meta || verdict !== 'ok') {
      setVideoBusy(false);
      setVideoError(meta && verdict === 'short' ? c.video.short(formatSeconds(meta.durationSec)) : meta && verdict === 'long' ? c.video.long(formatSeconds(meta.durationSec)) : c.video.unreadable);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setVideo((old) => { if (old) URL.revokeObjectURL(old.previewUrl); return { name: file.name, previewUrl, durationSec: meta.durationSec, sizeBytes: file.size, path: null, aspect: aspectOfVideo(meta.width, meta.height) }; });
    const res = await uploadFileToStorage(file);
    setVideoBusy(false);
    if ('path' in res) setVideo((v) => (v && v.previewUrl === previewUrl ? { ...v, path: res.path } : v));
    else { setVideo(null); URL.revokeObjectURL(previewUrl); setVideoError(uploadErrorText(res.error, locale, file.name)); }
  }, [c, locale]);
  const removeVideo = useCallback(() => {
    setVideo((v) => { if (v) URL.revokeObjectURL(v.previewUrl); return null; });
    setVideoError(null);
  }, []);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.previewUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── can it run, and what does the button say ──
  const videoReady = !!video?.path;
  const missing: 'effect' | 'video' | 'character' | null = !hasWords ? 'effect'
    : engine.needsVideo && !videoReady ? 'video'
      : op !== 'scene' && (selection.used.length === 0 || (engine.requiresRole === 'character' && !hasCharacter)) ? 'character'
        : null;
  const waitingForPrice = !guest && op !== 'scene' && missing === null && price === null && opOpen === true;
  const running = job.phase === 'running';
  const canRun = opOpen === true && missing === null && !running && !submitting && !waitingForPrice && !refs.pending;
  const label = locked ? (lang === 'en' ? 'Soon' : lang === 'ru' ? 'Скоро' : 'მალე')
    : missing === 'effect' ? c.labelPickEffect : missing === 'video' ? c.labelAddVideo : missing === 'character' ? c.labelAddCharacter
      : waitingForPrice ? c.labelGettingPrice : c.generate;

  const onGenerate = useCallback(async () => {
    if (!canRun) return;
    if (isGuest()) { fire('myavatar:auth-required'); return; }
    if (insufficient) { fire('myavatar:open-credits'); return; }
    setNotice(null);
    setSubmitting(true);
    try {
      const up = await refs.ensureUploaded(selection.used.map((u) => u.id));
      if (!up.ok) { setNotice(uploadErrorText(up.error, locale)); return; }
      const confirmed = op !== 'scene' && quote && quote.sig === quoteSig ? quote : null;
      const res = await startGeneration(buildRequestBody({
        op, presetId, prompt: userText, aspect, quality: q, keepSound,
        video: video?.path ? { path: video.path, durationSec: video.durationSec, sizeBytes: video.sizeBytes } : null,
        references: selection.used.map((u) => ({ ref: up.paths[u.id]!, role: u.role })), referencesTotal: refs.photos.length,
        expectedCredits: op === 'scene' ? price : null, confirmedGel: confirmed?.gel ?? null,
      }));
      if (res.ok) {
        begin({ jobId: res.job.jobId, op, aspect: op === 'scene' ? aspect : (video?.aspect ?? '16:9'), credits: res.job.credits });
        creditsUpdated();
        refreshBalance();
        return;
      }
      if (res.authRequired || res.status === 401) { fire('myavatar:auth-required'); return; }
      if (res.status === 402) { fire('myavatar:open-credits'); setNotice(describeServiceError('insufficient_credits', locale, c.failed)); return; }
      if (res.error === 'price_changed' || res.error === 'confirmation_required') {
        const next = res.price?.credits ?? res.credits;
        if (typeof next === 'number') {
          if (op === 'scene') setOverride({ key: overrideKey, credits: next });
          else setQuote(quoteSig ? { sig: quoteSig, credits: next, gel: res.price?.gel ?? null } : null);
          setNotice(c.priceChanged(next));
        } else setNotice(describeServiceError('price_changed', locale, c.failed));
        return;
      }
      if (res.status === 423) {
        setCaps((s) => (s.status === 'ready' ? { status: 'ready', ops: { ...s.ops, [op]: { open: false, state: 'soon' } } } : s));
        setNotice(c.locked);
        return;
      }
      if (res.issues?.length) { setNotice(issueText(res.issues as ApiIssue[], locale)); return; }
      setNotice(describeGenerationFailure({ success: false, error: res.error, refunded: res.refunded }, locale, c.failed));
    } finally {
      setSubmitting(false);
    }
  }, [canRun, insufficient, refs, selection, locale, op, quote, quoteSig, presetId, userText, aspect, q, keepSound, video, price, overrideKey, begin, refreshBalance, c]);

  // ── the job card: elapsed time drives its (honest, capped) progress ──
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const jobState: ResultState | null = job.phase === 'running' ? (job.state === 'queued' ? 'queued' : job.state === 'delivering' ? 'finalizing' : 'rendering')
    : job.phase === 'ready' ? 'ready' : job.phase === 'failed' || job.phase === 'stalled' ? 'error' : null;
  const jobAspect = job.phase === 'running' || job.phase === 'ready' ? job.aspect : '16:9';
  const announce = job.phase === 'running' ? generationAnnouncement('VFX', 'started', locale)
    : job.phase === 'ready' ? generationAnnouncement('VFX', 'done', locale)
      : job.phase === 'failed' ? generationAnnouncement('VFX', 'failed', locale, job.message || c.failed)
        : job.phase === 'stalled' ? generationAnnouncement('VFX', 'failed', locale, c.stillWorking) : '';

  const heroChange = useCallback(() => {
    const rail = document.querySelector<HTMLElement>('[data-testid="vfx-presets"]');
    rail?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const target = rail?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
    target?.focus({ preventScroll: true });
  }, []);

  const lengthText = engine.fixedSeconds !== null ? `${c.videoSeconds(String(engine.fixedSeconds))} · ${c.lengthFixed}` : video ? `${c.videoSeconds(formatSeconds(video.durationSec))} · ${c.lengthFromVideo}` : '—';
  const tierOptions = engine.qualities;
  // `inert` takes the locked inputs out of the tab order and the accessibility tree too (a property: React 18 has no prop for it).
  const lockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = lockRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = locked;
  }, [locked]);

  return (
    <div data-testid="vfx-panel" data-op={op} className="min-w-0 space-y-3">
      <LiveStatus text={announce} testId="vfx-live" />

      {/* The job — progress while it renders, the video when it is done, what happened to the credits if it failed. */}
      {jobState && (
        <div data-testid="vfx-job" data-state={jobState} className="space-y-2 rounded-2xl bg-app-elevated/40 p-2.5 ring-1 ring-app-border/10">
          <div className="mx-auto w-full max-w-[320px]">
            <ResultCard
              kind="video"
              aspect={jobAspect}
              state={jobState}
              locale={lang}
              size="tile"
              elapsedSec={job.phase === 'running' ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0}
              capSec={job.phase === 'running' && job.op === 'scene' ? 150 : 420}
              {...(job.phase === 'ready' ? { media: { type: 'video' as const, url: job.videoUrl } } : {})}
              {...(job.phase === 'failed' ? { error: job.message || c.failed } : job.phase === 'stalled' ? { error: c.stillWorking } : {})}
              onDismiss={job.phase === 'failed' || job.phase === 'stalled' ? reset : undefined}
            />
          </div>
          {job.phase === 'running' && <p className="text-center text-[11.5px] leading-snug text-app-muted">{c.jobWorking}</p>}
          {job.phase === 'ready' && (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-center text-[11.5px] leading-snug text-app-muted">{c.jobDone}</p>
              <button type="button" onClick={reset} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-elevated px-4 text-[13px] font-semibold text-app-text ring-1 ring-app-border/20 transition-colors hover:text-app-accent">
                <Clapperboard size={14} aria-hidden="true" /> {c.another}
              </button>
            </div>
          )}
        </div>
      )}

      <HeroCard locale={locale} preset={preset} onChange={heroChange} />
      <PresetCarousel locale={locale} activeId={presetId} onPick={(id) => { setPresetId(id); setNotice(null); }} />

      <div className="space-y-2">
        <ModeTabs locale={locale} value={op} onChange={changeOp} open={open} />
        <p data-testid="vfx-mode-hint" className="px-1 text-[11.5px] leading-snug text-app-muted">{c.modeHint[op]}</p>
      </div>

      {locked && (
        <div data-testid="vfx-locked" role="status" className="space-y-1 rounded-2xl bg-app-elevated/50 p-3 ring-1 ring-app-border/15">
          <p className="text-[13px] font-semibold text-app-text">{c.locked}</p>
          {op !== 'scene' && <p className="text-[11.5px] leading-snug text-app-muted">{c.lockedWhy[op]}</p>}
        </div>
      )}

      {/* While locked the inputs are SHOWN (the user sees what the mode will ask for) but inert. */}
      <div ref={lockRef} aria-disabled={locked || undefined} className={`space-y-3 ${locked ? 'pointer-events-none select-none opacity-55' : ''}`}>
        {engine.needsVideo && (
          <SourceVideoCard locale={locale} video={video} busy={videoBusy} error={videoError} disabled={locked} onPick={pickVideo} onRemove={removeVideo} />
        )}

        <ReferenceDropzone
          locale={locale}
          photos={refs.photos}
          pending={refs.pending}
          max={refs.max}
          usedIds={usedIds}
          cap={engine.maxRefs}
          engineLabel={engineName}
          skipped={refs.skipped}
          overflow={refs.overflow}
          needsCharacter={needsCharacter}
          disabled={locked}
          onAdd={(files) => { void refs.add(files); }}
          onRole={refs.setRole}
          onMove={refs.move}
          onRemove={refs.remove}
          onClear={refs.clear}
        />

        <div className="space-y-1.5 rounded-2xl bg-app-elevated/40 p-3 ring-1 ring-app-border/10">
          <label htmlFor="vfx-prompt" className="block text-[12.5px] font-semibold text-app-text">{c.promptLabel}</label>
          <textarea
            id="vfx-prompt"
            data-testid="vfx-prompt"
            value={userText}
            maxLength={USER_PROMPT_MAX_CHARS}
            rows={3}
            placeholder={c.promptPlaceholder}
            onChange={(e) => setUserText(e.target.value)}
            className={TEXTAREA}
            disabled={locked}
          />
          {op === 'motion' && (
            <button
              type="button"
              aria-pressed={keepSound}
              onClick={() => setKeepSound((v) => !v)}
              className={`${CHIP_BASE} ${keepSound ? CHIP_ON : CHIP_OFF}`}
            >
              {keepSound ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
              {keepSound ? c.soundOn : c.soundOff}
            </button>
          )}
        </div>

        <div className="space-y-2.5 rounded-2xl bg-app-elevated/40 p-3 ring-1 ring-app-border/10">
          {engine.aspects && (
            <Segmented label={c.format} cols="grid-cols-2" options={engine.aspects as readonly GenjutsuAspect[]} value={aspect} onChange={setAspect} />
          )}
          {tierOptions.length > 1 && (
            <Segmented label={c.quality} cols="grid-cols-2" options={tierOptions as readonly GenjutsuQuality[]} value={q} onChange={setQuality} format={(t) => c.tier[t]} />
          )}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-app-bg/40 px-3 py-2.5 text-[13px]" data-testid="vfx-length">
            <span className="font-medium text-app-muted">{c.length}</span>
            <span className="text-right font-semibold tabular-nums text-app-text">{lengthText}</span>
          </div>
        </div>
      </div>

      <EnginesList
        locale={locale}
        op={op}
        quality={q}
        open={open}
        onSelect={(nextOp, nextQ) => { changeOp(nextOp); setQuality(nextQ); }}
      />

      {op !== 'scene' && !locked && missing !== null && missing !== 'effect' && (
        <p className="px-1 text-[11.5px] leading-snug text-app-muted">{c.priceAfterInputs}</p>
      )}
      <div aria-live="polite" data-testid="vfx-notice">
        {notice && <p role="status" className="rounded-xl bg-amber-400/10 px-3 py-2 text-[12px] leading-snug text-amber-300/90 ring-1 ring-amber-400/20">{notice}</p>}
      </div>

      <GenerateButton
        stickyBottom
        testId="vfx-generate"
        label={label}
        loadingLabel={c.generating}
        loading={submitting || running}
        credits={locked ? null : price}
        disabled={!canRun}
        insufficient={insufficient && missing === null && !locked}
        locale={locale}
        onClick={onGenerate}
      />
    </div>
  );
}

export default GenjutsuPanel;
