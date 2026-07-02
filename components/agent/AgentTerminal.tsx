'use client';

/**
 * Agent Terminal — STEP 3 dashboard UI.
 *
 * Drives POST /api/agent/run and renders the ReAct trace (Thought → Action → Observation → Final)
 * as a console. The loop is always bounded + terminal server-side, so the UI just reflects the
 * returned steps. Social publishing is prepare-only end-to-end — the UI surfaces that explicitly.
 */
import { useEffect, useState } from 'react';

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
}

const SUGGESTIONS = [
  'Research 2026 Georgian coffee-shop marketing trends and summarize 3 hooks.',
  'Prepare an Instagram caption for a weekend discount on our skincare line.',
  'Draft a 6-second vertical video brief for a new energy drink launch.',
];

const TOOL_META: Record<string, { label: string; color: string }> = {
  web_search: { label: 'web search', color: '#0ea5e9' },
  scrape_webpage: { label: 'scrape page', color: '#22d3ee' },
  prepare_instagram_post: { label: 'prepare post ⛔', color: '#a855f7' },
  orchestrate_media: { label: 'orchestrate media', color: '#f97316' },
};

function pretty(v: unknown, max = 1200): string {
  if (v == null) return '';
  let s: string;
  try { s = typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { s = String(v); }
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}

const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', borderRadius: 14 };
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

// `embedded` = mounted in-place inside the main /dashboard window (ServiceHub → ChatChrome),
// where the shell already owns the top bar + scroll. Standalone (route) is the fallback.
export default function AgentTerminal({ locale, embedded = false, onExit }: { locale: string; embedded?: boolean; onExit?: () => void }) {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const body = await res.json();
      if (res.status === 401) { setError('Please sign in to run the agent.'); return; }
      if (!res.ok && res.status !== 502) { setError(body?.error || `Request failed (${res.status})`); return; }
      setResult(body as RunResult);
    } catch {
      setError('Network error — the agent could not be reached.');
    } finally {
      setRunning(false);
    }
  }

  const stopBadge = result && ({
    final: { text: 'completed', color: '#10b981' },
    max_steps: { text: 'stopped at step limit', color: '#f59e0b' },
    llm_error: { text: 'model unavailable', color: '#ef4444' },
  } as const)[result.stopReason];

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 72px', color: '#fff', minHeight: embedded ? '100%' : '100vh' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: running ? '#f59e0b' : '#10b981', boxShadow: `0 0 10px ${running ? '#f59e0b' : '#10b981'}` }} />
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Agent Terminal</h1>
        </div>
        <p style={{ marginTop: 6, fontSize: 13.5, color: 'rgba(255,255,255,0.5)' }}>
          An autonomous agent that researches, prepares, and orchestrates your marketing media. It reasons step by step —
          you see every Thought, Action, and Observation. Social posts are <strong style={{ color: 'rgba(255,255,255,0.75)' }}>prepared, never published</strong>.
        </p>
      </header>

      {/* Goal input */}
      <div style={{ ...card, padding: 14, marginBottom: 14 }}>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(goal); }}
          placeholder="Give the agent a goal… (⌘/Ctrl + Enter to run)"
          rows={3}
          disabled={running}
          style={{ width: '100%', resize: 'vertical', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15, lineHeight: 1.5, fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{goal.length}/2000</span>
          <button
            onClick={() => run(goal)}
            disabled={running || !goal.trim()}
            style={{
              padding: '9px 20px', borderRadius: 999, border: 'none', fontSize: 13.5, fontWeight: 600,
              color: '#fff', cursor: running || !goal.trim() ? 'default' : 'pointer',
              opacity: running || !goal.trim() ? 0.5 : 1,
              background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)', boxShadow: '0 6px 18px -6px rgba(124,58,237,0.6)',
            }}
          >
            {running ? 'Running…' : 'Run agent'}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {!result && !running && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setGoal(s); run(s); }}
              style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.7)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ ...card, padding: 14, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#fca5a5', fontSize: 13.5, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {running && (
        <div style={{ ...card, padding: 16, fontFamily: mono, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
          <span className="ag-pulse">▍</span> agent is reasoning…
        </div>
      )}

      {/* Trace */}
      {result && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.steps.map((st, i) => {
            if (st.final != null && st.tool == null) return null; // final rendered below
            const meta = st.tool ? TOOL_META[st.tool] ?? { label: st.tool, color: '#94a3b8' } : null;
            const isError = st.observation != null && typeof st.observation === 'object' && 'error' in (st.observation as object);
            return (
              <div key={i} style={{ ...card, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: st.thought ? 8 : 0 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>#{i + 1}</span>
                  {meta && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', color: meta.color, background: `${meta.color}18`, padding: '3px 9px', borderRadius: 999 }}>
                      {meta.label}
                    </span>
                  )}
                </div>
                {st.thought && (
                  <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.78)', marginBottom: 10, lineHeight: 1.5 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>thought · </span>{st.thought}
                  </div>
                )}
                {st.input != null && (
                  <pre style={{ margin: 0, fontFamily: mono, fontSize: 12, color: '#93c5fd', background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 140 }}>{pretty(st.input, 400)}</pre>
                )}
                {st.observation != null && (
                  <pre style={{ margin: '8px 0 0', fontFamily: mono, fontSize: 12, color: isError ? '#fca5a5' : 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 200 }}>
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>observation · </span>{pretty(st.observation, 800)}
                  </pre>
                )}
              </div>
            );
          })}

          {/* Final answer */}
          {result.answer != null && (
            <div style={{ ...card, padding: 16, borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#34d399', letterSpacing: '0.04em', marginBottom: 8 }}>FINAL</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.92)', whiteSpace: 'pre-wrap' }}>{result.answer}</div>
            </div>
          )}

          {/* Status footer */}
          {stopBadge && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: stopBadge.color }} />
              {stopBadge.text} · {result.steps.filter((s) => s.tool).length} tool call(s)
              <button onClick={() => { setResult(null); setGoal(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', padding: '5px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>
                New run
              </button>
            </div>
          )}
        </section>
      )}

      <style>{`.ag-pulse{animation:agpulse 1s steps(2) infinite}@keyframes agpulse{50%{opacity:0.2}}`}</style>
      {embedded ? (
        onExit ? (
          <button type="button" onClick={onExit} style={{ position: 'absolute', top: 8, right: 12, fontSize: 13, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕ Close</button>
        ) : null
      ) : (
        <a href={`/${locale}/dashboard`} style={{ position: 'fixed', top: 16, right: 18, fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>✕ Close</a>
      )}
    </main>
  );
}
