'use client';

/**
 * AdminSystemPanel — admin-only infrastructure telemetry overlay.
 *
 * Consumes GET /api/health/config. The server returns the full `integrations`
 * array ONLY to admins (ADMIN_EMAILS) / local dev; everyone else gets a coarse
 * { ready } with no integration list. So the panel infers admin purely from the
 * shape of the response — non-admins render nothing. Marine-themed, live-pollable
 * so the founder can watch backends flip from fail-open → live as console
 * switches are thrown. No secret values are ever transported (presence only).
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { IntegrationAudit } from '@/lib/orchestrator/config-audit';

interface ConfigResponse {
  ready: boolean;
  liveCount?: number;
  total?: number;
  hardMissing?: string[];
  degraded?: string[];
  integrations?: IntegrationAudit[];
}

const DOT: Record<string, string> = {
  live: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]',
  degraded: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.75)]',
  missing: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.75)]',
};
const STATUS_LABEL: Record<string, string> = { live: 'live', degraded: 'degraded', missing: 'fail-open' };

export function AdminSystemPanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health/config', { cache: 'no-store', credentials: 'include' });
      if (res.ok) setData((await res.json()) as ConfigResponse);
    } catch {
      /* ignore — diagnostics must never throw into the chat */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const integrations = data?.integrations ?? [];
  // Admin gate: only admins receive the integrations array from the server.
  if (!enabled || integrations.length === 0) return null;

  const ready = data?.ready === true;
  const liveCount = data?.liveCount ?? integrations.filter((i) => i.status === 'live').length;
  const total = data?.total ?? integrations.length;
  // Surface the four backends the founder is actively flipping, first.
  const PRIORITY = ['upstash', 'supabase', 'runpod', 'gemini'];
  const ordered = [...integrations].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.id); const bi = PRIORITY.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <>
      {/* Floating admin trigger — bottom-left, clear of the composer controls. */}
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        aria-label="Infrastructure status"
        className="fixed bottom-3 left-3 z-40 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-sky-400/30 bg-black/70 backdrop-blur-md text-[11px] font-semibold text-sky-200 hover:border-sky-300/50 hover:bg-black/90 transition active:scale-95 shadow-[0_0_18px_-6px_rgba(56,189,248,0.6)]"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${ready ? DOT.live : DOT.degraded}`} />
        <Activity size={12} /> System
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 24, scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-sky-400/20 bg-[#05080d] p-5 shadow-[0_24px_80px_-24px_rgba(56,189,248,0.5)] max-h-[82vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="inline-flex items-center gap-2 text-[15px] font-bold text-white">
                  {ready ? <ShieldCheck size={17} className="text-emerald-400" /> : <ShieldAlert size={17} className="text-amber-400" />}
                  Infrastructure Status
                </span>
                <span className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void load()} aria-label="Refresh" className="h-7 w-7 rounded-full flex items-center justify-center text-sky-200/70 hover:text-white hover:bg-white/[0.08] transition active:scale-90">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="h-7 w-7 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition active:scale-90">
                    <X size={15} />
                  </button>
                </span>
              </div>

              {/* Readiness summary */}
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ready ? DOT.live : DOT.degraded}`} />
                  {ready ? 'READY' : 'DEGRADED'}
                </span>
                <span className="text-[12px] text-white/55 tabular-nums">{liveCount}/{total} live</span>
              </div>

              {/* Integration rows */}
              <div className="space-y-1.5">
                {ordered.map((i) => (
                  <div key={i.id} className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${DOT[i.status] ?? DOT.missing}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-white truncate">{i.label}</span>
                        {!i.failOpen && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">required</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-white/45 leading-relaxed mt-0.5">{i.effect}</span>
                    </span>
                    <span className={`text-[11px] font-semibold flex-shrink-0 mt-0.5 ${i.status === 'live' ? 'text-emerald-300' : i.status === 'degraded' ? 'text-amber-300' : 'text-rose-300'}`}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[11px] text-white/35 leading-relaxed">
                Presence-only telemetry — no secret values are transported. Flip a backend in your cloud console, then tap refresh to watch it go live.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
