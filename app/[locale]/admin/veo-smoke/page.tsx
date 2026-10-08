'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Owner-only page for the one paid Veo test (GCP Part 0 "INFERENCE VERIFIED"): quote → confirm → submit → poll → play.
 * The API (/api/admin/veo-smoke) does the gating; this page is only the button the owner presses.
 */
interface Quote {
  ready?: boolean;
  model?: string;
  durationSec?: number;
  resolution?: string;
  estimateUsd?: number;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; operation: string; startedAt: number }
  | { kind: 'done'; url: string; gcsUri: string; seconds: number }
  | { kind: 'error'; message: string };

const POLL_MS = 10_000;
const POLL_LIMIT_MS = 30 * 60_000;
/** The submitted operation survives a reload, so polling resumes and the paid button stays locked until it settles. */
const PENDING_KEY = 'veo-smoke-pending';

function readPending(): { operation: string; startedAt: number } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? 'null');
    return v && typeof v.operation === 'string' && typeof v.startedAt === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writePending(v: { operation: string; startedAt: number } | null): void {
  try {
    if (v) window.localStorage.setItem(PENDING_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode: the in-memory phase still works */
  }
}

export default function VeoSmokePage() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/admin/veo-smoke', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((q: Quote) => setQuote(q))
      .catch((e: Error) => setPhase({ kind: 'error', message: `admin access needed (${e.message})` }));
    const pending = readPending();
    if (pending) {
      setPhase({ kind: 'polling', ...pending });
      poll(pending.operation, pending.startedAt, 0);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount; poll only reads its arguments
  }, []);

  const poll = (operation: string, startedAt: number, delay = POLL_MS) => {
    timer.current = setTimeout(async () => {
      const now = Date.now();
      setElapsed(Math.round((now - startedAt) / 1000));
      try {
        const r = await fetch(`/api/admin/veo-smoke?op=${encodeURIComponent(operation)}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.state === 'processing' && now - startedAt < POLL_LIMIT_MS) return poll(operation, startedAt);
        if (j.state !== 'processing') writePending(null);
        if (j.state === 'succeeded') return setPhase({ kind: 'done', url: j.url, gcsUri: j.gcsUri, seconds: Math.round((now - startedAt) / 1000) });
        setPhase({ kind: 'error', message: `${j.state}${j.reason ? `: ${j.reason}` : ''} — operation ${operation}` });
      } catch (e) {
        // A network blip is not the job's outcome: keep asking, the paid button stays locked meanwhile.
        if (now - startedAt < POLL_LIMIT_MS) return poll(operation, startedAt);
        setPhase({ kind: 'error', message: `${(e as Error).message} — operation ${operation}` });
      }
    }, delay);
  };

  const run = async () => {
    const price = quote?.estimateUsd != null ? `$${quote.estimateUsd.toFixed(2)}` : 'paid';
    if (!window.confirm(`ერთი ფასიანი Veo კლიპი (${price}), Vertex AI-ზე. გავუშვა?`)) return;
    setPhase({ kind: 'submitting' });
    const r = await fetch('/api/admin/veo-smoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'paid-test' }),
    }).catch((e: Error) => e);
    if (r instanceof Error) return setPhase({ kind: 'error', message: r.message });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return setPhase({ kind: 'error', message: `HTTP ${r.status} ${j.error ?? ''} ${j.reason ?? ''} ${j.detail ?? ''}`.trim() });
    const startedAt = Date.now();
    writePending({ operation: j.operation, startedAt });
    setPhase({ kind: 'polling', operation: j.operation, startedAt });
    poll(j.operation, startedAt);
  };

  const busy = phase.kind === 'submitting' || phase.kind === 'polling';
  return (
    <div className="min-h-screen bg-transparent py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-6 text-white">
        <h1 className="text-2xl font-semibold">Veo — ფასიანი ტესტი (Vertex AI)</h1>
        <p className="text-white/70 text-sm">
          ერთი კლიპი: {quote?.model ?? '…'}, {quote?.durationSec ?? '…'} წმ, {quote?.resolution ?? '…'}, ხმით. ფასი ≈{' '}
          {quote?.estimateUsd != null ? `$${quote.estimateUsd.toFixed(2)}` : '…'}. Transport: {quote?.ready ? 'vertex (pinned)' : 'NOT READY'}.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={busy || phase.kind === 'done' || !quote?.ready}
          className="rounded-lg bg-blue-600 px-5 py-3 font-medium disabled:opacity-40"
          data-testid="veo-smoke-run"
        >
          ტესტის გაშვება
        </button>
        {phase.kind === 'submitting' && <p>იგზავნება…</p>}
        {phase.kind === 'polling' && (
          <p>
            Veo ამზადებს კლიპს… {elapsed} წმ <span className="block text-white/50 text-xs break-all">{phase.operation}</span>
          </p>
        )}
        {phase.kind === 'error' && <p className="text-red-400 break-all">{phase.message}</p>}
        {phase.kind === 'done' && (
          <div className="space-y-2">
            <p className="text-green-400">INFERENCE OK — {phase.seconds} წმ</p>
            <video src={phase.url} controls autoPlay className="w-full rounded-lg" />
            <p className="text-white/60 text-xs break-all">{phase.gcsUri}</p>
          </div>
        )}
      </div>
    </div>
  );
}
