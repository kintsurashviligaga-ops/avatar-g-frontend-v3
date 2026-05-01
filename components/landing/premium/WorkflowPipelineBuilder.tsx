'use client'

/**
 * WorkflowPipelineBuilder — Clean, minimal, highly-usable pipeline builder.
 * Pick a template or tap services to build a chain, then run.
 * Designed for instant comprehension and one-tap interaction.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES, type ServiceDefinition } from '@/lib/services/catalog'

type Lang = 'en' | 'ka' | 'ru'

const ACCENT: Record<string, string> = {
  avatar: '#a78bfa', video: '#f59e0b', image: '#f472b6', music: '#34d399',
  text: '#818cf8', editing: '#06b6d4', photo: '#fb923c', workflow: '#fb923c',
  'agent-g': '#22d3ee', 'visual-intel': '#3b82f6', prompt: '#fbbf24',
  media: '#ec4899', business: '#8b5cf6', shop: '#10b981', software: '#6366f1',
  tourism: '#14b8a6',
}
const ac = (slug: string) => ACCENT[slug] || '#22d3ee'

const COPY = {
  en: {
    eyebrow: 'PIPELINE STUDIO',
    title: 'Build Your AI Pipeline',
    sub: 'Pick a template or tap services to chain them. Run everything in one click.',
    templates: 'Quick Start',
    services: 'Services',
    pipeline: 'Your Pipeline',
    empty: 'Tap services below to add steps',
    run: 'Run Pipeline',
    running: 'Running...',
    done: 'Complete!',
    clear: 'Clear',
    openBuilder: 'Full Builder',
    steps: 'steps',
  },
  ka: {
    eyebrow: 'PIPELINE STUDIO',
    title: 'ააწყვე AI პაიპლაინი',
    sub: 'აარჩიე შაბლონი ან დააჭირე სერვისებს ჯაჭვის ასაწყობად.',
    templates: 'სწრაფი დაწყება',
    services: 'სერვისები',
    pipeline: 'შენი პაიპლაინი',
    empty: 'დააჭირე სერვისებს ნაბიჯების დასამატებლად',
    run: 'გაშვება',
    running: 'მუშავდება...',
    done: 'დასრულდა!',
    clear: 'გასუფთავება',
    openBuilder: 'სრული კონსტრუქტორი',
    steps: 'ნაბიჯი',
  },
  ru: {
    eyebrow: 'PIPELINE STUDIO',
    title: 'Создайте AI-пайплайн',
    sub: 'Выберите шаблон или добавьте сервисы в цепочку. Запуск в один клик.',
    templates: 'Быстрый старт',
    services: 'Сервисы',
    pipeline: 'Ваш пайплайн',
    empty: 'Нажмите на сервисы чтобы добавить шаги',
    run: 'Запустить',
    running: 'Запуск...',
    done: 'Готово!',
    clear: 'Очистить',
    openBuilder: 'Полный конструктор',
    steps: 'шагов',
  },
} as const

interface Template { id: string; icon: string; name: Record<Lang, string>; slugs: string[] }

const TEMPLATES: Template[] = [
  { id: 'social', icon: '📱', name: { en: 'Social Content', ka: 'სოციალური', ru: 'Соцсети' }, slugs: ['text', 'image', 'video'] },
  { id: 'music-video', icon: '🎵', name: { en: 'Music Video', ka: 'მუსვიდეო', ru: 'Клип' }, slugs: ['text', 'music', 'image', 'video'] },
  { id: 'brand', icon: '✨', name: { en: 'Brand Identity', ka: 'ბრენდი', ru: 'Бренд' }, slugs: ['avatar', 'image', 'text'] },
  { id: 'full', icon: '🚀', name: { en: 'Full Production', ka: 'პროდაქშენი', ru: 'Продакшн' }, slugs: ['text', 'avatar', 'image', 'music', 'video'] },
]

interface Step { slug: string; svc: ServiceDefinition; status: 'idle' | 'running' | 'done' }

interface WorkflowPipelineBuilderProps {
  createdAvatar?: string | null
}

export function WorkflowPipelineBuilder({ createdAvatar }: WorkflowPipelineBuilderProps) {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const [steps, setSteps] = useState<Step[]>([])
  const [activeTpl, setActiveTpl] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  /* ── Load from template ── */
  const loadTemplate = useCallback((tpl: Template) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setIsRunning(false)
    setIsDone(false)
    setActiveTpl(tpl.id)
    setSteps(
      tpl.slugs
        .map(slug => {
          const svc = SERVICES.find(s => s.slug === slug)
          return svc ? { slug, svc, status: 'idle' as const } : null
        })
        .filter(Boolean) as Step[],
    )
  }, [])

  /* ── Toggle service in pipeline ── */
  const toggleService = useCallback((svc: ServiceDefinition) => {
    setActiveTpl(null)
    setIsRunning(false)
    setIsDone(false)
    timers.current.forEach(clearTimeout)
    timers.current = []
    setSteps(prev => {
      const exists = prev.findIndex(s => s.slug === svc.slug)
      if (exists >= 0) return prev.filter((_, i) => i !== exists)
      return [...prev, { slug: svc.slug, svc, status: 'idle' as const }]
    })
  }, [])

  /* ── Remove step ── */
  const removeStep = useCallback((idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx))
    setActiveTpl(null)
  }, [])

  /* ── Clear ── */
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setSteps([])
    setActiveTpl(null)
    setIsRunning(false)
    setIsDone(false)
  }, [])

  /* ── Run animation ── */
  const run = useCallback(() => {
    if (!steps.length || isRunning) return
    setIsRunning(true)
    setIsDone(false)
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle' as const })))
    timers.current.forEach(clearTimeout)
    timers.current = []

    steps.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => setSteps(p => p.map((s, j) => j === i ? { ...s, status: 'running' } : s)), i * 800),
        window.setTimeout(() => setSteps(p => p.map((s, j) => j === i ? { ...s, status: 'done' } : s)), i * 800 + 600),
      )
    })
    timers.current.push(window.setTimeout(() => { setIsRunning(false); setIsDone(true) }, steps.length * 800 + 600))
  }, [steps, isRunning])

  const pipelineSlugs = new Set(steps.map(s => s.slug))

  return (
    <section id="workflow-builder" className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-5xl mx-auto">
        {/* ─── HEADER ─── */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3" style={{ color: '#22d3ee' }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
          <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>{c.sub}</p>
          {createdAvatar && (
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}>
                <Image src={createdAvatar} alt="" width={120} height={120} className="w-7 h-7 rounded-lg object-cover" style={{ border: '1px solid rgba(34,211,238,0.3)' }} />
              <span className="text-xs font-bold" style={{ color: '#22d3ee' }}>Avatar ready</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#34d399', boxShadow: '0 0 6px #34d399' }} />
            </div>
          )}
        </div>

        {/* ─── TEMPLATES ROW ─── */}
        <div className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.templates}</p>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => loadTemplate(tpl)}
                className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: activeTpl === tpl.id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                  border: activeTpl === tpl.id ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-base">{tpl.icon}</span>
                <span className="text-xs font-bold" style={{ color: activeTpl === tpl.id ? '#22d3ee' : 'rgba(255,255,255,0.7)' }}>{tpl.name[lang]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── MAIN PANEL ─── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: '0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.04)',
          }}
        >
          {/* Window chrome */}
          <div className="flex items-center justify-between px-5 py-3" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
              </div>
              <span className="ml-3 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>PIPELINE STUDIO</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: isRunning ? '#fbbf24' : isDone ? '#34d399' : '#22d3ee', boxShadow: `0 0 6px ${isRunning ? '#fbbf24' : isDone ? '#34d399' : '#22d3ee'}` }} />
              <span className="text-[9px] font-bold" style={{ color: isRunning ? 'rgba(251,191,36,0.7)' : isDone ? 'rgba(52,211,153,0.7)' : 'rgba(34,211,238,0.6)' }}>
                {isRunning ? 'RUNNING' : isDone ? 'DONE' : 'READY'}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* ── PIPELINE VISUALIZATION ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {c.pipeline} {steps.length > 0 && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.15)', color: 'rgba(34,211,238,0.8)' }}>{steps.length} {c.steps}</span>}
                </p>
                {steps.length > 0 && (
                  <button onClick={clear} className="text-[10px] font-bold uppercase tracking-wider transition-colors" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {c.clear}
                  </button>
                )}
              </div>

              <div
                className="min-h-[120px] rounded-2xl flex items-center overflow-x-auto p-4 gap-2"
                style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <AnimatePresence mode="popLayout">
                  {steps.length === 0 && (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full text-center text-xs"
                      style={{ color: 'rgba(255,255,255,0.2)' }}
                    >
                      {c.empty}
                    </motion.p>
                  )}
                  {steps.map((step, i) => {
                    const color = ac(step.slug)
                    return (
                      <motion.div
                        key={step.slug}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-2 shrink-0"
                      >
                        {/* Step card */}
                        <div
                          className="relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-300 group cursor-default"
                          style={{
                            background: step.status === 'done' ? `linear-gradient(135deg, ${color}20, ${color}08)` : step.status === 'running' ? `linear-gradient(135deg, ${color}15, ${color}05)` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${step.status !== 'idle' ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                            boxShadow: step.status === 'running' ? `0 0 20px ${color}15` : 'none',
                          }}
                        >
                          <span className="text-lg">{step.svc.icon}</span>
                          <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: step.status !== 'idle' ? color : 'rgba(255,255,255,0.8)' }}>
                            {step.svc.title[lang] || step.svc.title.en}
                          </span>
                          {/* Status dot */}
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                            style={{
                              backgroundColor: step.status === 'done' ? '#34d399' : step.status === 'running' ? '#fbbf24' : 'rgba(255,255,255,0.15)',
                              boxShadow: step.status !== 'idle' ? `0 0 6px ${step.status === 'done' ? '#34d399' : '#fbbf24'}` : 'none',
                              animation: step.status === 'running' ? 'pulse 0.6s ease-in-out infinite' : undefined,
                            }}
                          />
                          {/* Remove button */}
                          {!isRunning && (
                            <button
                              onClick={() => removeStep(i)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: 'rgba(255,95,87,0.8)', color: '#fff', fontSize: 9 }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {/* Arrow connector */}
                        {i < steps.length - 1 && (
                          <svg width="24" height="12" viewBox="0 0 24 12" fill="none" className="shrink-0">
                            <line x1="0" y1="6" x2="16" y2="6" stroke={step.status === 'done' ? color : 'rgba(255,255,255,0.1)'} strokeWidth="1.5" strokeDasharray="3 2" />
                            <polygon points="16,2 24,6 16,10" fill={step.status === 'done' ? color : 'rgba(255,255,255,0.08)'} />
                          </svg>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* ── SERVICE GRID (tap to add) ── */}
            <div>
              <p className="text-[10px] font-bold tracking-[0.1em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>{c.services}</p>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-2">
                {SERVICES.map(svc => {
                  const color = ac(svc.slug)
                  const inPipeline = pipelineSlugs.has(svc.slug)
                  return (
                    <button
                      key={svc.slug}
                      onClick={() => toggleService(svc)}
                      disabled={isRunning}
                      className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-40"
                      style={{
                        background: inPipeline ? `linear-gradient(135deg, ${color}15, ${color}05)` : 'rgba(255,255,255,0.02)',
                        border: inPipeline ? `1px solid ${color}40` : '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <span className="text-xl">{svc.icon}</span>
                      <span className="text-[9px] font-bold truncate w-full text-center" style={{ color: inPipeline ? color : 'rgba(255,255,255,0.5)' }}>
                        {svc.title[lang]?.split(' ')[0] || svc.title.en.split(' ')[0]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── ACTION BAR ── */}
            {steps.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={run}
                  disabled={isRunning}
                  className="px-6 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all duration-300 active:scale-95 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee', boxShadow: '0 0 20px rgba(34,211,238,0.1)' }}
                >
                  {isRunning ? c.running : isDone ? c.done : c.run}
                </button>
                <Link
                  href={`/${language}/services/workflow`}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {c.openBuilder} →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
