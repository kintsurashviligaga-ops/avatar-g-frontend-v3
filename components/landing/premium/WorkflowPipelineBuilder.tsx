'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES, type ServiceDefinition } from '@/lib/services/catalog'

/* ══════════════════════════════════════════════════════════════════
 *  ACCENT COLOURS — per-service, matches PageEnvironment moods
 * ══════════════════════════════════════════════════════════════════ */
const ACCENT: Record<string, string> = {
  avatar: '#a78bfa', video: '#f59e0b', image: '#f472b6',
  music: '#34d399', text: '#818cf8', editing: '#06b6d4',
  photo: '#fb923c', workflow: '#fb923c', 'agent-g': '#22d3ee',
  'visual-intel': '#3b82f6', prompt: '#fbbf24', media: '#ec4899',
  business: '#8b5cf6', shop: '#10b981', software: '#6366f1',
  tourism: '#14b8a6',
}
const ac = (slug: string) => ACCENT[slug] || '#22d3ee'

const BUILDER_SLUGS = new Set(['avatar', 'video', 'image', 'music', 'text', 'workflow', 'agent-g'])
const BUILDER_SERVICES = SERVICES.filter(s => BUILDER_SLUGS.has(s.slug))

/* ══════════════════════════════════════════════════════════════════
 *  TYPES
 * ══════════════════════════════════════════════════════════════════ */
type Lang = 'en' | 'ka' | 'ru'

interface PipelineStep {
  slug: string
  service: ServiceDefinition
  status: 'idle' | 'running' | 'complete'
}

interface Template {
  id: string
  icon: string
  name: { en: string; ka: string; ru: string }
  desc: { en: string; ka: string; ru: string }
  slugs: string[]
}

/* ══════════════════════════════════════════════════════════════════
 *  i18n COPY
 * ══════════════════════════════════════════════════════════════════ */
const COPY = {
  en: {
    eyebrow: 'AI WORKFLOW ENGINE',
    title: 'One Platform.\nEvery Creative Tool.',
    sub: 'Chain AI services into automated pipelines. Pick a workflow or build your own — launch everything with a single click.',
    servicesLabel: 'AVAILABLE SERVICES',
    pipelineLabel: 'PIPELINE',
    runBtn: 'Run Pipeline',
    tryBuilder: 'Open the Builder',
    templates: 'QUICK START',
    processing: 'Processing…',
    complete: 'Complete!',
    ready: 'Ready',
  },
  ka: {
    eyebrow: 'AI WORKFLOW ENGINE',
    title: 'ერთი პლატფორმა.\nყველა ინსტრუმენტი.',
    sub: 'დააკავშირე AI სერვისები ავტომატიზირებულ პაიპლაინებში. აირჩიე შაბლონი ან ააწყვე თავად — გაუშვი ყველაფერი ერთი კლიკით.',
    servicesLabel: 'ხელმისაწვდომი სერვისები',
    pipelineLabel: 'პაიპლაინი',
    runBtn: 'გაშვება',
    tryBuilder: 'გახსენი ბილდერი',
    templates: 'სწრაფი დაწყება',
    processing: 'მუშავდება…',
    complete: 'დასრულდა!',
    ready: 'მზადაა',
  },
  ru: {
    eyebrow: 'AI WORKFLOW ENGINE',
    title: 'Одна платформа.\nВсе инструменты.',
    sub: 'Соединяй AI-сервисы в автоматизированные потоки. Выбери шаблон или построй сам — запусти всё одним кликом.',
    servicesLabel: 'Доступные сервисы',
    pipelineLabel: 'Пайплайн',
    runBtn: 'Запустить',
    tryBuilder: 'Открыть билдер',
    templates: 'Быстрый старт',
    processing: 'Обработка…',
    complete: 'Готово!',
    ready: 'Готов',
  },
} as const

/* ══════════════════════════════════════════════════════════════════
 *  TEMPLATES
 * ══════════════════════════════════════════════════════════════════ */
const TEMPLATES: Template[] = [
  {
    id: 'social', icon: '📱',
    name: { en: 'Social Content', ka: 'სოციალური კონტენტი', ru: 'Соцсети' },
    desc: { en: 'Write → Design → Produce', ka: 'ტექსტი → დიზაინი → ვიდეო', ru: 'Текст → Дизайн → Видео' },
    slugs: ['text', 'image', 'video'],
  },
  {
    id: 'music-video', icon: '🎵',
    name: { en: 'Music Video', ka: 'მუსიკალური ვიდეო', ru: 'Клип' },
    desc: { en: 'Compose → Visualize → Render', ka: 'კომპოზიცია → ვიზუალი → რენდერი', ru: 'Музыка → Визуал → Рендер' },
    slugs: ['text', 'music', 'image', 'video'],
  },
  {
    id: 'brand', icon: '✨',
    name: { en: 'Brand Identity', ka: 'ბრენდი', ru: 'Бренд' },
    desc: { en: 'Avatar → Visuals → Copy', ka: 'ავატარი → ვიზუალი → კოპი', ru: 'Аватар → Визуал → Текст' },
    slugs: ['avatar', 'image', 'text'],
  },
  {
    id: 'full', icon: '🚀',
    name: { en: 'Full Production', ka: 'სრული პროდაქშენი', ru: 'Полный продакшн' },
    desc: { en: 'End-to-end content pipeline', ka: 'სრული კონტენტ პაიპლაინი', ru: 'Полный контент-пайплайн' },
    slugs: ['text', 'avatar', 'image', 'music', 'video'],
  },
]

/* ══════════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS
 * ══════════════════════════════════════════════════════════════════ */

/* ── Service node glass card ── */
const ServiceNode = memo(function ServiceNode({
  svc,
  status,
  delay,
}: {
  svc: ServiceDefinition
  status: 'idle' | 'running' | 'complete'
  delay: number
}) {
  const color = ac(svc.slug)
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div
        className="relative w-[110px] sm:w-[124px] rounded-2xl p-[1px] transition-all duration-500"
        style={{
          background:
            status === 'complete'
              ? `linear-gradient(135deg, ${color}88, ${color}33)`
              : status === 'running'
                ? `linear-gradient(135deg, ${color}66, ${color}22)`
                : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
          boxShadow:
            status === 'running'
              ? `0 0 40px ${color}25, 0 8px 32px rgba(0,0,0,0.3)`
              : status === 'complete'
                ? `0 0 30px ${color}15, 0 8px 32px rgba(0,0,0,0.3)`
                : '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div
          className="rounded-2xl px-3 py-4 text-center"
          style={{ background: 'linear-gradient(165deg, rgba(15,25,35,0.95), rgba(10,16,24,0.98))' }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mx-auto mb-2.5 transition-all duration-500"
            style={{
              background: `linear-gradient(135deg, ${color}18, ${color}06)`,
              border: `1px solid ${color}${status !== 'idle' ? '40' : '20'}`,
              boxShadow: status === 'running' ? `0 0 16px ${color}30` : 'none',
            }}
          >
            {svc.icon}
          </div>
          <div
            className="text-[11px] font-semibold truncate mb-1"
            style={{ color: 'rgba(255,255,255,0.88)' }}
          >
            {svc.title.en}
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full transition-all duration-300"
              style={{
                backgroundColor:
                  status === 'complete' ? '#34d399' : status === 'running' ? '#fbbf24' : `${color}66`,
                boxShadow:
                  status === 'running'
                    ? '0 0 8px #fbbf24'
                    : status === 'complete'
                      ? '0 0 8px #34d399'
                      : 'none',
                animation: status === 'running' ? 'pulse 0.8s ease-in-out infinite' : undefined,
              }}
            />
            <span
              className="text-[9px] font-medium"
              style={{
                color:
                  status === 'complete'
                    ? '#34d399'
                    : status === 'running'
                      ? '#fbbf24'
                      : 'rgba(255,255,255,0.25)',
              }}
            >
              {status === 'complete' ? '✓' : status === 'running' ? '⏳' : '○'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
})

/* ── Connector arrow ── */
const Connector = memo(function Connector({
  color,
  active,
  delay,
}: {
  color: string
  active: boolean
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.3, delay: delay + 0.1 }}
      className="flex items-center justify-center shrink-0"
    >
      {/* Desktop: horizontal */}
      <svg className="hidden sm:block" width="36" height="20" viewBox="0 0 36 20" fill="none">
        <line
          x1="0" y1="10" x2="28" y2="10"
          stroke={active ? color : 'rgba(255,255,255,0.1)'}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        >
          {active && (
            <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.8s" repeatCount="indefinite" />
          )}
        </line>
        <polygon points="28,5 36,10 28,15" fill={active ? color : 'rgba(255,255,255,0.08)'} />
      </svg>
      {/* Mobile: vertical */}
      <svg className="block sm:hidden" width="20" height="28" viewBox="0 0 20 28" fill="none">
        <line
          x1="10" y1="0" x2="10" y2="20"
          stroke={active ? color : 'rgba(255,255,255,0.1)'}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        >
          {active && (
            <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.8s" repeatCount="indefinite" />
          )}
        </line>
        <polygon points="5,20 10,28 15,20" fill={active ? color : 'rgba(255,255,255,0.08)'} />
      </svg>
    </motion.div>
  )
})

/* ── Template pill ── */
const TemplatePill = memo(function TemplatePill({
  tpl,
  lang,
  active,
  onPick,
}: {
  tpl: Template
  lang: Lang
  active: boolean
  onPick: () => void
}) {
  return (
    <button
      onClick={onPick}
      className="shrink-0 flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 active:scale-[0.97] select-none whitespace-nowrap"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(6,182,212,0.06))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        border: active ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: active ? '0 0 30px rgba(34,211,238,0.08)' : 'none',
      }}
    >
      <span className="text-lg">{tpl.icon}</span>
      <div className="text-left">
        <div
          className="text-xs font-bold"
          style={{ color: active ? '#22d3ee' : 'rgba(255,255,255,0.8)' }}
        >
          {tpl.name[lang]}
        </div>
        <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {tpl.desc[lang]}
        </div>
      </div>
    </button>
  )
})

/* ══════════════════════════════════════════════════════════════════
 *  MAIN EXPORT
 * ══════════════════════════════════════════════════════════════════ */
export function WorkflowPipelineBuilder() {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  /* ── State ── */
  const [activeTpl, setActiveTpl] = useState<string>('social')
  const [pipeline, setPipeline] = useState<PipelineStep[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const timers = useRef<number[]>([])

  /* Build pipeline from active template */
  const buildPipeline = useCallback(
    (tplId: string) => {
      const tpl = TEMPLATES.find(t => t.id === tplId)
      if (!tpl) return
      timers.current.forEach(clearTimeout)
      timers.current = []
      setIsRunning(false)
      setIsComplete(false)
      setPipeline(
        tpl.slugs
          .map(slug => {
            const svc = SERVICES.find(s => s.slug === slug)
            return svc ? { slug, service: svc, status: 'idle' as const } : null
          })
          .filter(Boolean) as PipelineStep[],
      )
    },
    [],
  )

  /* Init with default template */
  useEffect(() => {
    buildPipeline('social')
  }, [buildPipeline])

  /* Cleanup */
  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout)
    }
  }, [])

  const selectTemplate = useCallback(
    (tplId: string) => {
      setActiveTpl(tplId)
      buildPipeline(tplId)
    },
    [buildPipeline],
  )

  /* Run animation */
  const runPipeline = useCallback(() => {
    if (!pipeline.length || isRunning) return
    setIsRunning(true)
    setIsComplete(false)
    setPipeline(prev => prev.map(n => ({ ...n, status: 'idle' as const })))
    timers.current.forEach(clearTimeout)
    timers.current = []

    pipeline.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setPipeline(prev =>
            prev.map((n, j) => (j === i ? { ...n, status: 'running' as const } : n)),
          )
        }, i * 900),
        window.setTimeout(() => {
          setPipeline(prev =>
            prev.map((n, j) => (j === i ? { ...n, status: 'complete' as const } : n)),
          )
        }, i * 900 + 650),
      )
    })

    timers.current.push(
      window.setTimeout(() => {
        setIsRunning(false)
        setIsComplete(true)
      }, pipeline.length * 900 + 650),
    )
  }, [pipeline, isRunning])

  /* ── Render ── */
  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* ── Background atmosphere ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.012]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        className="absolute top-0 left-0 w-[500px] h-[500px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.06), transparent 60%)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-[500px] h-[500px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 80% 80%, rgba(6,182,212,0.05), transparent 60%)',
          filter: 'blur(100px)',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* ═══════════ HEADER — text left, badge right ═══════════ */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14 sm:mb-18">
          <div className="max-w-xl">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-4"
              style={{ color: '#22d3ee', textShadow: '0 0 20px rgba(34,211,238,0.3)' }}
            >
              {c.eyebrow}
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight whitespace-pre-line"
              style={{ color: 'rgba(255,255,255,0.95)', lineHeight: 1.15 }}
            >
              {c.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-5 text-sm sm:text-base leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              {c.sub}
            </motion.p>
          </div>

          {/* Status badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="flex items-center gap-2 self-start lg:self-end"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: isRunning ? '#fbbf24' : isComplete ? '#34d399' : '#22d3ee',
                boxShadow: `0 0 10px ${isRunning ? '#fbbf24' : isComplete ? '#34d399' : '#22d3ee'}`,
                animation: isRunning ? 'pulse 0.6s ease-in-out infinite' : undefined,
              }}
            />
            <span
              className="text-[10px] font-bold tracking-wider uppercase"
              style={{
                color: isRunning
                  ? 'rgba(251,191,36,0.7)'
                  : isComplete
                    ? 'rgba(52,211,153,0.7)'
                    : 'rgba(34,211,238,0.6)',
              }}
            >
              {isRunning ? c.processing : isComplete ? c.complete : c.ready}
            </span>
          </motion.div>
        </div>

        {/* ═══════════ TEMPLATE SELECTOR BAR ═══════════ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <span
              className="text-[10px] font-black tracking-[0.15em] uppercase"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              {c.templates}
            </span>
          </div>
          <div
            className="flex gap-2.5 overflow-x-auto pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {TEMPLATES.map(t => (
              <TemplatePill
                key={t.id}
                tpl={t}
                lang={lang}
                active={activeTpl === t.id}
                onPick={() => selectTemplate(t.id)}
              />
            ))}
          </div>
        </motion.div>

        {/* ═══════════ MAIN GLASS PANEL ═══════════ */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
            boxShadow:
              '0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Window chrome */}
          <div
            className="flex items-center justify-between px-5 sm:px-6 py-3"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
              </div>
              <span
                className="ml-3 text-[10px] font-bold tracking-[0.15em] uppercase"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                PIPELINE STUDIO
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: isRunning ? '#fbbf24' : isComplete ? '#34d399' : '#22d3ee',
                  boxShadow: `0 0 6px ${isRunning ? '#fbbf24' : isComplete ? '#34d399' : '#22d3ee'}`,
                }}
              />
              <span
                className="text-[9px] font-bold"
                style={{
                  color: isRunning
                    ? 'rgba(251,191,36,0.7)'
                    : isComplete
                      ? 'rgba(52,211,153,0.7)'
                      : 'rgba(34,211,238,0.6)',
                }}
              >
                ONLINE
              </span>
            </div>
          </div>

          {/* ── Inner layout: services rail + pipeline visualization ── */}
          <div className="flex flex-col lg:flex-row">
            {/* LEFT — Services rail */}
            <div
              className="lg:w-[180px] shrink-0 p-4 overflow-x-auto lg:overflow-y-auto border-b lg:border-b-0 lg:border-r"
              style={{ borderColor: 'rgba(255,255,255,0.04)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <span
                  className="text-[10px] font-bold tracking-[0.1em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {c.servicesLabel}
                </span>
              </div>
              <div className="flex lg:flex-col gap-2 lg:gap-1.5">
                {BUILDER_SERVICES.map(s => {
                  const color = ac(s.slug)
                  const inPipeline = pipeline.some(p => p.slug === s.slug)
                  return (
                    <div
                      key={s.slug}
                      className="shrink-0 flex items-center gap-2 px-3 py-2 lg:py-2.5 rounded-xl transition-all duration-200"
                      style={{
                        background: inPipeline
                          ? `linear-gradient(135deg, ${color}22, ${color}0a)`
                          : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                        border: inPipeline
                          ? `1px solid ${color}55`
                          : '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <span className="text-lg shrink-0">{s.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[11px] font-bold truncate"
                          style={{ color: inPipeline ? color : 'rgba(255,255,255,0.8)' }}
                        >
                          {s.title[lang] || s.title.en}
                        </div>
                        <div
                          className="text-[10px] truncate hidden lg:block"
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                        >
                          {s.description[lang] || s.description.en}
                        </div>
                      </div>
                      {inPipeline && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CENTER — Pipeline visualization + controls */}
            <div className="flex-1 flex flex-col p-5 sm:p-6 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"
                >
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
                </svg>
                <span
                  className="text-[10px] font-bold tracking-[0.1em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {c.pipelineLabel}
                </span>
                {pipeline.length > 0 && (
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(34,211,238,0.15)',
                      border: '1px solid rgba(34,211,238,0.2)',
                      color: '#22d3ee',
                    }}
                  >
                    {pipeline.length}
                  </span>
                )}
              </div>

              {/* Pipeline node flow */}
              <div
                className="flex-1 min-h-[220px] flex items-center justify-center overflow-x-auto rounded-xl p-4 sm:p-6"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.015), rgba(255,255,255,0.005))',
                  border: '1px solid rgba(255,255,255,0.04)',
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              >
                <div className="flex flex-col sm:flex-row items-center gap-1">
                  {pipeline.map((step, i) => (
                    <div key={step.slug} className="flex flex-col sm:flex-row items-center">
                      <ServiceNode
                        svc={step.service}
                        status={step.status}
                        delay={i * 0.1}
                      />
                      {i < pipeline.length - 1 && (
                        <Connector
                          color={ac(step.slug)}
                          active={
                            step.status === 'complete' &&
                            pipeline[i + 1]?.status === 'running'
                          }
                          delay={i * 0.1}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action bar */}
              {pipeline.length > 0 && (
                <div
                  className="mt-5 pt-5 flex flex-wrap items-center gap-3"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-1.5 mr-auto">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isComplete
                          ? '#34d399'
                          : isRunning
                            ? '#fbbf24'
                            : '#22d3ee',
                        boxShadow: `0 0 8px ${isComplete ? '#34d399' : isRunning ? '#fbbf24' : '#22d3ee'}`,
                        animation: isRunning ? 'pulse 0.6s ease-in-out infinite' : undefined,
                      }}
                    />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      {isRunning ? c.processing : isComplete ? c.complete : c.ready}
                    </span>
                  </div>

                  {/* Run Pipeline */}
                  <button
                    onClick={runPipeline}
                    disabled={isRunning}
                    className="rounded-xl px-6 py-2.5 text-xs font-black tracking-wider uppercase transition-all duration-300 active:scale-95 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))',
                      border: '1px solid rgba(34,211,238,0.3)',
                      color: '#22d3ee',
                      boxShadow: '0 0 20px rgba(34,211,238,0.1)',
                    }}
                  >
                    {isRunning ? `⏳ ${c.processing}` : `⚡ ${c.runBtn}`}
                  </button>

                  {/* Open Builder CTA */}
                  <Link
                    href={`/${language}/services/workflow`}
                    className="rounded-xl px-5 py-2.5 text-xs font-bold tracking-wider uppercase transition-all duration-300 active:scale-95"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {c.tryBuilder} →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
