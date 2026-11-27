'use client';

/**
 * Music Producer panel (Phase 8.5 PR B): the controls, a one-line summary with the exact price on the Create button, and
 * the Music Cards of this session. Talks only to /api/music/producer (+ /quote); `post` is injected so tests mock it.
 * A failed track shows "Your credits were returned" only because nothing was charged (charge happens after delivery).
 */
import { useEffect, useRef, useState } from 'react';
import { ProducerControls } from './ProducerControls';
import { MusicCard, type MusicCardTrack } from './MusicCard';
import { UseInVideoSheet } from './UseInVideoSheet';
import type { montageHandoff } from '@/lib/music/producer/placement';
import { DEFAULT_SPEC, parseProducerSpec, type ProducerLang, type ProducerSpec } from '@/lib/music/producer/spec';
import { quoteProducer, type ProducerBook } from '@/lib/music/producer/price';
import { specSummary } from '@/lib/music/producer/brief';
import { LABELS } from '@/lib/music/producer/labels';
import type { ProducerRequest } from '@/lib/music/producer/request';

export type ProducerPost = (path: string, body: unknown) => Promise<{ ok: boolean; status: number; json: Record<string, unknown> }>;

export const fetchPost: ProducerPost = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

const T = {
  create: { ka: 'შექმნა', en: 'Create', ru: 'Создать' },
  working: { ka: 'იქმნება…', en: 'Composing…', ru: 'Создаётся…' },
  low: { ka: 'კრედიტი არ კმარა.', en: 'Not enough credits.', ru: 'Недостаточно кредитов.' },
  composing: { ka: 'სიმღერა იქმნება — ეს ერთ წუთამდე გრძელდება.', en: 'Your song is being composed. This takes up to a minute.', ru: 'Песня создаётся. Это занимает до минуты.' },
} as const;

export function MusicProducerPanel({ lang, book = 'today', post = fetchPost, onOpenMontage, initialSpec }: {
  lang: ProducerLang;
  book?: ProducerBook;
  post?: ProducerPost;
  onOpenMontage?: (handoff: ReturnType<typeof montageHandoff>) => void;
  initialSpec?: ProducerSpec;
}) {
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [spec, setSpec] = useState<ProducerSpec>(initialSpec ?? { ...DEFAULT_SPEC, vocals: true });
  const [tracks, setTracks] = useState<MusicCardTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = parseProducerSpec(spec);
  const price = quoteProducer('generate', spec.lengthSec, book).credits;
  const extendCredits = quoteProducer('extend', 30, book).credits;

  // A ref, not only `busy`: two taps in the same frame must never start two paid runs.
  const inFlight = useRef(false);
  // On a phone the Create button sits at the bottom of a long form: bring the progress card into view.
  const composingRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (busy) composingRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [busy]);

  const send = async (request: ProducerRequest) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const r = await post('/api/music/producer', request);
      const j = r.json as { ok?: boolean; id?: string; url?: string; meta?: MusicCardTrack['meta']; error?: string; message?: string };
      if (r.ok && j.ok && j.id && j.url && j.meta) setTracks((t) => [{ id: j.id as string, url: j.url as string, meta: j.meta as MusicCardTrack['meta'] }, ...t]);
      else if (j.error === 'insufficient_credits') setError(T.low[lang]);
      else if (j.error === 'provider_unavailable') setError(LABELS.refunded[lang]);
      else setError(j.message || LABELS.refunded[lang]);
    } catch {
      setError(LABELS.refunded[lang]);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section data-testid="mp-panel" data-ui-surface className="mx-auto max-w-3xl space-y-4 px-4">
      <ProducerControls value={spec} onChange={setSpec} book={book} lang={lang} />
      <div className="flex items-center justify-between gap-3">
        <p data-testid="mp-summary" className="truncate text-[13px] text-app-muted">{specSummary(spec, lang)}</p>
        <button type="button" data-testid="mp-create" disabled={busy || !check.ok} aria-busy={busy}
          onClick={() => check.ok && send({ action: 'generate', spec: check.spec })}
          className="shrink-0 rounded-full bg-app-accent px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-app-accent/25 transition disabled:opacity-40">
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              {T.working[lang]}
            </span>
          ) : `${T.create[lang]} · ✦${price}`}
        </button>
      </div>
      {!check.ok && <p data-testid="mp-invalid" className="text-[12px] text-app-muted">{check.errors[0]}</p>}
      {error && <p role="alert" data-testid="mp-error" className="rounded-xl border border-app-danger/30 bg-app-danger/10 px-3 py-2 text-[13px] text-app-danger">{error}</p>}
      <div className="space-y-3">
        {busy && (
          <div ref={composingRef} data-testid="mp-composing" role="status" aria-live="polite" className="ag-shimmer rounded-2xl border border-app-border/10 bg-app-elevated/60 p-4">
            <p className="text-[13px] text-app-muted">{T.composing[lang]}</p>
            <div aria-hidden className="mt-3 flex h-10 items-end gap-1">
              {Array.from({ length: 32 }, (_, i) => (
                <span key={i} className="w-1 flex-1 rounded-full bg-app-text/10" style={{ height: `${30 + ((i * 37) % 70)}%` }} />
              ))}
            </div>
          </div>
        )}
        {tracks.map((t) => (
          <MusicCard key={t.id} track={t} lang={lang} busy={busy} extendCredits={extendCredits}
            restyleCredits={quoteProducer('restyle', t.meta.spec.lengthSec, book).credits}
            onExtend={(id) => send({ action: 'extend', parentId: id })}
            onRestyle={(id, style) => send({ action: 'restyle', parentId: id, style })}
            onUseInVideo={() => setSheetFor((cur) => (cur === t.id ? null : t.id))}
            footer={sheetFor === t.id ? <UseInVideoSheet track={t} lang={lang} post={post} onClose={() => setSheetFor(null)} onOpenMontage={onOpenMontage} /> : null} />
        ))}
      </div>
    </section>
  );
}
