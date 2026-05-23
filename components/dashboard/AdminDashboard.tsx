'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  overview: {
    totalCreations: number;
    totalCreditsUsed: number;
    totalUsers: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    errorRate: number;
    today: { count: number; credits: number };
  };
  kindBreakdown: Record<string, number>;
  dailyActivity: Array<{ date: string; count: number; credits: number }>;
}

const KIND_COLORS: Record<string, string> = {
  image: '#0ea5e9',
  video: '#3b82f6',
  audio: '#22d3ee',
  avatar: '#f59e0b',
  text: '#10b981',
  code: '#f97316',
};

const KIND_ICONS: Record<string, string> = {
  image: '🎨', video: '🎬', audio: '🎵', avatar: '🧑', text: '📝', code: '💻',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: color ?? '#fff', lineHeight: 1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{sub}</span>}
    </motion.div>
  );
}

function MiniBarChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
            transition={{ delay: i * 0.02, duration: 0.4 }}
            style={{
              width: '100%',
              borderRadius: '3px 3px 0 0',
              background: d.count > 0
                ? 'linear-gradient(to top, #0284c7, #0ea5e9)'
                : 'rgba(255,255,255,0.06)',
            }}
            title={`${d.date}: ${d.count}`}
          />
        </div>
      ))}
    </div>
  );
}

function KindBreakdownBar({ kinds }: { kinds: Record<string, number> }) {
  const total = Object.values(kinds).reduce((s, v) => s + v, 0);
  if (total === 0) return <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No data yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Object.entries(kinds)
        .sort(([, a], [, b]) => b - a)
        .map(([kind, count]) => {
          const pct = Math.round((count / total) * 100);
          const color = KIND_COLORS[kind] ?? '#0ea5e9';
          return (
            <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>{KIND_ICONS[kind] ?? '📦'}</span>
              <span style={{ width: 50, fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>{kind}</span>
              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ height: '100%', borderRadius: 4, background: color }}
                />
              </div>
              <span style={{ width: 36, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>{pct}%</span>
              <span style={{ width: 32, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{count}</span>
            </div>
          );
        })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/creations-stats', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setError('Access denied. Admin only.');
        return;
      }
      if (!res.ok) {
        setError('Failed to load stats.');
        return;
      }
      const data = await res.json() as AdminStats;
      setStats(data);
      setLastRefresh(new Date());
      setError(null);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStats();
    // Auto-refresh every 60s
    const t = setInterval(() => void fetchStats(), 60_000);
    return () => clearInterval(t);
  }, []);

  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(14,165,233,0.3)',
          borderTopColor: '#0ea5e9',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading admin stats...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const { overview, kindBreakdown, dailyActivity } = stats;
  const successRate = overview.totalTasks > 0
    ? Math.round((overview.completedTasks / overview.totalTasks) * 100)
    : 0;

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>
            🛡️ Admin Dashboard
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '4px 0 0' }}>
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchStats()}
          disabled={loading}
          style={{
            padding: '7px 14px',
            background: 'rgba(14,165,233,0.15)',
            border: '1px solid rgba(14,165,233,0.3)',
            borderRadius: 8,
            color: '#0ea5e9',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '↻ Loading...' : '↻ Refresh'}
        </button>
      </div>

      {/* Overview stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <StatCard label="Total Generations" value={overview.totalCreations} sub="all time" color="#0ea5e9" />
        <StatCard label="Total Users" value={overview.totalUsers} sub="registered" color="#22d3ee" />
        <StatCard label="Credits Used" value={overview.totalCreditsUsed.toLocaleString()} sub="all time" color="#f59e0b" />
        <StatCard label="Today" value={overview.today.count} sub={`${overview.today.credits} credits`} color="#10b981" />
      </div>

      {/* Pipeline stats */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Agent G Pipeline
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{overview.totalTasks.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>TOTAL TASKS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{successRate}%</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>SUCCESS RATE</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{overview.errorRate}%</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>ERROR RATE</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f97316' }}>{overview.failedTasks}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>FAILED</div>
          </div>
        </div>
      </div>

      {/* Daily activity chart */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Daily Generations (14 days)
        </div>
        <MiniBarChart data={dailyActivity} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
            {dailyActivity[0]?.date?.slice(5) ?? ''}
          </span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
            {dailyActivity[dailyActivity.length - 1]?.date?.slice(5) ?? ''}
          </span>
        </div>
        {/* Daily numbers */}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {dailyActivity.slice(-7).map(d => (
            <div key={d.date} style={{
              flex: 1,
              minWidth: 60,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              padding: '6px 8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: d.count > 0 ? '#0ea5e9' : 'rgba(255,255,255,0.2)' }}>{d.count}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Service breakdown */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Generation Breakdown by Type
        </div>
        <KindBreakdownBar kinds={kindBreakdown} />
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <a
          href="/api/admin/stats"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ⚙️ System Stats JSON
        </a>
        <a
          href="/api/admin/creations-stats"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          📊 Creations Stats JSON
        </a>
      </div>

    </div>
  );
}
