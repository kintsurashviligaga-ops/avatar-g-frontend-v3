'use client';

/**
 * StartSheet — the confirmation every Deep Research run goes through. NOTHING is charged before the user presses the one
 * button here, and that button carries the exact price (GenerateButton, from the server's capabilities answer — the same number
 * POST /api/research/start demands back as `confirmedCredits`, or refuses with 409 price_changed). The browser never computes
 * or charges a price; the server's saga reserves the credits and refunds a run that produces nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileText } from 'lucide-react';
import { RESEARCH_ATTACH_MAX, RESEARCH_PROMPT_MAX_CHARS } from '@/lib/research/context';
import type { ConnectorFile } from '@/lib/connectors/types';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { fetchFiles, startJob } from './api';
import { researchCopy, researchLang } from './copy';
import { RequestIdKeeper } from './requestId';
import { researchActions, useResearchState } from './store';

export function StartSheet({ locale, authed }: { locale: string; authed: boolean }) {
  const { start, caps, connectors: connectorsOpen } = useResearchState();
  const c = researchCopy(locale);
  const lang = researchLang(locale);
  const [prompt, setPrompt] = useState(start?.prompt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; topUp: boolean } | null>(null);
  const [files, setFiles] = useState<ConnectorFile[] | null>(null);
  const [maxAttach, setMaxAttach] = useState(RESEARCH_ATTACH_MAX);
  const [picked, setPicked] = useState<string[]>([]);
  const keeper = useRef(new RequestIdKeeper());
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const credits = caps?.credits ?? 0;
  const filesOn = authed && caps?.filesAvailable === true;

  // The documents the user already keeps (Connectors → Local files), offered as attachments.
  useEffect(() => {
    if (!filesOn || connectorsOpen) return; // re-read when the Connectors sheet (opened over this one) closes
    let alive = true;
    void fetchFiles().then((r) => {
      if (!alive || !r.ok) return;
      setFiles(r.files);
      if (r.limits?.maxAttach) setMaxAttach(r.limits.maxAttach);
    });
    return () => { alive = false; };
  }, [filesOn, connectorsOpen]);

  const text = prompt.trim();
  const canStart = text.length >= 3 && credits > 0 && !busy;
  const fingerprint = useMemo(() => `${text}|${[...picked].sort().join(',')}|${credits}`, [text, picked, credits]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= maxAttach ? cur : [...cur, id]));

  const submit = async () => {
    if (!canStart) return;
    if (!authed) {
      setError({ text: c.signInNeeded, topUp: false });
      try { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); } catch { /* SSR */ }
      return;
    }
    setBusy(true);
    setError(null);
    const r = await startJob({ prompt: text, confirmedCredits: credits, locale: lang, fileIds: picked, requestId: keeper.current.get(fingerprint) });
    setBusy(false);
    if (r.ok) {
      keeper.current.settle(true);
      researchActions.jobStarted(r.job, text);
      return;
    }
    keeper.current.settle(!r.ambiguous);
    if (r.status === 401) {
      try { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); } catch { /* SSR */ }
      setError({ text: c.signInNeeded, topUp: false });
      return;
    }
    if (r.code === 'price_changed' && typeof r.credits === 'number') researchActions.setCredits(r.credits);
    setError({ text: r.message ?? c.startFailed, topUp: r.code === 'insufficient_credits' });
  };

  return (
    <BottomSheet open onClose={researchActions.closeStart} title={c.startTitle} closeLabel={c.close} testId="research-start-sheet">
      <div className="space-y-4 px-2 pb-2 pt-1">
        <p className="text-[13.5px] leading-relaxed text-app-muted">{c.startLead}</p>

        <div>
          <label htmlFor="research-prompt" className="mb-1.5 block text-[12.5px] font-medium text-app-text">{c.promptLabel}</label>
          <textarea
            id="research-prompt"
            ref={boxRef}
            data-testid="research-prompt"
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value.slice(0, RESEARCH_PROMPT_MAX_CHARS)); if (error) setError(null); }}
            rows={5}
            maxLength={RESEARCH_PROMPT_MAX_CHARS}
            placeholder={c.promptPlaceholder}
            className="max-h-[40svh] min-h-[120px] w-full resize-none rounded-2xl border border-app-border/15 bg-app-bg/40 px-3.5 py-3 text-[15px] leading-relaxed text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/60 focus:ring-2 focus:ring-app-accent/25"
          />
        </div>

        {filesOn && (
          <div data-testid="research-docs">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-medium text-app-text">{c.docsLabel}</p>
              <button type="button" onClick={researchActions.openConnectors} className="inline-flex min-h-[44px] items-center rounded-full px-3 text-[12.5px] font-medium text-app-accent hover:bg-app-elevated">{files && files.length > 0 ? c.docsManage : c.docsAdd}</button>
            </div>
            {files && files.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label={c.docsLabel}>
                {files.map((f) => {
                  const on = picked.includes(f.id);
                  const locked = !on && picked.length >= maxAttach;
                  return (
                    <li key={f.id} className="min-w-0 max-w-full">
                      <button type="button" aria-pressed={on} disabled={locked} onClick={() => toggle(f.id)}
                        className={`inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors disabled:opacity-45 ${on ? 'border-app-accent/60 bg-app-accent/15 text-app-text' : 'border-app-border/20 text-app-muted hover:bg-app-elevated'}`}>
                        {on ? <Check size={14} className="shrink-0 text-app-accent" aria-hidden="true" /> : <FileText size={14} className="shrink-0" aria-hidden="true" />}
                        <span className="truncate">{f.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : files ? <p className="text-[12.5px] text-app-muted">{c.docsNone}</p> : null}
            {files && files.length > 0 ? <p className="mt-1.5 text-[12px] text-app-muted">{c.docsLimit(maxAttach)}</p> : null}
          </div>
        )}

        <div className="space-y-1.5 rounded-2xl bg-app-elevated/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-app-muted">
          <p>{c.timeNote}</p>
          <p>{c.refundNote}</p>
        </div>

        {error && (
          <div role="alert" data-testid="research-start-error" className="rounded-2xl border border-app-border/20 bg-app-elevated/60 px-3.5 py-3 text-[13px] leading-relaxed text-app-text">
            <p>{error.text}</p>
            {error.topUp && (
              <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('myavatar:open-credits')); } catch { /* SSR */ } }}
                className="mt-1 inline-flex min-h-[44px] items-center rounded-full px-1 text-[13px] font-semibold text-app-accent">{c.topUp}</button>
            )}
          </div>
        )}

        <GenerateButton
          label={c.startButton}
          credits={credits}
          loading={busy}
          loadingLabel={c.starting}
          disabled={!canStart}
          locale={lang}
          onClick={() => void submit()}
          stickyBottom
          testId="research-start-button"
        />
      </div>
    </BottomSheet>
  );
}
