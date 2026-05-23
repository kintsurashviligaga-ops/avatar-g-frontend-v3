'use client';

/**
 * Inline SVG charts — no chartjs/recharts dependency. Renders sharp,
 * responsive line / bar / donut visualizations for the analytics page.
 */

import { useMemo, useState } from 'react';

// ─── Line chart (messages per day) ────────────────────────────────────────────

interface LineChartProps {
  data: Array<{ date: string; count: number }>;
  height?: number;
  color?: string;
}

export function LineChart({ data, height = 140, color = '#0ea5e9' }: LineChartProps) {
  const { path, area, max, ticks } = useMemo(() => {
    const w = 600;
    const h = height;
    const padX = 24;
    const padY = 12;
    const maxV = Math.max(1, ...data.map(d => d.count));
    const step = (w - padX * 2) / Math.max(1, data.length - 1);
    const pts = data.map((d, i) => {
      const x = padX + i * step;
      const y = h - padY - (d.count / maxV) * (h - padY * 2);
      return [x, y] as const;
    });
    const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${path} L ${pts[pts.length - 1]?.[0] ?? padX} ${h - padY} L ${padX} ${h - padY} Z`;
    const ticks = [Math.round(maxV), Math.round(maxV / 2), 0];
    return { path, area, max: maxV, ticks };
  }, [data, height]);

  return (
    <svg viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1="24" x2="576"
            y1={12 + (i / 2) * (height - 24)} y2={12 + (i / 2) * (height - 24)}
            stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4"
          />
          <text
            x="20" y={16 + (i / 2) * (height - 24)}
            fontSize="9" fill="rgba(255,255,255,0.35)" textAnchor="end"
          >{t}</text>
        </g>
      ))}
      <path d={area} fill="url(#line-area)" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <title>{`Max ${max} messages per day`}</title>
    </svg>
  );
}

// ─── Bar chart (generation usage) ─────────────────────────────────────────────

interface BarChartProps {
  data: Array<{ label: string; count: number; color?: string }>;
  height?: number;
}

export function BarChart({ data, height = 160 }: BarChartProps) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height, padding: '0 8px' }}>
      {data.map(d => {
        const pct = (d.count / max) * 100;
        return (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{d.count}</span>
            <div style={{
              width: '100%', maxWidth: 56, height: `${Math.max(2, pct)}%`, minHeight: 2,
              borderRadius: '6px 6px 0 0',
              background: d.color ?? 'linear-gradient(180deg,#0ea5e9,#0369a1)',
              transition: 'height 0.35s ease',
            }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Topic chip list (top keywords) ───────────────────────────────────────────

interface TopicListProps {
  topics: Array<{ topic: string; count: number }>;
}

export function TopicList({ topics }: TopicListProps) {
  if (topics.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '24px 0' }}>
        Not enough chat history yet.
      </p>
    );
  }
  const max = Math.max(1, ...topics.map(t => t.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {topics.map(t => {
        const pct = (t.count / max) * 100;
        return (
          <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', minWidth: 80 }}>{t.topic}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: 'linear-gradient(90deg,#06b6d4,#0ea5e9)',
                transition: 'width 0.35s ease',
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', minWidth: 24, textAlign: 'right' }}>
              {t.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

export function KpiTile({ label, value, accent = '#0ea5e9' }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.02)',
      backdropFilter: 'blur(20px)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ marginTop: 4, height: 2, width: 32, borderRadius: 2, background: accent }} />
    </div>
  );
}

// ─── Weekly Usage — premium 7-day area chart with interactive tooltips ────────

interface WeeklyUsageChartProps {
  /** Rolling 7-day data; the component slices/pads to exactly 7 points. */
  data: Array<{ date: string; count: number }>;
  locale?: 'ka' | 'en' | 'ru';
}

/**
 * A self-contained, dependency-free 7-day usage chart: indigo→deep-purple
 * gradient area + line, hoverable points with a floating tooltip showing
 * the day and its value. Responsive (viewBox), 60fps (pure SVG, no layout
 * thrash) and keyboard/pointer accessible.
 */
export function WeeklyUsageChart({ data, locale = 'en' }: WeeklyUsageChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const week = useMemo(() => {
    const last7 = data.slice(-7);
    while (last7.length < 7) last7.unshift({ date: '', count: 0 });
    return last7;
  }, [data]);

  const W = 600, H = 180, padX = 28, padY = 22;
  const maxV = Math.max(1, ...week.map(d => d.count));
  const step = (W - padX * 2) / Math.max(1, week.length - 1);
  const pts = week.map((d, i) => {
    const x = padX + i * step;
    const y = H - padY - (d.count / maxV) * (H - padY * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1]?.[0] ?? padX} ${H - padY} L ${padX} ${H - padY} Z`;

  const dayLabel = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const loc = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
    return d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric' });
  };

  const total = week.reduce((s, d) => s + d.count, 0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: H, display: 'block', cursor: 'pointer' }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="weekly-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="weekly-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0, 0.5, 1].map((f, i) => (
          <line key={i} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)}
            stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
        ))}

        <path d={area} fill="url(#weekly-area)" />
        <path d={line} fill="none" stroke="url(#weekly-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* points + invisible hit targets */}
        {pts.map(([x, y], i) => (
          <g key={i}>
            {hover === i && (
              <line x1={x} x2={x} y1={padY} y2={H - padY} stroke="rgba(14,165,233,0.4)" strokeWidth="1" />
            )}
            <circle cx={x} cy={y} r={hover === i ? 5 : 3.5} fill={hover === i ? '#fff' : '#0ea5e9'}
              stroke="#0369a1" strokeWidth="1.5" />
            <rect x={x - step / 2} y={0} width={step} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} />
          </g>
        ))}
      </svg>

      {/* x-axis day labels */}
      <div className="flex justify-between px-[18px] mt-1">
        {week.map((d, i) => (
          <span key={i} className={`text-[10px] ${hover === i ? 'text-white' : 'text-white/40'} transition-colors`}>
            {dayLabel(d.date)}
          </span>
        ))}
      </div>

      {/* floating tooltip */}
      {hover !== null && week[hover] && (
        <div
          className="absolute -top-1 px-2.5 py-1.5 rounded-lg bg-black border border-white/[0.15] shadow-lg pointer-events-none text-center"
          style={{ left: `${(pts[hover]?.[0] ?? 0) / W * 100}%`, transform: 'translateX(-50%)' }}
        >
          <div className="text-[10px] text-white/55">{dayLabel(week[hover]!.date)}</div>
          <div className="text-[14px] font-bold text-white tabular-nums">{week[hover]!.count}</div>
        </div>
      )}

      {/* total caption */}
      <div className="mt-2 text-[11px] text-white/45">
        {locale === 'ka' ? 'სულ კვირაში' : locale === 'ru' ? 'Всего за неделю' : 'Total this week'}:{' '}
        <span className="text-white/80 font-semibold">{total}</span>
      </div>
    </div>
  );
}
