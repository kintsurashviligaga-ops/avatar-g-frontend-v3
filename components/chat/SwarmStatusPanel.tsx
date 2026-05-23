'use client';

/**
 * SwarmStatusPanel — real-time agentic-swarm progress, driven by the live
 * client EventBroker. Subscribes to every pipeline topic and folds them
 * through the pure pipeline-stages reducer into six elegant rows.
 *
 * Resilience: a connectivity heartbeat (navigator.onLine + an online/offline
 * listener) shows a reconnect indicator when the network drops; the last
 * known progress stays on screen so a blip never blanks the panel.
 *
 * Design: elevated charcoal surface on the black chat base, restrained
 * indigo accent only on the active stage, framer-motion row + bar easing.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, AlertTriangle, Circle, Wifi, WifiOff } from 'lucide-react';
import { getBroker } from '@/lib/orchestrator/broker-instance';
import { PIPELINE_TOPICS, type PipelineEvent } from '@/lib/orchestrator/events';
import {
  applyEvent,
  initialProgress,
  STAGE_ORDER,
  stageLabel,
  type PipelineProgress,
  type StageStatus,
} from '@/lib/orchestrator/pipeline-stages';

type Lang = 'ka' | 'en' | 'ru';

export default function SwarmStatusPanel({ locale, pipelineId }: { locale: Lang; pipelineId: string }) {
  const [progress, setProgress] = useState<PipelineProgress>(() => initialProgress(pipelineId));
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const pidRef = useRef(pipelineId);
  pidRef.current = pipelineId;

  // Reset when a new pipeline starts.
  useEffect(() => { setProgress(initialProgress(pipelineId)); }, [pipelineId]);

  // Subscribe to every topic; only fold events for the active pipeline.
  useEffect(() => {
    const broker = getBroker();
    const offs = PIPELINE_TOPICS.map(topic =>
      broker.subscribe(topic, (e: PipelineEvent) => {
        if (e.pipelineId !== pidRef.current) return;
        setProgress(prev => applyEvent(prev, e));
      }),
    );
    return () => { offs.forEach(off => off()); };
  }, []);

  // Connectivity heartbeat.
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Cross-device SSE bridge — folds remote lifecycle events (from the RunPod
  // callback) for THIS pipeline. Auto-reconnects with exponential backoff
  // so a tab freeze / network blip never strands the panel.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/pipeline/stream?pipelineId=${encodeURIComponent(pipelineId)}`);
      es.onopen = () => { retry = 0; setOnline(true); };
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { topic?: string; pipelineId?: string; payload?: Record<string, unknown> };
          if (!data.topic || data.pipelineId !== pidRef.current) return;
          setProgress(prev => applyEvent(prev, {
            topic: data.topic as PipelineEvent['topic'],
            pipelineId: pidRef.current,
            ts: Date.now(),
            payload: (data.payload ?? {}) as PipelineEvent['payload'],
          }));
        } catch { /* ignore malformed frame */ }
      };
      es.onerror = () => {
        es?.close();
        if (closed) return;
        // Exponential backoff: 1s, 2s, 4s … capped at 15s.
        const delay = Math.min(15_000, 1000 * 2 ** retry);
        retry += 1;
        timer = setTimeout(connect, delay);
      };
    };
    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [pipelineId]);

  const overall = useMemo(() => {
    const done = STAGE_ORDER.filter(id => progress.stages[id]?.status === 'done').length;
    return Math.round((done / STAGE_ORDER.length) * 100);
  }, [progress]);

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-[#16181d] to-[#101216] border border-white/[0.06]">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <span className="text-[12px] font-semibold text-white/90">
          {locale === 'ka' ? 'სვარმის სტატუსი' : locale === 'ru' ? 'Статус сворма' : 'Swarm status'}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-white/45 tabular-nums">{overall}%</span>
          {online ? (
            <Wifi size={13} className="text-emerald-400/80" />
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-amber-300">
              <WifiOff size={13} className="animate-pulse" />
              {locale === 'ka' ? 'ხელახლა დაკავშირება…' : locale === 'ru' ? 'переподключение…' : 'reconnecting…'}
            </span>
          )}
        </span>
      </div>

      <div className="px-3.5 pb-3 space-y-1.5">
        {STAGE_ORDER.map(id => {
          const st = progress.stages[id]!;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2.5"
            >
              <StatusIcon status={st.status} />
              <span className={`flex-1 text-[12px] ${st.status === 'idle' ? 'text-white/40' : 'text-white/85'}`}>
                {stageLabel(id, locale)}
              </span>
              {typeof st.progress === 'number' && st.status === 'active' && (
                <span className="text-[10px] text-indigo-300 tabular-nums">{Math.round(st.progress * 100)}%</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* overall bar */}
      <div className="h-1 bg-white/[0.06]">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-400 to-blue-600"
          animate={{ width: `${overall}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <AnimatePresence>
        {progress.failed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="px-3.5 py-2 text-[11px] text-rose-300"
          >
            {locale === 'ka' ? 'პაიპლაინი შეჩერდა — კრედიტები დაბრუნდა.' : locale === 'ru' ? 'Пайплайн остановлен — кредиты возвращены.' : 'Pipeline halted — credits refunded.'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === 'done') return <Check size={14} className="text-emerald-400" />;
  if (status === 'active') return <Loader2 size={14} className="text-indigo-300 animate-spin" />;
  if (status === 'failed') return <AlertTriangle size={14} className="text-rose-400" />;
  return <Circle size={13} className="text-white/25" />;
}
