import React from 'react'
import { Upload, BrainCircuit, Sparkles, ShieldCheck, Download, ArrowRight, Image as ImageIcon, Video, Music, FileText, Rocket } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    title: 'Workflow Pipeline',
    subtitle: 'A clear path from idea to outcome with Agent G coordinating every stage.',
    rail: 'Idea -> Agent G -> Creation -> Automation -> Result',
    loopTitle: 'Create -> Optimize -> Automate -> Sell -> Scale',
    loop: ['Idea', 'Plan', 'Generate', 'Automate', 'Result'],
    artifacts: 'Live Output Types',
  },
  ka: {
    title: 'Workflow Pipeline',
    subtitle: 'იდეიდან შედეგამდე მკაფიო გზა, სადაც Agent G კოორდინაციას უწევს ყველა ეტაპს.',
    rail: 'Idea -> Agent G -> Creation -> Automation -> Result',
    loopTitle: 'Create -> Optimize -> Automate -> Sell -> Scale',
    loop: ['Idea', 'Plan', 'Generate', 'Automate', 'Result'],
    artifacts: 'Live Output Types',
  },
  ru: {
    title: 'Workflow Pipeline',
    subtitle: 'Понятный путь от идеи до результата под координацией Agent G.',
    rail: 'Idea -> Agent G -> Creation -> Automation -> Result',
    loopTitle: 'Create -> Optimize -> Automate -> Sell -> Scale',
    loop: ['Idea', 'Plan', 'Generate', 'Automate', 'Result'],
    artifacts: 'Live Output Types',
  },
} as const

const STEPS = {
  en: [
    { id: 'idea', title: '1) Idea', subtitle: 'Goal + brief', detail: 'Define what you want to create and the target outcome.', icon: Upload, tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35' },
    { id: 'plan', title: '2) Agent G', subtitle: 'Direction + planning', detail: 'Agent G selects modules, assigns tasks, and builds the execution plan.', icon: BrainCircuit, tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35' },
    { id: 'create', title: '3) Creation', subtitle: 'AI production', detail: 'Avatar, video, music, image and text modules generate assets in parallel.', icon: Sparkles, tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35' },
    { id: 'automate', title: '4) Automation', subtitle: 'Workflow execution', detail: 'Rules and workflows handle optimization, delivery, and repetition.', icon: ShieldCheck, tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35' },
    { id: 'result', title: '5) Result', subtitle: 'Launch-ready output', detail: 'Receive polished assets ready for publish, sales, and scale.', icon: Download, tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35' },
  ],
  ka: [
    { id: 'idea', title: '1) Idea', subtitle: 'მიზანი + ბრიფი', detail: 'დააფიქსირე რა უნდა შეიქმნას და რა შედეგზე ხარ ორიენტირებული.', icon: Upload, tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35' },
    { id: 'plan', title: '2) Agent G', subtitle: 'გეგმა + კოორდინაცია', detail: 'Agent G არჩევს მოდულებს, ანაწილებს ამოცანებს და აწყობს გეგმას.', icon: BrainCircuit, tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35' },
    { id: 'create', title: '3) Creation', subtitle: 'AI წარმოება', detail: 'ავატარი, ვიდეო, მუსიკა, სურათი და ტექსტი პარალელურად გენერირდება.', icon: Sparkles, tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35' },
    { id: 'automate', title: '4) Automation', subtitle: 'workflow შესრულება', detail: 'ავტომატიზაცია მართავს ოპტიმიზაციას, მიწოდებას და გამეორებად პროცესებს.', icon: ShieldCheck, tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35' },
    { id: 'result', title: '5) Result', subtitle: 'მზად შედეგი', detail: 'იღებ გამოქვეყნებისა და მასშტაბირებისთვის მზა საბოლოო შედეგს.', icon: Download, tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35' },
  ],
  ru: [
    { id: 'idea', title: '1) Idea', subtitle: 'цель + бриф', detail: 'Определите задачу и ожидаемый конечный результат.', icon: Upload, tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35' },
    { id: 'plan', title: '2) Agent G', subtitle: 'план + координация', detail: 'Agent G подбирает модули, распределяет задачи и строит план.', icon: BrainCircuit, tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35' },
    { id: 'create', title: '3) Creation', subtitle: 'AI production', detail: 'Модули аватара, видео, музыки, изображения и текста работают вместе.', icon: Sparkles, tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35' },
    { id: 'automate', title: '4) Automation', subtitle: 'выполнение workflow', detail: 'Автоматизация управляет оптимизацией, доставкой и повторяемостью.', icon: ShieldCheck, tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35' },
    { id: 'result', title: '5) Result', subtitle: 'готовый итог', detail: 'Получайте финальные материалы для публикации и масштабирования.', icon: Download, tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35' },
  ],
} as const

const artifacts = [
  { label: 'Avatar', icon: ImageIcon },
  { label: 'Video', icon: Video },
  { label: 'Music', icon: Music },
  { label: 'Text/Plan', icon: FileText },
] as const

export function WorkflowCinematicSection() {
  const { language } = useLanguage()
  const key = (language as keyof typeof COPY) || 'ka'
  const copy = COPY[key]
  const steps = STEPS[key]

  return (
    <section id="workflow-cinematic" className="relative w-full py-28 border-t border-white/[0.04] overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.10),transparent_50%),radial-gradient(circle_at_84%_84%,rgba(124,92,252,0.12),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,7,18,0.7),rgba(3,7,18,0.4)_42%,rgba(3,7,18,0.7)_100%)]" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-300/15 bg-cyan-500/[0.05] text-cyan-200/80 text-[10px] uppercase tracking-[0.16em] font-semibold">
            <Rocket className="w-[1.05rem] h-[1.05rem]" /> {copy.rail}
          </div>
          <h2 className="mt-6 text-3xl md:text-5xl font-bold text-white tracking-[-0.02em]">{copy.title}</h2>
          <p className="mt-5 text-sm md:text-base text-white/40 leading-relaxed">{copy.subtitle}</p>
        </div>

        <div className="relative">
          <div className="pointer-events-none hidden lg:block absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-3 items-stretch [perspective:1200px]">
            {steps.map((step, index) => {
              const Icon = step.icon
              const rotation = index % 2 === 0 ? '-rotate-y-3' : 'rotate-y-3'
              return (
                <div key={step.id} className="relative">
                  <div className={`h-full rounded-2xl border bg-gradient-to-b ${step.tone} backdrop-blur-sm p-5 md:p-6 transform-gpu ${rotation} hover:rotate-y-0 transition-transform duration-[400ms]`}>
                    <div className="w-11 h-11 rounded-xl border border-white/15 bg-black/20 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-white/90" />
                    </div>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="text-xs text-cyan-200/70 mt-1.5">{step.subtitle}</p>
                    <p className="text-xs text-white/40 leading-relaxed mt-3">{step.detail}</p>
                  </div>

                  {index < steps.length - 1 && (
                    <div className="hidden lg:flex absolute top-1/2 -right-2 -translate-y-1/2 z-20 w-4 h-4 items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-white/55" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5 md:p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">{copy.loopTitle}</p>
            <div className="flex flex-wrap gap-2">
              {copy.loop.map((item) => (
                <span key={item} className="inline-flex items-center rounded-xl border border-cyan-300/15 bg-cyan-500/[0.05] px-3.5 py-2 text-xs text-cyan-100/70">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5 md:p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">{copy.artifacts}</p>
            <div className="grid grid-cols-2 gap-3">
              {artifacts.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-cyan-300/70" />
                    <span className="text-sm text-white/70">{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
