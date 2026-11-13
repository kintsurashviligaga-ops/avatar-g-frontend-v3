'use client';

/**
 * Agent Terminal — STEP 3 dashboard UI.
 *
 * Drives POST /api/agent/run and renders the ReAct trace (Thought → Action → Observation → Final)
 * as a console. The loop is always bounded + terminal server-side, so the UI just reflects the
 * returned steps. Social publishing is prepare-only end-to-end — the UI surfaces that explicitly.
 */
import { useEffect, useState } from 'react';
import { PlanStartCard, type SignedPlan } from './PlanStartCard';
import { TERMINAL_COPY, terminalErrorText, terminalLang } from './agentTerminalCopy';

interface Step {
  thought?: string;
  tool?: string;
  input?: unknown;
  observation?: unknown;
  final?: string;
}
interface RunResult {
  answer: string | null;
  steps: Step[];
  stopReason: 'final' | 'max_steps' | 'llm_error';
  /** A browser plan Agent G signed (lib/agent/browser/quote): runs only on the card's Start. */
  browserQuote?: SignedPlan;
  /** A program plan Agent G signed (lib/agent/sandbox/codeQuote): runs only on the card's Start. */
  codeQuote?: SignedPlan;
}

function pretty(v: unknown, max = 1200): string {
  if (v == null) return '';
  let s: string;
  try { s = typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { s = String(v); }
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}

/** One card look for every block, on the app's tokens (the Phase 7 workspace look) — no inline colours. */
const CARD = 'rounded-2xl border border-app-border bg-app-surface';
const PRE = 'mt-2 max-h-[200px] overflow-auto rounded-lg bg-app-bg/60 p-2.5 font-mono text-[12px] leading-relaxed';

// `embedded` = mounted in-place inside the main /dashboard window (ServiceHub → ChatChrome),
// where the shell already owns the top bar + scroll. Standalone (route) is the fallback.
export default function AgentTerminal({ locale, embedded = false, onExit }: { locale: string; embedded?: boolean; onExit?: () => void }) {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lang = terminalLang(locale);
  const t = TERMINAL_COPY[lang];

  // Prompt handoff: when the user types in the "Ask Agent G" bar (which redirects here with
  // ?prompt=…), carry that text straight into the goal box — the request lands in-place, in the
  // same window they typed it. Pre-fill only (no auto-run); the user still hits Run. Client-only.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('prompt');
      if (p && p.trim()) setGoal((g) => g || p.trim().slice(0, 2000));
    } catch { /* no-op */ }
  }, []);

  async function run(g: string) {
    const trimmed = g.trim();
    if (!trimmed || running) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: trimmed, maxSteps: 6 }),
      });
      // A 502 still carries the run (the model failed mid-way: its steps and stopReason are worth showing).
      if (!res.ok && res.status !== 502) { setError(terminalErrorText(res.status, lang)); return; }
      const body = (await res.json().catch(() => null)) as RunResult | null;
      if (!body || !Array.isArray(body.steps)) { setError(terminalErrorText(500, lang)); return; }
      setResult(body);
    } catch {
      setError(terminalErrorText(0, lang));
    } finally {
      setRunning(false);
    }
  }

  const stopBadge = result && ({
    final: { text: t.stop.final, dot: 'bg-app-success' },
    max_steps: { text: t.stop.max_steps, dot: 'bg-app-warning' },
    llm_error: { text: t.stop.llm_error, dot: 'bg-app-danger' },
  } as const)[result.stopReason];
  const canRun = !running && !!goal.trim();

  return (
    <main
      data-testid="agent-terminal"
      className={`relative mx-auto max-w-[860px] px-5 pb-[72px] pt-7 text-app-text ${embedded ? 'min-h-full' : 'min-h-screen bg-app-bg'}`}
    >
      <header className="mb-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${running ? 'bg-app-warning' : 'bg-app-success'}`} />
          <h1 className="text-[24px] font-bold tracking-tight">{t.title}</h1>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-app-muted">
          {t.intro} <strong className="font-semibold text-app-text">{t.introStrong}</strong>.
        </p>
      </header>

      {/* Goal input */}
      <div className={`${CARD} mb-3.5 p-3.5`}>
        <textarea
          data-testid="agent-terminal-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(goal); }}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          rows={3}
          disabled={running}
          className="w-full resize-y bg-transparent text-[15px] leading-normal text-app-text outline-none placeholder:text-app-muted"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] tabular-nums text-app-muted">{goal.length}/2000</span>
          <button
            type="button"
            data-testid="agent-terminal-run"
            onClick={() => run(goal)}
            disabled={!canRun}
            className="rounded-full bg-app-accent px-5 py-2 text-[13.5px] font-semibold text-app-bg transition hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            {running ? t.running : t.run}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {!result && !running && (
        <div className="mb-5 flex flex-wrap gap-2">
          {t.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setGoal(s); run(s); }}
              className="rounded-full border border-app-border bg-app-surface px-3 py-2 text-left text-[12.5px] text-app-muted transition hover:border-app-accent/50 hover:text-app-text"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" data-testid="agent-terminal-error" className="mb-4 rounded-2xl border border-app-danger/30 bg-app-danger/10 p-3.5 text-[13.5px] text-app-danger">
          {error}
        </div>
      )}

      {running && (
        <div className={`${CARD} mb-4 p-4 font-mono text-[13px] text-app-muted`} aria-live="polite">
          <span className="ag-pulse" aria-hidden="true">▍</span> {t.reasoning}
        </div>
      )}

      {/* Trace */}
      {result && (
        <section className="flex flex-col gap-2.5">
          {result.steps.map((st, i) => {
            if (st.final != null && st.tool == null) return null; // final rendered below
            const label = st.tool ? (t.tools[st.tool] ?? st.tool) : null;
            const isError = st.observation != null && typeof st.observation === 'object' && 'error' in (st.observation as object);
            return (
              <div key={i} className={`${CARD} p-3.5`}>
                <div className={`flex items-center gap-2 ${st.thought ? 'mb-2' : ''}`}>
                  <span className="font-mono text-[11px] text-app-muted">#{i + 1}</span>
                  {label && (
                    <span className="rounded-full bg-app-accent/10 px-2.5 py-0.5 text-[11.5px] font-semibold text-app-accent">{label}</span>
                  )}
                </div>
                {st.thought && (
                  <div className="mb-2.5 text-[13.5px] leading-normal text-app-text/85">
                    <span className="text-app-muted">{t.thought} · </span>{st.thought}
                  </div>
                )}
                {st.input != null && (
                  <pre className={`${PRE} max-h-[140px] text-app-accent`}>{pretty(st.input, 400)}</pre>
                )}
                {st.observation != null && (
                  <pre className={`${PRE} ${isError ? 'text-app-danger' : 'text-app-muted'}`}>
                    <span className="text-app-muted/70">{t.observation} · </span>{pretty(st.observation, 800)}
                  </pre>
                )}
              </div>
            );
          })}

          {/* Final answer */}
          {result.answer != null && (
            <div className="rounded-2xl border border-app-success/30 bg-app-success/5 p-4">
              <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-app-success">{t.final}</div>
              <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-app-text">{result.answer}</div>
            </div>
          )}

          {/* Plans Agent G signed: each runs only on its own Start (nothing ran yet). */}
          {result.browserQuote && <PlanStartCard key={`b-${result.browserQuote.token.slice(-12)}`} kind="browser" plan={result.browserQuote} locale={locale} />}
          {result.codeQuote && <PlanStartCard key={`c-${result.codeQuote.token.slice(-12)}`} kind="code" plan={result.codeQuote} locale={locale} />}

          {/* Status footer */}
          {stopBadge && (
            <div className="mt-1 flex items-center gap-2 text-[12.5px] text-app-muted">
              <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${stopBadge.dot}`} />
              {stopBadge.text} · {t.toolCalls(result.steps.filter((s) => s.tool).length)}
              <button
                type="button"
                onClick={() => { setResult(null); setGoal(''); }}
                className="ml-auto rounded-full border border-app-border px-3 py-1 text-[12px] text-app-muted transition hover:text-app-text"
              >
                {t.newRun}
              </button>
            </div>
          )}
        </section>
      )}

      <style>{`.ag-pulse{animation:agpulse 1s steps(2) infinite}@keyframes agpulse{50%{opacity:0.2}}@media (prefers-reduced-motion:reduce){.ag-pulse{animation:none}}`}</style>
      {embedded ? (
        onExit ? (
          <button type="button" onClick={onExit} className="absolute right-3 top-2 text-[13px] text-app-muted hover:text-app-text">✕ {t.close}</button>
        ) : null
      ) : (
        <a href={`/${locale}/dashboard`} className="fixed right-[18px] top-4 text-[13px] text-app-muted no-underline hover:text-app-text">✕ {t.close}</a>
      )}
    </main>
  );
}
