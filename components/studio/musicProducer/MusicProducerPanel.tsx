'use client';

/**
 * Music Producer panel (Phase 8.5 PR B): the controls, a one-line summary with the exact price on the Create button, and
 * the Music Cards of this session. Talks only to /api/music/producer (+ /quote); `post` is injected so tests mock it.
 * A failed track shows "Your credits were returned" only because nothing was charged (charge happens after delivery).
 */
import { useState } from 'react';
import { ProducerControls } from './ProducerControls';
import { MusicCard, type MusicCardTrack } from './MusicCard';
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
} as const;

export function MusicProducerPanel({ lang, book = 'today', post = fetchPost, onUseInVideo, initialSpec }: {
  lang: ProducerLang;
  book?: ProducerBook;
  post?: ProducerPost;
  onUseInVideo?: (t: MusicCardTrack) => void;
  initialSpec?: ProducerSpec;
}) {
  const [spec, setSpec] = useState<ProducerSpec>(initialSpec ?? { ...DEFAULT_SPEC, vocals: true });
  const [tracks, setTracks] = useState<MusicCardTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = parseProducerSpec(spec);
  const price = quoteProducer('generate', spec.lengthSec, book).credits;
  const extendCredits = quoteProducer('extend', 30, book).credits;

  const send = async (request: ProducerRequest) => {
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
      setBusy(false);
    }
  };

  return (
    <section data-testid="mp-panel" className="mx-auto max-w-3xl space-y-4 px-4">
      <ProducerControls value={spec} onChange={setSpec} book={book} lang={lang} />
      <div className="flex items-center justify-between gap-3">
        <p data-testid="mp-summary" className="truncate text-[13px] text-app-muted">{specSummary(spec, lang)}</p>
        <button type="button" data-testid="mp-create" disabled={busy || !check.ok}
          onClick={() => check.ok && send({ action: 'generate', spec: check.spec })}
          className="shrink-0 rounded-full bg-app-accent px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-app-accent/25 disabled:opacity-40">
          {busy ? T.working[lang] : `${T.create[lang]} · ✦${price}`}
        </button>
      </div>
      {!check.ok && <p data-testid="mp-invalid" className="text-[12px] text-app-muted">{check.errors[0]}</p>}
      {error && <p role="alert" data-testid="mp-error" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-[13px] text-red-200">{error}</p>}
      <div className="space-y-3">
        {tracks.map((t) => (
          <MusicCard key={t.id} track={t} lang={lang} busy={busy} extendCredits={extendCredits}
            restyleCredits={quoteProducer('restyle', t.meta.spec.lengthSec, book).credits}
            onExtend={(id) => send({ action: 'extend', parentId: id })}
            onRestyle={(id, style) => send({ action: 'restyle', parentId: id, style })}
            onUseInVideo={onUseInVideo} />
        ))}
      </div>
    </section>
  );
}
