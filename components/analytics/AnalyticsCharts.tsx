'use client';

/**
 * Inline SVG charts — no chartjs/recharts dependency. Renders sharp,
 * responsive line / bar / donut visualizations for the analytics page.
 */

import { useMemo } from 'react';

// ─── Line chart (messages per day) ────────────────────────────────────────────

interface LineChartProps {
  data: Array<{ date: string; count: number }>;
  height?: number;
  color?: string;
}

export function LineChart({ data, height = 140, color = '#a855f7' }: LineChartProps) {
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
              background: d.color ?? 'linear-gradient(180deg,#a855f7,#6d28d9)',
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
                background: 'linear-gradient(90deg,#06b6d4,#a855f7)',
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

export function KpiTile({ label, value, accent = '#a855f7' }: { label: string; value: string | number; accent?: string }) {
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
