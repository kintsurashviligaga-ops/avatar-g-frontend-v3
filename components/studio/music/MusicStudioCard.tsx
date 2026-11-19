'use client';

/**
 * MusicStudioCard — Music Studio v1 inside the Agent G conversation (the One Window):
 *   plan → quote (the exact credits) → explicit Confirm → the job's real stage (no invented percent) with Cancel →
 *   inline player, download, edits (new versions, the original kept) and Regenerate (a new quote — never silent).
 * The server owns the job: the started job id is remembered per draft, so a reload, a locked phone or a closed tab
 * comes back to the same job. Refusals show the server's own sentence in the user's language.
 *
 * Its state and its one primary button come from lib/studio/cardState (MASTER TASK v3.1 §3.1, Phase 2 PR 6), marked
 * `data-card-state` and `data-primary`: Create (pressed and waiting while the price is fetched, so it does not appear
 * under the finger), Cancel while the job runs (disabled when this job cannot be stopped), Try again after a failure
 * or a stop, Download when the track is here. A refusal offers none: the server said no before any work, and trying
 * again is the conversation's.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, Music2, RotateCcw, Scissors, X } from 'lucide-react';
import { LoadingLoop } from '@/components/studio/ui/LoadingLoop';
import { MusicPreviewPlayer } from './MusicPreviewPlayer';
import type { MusicRequest } from '@/lib/music/studio/contracts';
import { cancelCall, editCall, isFinal, pollDelayMs, quoteCall, startCall, statusCall, commandCall, type MusicJobView, type MusicQuote, type Refusal } from '@/lib/music/studio/client';
import { LIVE_RESULT_EVENT, type LiveResultNote } from '@/lib/voice/liveTools';
import { musicCardCopy, stageText } from './musicCardCopy';
import { downloadHref, mimeOfUrl, trackFileName } from './musicDraft';
import { joinNewestTracks, registerMusicCard, type MusicCardPhase } from './musicVoiceBridge';
import { fromMusicPhase, primaryAction, type LegacyMusicJobStatus } from '@/lib/studio/cardState';

export interface MusicDraft { id: string; request: MusicRequest }

const btn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:opacity-50';
const jobKey = (draftId: string) => `music-studio:job:${draftId}`;
const remember = (draftId: string, jobId: string | null) => { try { if (jobId) localStorage.setItem(jobKey(draftId), jobId); else localStorage.removeItem(jobKey(draftId)); } catch { /* private mode */ } };
const recall = (draftId: string): string | null => { try { return localStorage.getItem(jobKey(draftId)); } catch { return null; } };
/** An [App] note for a Live Voice call (only a call listens; without one it goes nowhere). */
const tellCall = (what: string) => {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  try { window.dispatchEvent(new CustomEvent<LiveResultNote>(LIVE_RESULT_EVENT, { detail: { kind: 'music', what } })); } catch { /* old engines */ }
};

type Phase =
  | { k: 'quoting' }
  | { k: 'quoted'; q: MusicQuote }
  | { k: 'starting'; q: MusicQuote }
  | { k: 'job'; jobId: string; view: MusicJobView | null }
  | { k: 'refused'; r: Refusal };

export function MusicStudioCard({ draft, locale, onRegenerate }: { draft: MusicDraft; locale: string; onRegenerate?: (d: MusicDraft) => void }) {
  const c = musicCardCopy(locale);
  const [phase, setPhase] = useState<Phase>(() => { const j = recall(draft.id); return j ? { k: 'job', jobId: j, view: null } : { k: 'quoting' }; });
  const [edit, setEdit] = useState<{ busy: boolean; text: string; note: string | null; versions: Array<{ url: string; label: string; durationSec: number; jobId: string }> }>({ busy: false, text: '', note: null, versions: [] });
  const polls = useRef(0);
  const cur = useRef({ phase, edit });
  cur.current = { phase, edit };
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Set synchronously when an edit starts: a second tap or call in the same tick sees it (state would not yet). */
  const busyRef = useRef(false);
  const cancelBusyRef = useRef(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Quote once (the server prices it; nothing is charged).
  useEffect(() => {
    if (phase.k !== 'quoting') return;
    let live = true;
    void quoteCall(draft.request).then((q) => {
      if (!live) return;
      setPhase(q.ok ? { k: 'quoted', q } : { k: 'refused', r: q });
      tellCall(q.ok ? `The music plan card shows ${q.credits} credits. Only the user's tap on Create starts it.` : `The music plan was refused: ${q.message ?? q.code}`);
    });
    return () => { live = false; };
  }, [phase.k, draft.request]);

  // Follow the job until it is final.
  useEffect(() => {
    if (phase.k !== 'job' || (phase.view && isFinal(phase.view))) return;
    let live = true;
    const t = setTimeout(async () => {
      const v = await statusCall(phase.jobId);
      if (!live) return;
      polls.current += 1;
      if (v.ok) {
        setPhase({ k: 'job', jobId: phase.jobId, view: v });
        if (isFinal(v) && phase.view) {
          tellCall(v.status === 'completed' ? 'The music track is ready on screen (saved to the Library).'
            : v.status === 'cancelled' ? 'The music job was cancelled; reserved credits were returned.'
              : `The music job failed${v.error ? ` (${v.error})` : ''}; reserved credits are returned.`);
        }
      }
      else if (v.code === 'not_found') { remember(draft.id, null); setPhase({ k: 'refused', r: v }); }
      else setPhase({ ...phase }); // a dropped poll: try again
    }, phase.view ? pollDelayMs(polls.current) : 0);
    return () => { live = false; clearTimeout(t); };
  }, [phase, draft.id]);

  const confirm = useCallback(async () => {
    if (phase.k !== 'quoted') return;
    setPhase({ k: 'starting', q: phase.q });
    const v = await startCall(phase.q);
    if (!v.ok) { setPhase({ k: 'refused', r: v }); return; }
    remember(draft.id, v.jobId);
    polls.current = 0;
    setPhase({ k: 'job', jobId: v.jobId, view: v });
  }, [phase, draft.id]);

  const cancel = useCallback(async () => {
    if (phase.k !== 'job' || !phase.view?.cancellable || cancelBusyRef.current) return false;
    cancelBusyRef.current = true;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const v = await cancelCall(phase.jobId);
      if (!v.ok) {
        setCancelError(v.message ?? c.cancelFailed);
        return false;
      }
      setPhase({ k: 'job', jobId: phase.jobId, view: v });
      return v.status === 'cancelled';
    } finally {
      cancelBusyRef.current = false;
      setCancelBusy(false);
    }
  }, [phase, c.cancelFailed]);

  const editNow = useCallback(async (jobId: string, text: string, newest: string | undefined, spoken: boolean): Promise<{ ok: boolean; message?: string }> => {
    setEdit((e) => ({ ...e, busy: true, note: null }));
    const done = (note: string | null, ok: boolean) => { setEdit((e) => ({ ...e, busy: false, note })); return { ok, ...(note ? { message: note } : {}) }; };
    const parsed = await commandCall(text);
    const cmd = parsed.ok ? (parsed.command as { kind?: string; ops?: unknown[]; format?: string | null; op?: string; crossfadeSec?: number } | null) : null;
    if (!cmd || cmd.kind === 'create') return done(c.editNotUnderstood, false);
    if (cmd.kind === 'unsupported') return done(c.unsupportedOp, false);
    if (cmd.kind === 'regenerate') { done(null, true); onRegenerate?.({ id: `${draft.id}-r${Date.now().toString(36)}`, request: { ...draft.request, parentJobId: jobId } }); return { ok: true }; }
    if (cmd.kind === 'join') {
      const j = await joinNewestTracks({ crossfadeSec: cmd.crossfadeSec ?? 0, locale: draft.request.locale });
      if (!j.ok) return done(j.code === 'need_two_tracks' ? c.joinNeedsTwo : j.message, false);
      setEdit((e) => ({ ...e, busy: false, text: '', note: null }));
      return { ok: true };
    }
    const r = await editCall({ v: 1, sources: [newest ?? jobId], ops: cmd.ops ?? [], format: cmd.format ?? 'mp3', locale: draft.request.locale });
    setEdit((e) => (r.ok
      ? { busy: false, text: spoken ? e.text : '', note: null, versions: [{ url: r.url, label: r.label, durationSec: r.durationSec, jobId: r.jobId }, ...e.versions] }
      : { ...e, busy: false, note: r.message ?? c.editFailed }));
    return r.ok ? { ok: true } : { ok: false, message: r.message ?? c.editFailed };
  }, [c, draft, onRegenerate]);

  /** Edit words (typed in the box, or spoken in a call) on this card's newest track. Free; the original is kept. */
  const runEdit = useCallback(async (words?: string): Promise<{ ok: boolean; message?: string }> => {
    const { phase: ph, edit: ed } = cur.current;
    const text = (words ?? ed.text).trim();
    if (ph.k !== 'job' || !ph.view?.result || !text || busyRef.current) return { ok: false, message: c.editFailed };
    busyRef.current = true;
    try {
      return await editNow(ph.jobId, text, ed.versions[0]?.jobId, !!words);
    } finally {
      busyRef.current = false;
    }
  }, [c.editFailed, editNow]);


  // Agent G and Live Voice reach this card through the bridge (components/studio/music/musicVoiceBridge).
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const editRef = useRef(runEdit);
  editRef.current = runEdit;
  useEffect(() => registerMusicCard({
    draftId: draft.id,
    snapshot() {
      const { phase: ph, edit: ed } = cur.current;
      const v = ph.k === 'job' ? ph.view : null;
      const status: MusicCardPhase = ph.k === 'quoting' ? 'pricing' : ph.k === 'quoted' ? 'quoted' : ph.k === 'starting' ? 'starting' : ph.k === 'refused' ? 'refused'
        : !v || !isFinal(v) ? 'running' : v.status === 'completed' && v.result ? 'completed' : v.status === 'cancelled' ? 'cancelled' : 'failed';
      const original = v?.status === 'completed' && v.result ? [{ jobId: v.jobId, url: v.result.url, durationSec: v.result.durationSec, label: 'original' }] : [];
      return {
        draftId: draft.id, phase: status, prompt: draft.request.prompt, mode: draft.request.mode,
        ...(ph.k === 'quoted' || ph.k === 'starting' ? { credits: ph.q.credits } : {}),
        ...(v && !isFinal(v) ? { stage: v.stage } : {}),
        ...(ph.k === 'job' ? { jobId: ph.jobId } : {}),
        ...(ph.k === 'refused' ? { message: ph.r.message ?? ph.r.code } : v?.error ? { message: v.error } : {}),
        tracks: [...original, ...[...ed.versions].reverse()],
        busy: busyRef.current || ed.busy,
      };
    },
    async cancel() {
      const ph = cur.current.phase;
      if (ph.k !== 'job' || !ph.view?.cancellable) return false;
      return cancelRef.current();
    },
    edit: (text) => editRef.current(text),
    addVersion: (ver) => setEdit((e) => (e.versions.some((x) => x.jobId === ver.jobId) ? e : { ...e, versions: [ver, ...e.versions] })),
    download() {
      // The newest track: the newest version (listed first under the original), else the original.
      const a = rootRef.current?.querySelector<HTMLAnchorElement>('[data-testid="music-version-download"]')
        ?? rootRef.current?.querySelector<HTMLAnchorElement>('[data-testid="music-download"]');
      if (!a) return false;
      a.click();
      return true;
    },
  }), [draft.id, draft.request.prompt, draft.request.mode]);

  const shell = 'mt-2 w-full max-w-[480px] rounded-2xl border border-app-border/15 bg-app-elevated/40 p-3.5';
  const r = draft.request;
  // The card's state in the one studio vocabulary. A remembered job with no answer yet reads as queued.
  const card = fromMusicPhase(phase.k, phase.k === 'job' ? ((phase.view?.status ?? 'queued') as LegacyMusicJobStatus) : undefined);
  const primary = primaryAction(card, { cancellable: phase.k === 'job' && phase.view?.cancellable === true });

  if (phase.k === 'refused') {
    return (
      <div className={shell} role="alert" data-testid="music-card" data-phase="refused" data-card-state={card.state} ref={rootRef}>
        <p className="flex items-start gap-2 text-[13px] text-app-text"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />{/* A song refused as unsupported says WHY (vocals unverified) and that it was not swapped for an instrumental. */}{r.mode === 'song' && phase.r.code === 'unsupported' ? c.songRefused : phase.r.message ?? c.genericError}</p>
      </div>
    );
  }

  if (phase.k === 'quoting' || phase.k === 'quoted' || phase.k === 'starting') {
    const q = phase.k === 'quoting' ? null : phase.q;
    return (
      <div className={shell} aria-busy={phase.k !== 'quoted'} data-testid="music-card" data-phase={phase.k === 'quoting' ? 'pricing' : phase.k} data-card-state={card.state} ref={rootRef}>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-app-text"><Music2 className="h-4 w-4 text-app-accent" aria-hidden />{c.planTitle}</p>
        <p className="mt-1.5 line-clamp-3 text-[13px] text-app-text/85">{r.prompt}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] text-app-text/70">
          <li className="rounded-full bg-app-border/10 px-2 py-0.5">{r.mode === 'song' ? c.song : c.instrumental}</li>
          {r.genre && <li className="rounded-full bg-app-border/10 px-2 py-0.5">{r.genre}</li>}
          {r.mood && <li className="rounded-full bg-app-border/10 px-2 py-0.5">{r.mood}</li>}
          {r.bpm ? <li className="rounded-full bg-app-border/10 px-2 py-0.5">{r.bpm} BPM</li> : r.tempo ? <li className="rounded-full bg-app-border/10 px-2 py-0.5">{c.tempo[r.tempo]}</li> : null}
          <li className="rounded-full bg-app-border/10 px-2 py-0.5">{c.approxLength(q?.summary.durationSec ?? r.durationSec)}</li>
          {q && <li className="rounded-full bg-app-border/10 px-2 py-0.5">{q.summary.model}</li>}
        </ul>
        {/* One button from the first frame: pressed and waiting while the price is fetched, then Create with it. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!q ? (
            <button type="button" data-testid="music-pricing" data-primary={primary.action} className={`${btn} bg-app-accent text-white`} disabled aria-busy="true">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{c.pricing}
            </button>
          ) : (
            <>
              <button type="button" data-testid="music-confirm" data-primary={primary.action} data-credits={q.credits} data-live-guard="spend" className={`${btn} bg-app-accent text-white hover:bg-app-accent/90`} onClick={confirm} disabled={!primary.enabled} aria-label={c.confirmAria(q.credits)}>
                {primary.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{c.confirm(q.credits)}
              </button>
              <span className="text-[11.5px] text-app-text/60">{c.lengthNote}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  const v = phase.view;
  if (!v || !isFinal(v)) {
    return (
      <div className={shell} aria-live="polite" aria-busy="true" data-testid="music-card" data-phase="running" data-stage={v?.stage ?? 'queued'} data-card-state={card.state} ref={rootRef}>
        <div aria-hidden="true" data-testid="music-loop" className="relative mb-2 h-[120px] overflow-hidden rounded-xl bg-black ring-1 ring-app-border/15"><LoadingLoop /></div>
        <p className="text-[13px] text-app-text" data-testid="music-stage">{stageText(v?.stage ?? 'queued', locale)}</p>
        {/* Cancel is always here while it runs: disabled until the job's first answer, and disabled and saying so for a
            job the server says cannot be stopped. */}
        <button type="button" data-testid="music-cancel" data-primary={primary.action} className={`${btn} mt-2 border border-app-border/25 text-app-text hover:bg-app-border/10 disabled:cursor-not-allowed`} onClick={cancel} disabled={!primary.enabled || cancelBusy}><X className="h-4 w-4" aria-hidden />{v && !v.cancellable ? c.cannotCancel : c.cancel}</button>
        {cancelError && <p role="alert" className="mt-2 text-[13px] text-app-text">{cancelError}</p>}
      </div>
    );
  }
  if (v.status !== 'completed' || !v.result) {
    return (
      <div className={shell} role="status" data-testid="music-card" data-phase={v.status === 'cancelled' ? 'cancelled' : 'failed'} data-card-state={card.state} ref={rootRef}>
        <p className="flex items-start gap-2 text-[13px] text-app-text"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />{c.failed(v.status === 'cancelled', v.error)}</p>
        {v.settlementPending && <p className="mt-1 text-[11.5px] text-app-text/60">{c.refundPending}</p>}
        <button type="button" data-testid="music-retry" data-primary={primary.action} className={`${btn} mt-2 border border-app-border/25 text-app-text hover:bg-app-border/10`} onClick={() => { remember(draft.id, null); setPhase({ k: 'quoting' }); }}><RotateCcw className="h-4 w-4" aria-hidden />{c.retry}</button>
      </div>
    );
  }
  const res = v.result;
  return (
    <div className={shell} data-testid="music-card" data-phase="completed" data-job-id={v.jobId} data-card-state={card.state} ref={rootRef}>
      <MusicPreviewPlayer src={res.url} title={r.prompt} durationSec={res.durationSec} locale={locale} />
      <p className="mt-1.5 text-[11.5px] text-app-text/60">{c.delivered(Math.round(res.durationSec), res.credits, res.modelId)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a data-testid="music-download" data-primary={primary.action} className={`${btn} bg-app-accent text-white hover:bg-app-accent/90`} href={downloadHref(res.url, trackFileName(v.jobId, res.mime))} download={trackFileName(v.jobId, res.mime)}><Download className="h-4 w-4" aria-hidden />{c.download}</a>
        <button type="button" data-testid="music-regenerate" className={`${btn} border border-app-border/25 text-app-text hover:bg-app-border/10`} onClick={() => onRegenerate?.({ id: `${draft.id}-r${Date.now().toString(36)}`, request: { ...draft.request, parentJobId: v.jobId } })}><RotateCcw className="h-4 w-4" aria-hidden />{c.regenerate}</button>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void runEdit(); }}>
        <label className="sr-only" htmlFor={`ms-edit-${draft.id}`}>{c.editLabel}</label>
        <input id={`ms-edit-${draft.id}`} data-testid="music-edit-input" value={edit.text} onChange={(e) => setEdit((s) => ({ ...s, text: e.target.value }))} placeholder={c.editPlaceholder}
          className="min-h-[44px] flex-1 rounded-full border border-app-border/20 bg-transparent px-3 text-[13px] text-app-text placeholder:text-app-text/40" />
        <button type="submit" data-testid="music-edit-apply" className={`${btn} border border-app-border/25 text-app-text hover:bg-app-border/10`} disabled={edit.busy || !edit.text.trim()}>{edit.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Scissors className="h-4 w-4" aria-hidden />}{c.apply}</button>
      </form>
      {edit.note && <p className="mt-1.5 text-[12px] text-amber-300" role="status" data-testid="music-edit-note">{edit.note}</p>}
      {edit.versions.map((ver) => (
        <div key={ver.jobId} className="mt-2 rounded-xl border border-app-border/10 p-2" data-testid="music-version" data-job-id={ver.jobId} data-duration={ver.durationSec}>
          <p className="text-[11.5px] text-app-text/70">{c.version(ver.label, Math.round(ver.durationSec))}</p>
          <MusicPreviewPlayer src={ver.url} title={ver.label} durationSec={ver.durationSec} locale={locale} compact />
          <a data-testid="music-version-download" className="mt-1 inline-flex min-h-[44px] items-center text-[12px] text-app-accent underline" href={downloadHref(ver.url, trackFileName(ver.jobId, mimeOfUrl(ver.url), ver.label))} download={trackFileName(ver.jobId, mimeOfUrl(ver.url), ver.label)}>{c.download}</a>
        </div>
      ))}
      <p className="mt-2 text-[11px] text-app-text/50">{c.savedToLibrary}</p>
    </div>
  );
}
