'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICES, type ServiceDefinition } from '@/lib/services/catalog'

/* ── i18n ── */
const COPY = {
  en: {
    eyebrow: 'WORKFLOW PIPELINE BUILDER',
    title: 'Build Your AI Pipeline',
    sub: 'Drag services into the chain. Connect them. Run the entire workflow with one click.',
    available: 'Available Services',
    pipeline: 'Your Pipeline',
    emptyHint: 'Tap a service to add it to the pipeline →',
    run: 'Execute Pipeline',
    clear: 'Clear',
    step: 'STEP',
    output: 'Output feeds into next step',
    ready: 'Pipeline ready — click Execute to run',
    addMore: '+ Add Step',
  },
  ka: {
    eyebrow: 'WORKFLOW PIPELINE BUILDER',
    title: 'ააწყვე შენი AI პაიპლაინი',
    sub: 'აირჩიე სერვისები, დააკავშირე ჯაჭვში და გაუშვი მთლიანი ნაკადი ერთი კლიკით.',
    available: 'ხელმისაწვდომი სერვისები',
    pipeline: 'შენი პაიპლაინი',
    emptyHint: 'დააჭირე სერვისს პაიპლაინში დასამატებლად →',
    run: 'გაშვება',
    clear: 'გასუფთავება',
    step: 'ნაბიჯი',
    output: 'შედეგი გადადის შემდეგ ნაბიჯზე',
    ready: 'პაიპლაინი მზადაა — დააჭირე გაშვებას',
    addMore: '+ ნაბიჯის დამატება',
  },
  ru: {
    eyebrow: 'WORKFLOW PIPELINE BUILDER',
    title: 'Построй свой AI-пайплайн',
    sub: 'Выбирай сервисы, соединяй в цепочку и запускай весь поток одним кликом.',
    available: 'Доступные сервисы',
    pipeline: 'Ваш пайплайн',
    emptyHint: 'Нажмите на сервис, чтобы добавить в пайплайн →',
    run: 'Запустить',
    clear: 'Очистить',
    step: 'ШАГ',
    output: 'Результат передаётся на следующий шаг',
    ready: 'Пайплайн готов — нажмите Запустить',
    addMore: '+ Добавить шаг',
  },
} as const

/* ── Metallic connector SVG between pipeline steps ── */
function PipelineConnector() {
  return (
    <div className="flex items-center justify-center py-1">
      <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
        <defs>
          <linearGradient id="connGrad" x1="18" y1="0" x2="18" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <line x1="18" y1="2" x2="18" y2="26" stroke="url(#connGrad)" strokeWidth="2" strokeDasharray="4 3" />
        <polygon points="12,20 18,28 24,20" fill="#22d3ee" opacity="0.7" />
      </svg>
    </div>
  )
}

/* ── Metallic service card in the available panel ── */
function ServiceChip({
  service,
  lang,
  onAdd,
  inPipeline,
}: {
  service: ServiceDefinition
  lang: 'en' | 'ka' | 'ru'
  onAdd: () => void
  inPipeline: boolean
}) {
  return (
    <button
      onClick={onAdd}
      className="group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all duration-200 active:scale-[0.97] select-none"
      style={{
        background: inPipeline
          ? 'linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(6,182,212,0.08) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        border: inPipeline
          ? '1px solid rgba(34,211,238,0.4)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: inPipeline
          ? '0 0 20px rgba(34,211,238,0.1), inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      {/* Metal shine strip */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.05) 55%, transparent 60%)',
        }}
      />
      <span className="text-lg shrink-0">{service.icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-bold truncate" style={{ color: inPipeline ? '#22d3ee' : 'rgba(255,255,255,0.85)' }}>
          {service.title[lang] || service.title.en}
        </div>
      </div>
      {!inPipeline && (
        <span className="ml-auto text-[10px] font-bold opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#22d3ee' }}>
          + ADD
        </span>
      )}
      {inPipeline && (
        <span className="ml-auto w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }} />
      )}
    </button>
  )
}

/* ── Pipeline step card — bold metallic robotic design ── */
function PipelineStep({
  service,
  lang,
  index,
  stepLabel,
  outputLabel,
  isLast,
  onRemove,
}: {
  service: ServiceDefinition
  lang: 'en' | 'ka' | 'ru'
  index: number
  stepLabel: string
  outputLabel: string
  isLast: boolean
  onRemove: () => void
}) {
  return (
    <div className="relative">
      <div
        className="relative rounded-2xl p-[1px] overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.3) 0%, rgba(255,255,255,0.06) 40%, rgba(34,211,238,0.15) 100%)',
        }}
      >
        <div
          className="rounded-2xl px-4 py-3 sm:px-5 sm:py-4"
          style={{
            background: 'linear-gradient(165deg, #0f1923 0%, #0a1018 50%, #0c1520 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          {/* Step badge */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] font-black tracking-[0.2em] px-2 py-0.5 rounded"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))',
                  border: '1px solid rgba(34,211,238,0.25)',
                  color: '#22d3ee',
                }}
              >
                {stepLabel} {index + 1}
              </span>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22d3ee', boxShadow: '0 0 8px #22d3ee' }} />
            </div>
            <button
              onClick={onRemove}
              className="w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:scale-110 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, rgba(255,70,70,0.15), rgba(255,70,70,0.05))',
                border: '1px solid rgba(255,70,70,0.2)',
                color: 'rgba(255,120,120,0.8)',
              }}
              aria-label="Remove step"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Service row */}
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(6,182,212,0.06))',
                border: '1px solid rgba(34,211,238,0.2)',
                boxShadow: '0 0 16px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              {service.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
                {service.title[lang] || service.title.en}
              </div>
              <div className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {service.description[lang] || service.description.en}
              </div>
            </div>
          </div>

          {/* Output line */}
          {!isLast && (
            <div className="mt-2 text-[10px] font-medium flex items-center gap-1.5" style={{ color: 'rgba(34,211,238,0.5)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {outputLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
 *  MAIN EXPORT — WorkflowPipelineBuilder
 * ════════════════════════════════════════════════════════════════════ */
export function WorkflowPipelineBuilder() {
  const { language } = useLanguage()
  const lang = (language as 'en' | 'ka' | 'ru') || 'en'
  const c = COPY[lang] || COPY.en

  const [pipeline, setPipeline] = useState<ServiceDefinition[]>([])
  const [runAnimation, setRunAnimation] = useState(false)
  const pipelineRef = useRef<HTMLDivElement>(null)

  const addService = useCallback((service: ServiceDefinition) => {
    setPipeline(prev => [...prev, service])
    // Scroll pipeline to bottom after adding
    setTimeout(() => {
      pipelineRef.current?.scrollTo({ top: pipelineRef.current.scrollHeight, behavior: 'smooth' })
    }, 100)
  }, [])

  const removeStep = useCallback((index: number) => {
    setPipeline(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearPipeline = useCallback(() => {
    setPipeline([])
    setRunAnimation(false)
  }, [])

  const runPipeline = useCallback(() => {
    if (pipeline.length === 0) return
    setRunAnimation(true)
    setTimeout(() => setRunAnimation(false), 2500)
  }, [pipeline])

  const pipelineSlugs = new Set(pipeline.map(s => s.slug))

  return (
    <section className="cinematic-section relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background textures */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(34,211,238,0.04) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.015]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      {/* Ambient light sweeps */}
      <div className="absolute top-0 left-0 w-96 h-96 pointer-events-none" style={{ background: 'radial-gradient(circle at 30% 20%, rgba(34,211,238,0.06), transparent 60%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 pointer-events-none" style={{ background: 'radial-gradient(circle at 70% 80%, rgba(6,182,212,0.05), transparent 60%)', filter: 'blur(80px)' }} />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <p
            className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3"
            style={{
              color: '#22d3ee',
              textShadow: '0 0 20px rgba(34,211,238,0.3)',
            }}
          >
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
            {c.title}
          </h2>
          <p className="mt-4 text-sm sm:text-base max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {c.sub}
          </p>
        </div>

        {/* ── Main operational window ── */}
        <div
          className="holo-panel relative !rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(170deg, #0b1219 0%, #080e14 40%, #0a1018 100%)',
            boxShadow: '0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <div
            className="rounded-3xl overflow-hidden"
          >
            {/* Window title bar — metallic */}
            <div
              className="flex items-center justify-between px-4 sm:px-6 py-3"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
                </div>
                <span className="ml-3 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  PIPELINE CONTROL
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }} />
                <span className="text-[9px] font-bold" style={{ color: 'rgba(34,211,238,0.6)' }}>ONLINE</span>
              </div>
            </div>

            {/* Main grid: services panel + pipeline panel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] min-h-[520px]">

              {/* ── LEFT: Available Services ── */}
              <div
                className="p-4 sm:p-6 overflow-y-auto"
                style={{
                  borderRight: '1px solid rgba(255,255,255,0.04)',
                  maxHeight: '600px',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                  <span className="text-xs font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {c.available}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  {SERVICES.map(s => (
                    <ServiceChip
                      key={s.slug}
                      service={s}
                      lang={lang}
                      onAdd={() => addService(s)}
                      inPipeline={pipelineSlugs.has(s.slug)}
                    />
                  ))}
                </div>
              </div>

              {/* ── RIGHT: Pipeline Chain ── */}
              <div className="relative p-4 sm:p-6 flex flex-col">
                {/* Panel header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
                      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
                    </svg>
                    <span className="text-xs font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {c.pipeline}
                    </span>
                    {pipeline.length > 0 && (
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{
                          background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.08))',
                          border: '1px solid rgba(34,211,238,0.2)',
                          color: '#22d3ee',
                        }}
                      >
                        {pipeline.length}
                      </span>
                    )}
                  </div>
                  {pipeline.length > 0 && (
                    <button
                      onClick={clearPipeline}
                      className="text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-lg transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,70,70,0.1), rgba(255,70,70,0.04))',
                        border: '1px solid rgba(255,70,70,0.15)',
                        color: 'rgba(255,120,120,0.7)',
                      }}
                    >
                      {c.clear}
                    </button>
                  )}
                </div>

                {/* Pipeline steps */}
                <div ref={pipelineRef} className="flex-1 overflow-y-auto pr-1 space-y-0" style={{ maxHeight: '420px' }}>
                  {pipeline.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center min-h-[300px]">
                      <div className="text-center">
                        <div
                          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                            border: '1px dashed rgba(255,255,255,0.1)',
                          }}
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </div>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{c.emptyHint}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {pipeline.map((service, i) => (
                        <div key={`${service.slug}-${i}`}>
                          <PipelineStep
                            service={service}
                            lang={lang}
                            index={i}
                            stepLabel={c.step}
                            outputLabel={c.output}
                            isLast={i === pipeline.length - 1}
                            onRemove={() => removeStep(i)}
                          />
                          {i < pipeline.length - 1 && <PipelineConnector />}
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Action bar — metallic buttons */}
                {pipeline.length > 0 && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Status line */}
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: runAnimation ? '#fbbf24' : '#22d3ee',
                          boxShadow: runAnimation ? '0 0 8px #fbbf24' : '0 0 8px #22d3ee',
                          animation: runAnimation ? 'pulse 0.6s ease-in-out infinite' : undefined,
                        }}
                      />
                      <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {runAnimation ? 'PROCESSING...' : c.ready}
                      </span>
                    </div>

                    <div className="flex gap-3">
                      {/* Execute button — bold metallic */}
                      <Link
                        href={'/' + language + '/services/workflow'}
                        onClick={runPipeline}
                        className="cinematic-btn cinematic-btn-primary flex-1 rounded-xl py-3 text-center"
                      >
                        <span className="relative text-sm font-black tracking-wider text-white uppercase">
                          {runAnimation ? '⏳ ...' : `⚡ ${c.run}`}
                        </span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
