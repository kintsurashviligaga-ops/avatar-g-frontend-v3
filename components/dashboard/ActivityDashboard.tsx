'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type Kind = 'image' | 'video' | 'audio' | 'avatar' | 'text' | 'code';

interface Creation {
  id: string;
  kind: Kind;
  service: string;
  title?: string | null;
  prompt?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  credits_used: number;
  created_at: string;
}

interface ApiResponse {
  creations: Creation[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface ActivityDashboardProps {
  userId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KIND_EMOJI: Record<Kind, string> = {
  image: '🎨',
  video: '🎬',
  audio: '🎵',
  avatar: '🧑',
  text: '📝',
  code: '💻',
};

const KIND_LABEL: Record<Kind, string> = {
  image: 'სურათი',
  video: 'ვიდეო',
  audio: 'აუდიო',
  avatar: 'ავატარი',
  text: 'ტექსტი',
  code: 'კოდი',
};

const KIND_COLOR: Record<Kind, string> = {
  image: '#a78bfa',
  video: '#22d3ee',
  audio: '#34d399',
  avatar: '#00d4ff',
  text: '#fbbf24',
  code: '#60a5fa',
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them',
  'make', 'create', 'generate', 'get', 'like', 'just', 'very', 'so', 'if', 'not',
  'შექმნა', 'გენერაცია', 'და', 'ის', 'ეს', 'მე', 'თქვენ', 'ჩვენ', 'გააკეთე',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ახლახანს';
  if (min < 60) return `${min} წ. წინ`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} სთ. წინ`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} დ. წინ`;
  const months = Math.floor(days / 30);
  return `${months} თვ. წინ`;
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function topWords(creations: Creation[], topN = 12): Array<{ word: string; count: number }> {
  const freq: Record<string, number> = {};
  for (const c of creations) {
    if (!c.prompt) continue;
    const words = c.prompt
      .toLowerCase()
      .replace(/[^a-zა-ჿ\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of words) {
      freq[w] = (freq[w] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

function getDaysActive(creations: Creation[]): number {
  const days = new Set(creations.map(c => c.created_at.slice(0, 10)));
  return days.size;
}

function getMostUsedService(creations: Creation[]): string {
  if (!creations.length) return '—';
  const freq: Record<string, number> = {};
  for (const c of creations) {
    freq[c.service] = (freq[c.service] ?? 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-xl animate-pulse ${className ?? ''}`}
      style={{ background: 'rgba(255,255,255,0.06)' }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      {/* Recent + words row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}
      className="relative flex flex-col gap-1.5 overflow-hidden p-4"
    >
      {/* Accent glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 60,
          height: 60,
          borderRadius: '0 16px 0 60px',
          background: `${color}18`,
          pointerEvents: 'none',
        }}
      />
      <span className="text-xl leading-none">{icon}</span>
      <p className="mt-1 font-mono text-xl font-bold leading-none text-white">
        {value}
      </p>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {label}
      </p>
    </motion.div>
  );
}

function KindBarChart({ creations, delay = 0 }: { creations: Creation[]; delay?: number }) {
  const counts = useMemo(() => {
    const map: Partial<Record<Kind, number>> = {};
    for (const c of creations) {
      map[c.kind] = (map[c.kind] ?? 0) + 1;
    }
    return map;
  }, [creations]);

  const maxVal = Math.max(...Object.values(counts), 1);
  const kinds: Kind[] = ['image', 'video', 'audio', 'avatar', 'text', 'code'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}
      className="p-5"
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        სახეობის მიხედვით
      </p>
      <div className="space-y-3">
        {kinds.map((kind) => {
          const count = counts[kind] ?? 0;
          const pct = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;
          return (
            <div key={kind} className="flex items-center gap-3">
              <span className="w-5 text-center text-base leading-none">{KIND_EMOJI[kind]}</span>
              <span className="w-14 text-[11px] font-medium text-white/60">{KIND_LABEL[kind]}</span>
              <div className="relative flex-1 overflow-hidden rounded-full" style={{ height: 7, background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, delay: delay + 0.1, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: '100%',
                    borderRadius: 9999,
                    background: KIND_COLOR[kind],
                    boxShadow: `0 0 8px ${KIND_COLOR[kind]}80`,
                  }}
                />
              </div>
              <span className="w-6 text-right font-mono text-[11px] text-white/50">{count}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function CreditUsageBar({ creations, delay = 0 }: { creations: Creation[]; delay?: number }) {
  const usage = useMemo(() => {
    const buckets: { image: number; video: number; audio: number; other: number } = { image: 0, video: 0, audio: 0, other: 0 };
    for (const c of creations) {
      if (c.kind === 'image') buckets.image += c.credits_used;
      else if (c.kind === 'video') buckets.video += c.credits_used;
      else if (c.kind === 'audio') buckets.audio += c.credits_used;
      else buckets.other += c.credits_used;
    }
    return buckets;
  }, [creations]);

  const total = Object.values(usage).reduce((a, b) => a + b, 0);

  const segments = [
    { key: 'image', label: '🎨 სურათი', color: '#a78bfa' },
    { key: 'video', label: '🎬 ვიდეო', color: '#22d3ee' },
    { key: 'audio', label: '🎵 აუდიო', color: '#34d399' },
    { key: 'other', label: '📦 სხვა', color: '#60a5fa' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}
      className="p-5"
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        კრედიტების განაწილება
      </p>

      {/* Stacked bar */}
      {total > 0 ? (
        <>
          <div className="flex h-6 w-full overflow-hidden rounded-full" style={{ gap: 2 }}>
            {segments.map(({ key, color }) => {
              const pct = total > 0 ? (usage[key as keyof typeof usage] / total) * 100 : 0;
              if (pct < 1) return null;
              return (
                <motion.div
                  key={key}
                  initial={{ flex: 0 }}
                  animate={{ flex: pct }}
                  transition={{ duration: 0.8, delay: delay + 0.15, ease: [0.16, 1, 0.3, 1] }}
                  style={{ background: color, minWidth: 0 }}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {segments.map(({ key, label, color }) => {
              const val = usage[key as keyof typeof usage];
              if (!val) return null;
              const pct = Math.round((val / total) * 100);
              return (
                <div key={key} className="flex items-center gap-2">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span className="text-[11px] text-white/55">{label}</span>
                  <span className="ml-auto font-mono text-[11px] text-white/70">{pct}%</span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            <span className="text-[11px] text-white/40">სულ გამოყენებული:</span>
            <span className="font-mono text-[13px] font-bold" style={{ color: '#00d4ff' }}>{total.toLocaleString()}</span>
            <span className="text-[11px] text-white/40">კრედიტი</span>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-white/30">კრედიტები ჯერ არ გამოყენებულა</p>
      )}
    </motion.div>
  );
}

function RecentActivity({ creations, delay = 0 }: { creations: Creation[]; delay?: number }) {
  const recent = creations.slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}
      className="p-5"
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        ბოლო აქტივობა
      </p>
      <div className="space-y-2">
        {recent.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: delay + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-start gap-3 rounded-xl p-2.5 transition-colors"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
          >
            {/* Icon */}
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-base leading-none"
              style={{ background: `${KIND_COLOR[c.kind]}18`, border: `1px solid ${KIND_COLOR[c.kind]}30` }}
            >
              {KIND_EMOJI[c.kind]}
            </div>

            {/* Body */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: KIND_COLOR[c.kind] }}
                >
                  {c.service}
                </span>
                {c.credits_used > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
                    style={{
                      background: 'rgba(0,212,255,0.12)',
                      color: '#00d4ff',
                      border: '1px solid rgba(0,212,255,0.2)',
                    }}
                  >
                    -{c.credits_used}
                  </span>
                )}
                <span className="ml-auto flex-shrink-0 text-[10px] text-white/30">{timeAgo(c.created_at)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-white/50">{truncate(c.prompt ?? c.title, 60)}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TopWords({ creations, delay = 0 }: { creations: Creation[]; delay?: number }) {
  const words = useMemo(() => topWords(creations), [creations]);
  const maxCount = words[0]?.count ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}
      className="p-5"
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        ხშირი სიტყვები პრომფტებში
      </p>

      {words.length === 0 ? (
        <p className="text-[12px] text-white/30">პრომფტები ჯერ არ გაქვს</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {words.map(({ word, count }, i) => {
            const intensity = count / maxCount; // 0.2 – 1
            const size = Math.round(10 + intensity * 6); // 10–16px
            const opacity = 0.4 + intensity * 0.6;
            return (
              <motion.span
                key={word}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: delay + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="cursor-default rounded-lg px-2.5 py-1 font-medium transition-colors"
                style={{
                  fontSize: size,
                  opacity,
                  background: 'rgba(2,132,199,0.12)',
                  border: '1px solid rgba(2,132,199,0.2)',
                  color: '#c4b5fd',
                }}
                title={`${count}x`}
              >
                {word}
              </motion.span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActivityDashboard({ userId: _userId }: ActivityDashboardProps) {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/creations?limit=50', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ApiResponse = await res.json();
        if (!cancelled) {
          setCreations(data.creations ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'შეცდომა');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalGenerations = creations.length;
  const totalCredits = useMemo(() => creations.reduce((s, c) => s + (c.credits_used ?? 0), 0), [creations]);
  const mostUsedService = useMemo(() => getMostUsedService(creations), [creations]);
  const daysActive = useMemo(() => getDaysActive(creations), [creations]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ minHeight: '100%', color: '#f0f0f5' }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6"
      >
        <h2
          className="text-xl font-bold tracking-tight text-white"
          style={{ fontFamily: 'var(--font-syne, system-ui)' }}
        >
          აქტივობა
        </h2>
        <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          თქვენი გენერაციების ანალიტიკა
        </p>
      </motion.div>

      {/* Loading */}
      {loading && <LoadingSkeleton />}

      {/* Error */}
      {!loading && error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <span className="text-3xl">⚠️</span>
          <p className="mt-3 text-sm font-medium text-red-400">მონაცემების ჩატვირთვა ვერ მოხერხდა</p>
          <p className="mt-1 text-[11px] text-white/30">{error}</p>
        </motion.div>
      )}

      {/* Empty state */}
      {!loading && !error && creations.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}
        >
          <motion.span
            className="text-5xl"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
          >
            ✨
          </motion.span>
          <p
            className="mt-4 text-base font-semibold text-white"
            style={{ fontFamily: 'var(--font-syne, system-ui)' }}
          >
            ჯერ გენერაცია არ გქვს — დაიწყე ახლა!
          </p>
          <p className="mt-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            გამოიყენე Agent G სურათების, ვიდეოების ან ტექსტის შესაქმნელად
          </p>
        </motion.div>
      )}

      {/* Dashboard content */}
      <AnimatePresence>
        {!loading && !error && creations.length > 0 && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="გენერაციები"
                value={totalGenerations}
                icon="⚡"
                color="#00d4ff"
                delay={0}
              />
              <StatCard
                label="კრედიტები"
                value={totalCredits.toLocaleString()}
                icon="💎"
                color="#a78bfa"
                delay={0.07}
              />
              <StatCard
                label="ძირ. სერვისი"
                value={mostUsedService}
                icon="🏆"
                color="#fbbf24"
                delay={0.14}
              />
              <StatCard
                label="აქტ. დღეები"
                value={daysActive}
                icon="📅"
                color="#34d399"
                delay={0.21}
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <KindBarChart creations={creations} delay={0.1} />
              <CreditUsageBar creations={creations} delay={0.15} />
            </div>

            {/* Timeline + Word cloud row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <RecentActivity creations={creations} delay={0.2} />
              <TopWords creations={creations} delay={0.25} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
