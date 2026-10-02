'use client';

/**
 * ReportViewer — a finished research, full height: the report (headings, lists, tables — the shared Markdown renderer), its
 * sources as favicon chips, and everything you can do WITH it:
 *
 *   Go live      a Gemini Live call that has THIS report (the server loads it for the owner from the id — the browser never
 *                sends report text) — "summarize", "key takeaways", "read it to me" by voice
 *   Read aloud   chunked TTS of the report text, with pause / resume / stop (the start of a long report; the screen says so)
 *   Ask          a box under the report: a question, or one of the three commands. Typed, or dictated with the mic — both go
 *                through the same planner (commands.ts → lib/research/voiceCommands), so "წამიკითხე" starts the reading and a
 *                bare "stop" stops it instead of being sent to the model as a question.
 *   Copy · Download (.md)
 *
 * A job that is not finished shows its card instead (progress, cancel, or why it failed). Focus is managed by useDialogA11y
 * (focus in, Tab trapped, Escape closes, focus back to the trigger).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Loader2, Mic, Pause, Play, Radio, Send, Square, Volume2, X } from 'lucide-react';
import { useDictation } from '@/components/chat/composer/useDictation';
import { Markdown } from '@/components/studio/Markdown';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { readMinutes, reportFileName, reportToMarkdownFile } from '@/lib/research/report';
import { primeLive } from '@/lib/voice/livePrime';
import { askReport, safeSources } from './api';
import { planReportCommand, type ReportAction } from './commands';
import { jobLabel, researchCopy, researchLang } from './copy';
import { ResearchCard } from './ResearchCard';
import { SourceChip } from './SourceChip';
import { researchActions } from './store';
import { useEnsureJob } from './useEnsureJob';
import { useReportVoice } from './useReportVoice';

interface QaEntry {
  key: number;
  mode: 'ask' | 'summarize' | 'takeaways';
  question: string;
  answer?: string;
  error?: string;
  loading: boolean;
}

const SOURCES_SHOWN = 12;
const iconBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:opacity-50';
const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ReportViewer({ id, locale, canLive }: { id: string; locale: string; canLive: boolean }) {
  const c = researchCopy(locale);
  const lang = researchLang(locale);
  const { job, missing } = useEnsureJob(id, { needReport: true });
  const [mounted, setMounted] = useState(false);
  // `open` flips true only once the portal below exists, so the hook finds the panel node when its effect runs.
  const panelRef = useDialogA11y<HTMLDivElement>(mounted, researchActions.closeViewer);
  const voice = useReportVoice(lang);
  const [copied, setCopied] = useState(false);
  const [allSources, setAllSources] = useState(false);
  const [entries, setEntries] = useState<QaEntry[]>([]);
  const [draft, setDraft] = useState('');
  const seq = useRef(0);
  const aborts = useRef(new Set<AbortController>());
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { aborts.current.forEach((a) => a.abort()); }, []);

  const dictation = useDictation({
    locale: lang,
    value: draft,
    setValue: setDraft,
    textareaRef: inputRef,
    authed: true,
    onAuthRequired: () => { try { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); } catch { /* SSR */ } },
  });

  const report = job?.status === 'completed' ? job.report ?? null : null;
  const ready = !!report && report.trim().length > 0;
  const sources = safeSources(job?.sources);

  useEffect(() => {
    if (entries.length === 0) return;
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [entries.length, entries[entries.length - 1]?.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = useCallback(async (mode: QaEntry['mode'], question: string, speak: boolean) => {
    const key = ++seq.current;
    setEntries((cur) => [...cur, { key, mode, question, loading: true }]);
    const ctrl = new AbortController();
    aborts.current.add(ctrl);
    const r = await askReport(id, { mode, question, locale: lang, signal: ctrl.signal });
    aborts.current.delete(ctrl);
    if (ctrl.signal.aborted) return;
    setEntries((cur) => cur.map((e) => (e.key === key ? { ...e, loading: false, ...(r.ok ? { answer: r.answer } : { error: r.message ?? c.loadFailed }) } : e)));
    if (r.ok && speak) voice.readAnswer(r.answer);
  }, [id, lang, c.loadFailed, voice]);

  const run = useCallback((action: ReportAction) => {
    switch (action.type) {
      case 'read': if (report) voice.readReport(report); break;
      case 'pause': voice.pause(); break;
      case 'resume': voice.resume(); break;
      case 'stop': voice.stop(); break;
      case 'ask': void ask(action.mode, action.question, action.speak); break;
      default: break;
    }
  }, [ask, report, voice]);

  /** A line the user sent (typed, or dictated into the box): the planner decides what it means. */
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    dictation.stopEcho();
    voice.prime(); // inside the tap: a spoken answer starts after the network round trip
    setDraft('');
    run(planReportCommand(t, voice.activity));
  };
  const quick = (mode: 'summarize' | 'takeaways' | 'read') => {
    voice.prime();
    if (mode === 'read') run({ type: 'read' });
    else run({ type: 'ask', mode, question: '', speak: false });
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — nothing to say that helps */ }
  };
  const download = () => {
    if (!job || !report) return;
    const md = reportToMarkdownFile({ title: job.title, prompt: job.prompt, report, sources, createdAt: job.createdAt });
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(job.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const goLive = () => {
    voice.stop();
    primeLive(); // inside the tap — Live adopts the primed audio + mic (lib/voice/livePrime)
    researchActions.openLive(id);
  };

  if (!mounted) return null;

  const v = voice.state;
  const reading = v.status === 'loading' || v.status === 'playing' || v.status === 'paused';
  const date = job ? (() => { try { return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang === 'ru' ? 'ru-RU' : 'ka-GE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(job.createdAt)); } catch { return ''; } })() : '';

  return createPortal(
    <div className="fixed inset-0 z-[96] flex items-end justify-center sm:items-center sm:p-6" onClick={researchActions.closeViewer}>
      <div aria-hidden="true" className="sheet-fade absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={job ? jobLabel(job, 80) : c.startTitle}
        data-testid="research-viewer"
        onClick={(e) => e.stopPropagation()}
        className="sheet-rise relative flex h-[100dvh] w-full flex-col overflow-hidden bg-app-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)] sm:h-[min(88dvh,860px)] sm:max-w-[780px] sm:rounded-[28px] sm:border sm:border-app-border/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-app-border/10 pl-4 pr-2" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <h2 className="min-w-0 flex-1 truncate py-3 text-[15px] font-semibold text-app-text">{job ? jobLabel(job, 80) : c.startTitle}</h2>
          <button type="button" onClick={researchActions.closeViewer} aria-label={c.close} title={c.close} data-testid="research-viewer-close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 sm:px-6 [scrollbar-width:thin]">
          {!job ? (
            <p className="flex items-center gap-2 py-6 text-[13.5px] text-app-muted" role="status">
              {missing ? c.cardMissing : (<><Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />{c.loadingReport}</>)}
            </p>
          ) : !ready ? (
            job.status === 'completed' && job.hasReport ? (
              <p className="flex items-center gap-2 py-6 text-[13.5px] text-app-muted" role="status"><Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />{c.loadingReport}</p>
            ) : (
              <div className="py-2"><ResearchCard id={id} locale={locale} className="!max-w-none" /></div>
            )
          ) : (
            <>
              <p className="text-[12.5px] text-app-muted" data-testid="research-meta">
                {[date, c.readMinutes(readMinutes(job.reportChars)), c.sourcesCount(job.sourcesCount)].filter(Boolean).join(' · ')}
              </p>
              {job.incomplete && <p className="mt-2 rounded-xl bg-app-elevated/60 px-3 py-2 text-[12.5px] text-app-text">{c.incompleteNote}</p>}

              {/* actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label={c.startTitle}>
                {canLive && (
                  <button type="button" onClick={goLive} data-testid="research-go-live" className={`${iconBtn} bg-app-accent text-app-bg hover:opacity-90`}>
                    <Radio size={16} aria-hidden="true" />{c.goLive}
                  </button>
                )}
                <button type="button" onClick={() => (reading ? voice.stop() : (voice.prime(), run({ type: 'read' })))} aria-pressed={reading} data-testid="research-read-aloud"
                  className={`${iconBtn} border border-app-border/25 text-app-text hover:bg-app-elevated`}>
                  {reading ? <Square size={15} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}{reading ? c.readStop : c.readAloud}
                </button>
                <button type="button" onClick={() => void copy()} className={`${iconBtn} text-app-muted hover:bg-app-elevated hover:text-app-text`}>
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? c.copied : c.copy}
                </button>
                <button type="button" onClick={download} className={`${iconBtn} text-app-muted hover:bg-app-elevated hover:text-app-text`}>
                  <Download size={15} aria-hidden="true" />{c.download}
                </button>
              </div>

              {/* the voice, while it reads */}
              {(reading || v.status === 'error') && (
                <div role="status" data-testid="research-reading" data-state={v.status} className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-app-elevated/60 px-3.5 py-2">
                  <span className="min-w-0 flex-1 text-[12.5px] text-app-text">
                    {v.status === 'error' ? c.readFailed : v.status === 'loading' ? c.readLoading : `${v.status === 'paused' ? c.readPaused : c.readReading} · ${Math.min(v.index + 1, v.total)}/${v.total}`}
                    {voice.partial && v.status !== 'error' ? <span className="mt-0.5 block text-[12px] text-app-muted">{c.readPartial}</span> : null}
                  </span>
                  {v.status === 'paused' ? (
                    <button type="button" onClick={voice.resume} className={`${iconBtn} px-3 text-app-text hover:bg-app-bg/40`}><Play size={15} aria-hidden="true" />{c.readResume}</button>
                  ) : v.status === 'playing' || v.status === 'loading' ? (
                    <button type="button" onClick={voice.pause} className={`${iconBtn} px-3 text-app-text hover:bg-app-bg/40`}><Pause size={15} aria-hidden="true" />{c.readPause}</button>
                  ) : null}
                  {v.status === 'error' ? (
                    <button type="button" onClick={() => { voice.prime(); run({ type: 'read' }); }} className={`${iconBtn} px-3 text-app-accent hover:bg-app-bg/40`}>{c.retry}</button>
                  ) : (
                    <button type="button" onClick={voice.stop} className={`${iconBtn} px-3 text-app-muted hover:bg-app-bg/40`}><Square size={14} aria-hidden="true" />{c.readStop}</button>
                  )}
                </div>
              )}

              {/* the report */}
              <article className="mt-4 text-[15px] leading-relaxed text-app-text" data-testid="research-report" lang={lang}>
                <Markdown locale={lang}>{report}</Markdown>
              </article>

              {/* sources */}
              {sources.length > 0 && (
                <section className="mt-6" aria-labelledby="research-sources-h" data-testid="research-sources">
                  <h3 id="research-sources-h" className="mb-2 text-[13px] font-semibold text-app-text">{c.sourcesHeading} <span className="font-normal text-app-muted">· {sources.length}</span></h3>
                  <ul className="flex flex-wrap gap-2">
                    {(allSources ? sources : sources.slice(0, SOURCES_SHOWN)).map((s, i) => (
                      <li key={`${s.url}-${i}`} className="min-w-0 max-w-full"><SourceChip url={s.url} title={s.title} openLabel={c.openSource} /></li>
                    ))}
                  </ul>
                  {sources.length > SOURCES_SHOWN && !allSources && (
                    <button type="button" onClick={() => setAllSources(true)} className="mt-2 inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-medium text-app-accent hover:bg-app-elevated">{c.sourcesCount(sources.length)} ›</button>
                  )}
                </section>
              )}

              {/* what you asked, and the answers */}
              {entries.length > 0 && (
                <section className="mt-6 space-y-3" aria-label={c.askLabel} data-testid="research-qa">
                  {entries.map((e) => (
                    <div key={e.key} className="space-y-1.5">
                      <p className="text-[12px] font-medium text-app-muted">{c.askYou} · {e.mode === 'summarize' ? c.summarize : e.mode === 'takeaways' ? c.takeaways : e.question}</p>
                      <div className="rounded-2xl bg-app-elevated/50 px-3.5 py-3 text-[14.5px] leading-relaxed text-app-text" role={e.error ? 'alert' : undefined} data-testid="research-answer">
                        {e.loading ? (
                          <span className="flex items-center gap-2 text-app-muted" role="status"><Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" />{c.askBusy}</span>
                        ) : e.error ? e.error : (
                          <>
                            <Markdown locale={lang}>{e.answer ?? ''}</Markdown>
                            <button type="button" onClick={() => { voice.prime(); voice.readAnswer(e.answer ?? ''); }} className={`${iconBtn} -ml-3 mt-1 px-3 text-app-muted hover:text-app-text`}>
                              <Volume2 size={15} aria-hidden="true" />{c.answerReadAloud}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </section>
              )}
            </>
          )}
        </div>

        {/* the ask box — only for a finished report */}
        {ready && (
          <div className="shrink-0 border-t border-app-border/10 bg-app-surface px-3 pb-3 pt-2 sm:px-5">
            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={c.askLabel}>
              <button type="button" onClick={() => quick('summarize')} data-testid="research-summarize" className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-app-border/25 px-4 text-[13px] font-medium text-app-text hover:bg-app-elevated">{c.summarize}</button>
              <button type="button" onClick={() => quick('takeaways')} data-testid="research-takeaways" className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-app-border/25 px-4 text-[13px] font-medium text-app-text hover:bg-app-elevated">{c.takeaways}</button>
              <button type="button" onClick={() => quick('read')} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-app-border/25 px-4 text-[13px] font-medium text-app-text hover:bg-app-elevated">{c.readAloud}</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex items-end gap-1.5 rounded-[26px] border border-app-border/15 bg-app-bg/40 py-1 pl-4 pr-1 focus-within:border-app-accent/60">
              <label htmlFor="research-ask" className="sr-only">{c.askLabel}</label>
              <textarea
                id="research-ask"
                ref={inputRef}
                data-testid="research-ask-input"
                value={draft}
                rows={1}
                enterKeyHint="send"
                placeholder={c.askPlaceholder}
                onChange={(e) => { setDraft(e.target.value.slice(0, 1000)); dictation.markTyped(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }}
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[16px] leading-snug text-app-text outline-none placeholder:text-app-muted"
              />
              <button type="button" onClick={() => void dictation.toggle()} aria-pressed={dictation.recording} aria-label={dictation.recording ? c.micStop : c.micStart} title={dictation.recording ? c.micStop : c.micStart}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${dictation.recording ? 'bg-app-accent text-app-bg' : 'text-app-muted hover:bg-app-elevated hover:text-app-text'}`}>
                {dictation.transcribing ? <Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
              </button>
              <button type="submit" disabled={!draft.trim()} aria-label={c.askSend} title={c.askSend} data-testid="research-ask-send"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg transition-opacity hover:opacity-90 disabled:opacity-40">
                <Send size={17} aria-hidden="true" />
              </button>
            </form>
            <p className="px-2 pt-1.5 text-[11.5px] leading-snug text-app-muted">{dictation.warn ?? c.askHint}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
