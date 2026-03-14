'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  UserCircle2, Video, Music2, Camera, ImageIcon, FileText, Wand2, Workflow,
  ShoppingCart, Cpu, Code2, Briefcase, Plane, Scissors, Eye, Film,
  Play, Zap, BarChart3, CheckCircle2, Clock, ArrowRight, Sparkles,
  Bot, Globe, TrendingUp, Layers, Target, Star, Activity, Plus,
  ChevronRight, Package, Flame, Radio,
} from 'lucide-react'

// ─── Types & Data ─────────────────────────────────────────────
type ServiceId = 'avatar' | 'video' | 'editing' | 'music' | 'photo' | 'image' | 'media' | 'text' | 'prompt' | 'visual-intel' | 'workflow' | 'shop' | 'agent-g' | 'software' | 'business' | 'tourism'

const SERVICES: { id: ServiceId; label: string; shortLabel: string; icon: React.ElementType; color: string; glow: string; category: string }[] = [
  { id: 'avatar',       label: 'AI Avatar',          shortLabel: 'Avatar',     icon: UserCircle2,  color: 'from-cyan-500 to-sky-600',      glow: 'rgba(6,182,212,0.5)' ,   category: 'create' },
  { id: 'video',        label: 'AI Video Studio',     shortLabel: 'Video',      icon: Video,        color: 'from-sky-500 to-blue-600',      glow: 'rgba(14,165,233,0.5)',   category: 'create' },
  { id: 'music',        label: 'AI Music Studio',     shortLabel: 'Music',      icon: Music2,       color: 'from-pink-500 to-rose-600',     glow: 'rgba(236,72,153,0.5)',   category: 'create' },
  { id: 'image',        label: 'AI Image Creator',    shortLabel: 'Image',      icon: ImageIcon,    color: 'from-teal-500 to-emerald-600',  glow: 'rgba(20,184,166,0.5)',   category: 'create' },
  { id: 'text',         label: 'Text Intelligence',   shortLabel: 'Text',       icon: FileText,     color: 'from-lime-500 to-green-600',    glow: 'rgba(132,204,22,0.5)',   category: 'analyze' },
  { id: 'agent-g',      label: 'Agent G Director',    shortLabel: 'Agent G',    icon: Cpu,          color: 'from-cyan-400 to-blue-500',     glow: 'rgba(34,211,238,0.6)',   category: 'automate' },
  { id: 'workflow',     label: 'Workflow Automation', shortLabel: 'Workflow',   icon: Workflow,     color: 'from-orange-500 to-amber-600',  glow: 'rgba(249,115,22,0.5)',   category: 'automate' },
  { id: 'shop',         label: 'Online Shop',         shortLabel: 'Shop',       icon: ShoppingCart, color: 'from-rose-500 to-pink-600',     glow: 'rgba(244,63,94,0.5)',    category: 'scale' },
  { id: 'photo',        label: 'AI Photo Studio',     shortLabel: 'Photo',      icon: Camera,       color: 'from-sky-500 to-blue-600',      glow: 'rgba(14,165,233,0.5)',   category: 'create' },
  { id: 'editing',      label: 'Video Editing',       shortLabel: 'Edit',       icon: Scissors,     color: 'from-slate-500 to-blue-600',    glow: 'rgba(100,116,139,0.5)',  category: 'edit' },
  { id: 'prompt',       label: 'Prompt Builder',      shortLabel: 'Prompt',     icon: Wand2,        color: 'from-amber-500 to-orange-600',  glow: 'rgba(245,158,11,0.5)',   category: 'analyze' },
  { id: 'business',     label: 'Business Agent',      shortLabel: 'Business',   icon: Briefcase,    color: 'from-yellow-500 to-amber-600',  glow: 'rgba(234,179,8,0.5)',    category: 'scale' },
]

const QUICK_PIPELINES: { id: string; icon: string; label: { en: string; ka: string; ru: string }; services: ServiceId[]; accent: string }[] = [
  {
    id: 'brand-video',
    icon: '🎬',
    label: { en: 'Brand Video', ka: 'ბრენდ ვიდეო', ru: 'Бренд-видео' },
    services: ['avatar', 'video', 'editing'],
    accent: 'from-sky-500/15 to-blue-600/10 border-sky-400/25',
  },
  {
    id: 'music-clip',
    icon: '🎵',
    label: { en: 'Music + Clip', ka: 'მუსიკა + კლიპი', ru: 'Музыка + Клип' },
    services: ['avatar', 'music', 'video'],
    accent: 'from-pink-500/15 to-rose-600/10 border-pink-400/25',
  },
  {
    id: 'ad-campaign',
    icon: '📣',
    label: { en: 'Ad Campaign', ka: 'სარეკლამო', ru: 'Реклама' },
    services: ['image', 'text', 'video'],
    accent: 'from-amber-500/15 to-orange-600/10 border-amber-400/25',
  },
  {
    id: 'ai-pipeline',
    icon: '⚡',
    label: { en: 'Full Pipeline', ka: 'სრული AI', ru: 'Полный AI' },
    services: ['avatar', 'video', 'music', 'agent-g'],
    accent: 'from-cyan-500/15 to-blue-600/10 border-cyan-400/25',
  },
]

const STATS = [
  { icon: UserCircle2, valueKey: 'statsAvatars',  value: '12',    label: { en: 'Avatars',       ka: 'ავატარი',   ru: 'Аватаров' },     color: 'text-cyan-300',    bg: 'from-cyan-500/10 to-sky-600/5',       border: 'border-cyan-400/20' },
  { icon: Play,        valueKey: 'statsPipelines', value: '7',     label: { en: 'Pipelines Run', ka: 'გაშვება',   ru: 'Pipeline' },     color: 'text-sky-300',     bg: 'from-sky-500/10 to-blue-600/5',       border: 'border-sky-400/20' },
  { icon: Zap,         valueKey: 'statsServices',  value: '17',    label: { en: 'Services',      ka: 'სერვისი',   ru: 'Сервисов' },     color: 'text-amber-300',   bg: 'from-amber-500/10 to-orange-600/5',   border: 'border-amber-400/20' },
  { icon: TrendingUp,  valueKey: 'statsOutput',    value: '98%',   label: { en: 'Success Rate',  ka: 'წარმატება', ru: 'Успех' },        color: 'text-emerald-300', bg: 'from-emerald-500/10 to-teal-600/5',   border: 'border-emerald-400/20' },
]

const RECENT_ACTIVITY: { icon: string; label: { en: string; ka: string; ru: string }; when: { en: string; ka: string; ru: string }; status: 'done' | 'running' | 'queued' }[] = [
  { icon: '🎬', label: { en: 'Brand Video Pipeline', ka: 'ბრენდ ვიდეო პაიფლაინი', ru: 'Видео-pipeline бренда' },     when: { en: '2 min ago',   ka: '2 წუთის წინ',   ru: '2 мин. назад' },   status: 'done' },
  { icon: '🎭', label: { en: 'Avatar Generation',    ka: 'ავატარის გენერაცია',     ru: 'Генерация аватара' },          when: { en: '18 min ago',  ka: '18 წ. წინ',     ru: '18 мин назад' },   status: 'done' },
  { icon: '🎵', label: { en: 'Music + Voice Sync',   ka: 'მუსიკა + ხმის სინქრო',  ru: 'Синхронизация музыки' },      when: { en: 'Running…',    ka: 'მიმდინარეობს…', ru: 'Выполняется…' },   status: 'running' },
  { icon: '📣', label: { en: 'Ad Campaign Pack',     ka: 'სარეკლამო კამპანია',     ru: 'Рекламный пакет' },            when: { en: 'In queue',    ka: 'რიგში',         ru: 'В очереди' },      status: 'queued' },
]

// ─── Copy ─────────────────────────────────────────────────────
const COPY = {
  en: {
    greeting: (h: number) => h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening',
    subtitle: 'Your AI production hub is ready.',
    statsSectionTitle: 'Your Stats',
    quickLaunch: 'Quick Launch',
    allServices: 'All Services →',
    recentActivity: 'Recent Activity',
    quickPipelines: 'Quick Pipelines',
    servicesTitle: 'Services',
    launchBtn: 'Launch',
    openBtn: 'Open',
    viewAll: 'View all activity →',
    agentGBadge: 'Agent G is online',
    statusDone: 'Done',
    statusRunning: 'Running',
    statusQueued: 'Queued',
    buildCustom: 'Build Custom Pipeline',
    browseServices: 'Browse All Services',
    pipelineServices: (n: number) => `${n} services`,
  },
  ka: {
    greeting: (h: number) => h < 12 ? 'დილა მშვიდობისა' : h < 17 ? 'შუადღე მშვიდობისა' : 'საღამო მშვიდობისა',
    subtitle: 'შენი AI სტუდია მზადაა.',
    statsSectionTitle: 'სტატისტიკა',
    quickLaunch: 'სწრაფი გაშვება',
    allServices: 'ყველა სერვისი →',
    recentActivity: 'ბოლო აქტივობა',
    quickPipelines: 'სწრაფი პაიფლაინები',
    servicesTitle: 'სერვისები',
    launchBtn: 'გაშვება',
    openBtn: 'გახსნა',
    viewAll: 'ყველა →',
    agentGBadge: 'Agent G ონლაინ',
    statusDone: 'შესრულდა',
    statusRunning: 'მიმდინარე',
    statusQueued: 'მოლოდინში',
    buildCustom: 'მორგებული პაიფლაინი',
    browseServices: 'ყველა სერვისი',
    pipelineServices: (n: number) => `${n} სერვისი`,
  },
  ru: {
    greeting: (h: number) => h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : 'Добрый вечер',
    subtitle: 'Ваш AI-хаб готов к работе.',
    statsSectionTitle: 'Статистика',
    quickLaunch: 'Быстрый запуск',
    allServices: 'Все сервисы →',
    recentActivity: 'Активность',
    quickPipelines: 'Быстрые pipeline',
    servicesTitle: 'Сервисы',
    launchBtn: 'Запустить',
    openBtn: 'Открыть',
    viewAll: 'Все →',
    agentGBadge: 'Agent G онлайн',
    statusDone: 'Готово',
    statusRunning: 'Выполняется',
    statusQueued: 'В очереди',
    buildCustom: 'Свой pipeline',
    browseServices: 'Все сервисы',
    pipelineServices: (n: number) => `${n} сервиса`,
  },
} as const

// ─── Animation variants ───────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: 'easeOut' } }) }

// ─── Component ────────────────────────────────────────────────
export function WorkspaceDashboard({ locale }: { locale: string }) {
  const [hour, setHour] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'activity'>('overview')
  const [launchedPipeline, setLaunchedPipeline] = useState<string | null>(null)

  const loc = (locale || 'ka') as keyof typeof COPY
  const t = COPY[loc] ?? COPY.ka

  useEffect(() => {
    setHour(new Date().getHours())
  }, [])

  const getLabel = (obj: { en: string; ka: string; ru: string }) =>
    loc === 'ka' ? obj.ka : loc === 'ru' ? obj.ru : obj.en

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8" style={{ background: 'radial-gradient(ellipse at top, var(--color-accent-soft) 0%, transparent 60%)' }}>
      <div className="mx-auto max-w-7xl space-y-6">

        {/* ─── Welcome Header ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            {/* Avatar glow ring */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                <UserCircle2 className="w-8 h-8 text-white" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 bg-emerald-400 shadow-sm" style={{ borderColor: 'var(--color-bg)' }} />
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{t.greeting(hour)}</p>
              <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-text)' }}>
                Avatar G <span style={{ color: 'var(--color-accent)' }}>Workspace</span>
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{t.subtitle}</p>
            </div>
          </div>

          {/* Agent G status badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] shadow-[0_0_20px_rgba(34,211,238,0.12)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-300" />
              </span>
              <Bot className="w-4 h-4 text-cyan-300" />
              <span className="text-xs font-semibold text-cyan-200">{t.agentGBadge}</span>
            </div>
          </div>
        </motion.div>

        {/* ─── Stats Row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((stat, i) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.valueKey}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className={`relative rounded-2xl border bg-gradient-to-br ${stat.bg} ${stat.border} p-4 overflow-hidden`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center border ${stat.border}`}>
                    <Icon className={`w-4.5 h-4.5 ${stat.color}`} />
                  </div>
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--color-text-tertiary)' }} />
                </div>
                <p className={`text-3xl font-bold ${stat.color} mb-0.5`}>{stat.value}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{getLabel(stat.label)}</p>
                {/* ambient glow */}
                <div className={`absolute -bottom-4 -right-4 w-16 h-16 rounded-full blur-2xl opacity-20 bg-gradient-to-br ${stat.bg}`} />
              </motion.div>
            )
          })}
        </div>

        {/* ─── Tab Navigation ─────────────────────────────────── */}
        <div className="flex items-center gap-1 p-1 rounded-2xl w-fit" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
          {(['overview', 'services', 'activity'] as const).map(tab => {
            const labels = {
              overview: { en: 'Overview', ka: 'მიმოხილვა', ru: 'Обзор' },
              services: { en: 'Services', ka: 'სერვისები', ru: 'Сервисы' },
              activity: { en: 'Activity', ka: 'აქტივობა', ru: 'Активность' },
            }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="relative px-5 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                style={activeTab === tab ? {
                  backgroundColor: 'var(--card-hover)',
                  color: 'var(--color-text)',
                } : {
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {getLabel(labels[tab])}
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-xl"
                    style={{ zIndex: -1, backgroundColor: 'var(--card-hover)', border: '1px solid var(--color-border)' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        <AnimatePresence mode="wait">

          {/* ═══════════════════════════════════════════════════
              OVERVIEW TAB
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-5"
            >
              {/* ── Quick Pipelines (2/3 wide) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <Layers className="w-4 h-4 text-cyan-400" /> {t.quickPipelines}
                  </h2>
                  <Link href={`/${locale}/services`} className="text-[11px] hover:opacity-80 transition-colors" style={{ color: 'var(--color-accent)' }}>
                    {t.allServices}
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {QUICK_PIPELINES.map((pipe, i) => {
                    const isLaunched = launchedPipeline === pipe.id
                    const serviceIcons = pipe.services.slice(0, 3).map(sid => SERVICES.find(s => s.id === sid)!).filter(Boolean)
                    return (
                      <motion.div
                        key={pipe.id}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={fadeUp}
                        className={`relative rounded-2xl border bg-gradient-to-br ${pipe.accent} p-4 flex flex-col gap-3 overflow-hidden group hover:scale-[1.01] transition-transform`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{pipe.icon}</span>
                          <div>
                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--color-text)' }}>{getLabel(pipe.label)}</p>
                            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.pipelineServices(pipe.services.length)}</p>
                          </div>
                        </div>

                        {/* Mini pipeline chain */}
                        <div className="flex items-center gap-1">
                          {serviceIcons.map((svc, idx) => {
                            const SIcon = svc.icon
                            return (
                                <div key={svc.id} className="flex items-center gap-1">
                                {idx > 0 && <ChevronRight className="w-2.5 h-2.5" style={{ color: 'var(--color-text-tertiary)' }} />}
                                <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${svc.color} flex items-center justify-center`}
                                  style={{ boxShadow: `0 0 8px ${svc.glow}` }}>
                                  <SIcon className="w-3 h-3 text-white" />
                                </div>
                              </div>
                            )
                          })}
                          {pipe.services.length > 3 && (
                            <span className="ml-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>+{pipe.services.length - 3}</span>
                          )}
                        </div>

                        <button
                          onClick={() => setLaunchedPipeline(isLaunched ? null : pipe.id)}
                          className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                            isLaunched
                              ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                              : ''
                          }`}
                          style={!isLaunched ? {
                            backgroundColor: 'var(--card-bg)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-secondary)',
                          } : undefined}
                        >
                          {isLaunched ? <><CheckCircle2 className="w-3.5 h-3.5" /> Ready!</> : <><Play className="w-3.5 h-3.5" /> {t.launchBtn}</>}
                        </button>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Build custom pipeline link */}
                <Link
                  href={`/${locale}#workflow-builder`}
                  className="flex items-center justify-center gap-2 w-full rounded-2xl border border-dashed py-3 text-[11px] transition-all"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> {t.buildCustom}
                </Link>
              </div>

              {/* ── Recent Activity (1/3 wide) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <Activity className="w-4 h-4 text-cyan-400" /> {t.recentActivity}
                  </h2>
                  <button className="text-[11px] transition-colors" style={{ color: 'var(--color-text-tertiary)' }}>{t.viewAll}</button>
                </div>

                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}>
                  {RECENT_ACTIVITY.map((item, i) => {
                    const statusColor = item.status === 'done' ? 'text-emerald-400 bg-emerald-500/12 border-emerald-400/25' :
                      item.status === 'running' ? 'text-cyan-300 bg-cyan-500/12 border-cyan-400/25 animate-pulse' :
                      'bg-transparent'
                    const statusLabel = item.status === 'done' ? t.statusDone : item.status === 'running' ? t.statusRunning : t.statusQueued
                    return (
                      <motion.div
                        key={i}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={fadeUp}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span className="text-xl shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text-secondary)' }}>{getLabel(item.label)}</p>
                          <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{getLabel(item.when)}</p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColor} shrink-0`}
                          style={item.status === 'queued' ? { color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' } : undefined}>
                          {statusLabel}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Agent G CTA */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="rounded-2xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.07),rgba(34,211,238,0.05))] p-4 text-center space-y-3"
                >
                  <div className="w-10 h-10 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg">
                    <Cpu className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>Agent G</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                      {loc === 'ka' ? 'AI director · ონლაინ' : loc === 'ru' ? 'AI директор · онлайн' : 'AI director · online'}
                    </p>
                  </div>
                  <Link
                    href={`/${locale}/services/agent-g`}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold py-2.5 hover:brightness-110 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {loc === 'ka' ? 'გაშვება' : loc === 'ru' ? 'Запустить' : 'Launch Agent G'}
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════
              SERVICES TAB
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'services' && (
            <motion.div
              key="services"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {SERVICES.map((svc, i) => {
                  const Icon = svc.icon
                  return (
                    <motion.div
                      key={svc.id}
                      custom={i}
                      initial="hidden"
                      animate="visible"
                      variants={fadeUp}
                    >
                      <Link
                        href={`/${locale}/services/${svc.id}`}
                        className="group flex flex-col items-center gap-3 rounded-2xl p-4 text-center transition-all duration-200 hover:scale-[1.03]"
                        style={{
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--card-bg)',
                        }}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${svc.color} flex items-center justify-center`}
                        >
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold leading-tight" style={{ color: 'var(--color-text)' }}>{svc.shortLabel}</p>
                          <p className="text-[9px] mt-0.5 leading-tight line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{svc.label}</p>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] transition-colors" style={{ color: 'var(--color-text-tertiary)' }}>
                          <span>{t.openBtn}</span> <ArrowRight className="w-3 h-3" />
                        </div>
                      </Link>
                    </motion.div>
                  )
                })}
              </div>

              <div className="mt-4 flex justify-center">
                <Link
                  href={`/${locale}/services`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold transition-all"
                  style={{
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <Package className="w-4 h-4" /> {t.browseServices}
                </Link>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════
              ACTIVITY TAB
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-3xl overflow-hidden"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <Radio className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>{t.recentActivity}</h2>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-300/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {loc === 'ka' ? 'ლაივი' : loc === 'ru' ? 'Онлайн' : 'Live'}
                </span>
              </div>

              {[...RECENT_ACTIVITY, ...RECENT_ACTIVITY].map((item, i) => {
                const statusColor = item.status === 'done' ? 'text-emerald-400 bg-emerald-500/12 border-emerald-400/25' :
                  item.status === 'running' ? 'text-cyan-300 bg-cyan-500/12 border-cyan-400/25' :
                  'bg-transparent'
                const statusLabel = item.status === 'done' ? t.statusDone : item.status === 'running' ? t.statusRunning : t.statusQueued
                const svc = SERVICES.find(s => item.label.en.toLowerCase().includes(s.shortLabel.toLowerCase()))
                return (
                  <motion.div
                    key={i}
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="flex items-center gap-4 px-5 py-4 transition-colors"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-9 h-9 rounded-xl ${svc ? `bg-gradient-to-br ${svc.color}` : ''} flex items-center justify-center text-lg`}
                        style={!svc ? { backgroundColor: 'var(--card-hover)' } : undefined}>
                        {item.icon}
                      </div>
                      {item.status === 'running' && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyan-400 border-2 animate-pulse" style={{ borderColor: 'var(--color-bg)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{getLabel(item.label)}</p>
                      <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                        <Clock className="w-3 h-3" /> {getLabel(item.when)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusColor} shrink-0`}
                      style={item.status === 'queued' ? { color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' } : undefined}>
                      {statusLabel}
                    </span>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Bottom Banner ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="rounded-3xl border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(6,182,212,0.06),rgba(34,211,238,0.04))] p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                {loc === 'ka' ? '17 AI სერვისი — ერთ workspace-ში' : loc === 'ru' ? '17 AI-сервисов в одном пространстве' : '17 AI Services — one workspace'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {loc === 'ka' ? 'ყველა სერვისი კავშირში. Zero vendor lock-in.' : loc === 'ru' ? 'Все сервисы соединены. Без привязки к поставщику.' : 'All services connected. Zero vendor lock-in.'}
              </p>
            </div>
          </div>
          <Link
            href={`/${locale}/services`}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold hover:brightness-110 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {loc === 'ka' ? 'სრული სერვისები' : loc === 'ru' ? 'Все сервисы' : 'Explore Services'}
          </Link>
        </motion.div>

      </div>
    </div>
  )
}
