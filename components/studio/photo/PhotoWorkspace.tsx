'use client';

/**
 * Photo culling — a local assistant for going through a shoot: drop the photos, rate them P / X / U, let the
 * assistant point at the blurry, the blown and the softer frames of a burst, grade, and export the picks as a ZIP.
 *
 * Everything happens on the device. The photos are read from the files the user dropped, measured in a same-origin
 * worker (./cull.worker.ts), graded on a canvas and saved through blob: links — no upload, no storage, no account,
 * no credits. That is the promise on the tool itself (lib/studio/tools.ts, „photos never leave your device"), and
 * the reason this file imports no fetch helper, no upload hook and no Supabase client.
 *
 * Opened by OmniStudio as the 'photo' tool (its mode), in place of the chat — like the Surgical Editor.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, Download, Eye, ImagePlus, Layers, Loader2, RotateCcw, ShieldCheck, Star, Trash2, Wand2, X,
} from 'lucide-react';
import { toolName, toolSub } from '@/lib/studio/tools';
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTOS } from '@/lib/photo/exportPlan';
import type { CullFlag } from '@/lib/photo/cullMetrics';
import {
  GRADE_PRESETS, GRADE_RANGE, NEUTRAL_GRADE, applyGrade, autoGrade, gradeCssFilter, isNeutralGrade, sameGrade, type Grade,
} from '@/lib/photo/grade';
import { BTN_PRIMARY, BTN_SECONDARY, CHIP_BASE, CHIP_OFF, CHIP_ON, DROPZONE, DROPZONE_IDLE, DROPZONE_OVER, HINT, ICON_BTN } from '@/components/studio/ui/tokens';
import { PHOTO_COPY, photoLang, type PhotoCopy } from './copy';
import { domCanvas, offscreenCanvas, previewPixels } from './pipeline';
import { exportPicks } from './exportPicks';
import {
  cullKeyAction, deriveCull, filterItems, photoSession, type AddReport, type CullFilter, type CullInfo, type PhotoItem,
  type PhotoSession,
} from './session';

const FILTERS: readonly CullFilter[] = ['all', 'picks', 'rejects', 'unrated', 'flagged'];
/** The live preview's long edge: sharp on a desktop panel, and cheap enough to regrade on every slider tick. */
const PREVIEW_LONG_EDGE = 1280;
const ACCEPT = ACCEPTED_PHOTO_TYPES.join(',');

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
};

function reportText(r: AddReport, t: PhotoCopy): string | null {
  const parts: string[] = [];
  if (r.skippedType) parts.push(t.skippedType(r.skippedType));
  if (r.skippedSize) parts.push(t.skippedSize(r.skippedSize));
  if (r.skippedLimit) parts.push(t.skippedLimit(MAX_PHOTOS));
  if (r.duplicates) parts.push(t.duplicates(r.duplicates));
  return parts.length ? parts.join(' · ') : null;
}

export function PhotoWorkspace({ locale, onExit, session }: { locale: string; onExit: () => void; session?: PhotoSession }) {
  const s = useMemo(() => session ?? photoSession(), [session]);
  const st = useSyncExternalStore(s.subscribe, s.get, s.get);
  const t = PHOTO_COPY[photoLang(locale)];
  const [filter, setFilter] = useState<CullFilter>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLUListElement | null>(null);
  const basePixels = useRef<ImageData | null>(null);
  const [pixelsReady, setPixelsReady] = useState(false);

  const { items, selectedId } = st;
  // Bursts and verdicts only change when a measurement lands — not on every rating or slider tick.
  const analysisSig = useMemo(() => items.map((it) => (it.metrics ? it.id : `${it.id}?`)).join(','), [items]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cull = useMemo(() => deriveCull(items), [analysisSig]);
  const visible = useMemo(() => filterItems(items, filter, cull), [items, filter, cull]);
  const selected = items.find((it) => it.id === selectedId) ?? null;
  const selectedInfo = selected ? cull.get(selected.id) ?? null : null;
  const picks = useMemo(() => items.filter((it) => it.status === 'pick'), [items]);
  const analysed = items.filter((it) => it.state !== 'queued').length;
  const counts = useMemo(() => {
    const c: Record<CullFilter, number> = { all: items.length, picks: 0, rejects: 0, unrated: 0, flagged: 0 };
    for (const it of items) {
      if (it.status === 'pick') c.picks++;
      else if (it.status === 'reject') c.rejects++;
      else c.unrated++;
      if ((cull.get(it.id)?.verdict?.flags.length ?? 0) > 0) c.flagged++;
    }
    return c;
  }, [items, cull]);

  const flash = useCallback((msg: string | null) => setNotice(msg), []);
  useEffect(() => {
    if (!notice) return;
    const h = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(h);
  }, [notice]);

  const addFiles = useCallback((files: Iterable<File>) => flash(reportText(s.addFiles(files), t)), [s, t, flash]);

  // ── Keys: P / X / U rate the selected frame, ← → move. ─────────────────────────────────────────────────────
  const select = useCallback((id: string | null, focus = false) => {
    s.select(id);
    if (!id) return;
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-photo-id="${id}"]`);
      el?.scrollIntoView?.({ block: 'nearest' });
      if (focus) el?.focus({ preventScroll: true });
    });
  }, [s]);

  const move = useCallback((by: 1 | -1, focus: boolean) => {
    if (!visible.length) return;
    const i = visible.findIndex((it) => it.id === selectedId);
    const next = visible[i < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, i + by))];
    if (next) select(next.id, focus);
  }, [visible, selectedId, select]);

  const rate = useCallback((status: PhotoItem['status']) => {
    if (!selected) return;
    const i = visible.findIndex((it) => it.id === selected.id);
    s.setStatus(selected.id, status);
    // Pick and reject advance to the next frame (a culling pass is one key per photo); U stays put to re-decide.
    if (status !== 'unrated' && i >= 0) {
      const next = visible[i + 1];
      if (next) select(next.id, !!gridRef.current?.contains(document.activeElement));
    }
  }, [selected, visible, s, select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      // Only when the workspace has the keyboard: a drawer or dialog over it keeps its own keys.
      const target = e.target as Node | null;
      if (target && target !== document.body && !rootRef.current?.contains(target)) return;
      const a = cullKeyAction(e);
      if (!a) return;
      e.preventDefault();
      if (a.type === 'status') rate(a.status);
      else move(a.by, !!gridRef.current?.contains(document.activeElement));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rate, move]);

  // A reload would drop ratings that were never exported (nothing is stored — the photos never leave the device).
  useEffect(() => {
    if (!st.dirty || !items.length) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [st.dirty, items.length]);

  // ── Drop anywhere on the workspace. ───────────────────────────────────────────────────────────────────────
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  // ── Grade. ────────────────────────────────────────────────────────────────────────────────────────────────
  const grade = selected?.grade ?? NEUTRAL_GRADE;
  const setGrade = (g: Grade) => { if (selected) s.setGrade(selected.id, g); };
  const onPixels = useCallback((img: ImageData | null) => { basePixels.current = img; setPixelsReady(!!img); }, []);
  const runAuto = () => {
    const px = basePixels.current;
    if (px && selected) setGrade(autoGrade(px.data, px.width, px.height));
  };
  const applyToPicks = () => {
    if (!selected) return;
    s.setGradeFor(picks.map((p) => p.id), selected.grade);
  };

  // ── Export. ───────────────────────────────────────────────────────────────────────────────────────────────
  const runExport = async () => {
    if (!picks.length) { flash(t.noPicks); return; }
    if (exporting) return;
    setExporting({ done: 0, total: picks.length });
    try {
      const o = await exportPicks(picks, s.client(), { onProgress: (p) => setExporting(p) });
      s.markExported();
      const parts = [t.saved(picks.length)];
      if (o.zipFailed) parts.push(t.zipFailed);
      if (o.ungraded.length) parts.push(t.ungraded(o.ungraded.length));
      if (o.downscaled) parts.push(t.downscaled(o.downscaled));
      flash(parts.join(' · '));
    } catch {
      flash(t.exportFailed);
    } finally {
      setExporting(null);
    }
  };

  const clearSession = () => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t.clearConfirm)) return;
    s.clear();
    setFilter('all');
  };

  const burstItems = useMemo(() => {
    const id = selectedInfo?.burst?.burstId;
    return id ? items.filter((it) => cull.get(it.id)?.burst?.burstId === id) : [];
  }, [selectedInfo, items, cull]);

  const empty = items.length === 0;
  const selectedVisible = !!selectedId && visible.some((it) => it.id === selectedId);
  const anyGraded = picks.some((p) => !isNeutralGrade(p.grade));

  return (
    <div ref={rootRef} data-testid="photo-workspace"
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col bg-app-bg text-app-text"
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" data-testid="photo-input"
        onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />

      {/* ── Header: back · the tool and its promise · add · export ── */}
      <header className="shrink-0 border-b border-app-border/10 px-3 pb-2 pt-2 sm:px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onExit} aria-label={t.back} title={t.back} className={ICON_BTN}>
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight">{toolName('photo', locale)}</h1>
            {!empty && (
              <p className="truncate text-[12px] text-app-muted" aria-live="polite">
                {analysed < items.length ? t.analysing(analysed, items.length) : t.photos(items.length)}
              </p>
            )}
          </div>
          {!empty && (
            <button type="button" onClick={() => fileRef.current?.click()} className={`${BTN_SECONDARY} px-3`} aria-label={t.add} title={t.add}>
              <ImagePlus size={17} aria-hidden="true" /><span className="hidden sm:inline">{t.add}</span>
            </button>
          )}
          {!empty && (
            <button type="button" onClick={() => void runExport()} disabled={!!exporting} data-testid="export-picks"
              aria-label={`${t.exportPicks} (${picks.length})`}
              className={`${BTN_PRIMARY} px-3 ${picks.length ? '' : 'opacity-60'}`}>
              {exporting ? <Loader2 size={17} aria-hidden="true" className="motion-safe:animate-spin" /> : <Download size={17} aria-hidden="true" />}
              <span className="hidden sm:inline">{exporting ? t.exporting(exporting.done, exporting.total) : t.exportPicks}</span>
              {!exporting && <span className="tabular-nums">{picks.length}</span>}
            </button>
          )}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-app-muted" data-testid="photo-privacy">
          <ShieldCheck size={14} aria-hidden="true" className="shrink-0 text-app-accent" />
          <span>{toolSub('photo', locale)}</span>
        </p>
      </header>

      {notice && (
        <p role="status" className="mx-3 mt-2 shrink-0 rounded-lg bg-app-elevated px-3 py-2 text-[12.5px] leading-snug text-app-text sm:mx-4">
          {notice}
        </p>
      )}

      {empty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
          <button type="button" onClick={() => fileRef.current?.click()} data-testid="photo-dropzone"
            className={`${DROPZONE} ${dragOver ? DROPZONE_OVER : DROPZONE_IDLE} min-h-[240px] max-w-xl`}>
            <ImagePlus size={30} aria-hidden="true" className="text-app-accent" />
            <span className="text-[15px] font-semibold text-app-text">{t.dropTitle}</span>
            <span className={HINT}>{t.dropHint}</span>
            <span className={`${BTN_SECONDARY} mt-2 pointer-events-none`}>{t.choose}</span>
          </button>
        </div>
      ) : (
        // ⚠️ A <div>, not a <main>: the studio already renders inside AppShell's <main id="main-content">, and a
        // second, nested main landmark is an a11y error (one main per page, never inside another).
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
          {/* ── The selected frame: preview, rating, what the assistant noticed (sticky on a phone). ── */}
          <section aria-label={t.preview}
            className="sticky top-0 z-10 border-b border-app-border/10 bg-app-bg px-3 pb-2 pt-2 sm:px-4 lg:static lg:col-start-2 lg:row-start-1 lg:border-b-0 lg:border-l lg:pt-3">
            {selected ? (
              <>
                <div className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-xl bg-app-surface">
                  <PreviewCanvas file={selected.file} grade={showOriginal ? NEUTRAL_GRADE : grade} label={selected.name} onPixels={onPixels} unreadable={t.unreadable} />
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <RateButton on={selected.status === 'pick'} onClick={() => rate('pick')} label={`${t.pick} (P)`} tone="pick" testId="rate-pick"><Check size={17} aria-hidden="true" /></RateButton>
                  <RateButton on={selected.status === 'reject'} onClick={() => rate('reject')} label={`${t.reject} (X)`} tone="reject" testId="rate-reject"><X size={17} aria-hidden="true" /></RateButton>
                  <RateButton on={selected.status === 'unrated'} onClick={() => rate('unrated')} label={`${t.unrate} (U)`} tone="none" testId="rate-unrate"><RotateCcw size={16} aria-hidden="true" /></RateButton>
                  <span className="min-w-0 flex-1 truncate text-right text-[12px] text-app-muted" title={selected.name}>{selected.name}</span>
                </div>
                <FlagLine info={selectedInfo} item={selected} t={t} />
              </>
            ) : (
              <p className="py-6 text-center text-[13px] text-app-muted">{t.noSelection}</p>
            )}
          </section>

          {/* ── Grade (folded on a phone, always open on a desktop). ── */}
          <section aria-label={t.grade} className="border-b border-app-border/10 px-3 py-2 sm:px-4 lg:col-start-2 lg:row-start-2 lg:overflow-y-auto lg:border-b-0 lg:border-l lg:pb-4">
            <button type="button" onClick={() => setGradeOpen((v) => !v)} aria-expanded={gradeOpen}
              className="flex min-h-[44px] w-full items-center justify-between text-[13px] font-semibold text-app-text lg:hidden">
              {t.grade}
              {selected && !isNeutralGrade(grade) && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-app-accent" />}
            </button>
            <h2 className="mb-2 hidden text-[13px] font-semibold lg:block">{t.grade}</h2>
            <div className={gradeOpen ? 'block' : 'hidden lg:block'}>
              <GradePanel grade={grade} disabled={!selected} t={t} lang={photoLang(locale)} onChange={setGrade}
                onAuto={runAuto} autoReady={pixelsReady} showOriginal={showOriginal} onToggleOriginal={() => setShowOriginal((v) => !v)}
                onApplyToPicks={applyToPicks} picks={picks.length} />
              {anyGraded && <p className={`${HINT} mt-2`}>{t.regradeNote}</p>}
            </div>
          </section>

          {/* ── The shoot: filters, the selected burst, the grid. ── */}
          <section aria-label={toolName('photo', locale)} className="min-w-0 px-3 pb-6 pt-2 sm:px-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
            <div className="flex items-center gap-2">
              <div role="group" aria-label={t.filter} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {FILTERS.map((f) => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                    className={`${CHIP_BASE} ${filter === f ? CHIP_ON : CHIP_OFF}`}>
                    {t.filters[f]}<span className="tabular-nums opacity-70">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={clearSession} aria-label={t.clear} title={t.clear} className={ICON_BTN}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            <p className={`${HINT} mt-1 hidden sm:block`}>{t.keys}</p>

            {burstItems.length > 1 && (
              <div className="mt-2" data-testid="burst-strip">
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-app-muted">
                  <Layers size={13} aria-hidden="true" />{t.burst(burstItems.length)}
                </p>
                <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {burstItems.map((it) => {
                    const info = cull.get(it.id);
                    const on = it.id === selectedId;
                    return (
                      <li key={it.id} className="shrink-0">
                        <button type="button" onClick={() => select(it.id)} aria-label={`${it.name}${info?.burst?.best ? ` — ${t.best}` : ''}`} aria-current={on || undefined}
                          className={`relative block h-16 w-16 overflow-hidden rounded-lg bg-app-surface ${on ? 'ring-2 ring-app-accent' : 'ring-1 ring-app-border/15'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: thumbnail made on the device; next/image has nothing to optimise */}
                          {it.thumbUrl && <img src={it.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} />}
                          {info?.burst?.best && (
                            <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-bg/80 text-app-accent">
                              <Star size={12} aria-hidden="true" fill="currentColor" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {visible.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-app-muted">{t.empty}</p>
            ) : (
              <ul ref={gridRef} role="list" data-testid="photo-grid" className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                {visible.map((it, i) => {
                  const info = cull.get(it.id);
                  // Roving tab stop: one cell in the Tab order (the selected one), the keys move between them.
                  const tabbable = selectedVisible ? it.id === selectedId : i === 0;
                  return (
                    <GridCell key={it.id} item={it} selected={it.id === selectedId} tabbable={tabbable}
                      flags={info?.verdict?.flags.join(',') ?? ''} burstSize={info?.burst?.size ?? 0} best={!!info?.burst?.best}
                      t={t} onSelect={select} />
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {dragOver && !empty && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-app-bg/80">
          <span className="rounded-2xl border-2 border-dashed border-app-accent px-6 py-4 text-[15px] font-semibold text-app-accent">{t.dropOverlay}</span>
        </div>
      )}
    </div>
  );
}

function RateButton({ on, onClick, label, tone, testId, children }: {
  on: boolean; onClick: () => void; label: string; tone: 'pick' | 'reject' | 'none'; testId: string; children: React.ReactNode;
}) {
  const onCls = tone === 'pick' ? 'bg-app-success text-app-bg' : tone === 'reject' ? 'bg-app-danger text-white' : 'bg-app-elevated text-app-text';
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label} data-testid={testId}
      className={`inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl px-3 text-[13px] font-semibold transition-colors ${on ? onCls : 'bg-app-elevated/60 text-app-muted hover:text-app-text'}`}>
      {children}
    </button>
  );
}

function FlagLine({ info, item, t }: { info: CullInfo | null; item: PhotoItem; t: PhotoCopy }) {
  if (item.state === 'error') return <p className="mt-1.5 text-[12px] text-app-warning">{t.unreadable}</p>;
  const flags = info?.verdict?.flags ?? [];
  const best = !!info?.burst?.best;
  if (!flags.length && !best) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px]" data-testid="photo-flags">
      {best && <li className="flex items-center gap-1 text-app-accent"><Star size={12} aria-hidden="true" fill="currentColor" />{t.best}</li>}
      {flags.map((f) => (
        <li key={f} className="flex items-center gap-1 text-app-warning"><AlertTriangle size={12} aria-hidden="true" />{t.flags[f]}</li>
      ))}
    </ul>
  );
}

const GridCell = memo(function GridCell({ item, selected, tabbable, flags, burstSize, best, t, onSelect }: {
  item: PhotoItem; selected: boolean; tabbable: boolean; flags: string; burstSize: number; best: boolean; t: PhotoCopy;
  onSelect: (id: string, focus?: boolean) => void;
}) {
  const flagList = (flags ? flags.split(',') : []) as CullFlag[];
  const status = item.status === 'pick' ? t.picked : item.status === 'reject' ? t.rejected : t.unrated;
  const label = [item.name, status, ...flagList.map((f) => t.flags[f]), best ? t.best : '', item.state === 'error' ? t.unreadable : '']
    .filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" data-photo-id={item.id} tabIndex={tabbable ? 0 : -1} aria-current={selected || undefined} aria-label={label}
        onClick={() => onSelect(item.id)}
        className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-app-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${selected ? 'ring-2 ring-app-accent' : ''}`}>
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: thumbnail made on the device (see above)
          <img src={item.thumbUrl} alt="" draggable={false} loading="lazy" decoding="async"
            className={`h-full w-full object-cover ${item.status === 'reject' ? 'opacity-35' : ''}`}
            style={isNeutralGrade(item.grade) ? undefined : { filter: gradeCssFilter(item.grade) }} />
        ) : item.state === 'error' ? (
          <span className="flex h-full w-full items-center justify-center text-app-warning"><AlertTriangle size={18} aria-hidden="true" /></span>
        ) : (
          <span className="block h-full w-full bg-app-elevated motion-safe:animate-pulse" />
        )}
        {item.status !== 'unrated' && (
          <span aria-hidden="true" className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full ${item.status === 'pick' ? 'bg-app-success text-app-bg' : 'bg-app-danger text-white'}`}>
            {item.status === 'pick' ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
          </span>
        )}
        {flagList.length > 0 && (
          <span aria-hidden="true" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-app-bg/80 text-app-warning">
            <AlertTriangle size={12} />
          </span>
        )}
        {burstSize > 1 && (
          <span aria-hidden="true" className="absolute bottom-1 left-1 flex h-5 items-center gap-0.5 rounded-full bg-app-bg/80 px-1.5 text-[10.5px] font-semibold tabular-nums text-app-text">
            <Layers size={11} />{burstSize}
          </span>
        )}
        {best && (
          <span aria-hidden="true" className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-app-bg/80 text-app-accent">
            <Star size={12} fill="currentColor" />
          </span>
        )}
      </button>
    </li>
  );
});

/**
 * The live preview: the selected photo decoded once at PREVIEW_LONG_EDGE, then regraded through the SAME
 * `applyGrade` the export uses on every change — one frame at a time, the slider never queues work.
 */
function PreviewCanvas({ file, grade, label, onPixels, unreadable }: {
  file: File; grade: Grade; label: string; onPixels: (img: ImageData | null) => void; unreadable: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const base = useRef<ImageData | null>(null);
  const scratch = useRef<ImageData | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPixelsRef = useRef(onPixels);
  onPixelsRef.current = onPixels;

  useEffect(() => {
    let alive = true;
    setReady(false);
    setFailed(false);
    base.current = null;
    scratch.current = null;
    onPixelsRef.current(null);
    const make = typeof OffscreenCanvas !== 'undefined' ? offscreenCanvas : domCanvas;
    previewPixels(file, PREVIEW_LONG_EDGE, make).then(
      (img) => {
        if (!alive) return;
        base.current = img;
        const c = ref.current;
        if (c) { c.width = img.width; c.height = img.height; }
        setReady(true);
        onPixelsRef.current(img);
      },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [file]);

  const g = grade;
  useEffect(() => {
    if (!ready) return;
    const raf = requestAnimationFrame(() => {
      const src = base.current;
      const c = ref.current;
      const ctx = c?.getContext('2d');
      if (!src || !ctx) return;
      if (!scratch.current || scratch.current.width !== src.width || scratch.current.height !== src.height) {
        scratch.current = ctx.createImageData(src.width, src.height);
      }
      applyGrade(src.data, g, scratch.current.data);
      ctx.putImageData(scratch.current, 0, 0);
    });
    return () => cancelAnimationFrame(raf);
    // The four numbers, not the object: a store update that leaves the grade alone must not redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, g.saturation, g.contrast, g.brightness, g.temperature]);

  if (failed) return <p className="p-6 text-center text-[12.5px] text-app-warning">{unreadable}</p>;
  return (
    <>
      <canvas ref={ref} role="img" aria-label={label}
        className={`block h-auto max-h-[34svh] w-auto max-w-full lg:max-h-[46svh] ${ready ? '' : 'hidden'}`} />
      {!ready && <Loader2 size={20} aria-hidden="true" className="m-8 text-app-muted motion-safe:animate-spin" />}
    </>
  );
}

function GradePanel({ grade, disabled, t, lang, onChange, onAuto, autoReady, showOriginal, onToggleOriginal, onApplyToPicks, picks }: {
  grade: Grade; disabled: boolean; t: PhotoCopy; lang: 'ka' | 'en' | 'ru'; onChange: (g: Grade) => void;
  onAuto: () => void; autoReady: boolean; showOriginal: boolean; onToggleOriginal: () => void; onApplyToPicks: () => void; picks: number;
}) {
  const sliders: { key: keyof Grade; label: string; suffix: string }[] = [
    { key: 'brightness', label: t.brightness, suffix: '%' },
    { key: 'contrast', label: t.contrast, suffix: '%' },
    { key: 'saturation', label: t.saturation, suffix: '%' },
    { key: 'temperature', label: t.temperature, suffix: '' },
  ];
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-50">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onAuto} disabled={!autoReady} className={`${CHIP_BASE} ${CHIP_OFF}`}>
          <Wand2 size={14} aria-hidden="true" />{t.auto}
        </button>
        <button type="button" onClick={() => onChange({ ...NEUTRAL_GRADE })} disabled={isNeutralGrade(grade)} className={`${CHIP_BASE} ${CHIP_OFF}`}>
          <RotateCcw size={14} aria-hidden="true" />{t.reset}
        </button>
        <button type="button" onClick={onToggleOriginal} aria-pressed={showOriginal} className={`${CHIP_BASE} ${showOriginal ? CHIP_ON : CHIP_OFF}`}>
          <Eye size={14} aria-hidden="true" />{t.original}
        </button>
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-app-muted">{t.looks}</p>
        <div className="flex flex-wrap gap-1.5">
          {GRADE_PRESETS.map((p) => {
            const on = sameGrade(grade, p.grade as Grade);
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => onChange({ ...p.grade })}
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}>
                {p.label[lang]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1">
        {sliders.map(({ key, label, suffix }) => (
          <label key={key} className="flex min-h-[44px] items-center gap-3">
            <span className="w-24 shrink-0 text-[12.5px] leading-tight text-app-text/85">{label}</span>
            <input type="range" min={GRADE_RANGE[key][0]} max={GRADE_RANGE[key][1]} step={1} value={grade[key]}
              onChange={(e) => onChange({ ...grade, [key]: Number(e.target.value) })}
              className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-app-elevated accent-app-accent" />
            <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-app-muted">{Math.round(grade[key])}{suffix}</span>
          </label>
        ))}
      </div>
      <button type="button" onClick={onApplyToPicks} disabled={!picks || isNeutralGrade(grade)} className={`${BTN_SECONDARY} w-full`}>
        {t.applyToPicks}<span className="tabular-nums text-app-muted">{picks}</span>
      </button>
    </fieldset>
  );
}
