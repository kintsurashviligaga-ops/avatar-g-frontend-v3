'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp, Zap, MessageSquare, Layers, Workflow, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const PERIODS = ['7 days', '30 days', '90 days', 'All time'];

const STATS = [
  { label: 'Credits Used', value: '5,800', change: '+12%', up: true, icon: Zap, color: '#0ea5e9' },
  { label: 'AI Sessions', value: '127', change: '+23%', up: true, icon: MessageSquare, color: '#00d4ff' },
  { label: 'Generated Items', value: '48', change: '+8%', up: true, icon: Layers, color: '#10b981' },
  { label: 'Workflows Run', value: '12', change: '-3%', up: false, icon: Workflow, color: '#f59e0b' },
];

const DAILY = [40, 65, 32, 80, 55, 90, 70, 45, 85, 60, 75, 95, 50, 88];
const SERVICES = [
  { name: 'Agent G', pct: 42, color: '#0ea5e9', credits: 2436 },
  { name: 'Image Gen', pct: 25, color: '#f59e0b', credits: 1450 },
  { name: 'Copy AI', pct: 18, color: '#06b6d4', credits: 1044 },
  { name: 'Music', pct: 10, color: '#10b981', credits: 580 },
  { name: 'Other', pct: 5, color: '#38bdf8', credits: 290 },
];

function BarGraph({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-sm transition-all hover:opacity-80"
            style={{ height: `${(v / max) * 100}%`, background: `rgba(14,165,233,${0.3 + (v / max) * 0.5})`, minHeight: 2 }}
          />
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30 days');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#3b82f618', border: '1px solid #3b82f640' }}>
            <BarChart3 className="w-5 h-5" style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>Analytics</h1>
            <p className="text-xs text-white/40">Usage metrics and service performance</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={period === p ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { color: 'rgba(255,255,255,0.4)' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(s => {
          const Icon = s.icon;
          const Arrow = s.up ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={s.label} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-semibold ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>
                  <Arrow className="w-3 h-3" />{s.change}
                </div>
              </div>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>{s.value}</p>
              <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Usage chart */}
        <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Daily Credit Usage</h3>
              <p className="text-xs text-white/35 mt-0.5">Last {DAILY.length} days</p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <BarGraph data={DAILY} />
          <div className="flex justify-between mt-2">
            {DAILY.map((_, i) => i % 3 === 0 && (
              <span key={i} className="text-[10px] text-white/25">Day {i + 1}</span>
            ))}
          </div>
        </div>

        {/* Service breakdown */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 className="text-sm font-semibold text-white mb-4">Credits by Service</h3>
          <div className="space-y-3">
            {SERVICES.map(s => (
              <div key={s.name}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-white/65">{s.name}</span>
                  <span className="text-xs font-mono text-white/50">{s.credits.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top sessions */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold text-white">Recent Sessions</h3>
          <span className="text-xs text-white/35">127 total</span>
        </div>
        {[
          { service: 'Agent G', query: 'მარკეტინგ სტრატეგია ახალი პროდუქტისთვის', credits: 25, time: '2 წ. წინ', color: '#0ea5e9' },
          { service: 'Image Gen', query: 'Photorealistic product photo — studio lighting', credits: 40, time: '1 სთ. წინ', color: '#f59e0b' },
          { service: 'Copy AI', query: 'Landing page copy for SaaS product', credits: 10, time: '3 სთ. წინ', color: '#06b6d4' },
          { service: 'Music', query: 'Electronic background track for promo video', credits: 35, time: 'გუშინ', color: '#10b981' },
          { service: 'Avatar', query: 'Professional business avatar — dark suit', credits: 30, time: 'გუშინ', color: '#38bdf8' },
        ].map((row, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
            style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: row.color }}>{row.service}</span>
                <span className="text-xs text-white/60 truncate">{row.query}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs font-mono text-white/40">{row.credits}cr</span>
              <span className="text-xs text-white/30">{row.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
