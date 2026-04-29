'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Bot, UserCircle2, ImageIcon, Video, Music2, FileText,
  Workflow, BarChart3, Zap, TrendingUp, MessageSquare,
  Layers, ArrowRight, Sparkles, Clock, CheckCircle,
} from 'lucide-react';

// ─── Stats ───────────────────────────────────────────────────────────────────

const STATS = [
  { label: 'Credits Remaining', value: '4,200', sub: 'of 10,000 total', icon: Zap, color: '#6366f1', trend: '-580 this week' },
  { label: 'AI Sessions', value: '127', sub: 'conversations', icon: MessageSquare, color: '#00d4ff', trend: '+23 this week' },
  { label: 'Generated Items', value: '48', sub: 'images & videos', icon: Layers, color: '#10b981', trend: '+12 this week' },
  { label: 'Active Workflows', value: '3', sub: 'running now', icon: TrendingUp, color: '#f59e0b', trend: '2 completed today' },
];

// ─── Quick Start services ─────────────────────────────────────────────────────

const QUICK = [
  { id: 'agent-g',   label: 'Agent G',          icon: Bot,        color: '#6366f1', desc: 'AI ორკესტრატორი' },
  { id: 'avatar',    label: 'Avatar Studio',    icon: UserCircle2, color: '#8b5cf6', desc: 'ავატარის შექმნა' },
  { id: 'image',     label: 'Image Generation', icon: ImageIcon,  color: '#f59e0b', desc: 'AI სურათები' },
  { id: 'video',     label: 'Video Generation', icon: Video,      color: '#ef4444', desc: 'ვიდეო სკრიპტები' },
  { id: 'music',     label: 'Music Production', icon: Music2,     color: '#10b981', desc: 'AI მუსიკა' },
  { id: 'copy',      label: 'Text & Copy',      icon: FileText,   color: '#06b6d4', desc: 'მარკეტინგ ტექსტი' },
  { id: 'workflows', label: 'Workflow Builder', icon: Workflow,   color: '#84cc16', desc: 'ავტომატიზაცია' },
  { id: 'analytics', label: 'Analytics',        icon: BarChart3,  color: '#3b82f6', desc: 'მონაცემთა ანალიზი' },
];

// ─── Recent activity ──────────────────────────────────────────────────────────

const ACTIVITY = [
  { icon: Bot,        color: '#6366f1', text: 'Agent G — მარკეტინგ სტრატეგია შეიქმნა',    time: '2 წ. წინ',    status: 'done' },
  { icon: ImageIcon,  color: '#f59e0b', text: 'Image Gen — 3 სურათი გენერირდა',             time: '1 სთ. წინ',   status: 'done' },
  { icon: Workflow,   color: '#84cc16', text: 'Workflow "Content Pipeline" გაეშვა',          time: '3 სთ. წინ',   status: 'running' },
  { icon: Music2,     color: '#10b981', text: 'Music — "Tech Vibes" ბითი შეიქმნა',          time: 'გუშინ',       status: 'done' },
  { icon: UserCircle2,color: '#8b5cf6', text: 'Avatar Studio — პროფესიონალური ავატარი',     time: 'გუშინ',       status: 'done' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'ka';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-0.02em' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            MyAvatar.ge — AI Civilization Stack
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/agent-g`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6366f1, #00d4ff)' }}
        >
          <Sparkles className="w-4 h-4" />
          Start with Agent G
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(s => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/40 font-medium">{s.label}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.sub}</p>
              <p className="text-[11px] mt-2 font-medium" style={{ color: s.color }}>{s.trend}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Start */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Quick Start</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map(svc => {
            const Icon = svc.icon;
            return (
              <Link
                key={svc.id}
                href={`/${locale}/dashboard/${svc.id}`}
                className="group flex flex-col gap-3 p-4 rounded-2xl transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${svc.color}18`, border: `1px solid ${svc.color}30` }}
                >
                  <Icon className="w-5 h-5" style={{ color: svc.color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/85 group-hover:text-white transition-colors">{svc.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{svc.desc}</p>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: svc.color }}>
                  <span>გახსნა</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Recent Activity</h2>
          <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">View all</button>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {ACTIVITY.map((a, i) => {
            const Icon = a.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
                style={{ borderBottom: i < ACTIVITY.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${a.color}18` }}>
                  <Icon className="w-4 h-4" style={{ color: a.color }} />
                </div>
                <p className="flex-1 text-sm text-white/70 truncate">{a.text}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Clock className="w-3 h-3 text-white/25" />
                  <span className="text-[11px] text-white/35">{a.time}</span>
                  {a.status === 'done' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
