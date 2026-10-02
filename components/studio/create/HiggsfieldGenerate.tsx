'use client';

/**
 * HiggsfieldGenerate — the Generate of the Image and Video panels while a Higgsfield model is picked (the ModelPicker's opt-in
 * rows; Google stays the default). It replaces the panel's own button and runs the request through the studio saga — the ONE
 * money path every Higgsfield model already takes in Studio β (hooks/useStudioGeneration):
 *
 *   the panel's state → that model's own params (lib/studio/hfParams) → POST /api/estimate → the price ON this button →
 *   the tap IS the confirmation → POST /api/generate { modelId, params, confirmedGel } → poll → the result, filed in the Library.
 *
 * ⚠️ NOTHING IS CHARGED WITHOUT THE PRICE THE USER SAW. The tap sends that price; a fresh quote that differs comes back 409
 * price_changed and waits for another tap (never auto-accepted). Nothing here computes a price.
 * TODO(pricing): when POST /api/quote prices Higgsfield ids, read the number from it here — `quoteHiggsfield` below is the
 * single hook — but keep sending the price the user saw as `confirmedGel` (the saga refuses anything else).
 *
 * ⚠️ THE MODEL ID IS THE REQUEST. `modelId` is a catalogue id the server checks again (registry.isModelEnabled): a pick this
 * deployment cannot run is refused before an estimate or a charge, whatever a browser sends.
 *
 * Reference pictures from the panel (data: URLs) go to our storage first (components/studio/ui/useUpload — the bytes never
 * pass through a function) and reach the model as signed URLs (lib/studio/media).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { describeServiceError } from '@/components/studio/ui/serviceError';
import { uploadFileToStorage } from '@/components/studio/ui/useUpload';
import { useStudioGeneration, type StudioPrice } from '@/hooks/useStudioGeneration';
import { catalogueEntry, catalogueLang } from '@/lib/providers/catalogue';
import { hfMedia, hfMediaKeys, hfRequest, hfSummary, hfValues, type PanelHints } from '@/lib/studio/hfParams';
import { missing, requestKey } from '@/lib/studio/ui/dock';
import { useStudioModels } from './useStudioModels';

type L3 = { ka: string; en: string; ru: string };
const t3 = (ka: string, en: string, ru: string): L3 => ({ ka, en, ru });

export const HF_GENERATE_COPY = {
  pricing: t3('ფასი მოწმდება…', 'Getting the price…', 'Узнаём цену…'),
  starting: t3('იწყება…', 'Starting…', 'Запускаем…'),
  needPhoto: t3('დაამატე ფოტო', 'Add a photo', 'Добавьте фото'),
  uploading: t3('ფოტო იტვირთება…', 'Uploading the photo…', 'Загружаем фото…'),
  uploadFailed: t3('ფოტო ვერ აიტვირთა — სცადე ხელახლა', 'The photo did not upload — try again', 'Фото не загрузилось — попробуйте ещё раз'),
  unavailable: t3('ეს მოდელი ახლა მიუწვდომელია — აირჩიე სხვა', 'This model is unavailable right now — pick another one', 'Эта модель сейчас недоступна — выберите другую'),
  signIn: t3('შედი და შექმენი', 'Sign in to create', 'Войдите, чтобы создать'),
  priceChanged: t3('ფასი შეიცვალა — დაადასტურე ხელახლა', 'The price changed — tap again to confirm', 'Цена изменилась — нажмите ещё раз'),
  running: t3('მზადდება…', 'Rendering…', 'Создаётся…'),
  done: t3('მზადაა · შენახულია ბიბლიოთეკაში', 'Ready · saved to your Library', 'Готово · сохранено в Библиотеке'),
  failed: t3('ვერ მოხერხდა', 'It did not work', 'Не получилось'),
  refunded: t3('თანხა დაგიბრუნდა', 'Your credits were returned', 'Кредиты возвращены'),
  open: t3('გახსნა', 'Open', 'Открыть'),
  download: t3('ჩამოტვირთვა', 'Download', 'Скачать'),
  cancel: t3('გაუქმება', 'Cancel', 'Отменить'),
  seconds: t3('წმ', 's', 'с'),
  soundOn: t3('ხმით', 'sound on', 'со звуком'),
  soundOff: t3('უხმოდ', 'no sound', 'без звука'),
} as const;

const RUNNING = new Set(['reserving', 'reserved', 'pending', 'queued', 'in_progress', 'submitting', 'finalizing', 'running']);
const CANCELABLE = new Set(['reserving', 'reserved', 'pending', 'queued']);

/** The one place a Higgsfield price is asked for (see the TODO(pricing) in the header). */
type QuoteFn = (modelId: string, params: Record<string, unknown>) => Promise<StudioPrice | null>;

/** A data: URL as a File, for the direct-to-storage upload. */
async function dataUrlToFile(src: string, i: number): Promise<File | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const ext = /png/.test(blob.type) ? 'png' : /webp/.test(blob.type) ? 'webp' : 'jpg';
    return new File([blob], `reference-${i}.${ext}`, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

const signedOut = () => typeof document !== 'undefined' && document.documentElement.dataset.authed === '0';

export interface HiggsfieldGenerateProps {
  locale: string;
  /** A catalogue id whose runner is the studio saga ('hf/…'). */
  modelId: string;
  service: 'image' | 'video';
  /** The panel's Generate label ("Generate", „შექმნა“). */
  label: string;
  prompt: string;
  hints: PanelHints;
  /** The panel's reference pictures (data: or https URLs), in order. */
  images: readonly string[];
  /** Spendable credits, or null when unknown. Display-only — the ledger decides. */
  balanceCredits: number | null;
  onTopUp: () => void;
  /** The prompt is empty: the panel focuses it and says so. */
  onNeedPrompt: () => void;
  testId?: string;
  /** The button's own test id — the panel's usual one, so a screen reads the same whichever model runs. */
  buttonTestId?: string;
}

export function HiggsfieldGenerate(p: HiggsfieldGenerateProps) {
  const lang = catalogueLang(p.locale);
  const c = (k: keyof typeof HF_GENERATE_COPY) => HF_GENERATE_COPY[k][lang];
  const name = catalogueEntry(p.modelId)?.label[lang] ?? p.modelId;
  const models = useStudioModels(p.service, true);
  const model = models?.find((m) => m.id === p.modelId) ?? null;
  const gen = useStudioGeneration();
  const quote: QuoteFn = gen.estimate;

  // ── the panel's pictures, uploaded once each, when this model takes pictures ──────────────────────────────────────
  const takesPictures = !!model && (() => { const k = hfMediaKeys(model); return !!(k.single || k.list); })();
  const uploaded = useRef(new Map<string, string>());
  const [paths, setPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const imagesKey = p.images.join('\n');
  useEffect(() => {
    if (!takesPictures || !p.images.length || signedOut()) { setPaths([]); return; }
    let alive = true;
    (async () => {
      setUploading(true);
      setUploadFailed(false);
      const out: string[] = [];
      for (const [i, src] of p.images.entries()) {
        if (/^https:\/\//i.test(src)) { out.push(src); continue; }
        const known = uploaded.current.get(src);
        if (known) { out.push(known); continue; }
        const file = await dataUrlToFile(src, i);
        const r = file ? await uploadFileToStorage(file) : { error: 'fail' as const };
        if ('path' in r) { uploaded.current.set(src, r.path); out.push(r.path); } else if (alive) setUploadFailed(true);
      }
      if (alive) { setPaths(out); setUploading(false); }
    })();
    return () => { alive = false; };
    // imagesKey is the identity of the picture list; takesPictures flips once the model's description arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey, takesPictures]);

  // ── the request: exactly this model's params ───────────────────────────────────────────────────────────────────────
  const media = useMemo(() => (model ? hfMedia(model, paths) : {}), [model, paths]);
  const need = useMemo(() => (model ? missing(model, p.prompt, media) : []), [model, p.prompt, media]);
  const body = useMemo(() => (model ? hfRequest(model, p.prompt, p.hints, media) : {}), [model, p.prompt, p.hints, media]);
  const summary = useMemo(
    () => (model ? hfSummary(model, hfValues(model, p.hints), { seconds: c('seconds'), soundOn: c('soundOn'), soundOff: c('soundOff') }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, p.hints, lang],
  );
  // The words do not change the price (models price by length, size, sound): the estimate is keyed without them.
  const priceKey = useMemo(() => { const { prompt: _words, ...rest } = body; return model ? requestKey(model.id, rest) : ''; }, [model, body]);
  const [priced, setPriced] = useState<{ key: string; price: StudioPrice } | null>(null);
  const price = priced && priced.key === priceKey ? priced.price : null;

  const seq = useRef(0);
  useEffect(() => {
    if (!model || need.length || uploading || signedOut() || (priced && priced.key === priceKey)) return;
    const mine = ++seq.current;
    const key = priceKey;
    const timer = setTimeout(async () => {
      const got = await quote(model.id, body);
      if (mine === seq.current && got) setPriced({ key, price: got });
    }, 450);
    return () => clearTimeout(timer);
    // body is derived from priceKey + the prompt; re-pricing on every keystroke would only repeat the same number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, need.length, uploading, priceKey, priced]);

  // A fresh quote that differs is shown and waits for another tap — never accepted on the user's behalf.
  useEffect(() => {
    if ((gen.state.errorCode === 'price_changed' || gen.state.errorCode === 'confirmation_required') && gen.state.price) {
      setPriced({ key: priceKey, price: gen.state.price });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.state.errorCode, gen.state.price]);

  const job = gen.state.job;
  const phase = gen.state.phase;
  const insufficient = !!price && p.balanceCredits !== null && p.balanceCredits < price.credits;

  const onClick = useCallback(async () => {
    if (signedOut() || gen.state.errorCode === 'unauthorized') { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); return; }
    if (!model) return;
    if (need.includes('prompt')) { p.onNeedPrompt(); return; }
    if (need.length || uploading) return;
    if (insufficient) { p.onTopUp(); return; }
    if (!price) { const got = await quote(model.id, body); if (got) setPriced({ key: priceKey, price: got }); return; }
    await gen.start(model.id, body, p.prompt.trim() || undefined);
  }, [gen, model, need, uploading, insufficient, price, quote, body, priceKey, p]);

  // ── what the button says ───────────────────────────────────────────────────────────────────────────────────────────
  const unavailable = models !== null && !model;
  const busy = phase === 'starting' || phase === 'estimating' || uploading || (!!job && RUNNING.has(job.status));
  const loadingLabel = uploading ? c('uploading') : phase === 'starting' ? c('starting') : job && RUNNING.has(job.status) ? c('running') : c('pricing');
  const needPhoto = need.some((k) => k !== 'prompt');
  const needsSignIn = signedOut() || gen.state.errorCode === 'unauthorized';
  const note = unavailable ? c('unavailable')
    : gen.state.errorCode === 'price_changed' ? c('priceChanged')
      : uploadFailed ? c('uploadFailed')
        : gen.state.errorCode && gen.state.errorCode !== 'confirmation_required' && gen.state.errorCode !== 'unauthorized' && phase !== 'running'
          ? describeServiceError(gen.state.errorCode, p.locale, c('failed'))
          : null;

  return (
    <div data-testid={p.testId ?? 'hf-generate'} data-model={p.modelId} className="space-y-2">
      {summary && <p data-testid="hf-summary" className="px-1 text-[12.5px] leading-snug text-app-muted"><span className="font-medium text-app-text">{name}</span> · {summary}</p>}
      {note && <p role="alert" className="rounded-2xl bg-app-elevated/70 px-3.5 py-2 text-[12.5px] leading-snug text-app-text">{note}</p>}

      {job && (
        <div data-testid="hf-job" data-status={job.status} className="flex items-center gap-3 rounded-2xl bg-app-elevated/60 px-3 py-2 ring-1 ring-app-border/10" aria-live="polite">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/40">
            {job.status === 'completed' && job.outputUrls[0] ? (
              p.service === 'image'
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={job.outputUrls[0]} alt="" className="h-full w-full object-cover" />
                : <video src={job.outputUrls[0]} muted playsInline className="h-full w-full object-cover" />
            ) : RUNNING.has(job.status) ? <Loader2 size={18} className="animate-spin text-app-muted" aria-hidden="true" /> : <X size={18} className="text-app-muted" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1 text-[13px] leading-snug">
            <p className="font-medium text-app-text">
              {job.status === 'completed' ? c('done') : RUNNING.has(job.status) ? c('running') : job.status === 'canceled' ? c('cancel') : c('failed')}
            </p>
            {(job.status === 'failed' || job.status === 'nsfw') && (
              <p className="text-app-muted">{describeServiceError(job.errorCode ?? 'generation_failed', p.locale, c('failed'))}{job.refunded ? ` · ${c('refunded')}` : ''}</p>
            )}
          </div>
          {job.status === 'completed' && job.outputUrls[0] ? (
            <span className="flex shrink-0 items-center gap-1">
              <a href={job.outputUrls[0]} target="_blank" rel="noreferrer" aria-label={c('open')} title={c('open')}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-app-text hover:bg-app-elevated"><ExternalLink size={17} aria-hidden="true" /></a>
              <a href={job.outputUrls[0]} download aria-label={c('download')} title={c('download')}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-app-text hover:bg-app-elevated"><Download size={17} aria-hidden="true" /></a>
            </span>
          ) : CANCELABLE.has(job.status) ? (
            <button type="button" onClick={() => void gen.cancel()} className="min-h-[44px] shrink-0 rounded-xl px-3 text-[13px] font-semibold text-app-text hover:bg-app-elevated">{c('cancel')}</button>
          ) : null}
        </div>
      )}

      <GenerateButton
        label={needsSignIn ? c('signIn') : needPhoto ? c('needPhoto') : p.label}
        credits={price?.credits ?? null}
        insufficient={insufficient}
        loading={busy}
        loadingLabel={loadingLabel}
        disabled={unavailable || models === null}
        locale={p.locale}
        onClick={() => void onClick()}
        testId={p.buttonTestId ?? 'create-generate'}
      />
    </div>
  );
}
