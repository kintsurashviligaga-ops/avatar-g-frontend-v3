'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  UserCircle2, Video, Music2, ImageIcon, Bot, Workflow, Zap,
  TrendingUp, Play, CheckCircle2, Clock, ArrowRight, Plus,
  Sparkles, Activity, Star, Package, BarChart3, Flame,
  ShoppingCart, Code2, Briefcase, Coins,
} from 'lucide-react';

// ─── Static data ───────────────────────────────────────────────

const STATS = [
  { icon: UserCircle2, label: 'Avatars Created', value: '12', delta: '+3', color: 'text-cyan-300',    bg: 'from-cyan-500/10 to-sky-600/5',      border: 'border-cyan-400/20'    },
  { icon: Play,        label: 'Pipelines Run',   value: '7',  delta: '+1', color: 'text-sky-300',     bg: 'from-sky-500/10 to-blue-600/5',      border: 'border-sky-400/20'     },
  { icon: Zap,         label: 'Services Active', value: '17', delta: '',   color: 'text-amber-300',   bg: 'from-amber-500/10 to-orange-600/5',  border: 'border-amber-400/20'   },
  { icon: TrendingUp,  label: 'Success Rate',    value: '98%',delta: '',   color: 'text-emerald-300', bg: 'from-emerald-500/10 to-teal-600/5',  border: 'border-emerald-400/20' },
];

const QUICK_PIPELINES = [
  { id: 'brand-video',  icon: '🎬', label: 'Brand Video',   services: ['avatar', 'video', 'editing'],          accent: 'from-sky-500/10 to-blue-600/5 border-sky-400/20'     },
  { id: 'music-clip',   icon: '🎵', label: 'Music + Clip',  services: ['avatar', 'music', 'video'],            accent: 'from-pink-500/10 to-rose-600/5 border-pink-400/20'   },
  { id: 'ad-campaign',  icon: '📣', label: 'Ad Campaign',   services: ['image', 'text', 'video'],              accent: 'from-amber-500/10 to-orange-600/5 border-amber-400/20'},
  { id: 'full-ai',      icon: '⚡', label: 'Full Pipeline', services: ['avatar', 'video', 'music', 'agent-g'], accent: 'from-cyan-500/10 to-blue-600/5 border-cyan-400/20'   },
];

const ACTIVITY = [
  { icon: '🎬', label: 'Brand Video Pipeline',  time: '2 min ago',   status: 'done'    as const },
  { icon: '🎭', label: 'Avatar Generation',      time: '18 min ago',  status: 'done'    as const },
  { icon: '🎵', label: 'Music + Voice Sync',     time: 'Running…',    status: 'running' as const },
  { icon: '📣', label: 'Ad Campaign Pack',       time: 'In queue',    status: 'queued'  as const },
];

const STATUS_STYLES = {
  done:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  running: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
  queued:  'text-slate-400  bg-slate-400/10  border-slate-400/20',
};
const STATUS_LABELS = { done: 'Done', running: 'Running', queued: 'Queued' };

const TOP_SERVICES = [
  { id: 'avatar',   label: 'Avatar', icon: UserCircle2, color: 'text-violet-300', href: '/services/avatar'   },
  { id: 'video',    label: 'Video',  icon: Video,       color: 'text-sky-300',    href: '/services/video'    },
  { id: 'image',    label: 'Image',  icon: ImageIcon,   color: 'text-teal-300',   href: '/services/image'    },
  { id: 'music',    label: 'Music',  icon: Music2,      color: 'text-pink-300',   href: '/services/music'    },
  { id: 'text',     label: 'Copy',   icon: Code2,       color: 'text-lime-300',   href: '/services/text'     },
  { id: 'workflow', label: 'Flow',   icon: Workflow,    color: 'text-orange-300', href: '/services/workflow' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45 } }),
};

// ─── Component ────────────────────────────────────────────────

export function DashboardPanel({ locale }: { locale: string }) {
  const [hour, setHour] = useState(new Date().getHours());
  const [launched, setLaunched] = useState<string | null>(null);

  useEffect(() => { setHour(new Date().getHours()); }, []);

  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Welcome ─── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                <UserCircle2 className="w-6 h-6 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 bg-emerald-400" style={{ borderColor: 'var(--color-bg, #05050e)' }} />
            </div>
            <div>
              <p className="text-xs text-white/40">{greeting}</p>
              <h1 className="text-xl font-bold text-white">
                Avatar G <span className="text-cyan-400">Workspace</span>
              </h1>
              <p className="text-xs text-white/35 mt-0.5">Your AI production studio is ready.</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300" />
            </span>
            <Bot className="w-4 h-4 text-cyan-300" />
            <span className="text-[12px] font-semibold text-cyan-200">Agent G Online</span>
          </div>
        </motion.div>

        {/* ── Stats ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className={`rounded-2xl border bg-gradient-to-br ${s.bg} ${s.border} p-4`}
            >
              <div className="flex items-center justify-between mb-2">
                <s.icon className={cn('w-4 h-4', s.color)} />
                {s.delta && (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                    {s.delta}
                  </span>
                )}
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Quick Services Row ─── */}
        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/70">Quick Launch</h2>
            <Link href={`/${locale}/services`} className="text-[12px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              All Services <ArrowRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {TOP_SERVICES.map(({ id, label, icon: Icon, color, href }) => (
              <Link
                key={id}
                href={`/${locale}${href}`}
                className="group flex flex-col items-center gap-2 py-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all"
              >
                <Icon className={cn('w-5 h-5', color)} />
                <span className="text-[11px] font-medium text-white/60 group-hover:text-white/90">{label}</span>
              </Link>
            ))}
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-4">

          {/* ── Quick Pipelines ─── */}
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white/70">Quick Pipelines</h2>
              <Link href={`/${locale}/services/workflow`} className="text-[12px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                Build <ArrowRight size={11} />
              </Link>
            </div>
            <div className="space-y-2">
              {QUICK_PIPELINES.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border bg-gradient-to-r ${p.accent}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{p.icon}</span>
                    <div>
                      <p className="text-[13px] font-semibold text-white/90">{p.label}</p>
                      <p className="text-[11px] text-white/40">{p.services.length} services</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setLaunched(p.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all',
                      launched === p.id
                        ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-white/[0.08] text-white/70 border border-white/[0.10] hover:bg-white/[0.14] hover:text-white',
                    )}
                  >
                    {launched === p.id ? <CheckCircle2 size={13} /> : <Play size={13} />}
                    {launched === p.id ? 'Launched' : 'Launch'}
                  </button>
                </div>
              ))}

              <Link
                href={`/${locale}/services/workflow`}
                className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 border border-dashed border-white/[0.12] text-white/35 hover:text-white/60 hover:border-white/[0.25] transition-colors text-[12px]"
              >
                <Plus size={13} />
                Build Custom Pipeline
              </Link>
            </div>
          </motion.div>

          {/* ── Recent Activity ─── */}
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white/70">Recent Activity</h2>
              <button className="text-[12px] text-white/35 hover:text-white/60 flex items-center gap-1">
                All <ArrowRight size={11} />
              </button>
            </div>
            <div className="space-y-2">
              {ACTIVITY.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <span className="text-base shrink-0">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/80 truncate">{a.label}</p>
                    <p className="text-[11px] text-white/35 mt-0.5">{a.time}</p>
                  </div>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', STATUS_STYLES[a.status])}>
                    {STATUS_LABELS[a.status]}
                  </span>
                </div>
              ))}
            </div>

            {/* Agent G promo */}
            <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-cyan-200">Agent G</p>
                  <p className="text-[10px] text-white/40">AI director · online</p>
                </div>
              </div>
              <Link
                href={`/${locale}/services/agent-g`}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-200 text-[12px] font-semibold transition-colors"
              >
                Open <ArrowRight size={11} />
              </Link>
            </div>
          </motion.div>

        </div>

        {/* ── All Services Grid ─── */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/70">All Services</h2>
            <span className="text-[11px] text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full">17 active</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { id:'avatar',      icon:'👤', label:'Avatar',        color:'from-violet-500/10 to-purple-600/5  border-violet-400/20' },
              { id:'video',       icon:'🎬', label:'Video',         color:'from-sky-500/10 to-blue-600/5       border-sky-400/20'    },
              { id:'image',       icon:'🖼️', label:'Image',         color:'from-teal-500/10 to-emerald-600/5   border-teal-400/20'   },
              { id:'music',       icon:'🎵', label:'Music',         color:'from-pink-500/10 to-rose-600/5      border-pink-400/20'   },
              { id:'photo',       icon:'📷', label:'Photo',         color:'from-blue-500/10 to-indigo-600/5    border-blue-400/20'   },
              { id:'editing',     icon:'✂️', label:'Editing',       color:'from-orange-500/10 to-amber-600/5   border-orange-400/20' },
              { id:'text',        icon:'✍️', label:'Copy',          color:'from-lime-500/10 to-green-600/5     border-lime-400/20'   },
              { id:'prompt',      icon:'💡', label:'Prompts',       color:'from-yellow-500/10 to-amber-600/5   border-yellow-400/20' },
              { id:'media',       icon:'📡', label:'Media Hub',     color:'from-red-500/10 to-rose-600/5       border-red-400/20'    },
              { id:'visual-intel',icon:'🔍', label:'Visual Intel',  color:'from-indigo-500/10 to-violet-600/5  border-indigo-400/20' },
              { id:'workflow',    icon:'⚡', label:'Workflow',      color:'from-orange-500/10 to-amber-600/5   border-orange-400/20' },
              { id:'shop',        icon:'🛒', label:'Shop',          color:'from-rose-500/10 to-pink-600/5      border-rose-400/20'   },
              { id:'software',    icon:'💻', label:'Software',      color:'from-cyan-500/10 to-sky-600/5       border-cyan-400/20'   },
              { id:'business',    icon:'💼', label:'Business',      color:'from-amber-500/10 to-yellow-600/5   border-amber-400/20'  },
              { id:'tourism',     icon:'✈️', label:'Tourism',       color:'from-sky-500/10 to-blue-600/5       border-sky-400/20'    },
              { id:'game',        icon:'🎮', label:'Games',         color:'from-lime-500/10 to-green-600/5     border-lime-400/20'   },
              { id:'interior',    icon:'🛋️', label:'Interior',      color:'from-amber-500/10 to-yellow-600/5   border-amber-400/20'  },
              { id:'agent-g',     icon:'🤖', label:'Agent G',       color:'from-cyan-500/10 to-blue-600/5      border-cyan-400/20'   },
            ].map((s) => (
              <Link
                key={s.id}
                href={`/${locale}/services/${s.id}`}
                className={cn(
                  'group flex flex-col items-center gap-2 p-3 rounded-2xl border bg-gradient-to-br transition-all hover:scale-105',
                  s.color,
                )}
              >
                <span className="text-xl">{s.icon}</span>
                <span className="text-[11px] font-medium text-white/60 group-hover:text-white/90 text-center leading-tight">{s.label}</span>
              </Link>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}


