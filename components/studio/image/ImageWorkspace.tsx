'use client';
import Image from 'next/image';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ASPECTS, REFERENCE_ROLES, RESOLUTIONS, type ImageRequest } from '@/lib/image/studio/contracts';
import { imageApi, finalJob, ImageClientError, readBatch, saveBatch, type BatchItem, type ClientJob,
  type ClientQuote, type ImageAccess, type ImageAsset, type ImageVersions } from '@/lib/image/studio/client';
import { uploadFileToStorage, uploadErrorText } from '@/components/studio/ui/useUpload';
import { imageCopy, imageErrorCopy } from './copy';

// ⚠️ ON A PHONE THE MODEL PICKER RAN PAST THE SCREEN (GG's iPhone, 2026-10-16). A <select> is as wide as its longest option
// („Nano Banana 2 (Gemini 3.1 Flash Image)"), and a grid item never shrinks below its content: the picker pushed 21 px past a
// 390 px screen. Every control is the width of its column (w-full min-w-0) and every label may shrink (field).
const control = 'min-h-[44px] w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#338FE8] disabled:opacity-50';
const field = 'grid min-w-0 gap-1.5 text-sm text-white/80';
const button = control.replace('w-full ', '') + ' touch-manipulation hover:border-[#338FE8]';
const primary = button + ' bg-[#338FE8] font-semibold text-black';
const emptyRequest = (access: ImageAccess, locale: string, prompt: string): ImageRequest => ({
  v: 1, originalPrompt: prompt, operation: 'generate', modelId: access.models[0]!.id,
  instructions: [], references: [], aspectRatio: '1:1', resolution: '1K', count: 1,
  locale: locale === 'en' || locale === 'ru' ? locale : 'ka',
});
export function ImageWorkspace({ access, locale, initialPrompt = '', onClose }: {
  access: ImageAccess; locale: string; initialPrompt?: string; onClose: () => void;
}) {
  const c = imageCopy(locale), uid = useId();
  const [batch, setBatch] = useState<BatchItem[]>(() => readBatch(access.userId));
  const [draft, setDraft] = useState<ImageRequest>(() => batch[0]?.quote.plan.request ?? emptyRequest(access, locale, initialPrompt));
  const [count, setCount] = useState(1), [autoRun, setAutoRun] = useState(false);
  const [quoting, setQuoting] = useState(false), [uploading, setUploading] = useState(false);
  const [error, setError] = useState(''), [localWarning, setLocalWarning] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<ImageAsset | null>(null);
  const [versions, setVersions] = useState<ImageVersions | null>(null);
  const [library, setLibrary] = useState<Array<{ id: string; url: string; prompt: string | null }>>([]);
  const [libraryOpen, setLibraryOpen] = useState(false), [libraryLoading, setLibraryLoading] = useState(false);
  const [source, setSource] = useState<ImageAsset | null>(null), [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(100), [copied, setCopied] = useState(false);
  const alive = useRef(true), launching = useRef(false), uploadingRef = useRef(false), previewUrls = useRef<string[]>([]);
  /** The job whose start request is in flight: it has no row to read yet, so the poll leaves it alone until the start answers. */
  const startingRef = useRef<string | null>(null);
  const batchRef = useRef(batch); batchRef.current = batch;
  const pauseRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // A prompt handed in later (Agent G's Live prepare_generation, or its chat card) fills the box of an open workspace.
  // The draft was read once at mount, so the workspace kept an empty or older prompt while the call said it was ready.
  const handedPrompt = useRef(initialPrompt);
  useEffect(() => {
    if (initialPrompt === handedPrompt.current) return;
    handedPrompt.current = initialPrompt;
    if (initialPrompt.trim()) setDraft(d => ({ ...d, originalPrompt: initialPrompt }));
  }, [initialPrompt]);
  const fail = useCallback((e: unknown) => {
    if (alive.current) setError(imageErrorCopy(e instanceof ImageClientError ? e.code : 'unknown_error', locale));
  }, [locale]);
  useEffect(() => {
    alive.current = true;
    const urls = previewUrls.current;
    return () => { alive.current = false; urls.splice(0).forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => { if (!saveBatch(access.userId, batch)) setLocalWarning(true); }, [access.userId, batch]);
  const updateJob = useCallback((job: ClientJob) => {
    if (alive.current) setBatch(items => items.map(x => x.quote.jobId === job.jobId ? { ...x, job } : x));
  }, []);
  // Restore only by authenticated job IDs. Poll real states without manufactured percentages.
  // ⚠️ A JOB THE SERVER NO LONGER KNOWS LOCKED THE WHOLE FORM FOR GOOD. The tab keeps its batch (sessionStorage) and a
  // restored, issued tile counts as running until its status arrives. When that status was `not_found` (gone, or not this
  // account's), the tile stayed "running" forever: every field disabled, no Cancel, the poll asking again every 3 s, and
  // reopening the studio restored it again. Such a tile is dropped, once, with the not-found message; any other failure
  // (the network, a 5xx) keeps it and asks again.
  useEffect(() => {
    const ctl = new AbortController();
    let busy = false, first = true;
    const poll = async () => {
      if (busy) return;
      busy = true;
      const gone: string[] = [];
      for (const item of batchRef.current) {
        if (!item.issued || item.quote.jobId === startingRef.current || (!first && finalJob(item.job) && !item.job?.settlementPending)) continue;
        try { const job = await imageApi<ClientJob>('/api/image/jobs/' + encodeURIComponent(item.quote.jobId), undefined, ctl.signal);
          if (!ctl.signal.aborted) updateJob(job);
        } catch (e) {
          if (ctl.signal.aborted) continue;
          if (e instanceof ImageClientError && e.code === 'not_found') gone.push(item.quote.jobId);
          fail(e);
        }
      }
      if (gone.length && alive.current) setBatch(items => items.filter(x => !gone.includes(x.quote.jobId)));
      first = false; busy = false;
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => { ctl.abort(); clearInterval(timer); };
  }, [batch.length, fail, updateJob]);
  // A batch is several independently signed jobs. A cancelled/failed tile never repeats inference.
  useEffect(() => {
    if (!autoRun || pauseRef.current || launching.current) return;
    if (batch.some(x => x.job && (!finalJob(x.job) || x.job.settlementPending))) return;
    const next = batch.find(x => !x.issued || !x.job);
    if (!next) { setAutoRun(false); return; }
    if (next.quote.expiresAt <= Date.now()) { setAutoRun(false); fail(new ImageClientError('quote_expired')); return; }
    launching.current = true; startingRef.current = next.quote.jobId;
    setBatch(items => items.map(x => x.quote.jobId === next.quote.jobId ? { ...x, issued: true } : x));
    void imageApi<ClientJob>('/api/image/jobs', { plan: next.quote.plan, token: next.quote.token, confirmed: true })
      .then(updateJob).catch(e => { if (alive.current) setAutoRun(false); fail(e); })
      .finally(() => { launching.current = false; startingRef.current = null; });
  }, [autoRun, batch, fail, updateJob]);
  const pending = batch.some(x => x.issued && (!finalJob(x.job) || x.job?.settlementPending));
  const locked = pending || autoRun || uploading || quoting;
  const hasIssued = batch.some(x => x.issued);
  const set = <K extends keyof ImageRequest>(key: K, value: ImageRequest[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    if (!hasIssued) setBatch([]);
    setError('');
  };
  const quote = async () => {
    if (locked) return;
    if (!draft.originalPrompt.trim()) { inputRef.current?.focus(); return; }
    setQuoting(true); setError(''); setBatch([]);
    try {
      const result: BatchItem[] = [];
      for (let i = 0; i < count; i++) {
        const q = await imageApi<ClientQuote>('/api/image/commands', { ...draft, instructions: draft.instructions.filter(x => x.trim().length > 0), count: 1,
          locale: locale === 'en' || locale === 'ru' ? locale : 'ka' });
        result.push({ quote: q, issued: false });
      }
      if (alive.current) setBatch(result);
    } catch (e) { fail(e); }
    finally { if (alive.current) setQuoting(false); }
  };
  const upload = async (files: File[]) => {
    if (uploadingRef.current || locked) return;
    if (files.length + draft.references.length > 4 || files.some(f => f.size > 12 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type))) {
      setError(c.t('size')); return;
    }
    uploadingRef.current = true; setUploading(true); setBatch([]); setError('');
    try {
      for (const file of files) {
        const result = await uploadFileToStorage(file, { verifyKind: 'image' });
        if ('error' in result) { if (alive.current) setError(uploadErrorText(result.error, locale, file.name)); break; }
        if (!alive.current) break;
        const id = crypto.randomUUID(), url = URL.createObjectURL(file);
        previewUrls.current.push(url);
        setPreviews(current => ({ ...current, [id]: url }));
        setDraft(current => ({ ...current, references: [...current.references, { id, role: 'subject', asset: { kind: 'upload', path: result.path } }] }));
      }
    } catch (e) { fail(e); }
    finally { uploadingRef.current = false; if (alive.current) setUploading(false); }
  };
  const loadAsset = async (id: string) => {
    setError('');
    try {
      const asset = await imageApi<ImageAsset>('/api/image/assets/' + encodeURIComponent(id));
      if (!alive.current) return;
      setSelected(asset); setCompare(false); setZoom(100);
      const history = await imageApi<ImageVersions>('/api/image/assets/' + encodeURIComponent(id) + '/versions');
      if (alive.current) setVersions(history);
    } catch (e) { fail(e); }
  };
  const reuse = (asset: ImageAsset) => {
    if (locked) return;
    setSource(asset); setCompare(false); setSelected(asset); setBatch([]);
    const id = crypto.randomUUID();
    setPreviews(current => ({ ...current, [id]: asset.image.url }));
    setDraft({ ...asset.request, operation: 'edit', originalPrompt: '', instructions: [], parentJobId: asset.id,
      references: [{ id, role: 'subject', asset: { kind: 'result', id: asset.id } }], count: 1 });
    inputRef.current?.focus();
  };
  const loadLibrary = async () => {
    setLibraryOpen(true); setLibraryLoading(true); setError('');
    try {
      const result = await imageApi<{ items: typeof library }>('/api/studio/library?kind=image&limit=30');
      if (alive.current) setLibrary(result.items);
    } catch (e) { fail(e); }
    finally { if (alive.current) setLibraryLoading(false); }
  };
  const cancel = async (id: string) => {
    pauseRef.current = true; setAutoRun(false);
    try { updateJob(await imageApi<ClientJob>('/api/image/jobs/' + encodeURIComponent(id) + '/cancel', {})); }
    catch (e) { fail(e); }
  };
  const download = async (url: string) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!blob.type.startsWith('image/') || blob.size > 12 * 1024 * 1024) throw new Error();
      const local = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = local; a.download = 'myavatar-image.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(local), 1000);
    } catch (e) { fail(e); }
  };
  const model = access.models.find(m => m.id === draft.modelId);
  const total = batch.reduce((sum, x) => sum + x.quote.credits, 0);
  const activeQuote = batch[0]?.quote;
  const expiry = activeQuote ? new Date(Math.min(...batch.map(x => x.quote.expiresAt))).toLocaleTimeString(locale === 'ka' ? 'ka-GE' : locale) : '';
  const shown = compare && source ? source : selected;
  return <section data-testid="image-workspace" aria-label={c.t('title')} className="min-w-0 space-y-5 bg-[#0D1016] p-4 text-white sm:p-5">
    <header className="flex min-w-0 items-center justify-between gap-3">
      <h2 className="min-w-0 break-words text-lg font-semibold leading-snug">{c.t('title')}</h2>
      <button type="button" className={button + ' shrink-0'} onClick={onClose}>{c.t('close')}</button>
    </header>
    {error && <p role="alert" className="break-words rounded-lg border border-red-300/50 p-3 text-red-200">{error}</p>}
    {localWarning && <p role="status">{c.t('storageLocal')}</p>}
    <fieldset disabled={locked} className="min-w-0 space-y-4">
      <label className="block min-w-0 space-y-1.5 text-sm text-white/80" htmlFor={uid + '-prompt'}><span>{c.t('prompt')}</span>
        <textarea ref={inputRef} id={uid + '-prompt'} className={control + ' w-full resize-y'} rows={4} maxLength={8000}
          value={draft.originalPrompt} onChange={e => set('originalPrompt', e.target.value)} />
      </label>
      <p className="text-sm text-white/75">{c.t('unchanged')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>{c.t('operation')}<select aria-label={c.t('operation')} className={control} value={draft.operation} onChange={e => set('operation', e.target.value as ImageRequest['operation'])}>
          {model?.operations.map(op => <option key={op} value={op}>{c.operation(op)}</option>)}</select></label>
        <label className={field}>{c.t('model')}<select aria-label={c.t('model')} className={control} value={draft.modelId} onChange={e => set('modelId', e.target.value)}>
          {access.models.map(m => <option key={m.id} value={m.id}>{m.label ?? m.id}</option>)}</select></label>
        <label className={field}>{c.t('aspect')}<select aria-label={c.t('aspect')} className={control} value={draft.aspectRatio} onChange={e => set('aspectRatio', e.target.value as ImageRequest['aspectRatio'])}>
          {(model?.aspects ?? ASPECTS).map(x => <option key={x}>{x}</option>)}</select></label>
        <label className={field}>{c.t('resolution')}<select aria-label={c.t('resolution')} className={control} value={draft.resolution} onChange={e => set('resolution', e.target.value as ImageRequest['resolution'])}>
          {(model?.resolutions ?? RESOLUTIONS).map(x => <option key={x}>{x}</option>)}</select></label>
        <label className={field}>{c.t('variations')}<select aria-label={c.t('variations')} className={control} value={count} onChange={e => { setCount(Number(e.target.value)); if (!hasIssued) setBatch([]); }}>
          {[1, 2, 4].map(x => <option key={x}>{x}</option>)}</select></label>
      </div>
      <label className={field}>{c.t('instructions')}<textarea className={control} rows={2}
        value={draft.instructions.join('\n')} onChange={e => set('instructions', e.target.value.split('\n'))} /></label>
      {draft.parentJobId && <p className="break-all text-sm">{c.t('parent')}: {draft.parentJobId}</p>}
      <h3 className="font-semibold">{c.t('references')} ({draft.references.length}/4)</h3>
      <p className="text-sm text-white/75">{c.t('size')}</p>
      <label className={button + ' flex cursor-pointer items-center justify-center gap-2'}>
        <span>{uploading ? c.t('uploading') : c.t('add')}</span>
        <input className="min-w-0 max-w-full text-base" aria-label={c.t('add')} type="file" accept="image/png,image/jpeg,image/webp" multiple
          disabled={locked || draft.references.length >= 4} onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      <ol className="space-y-3">{draft.references.map((ref, i) => <li key={ref.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/25 p-2">
        <span>{i + 1}.</span>
        {previews[ref.id] && <Image src={previews[ref.id]!} alt={c.role(ref.role)} width={64} height={64} unoptimized className="h-16 w-16 rounded object-contain" />}
        <label className="grid min-w-0 flex-1 gap-1">{c.t('role')} {i + 1}<select aria-label={c.t('role') + ' ' + (i + 1)} className={control} value={ref.role}
          onChange={e => set('references', draft.references.map((r, n) => n === i ? { ...r, role: e.target.value as typeof ref.role } : r))}>
          {REFERENCE_ROLES.map(role => <option key={role} value={role}>{c.role(role)}</option>)}</select></label>
        <button type="button" className={button} aria-label={c.t('up') + ' ' + (i + 1)} disabled={i === 0} onClick={() => {
          const refs = [...draft.references]; [refs[i - 1], refs[i]] = [refs[i]!, refs[i - 1]!]; set('references', refs);
        }}>{c.t('up')}</button>
        <button type="button" className={button} aria-label={c.t('remove') + ' ' + (i + 1)} onClick={() => set('references', draft.references.filter((_, n) => n !== i))}>{c.t('remove')}</button>
      </li>)}</ol>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={primary} disabled={locked || !model} onClick={() => void quote()}>{quoting ? c.t('quoting') : c.t('quote')}</button>
      <button type="button" className={button} disabled={locked} onClick={() => { setDraft(emptyRequest(access, locale, '')); setSource(null); setBatch([]); }}>{c.t('new')}</button>
      <button type="button" className={button} onClick={() => void loadLibrary()}>{c.t('library')}</button>
    </div>
    {activeQuote && <section aria-label={c.t('quoteTitle')} className="space-y-3 rounded-xl border border-[#338FE8] p-4">
      <h3 className="font-semibold">{c.t('quoteTitle')}</h3>
      <p>{c.operation(activeQuote.plan.request.operation)} · {activeQuote.plan.request.modelId} · {activeQuote.plan.request.aspectRatio} · {activeQuote.plan.request.resolution}</p>
      <p className="whitespace-pre-wrap break-words">{activeQuote.plan.request.originalPrompt}</p>
      <details><summary className="min-h-[44px] cursor-pointer py-3">{c.t('extras')}</summary>
        <ul className="space-y-2">{activeQuote.supplementaryInstructions.map((text, i) => <li key={i} className="whitespace-pre-wrap break-words">{text}</li>)}</ul>
      </details>
      <p className="font-semibold">{batch.length} × {activeQuote.credits} = {total} {c.t('credits')}</p>
      <p className="text-sm text-white/75">{c.t('expires')}: {expiry}</p>
      <p className="text-sm">{c.t('limitation')}</p><p className="text-sm">{c.t('batchNote')}</p>
      {!autoRun && batch.some(x => !x.issued || !x.job) && <button type="button" className={primary} onClick={() => {
        pauseRef.current = false; setError(''); setAutoRun(true);
      }}>{hasIssued ? c.t('resume') : c.t('confirm')}</button>}
      {autoRun && <button type="button" className={button} onClick={() => { pauseRef.current = true; setAutoRun(false); }}>{c.t('stopBatch')}</button>}
      {!hasIssued && <button type="button" className={button + ' ml-2'} onClick={() => { setBatch([]); inputRef.current?.focus(); }}>{c.t('edit')}</button>}
      {!autoRun && hasIssued && batch.some(x => !x.issued) && <p role="status">{c.t('paused')}</p>}
    </section>}
    <div aria-live="polite" aria-atomic="false" className="grid gap-3 sm:grid-cols-2">
      {batch.filter(x => x.issued).map(({ quote: q, job }, index) => <article key={q.jobId} data-testid="image-job" className="min-w-0 space-y-2 rounded-xl border border-white/25 p-3">
        <p role="status">{index + 1}. {c.stage(finalJob(job) ? job!.status : job?.stage ?? 'queued')}</p>
        {job?.error && <p className="text-sm text-red-200">{imageErrorCopy(job.error, locale)}</p>}
        {job?.settlementPending && <p>{c.t('pendingRefund')}</p>}
        {job?.result && <><Image src={job.result.url} alt={job.result.originalPrompt} width={job.result.width} height={job.result.height} unoptimized className="h-auto max-h-80 w-full object-contain" />
          <button type="button" className={button} onClick={() => void loadAsset(q.jobId)}>{c.t('preview')}</button></>}
        {job?.cancellable && <button type="button" className={button} onClick={() => void cancel(q.jobId)}>{c.t('cancel')}</button>}
      </article>)}
    </div>
    {shown && <section className="min-w-0 space-y-3" aria-label={c.t('preview')}>
      <h3 className="font-semibold">{compare ? c.t('original') : c.t('preview')}</h3>
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-white/25">
        <Image src={shown.image.url} alt={shown.request.originalPrompt} width={shown.image.width} height={shown.image.height} unoptimized
          className="h-auto max-w-none object-contain" style={{ width: zoom + '%' }} />
      </div>
      <label className="flex min-h-[44px] flex-wrap items-center gap-3">{c.t('zoom')} {zoom}%
        <input aria-label={c.t('zoom')} type="range" min={50} max={200} step={25} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="min-h-[44px]" /></label>
      <div className="flex flex-wrap gap-2">
        {source && <button type="button" className={button} aria-pressed={compare} onClick={() => setCompare(x => !x)}>{c.t('compare')}</button>}
        <button type="button" className={button} onClick={() => void download(shown.image.url)}>{c.t('download')}</button>
        <button type="button" className={button} disabled={locked} onClick={() => reuse(shown)}>{c.t('use')}</button>
        <button type="button" className={button} onClick={() => { void navigator.clipboard.writeText(shown.request.originalPrompt)
          .then(() => setCopied(true)).catch(fail); }}>{copied ? c.t('copied') : c.t('copy')}</button>
      </div>
      {versions && <details open><summary className="min-h-[44px] cursor-pointer py-3">{c.t('versions')}</summary>
        <ul className="space-y-2">{[...versions.ancestors].reverse().concat([versions.current], versions.children).map(v => <li key={v.id}>
          <button type="button" className={button + ' w-full truncate text-left'} disabled={v.status !== 'completed'} onClick={() => void loadAsset(v.id)}>
            {c.operation(v.operation)} — {v.prompt}</button></li>)}</ul>
        {(versions.moreAncestors || versions.moreChildren) && <p>{c.t('more')}</p>}
      </details>}
    </section>}
    {libraryOpen && <section aria-label={c.t('library')} className="space-y-3">
      <h3 className="font-semibold">{c.t('library')}</h3>
      <button type="button" className={button} disabled={libraryLoading} onClick={() => void loadLibrary()}>{c.t('refresh')}</button>
      {libraryLoading ? <p role="status">{c.t('loading')}</p> : !library.length ? <p>{c.t('empty')}</p> : <div className="grid grid-cols-2 gap-3">
        {library.map(item => <button type="button" key={item.id} className={button} onClick={() => void loadAsset(item.id)}>
          <Image src={item.url} alt={item.prompt ?? c.t('preview')} width={256} height={256} unoptimized loading="lazy" className="h-32 w-full object-contain" />
          <span className="block truncate">{item.prompt ?? c.t('preview')}</span>
        </button>)}
      </div>}
    </section>}
  </section>;
}
