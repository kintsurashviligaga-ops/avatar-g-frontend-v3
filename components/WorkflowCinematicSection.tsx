import React from 'react'
import { Upload, BrainCircuit, Sparkles, ShieldCheck, Download, ArrowRight, Image as ImageIcon, Video, Music, FileText, Rocket } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    title: 'How MyAvatar Works End-to-End',
    subtitle: 'A clear 3D pipeline view: from your brief to final assets, with live automation and transparent quality control.',
    rail: 'Automation Pipeline',
    loopTitle: 'Automation Loop',
    loop: ['Trigger', 'Agent G planning', 'Parallel generation', 'Delivery + analytics'],
    artifacts: 'Final Outputs',
  },
  ka: {
    title: 'როგორ მუშაობს MyAvatar სრულ ციკლში',
    subtitle: 'მკაფიო 3D pipeline: ბრიფიდან საბოლოო ფაილებამდე — გამჭვირვალე ავტომატიზაციით და ხარისხის კონტროლით.',
    rail: 'ავტომატიზაციის Pipeline',
    loopTitle: 'ავტომატიზაციის ციკლი',
    loop: ['სტარტი', 'Agent G დაგეგმვა', 'პარალელური გენერაცია', 'მიწოდება + ანალიტიკა'],
    artifacts: 'საბოლოო შედეგები',
  },
  ru: {
    title: 'Как работает MyAvatar от начала до результата',
    subtitle: 'Понятный 3D pipeline: от брифа до финальных файлов с прозрачной автоматизацией и контролем качества.',
    rail: 'Автоматизированный Pipeline',
    loopTitle: 'Цикл автоматизации',
    loop: ['Старт', 'План Agent G', 'Параллельная генерация', 'Доставка + аналитика'],
    artifacts: 'Финальные результаты',
  },
} as const

const STEPS = {
  en: [
    { id: 'input', title: '1) Input', subtitle: 'Brief + source files', detail: 'Upload prompt, media, goals, audience and language.', icon: Upload, tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35' },
    { id: 'plan', title: '2) Agent G', subtitle: 'Smart coordination', detail: 'Agent G builds the best action plan, model mix and quality profile.', icon: BrainCircuit, tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35' },
    { id: 'generate', title: '3) Generation', subtitle: 'AI modules run', detail: 'Avatar, video, music, image and text modules execute as one pipeline.', icon: Sparkles, tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35' },
    { id: 'review', title: '4) Validation', subtitle: 'Quality + review', detail: 'Automatic quality gates validate content before final delivery.', icon: ShieldCheck, tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35' },
    { id: 'export', title: '5) Delivery', subtitle: 'Production outputs', detail: 'Get ready-to-publish files for social, ads, web and campaigns.', icon: Download, tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35' },
  ],
  ka: [
    { id: 'input', title: '1) შეყვანა', subtitle: 'ბრიფი + საწყისი ფაილები', detail: 'ატვირთე prompt, მედია, მიზანი, აუდიტორია და ენა.', icon: Upload, tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35' },
    { id: 'plan', title: '2) Agent G', subtitle: 'ჭკვიანი კოორდინაცია', detail: 'Agent G აწყობს ოპტიმალურ გეგმას, მოდულებს და ხარისხის პროფილს.', icon: BrainCircuit, tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35' },
    { id: 'generate', title: '3) გენერაცია', subtitle: 'AI მოდულები მუშაობს', detail: 'ავატარი, ვიდეო, მუსიკა, სურათი და ტექსტი ერთ pipeline-ში სრულდება.', icon: Sparkles, tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35' },
    { id: 'review', title: '4) ვერიფიკაცია', subtitle: 'ხარისხი + შემოწმება', detail: 'ავტომატური ხარისხის კონტროლი ამოწმებს შედეგს საბოლოო მიწოდებამდე.', icon: ShieldCheck, tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35' },
    { id: 'export', title: '5) მიწოდება', subtitle: 'საბოლოო ფაილები', detail: 'მიიღე მზად ფაილები სოციალური არხებისთვის, რეკლამისთვის და ვებისთვის.', icon: Download, tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35' },
  ],
  ru: [
    { id: 'input', title: '1) Вход', subtitle: 'Бриф + исходники', detail: 'Загрузите prompt, медиа, цели, аудиторию и язык.', icon: Upload, tone: 'from-cyan-500/25 to-cyan-300/10 border-cyan-300/35' },
    { id: 'plan', title: '2) Agent G', subtitle: 'Умная координация', detail: 'Agent G собирает лучший план, связку модулей и профиль качества.', icon: BrainCircuit, tone: 'from-blue-500/25 to-indigo-300/10 border-blue-300/35' },
    { id: 'generate', title: '3) Генерация', subtitle: 'Работа AI-модулей', detail: 'Аватар, видео, музыка, изображение и текст идут единым pipeline.', icon: Sparkles, tone: 'from-violet-500/25 to-fuchsia-300/10 border-violet-300/35' },
    { id: 'review', title: '4) Проверка', subtitle: 'Качество + ревью', detail: 'Автоматические quality-гейты проверяют результат перед выдачей.', icon: ShieldCheck, tone: 'from-emerald-500/25 to-emerald-300/10 border-emerald-300/35' },
    { id: 'export', title: '5) Выдача', subtitle: 'Финальные файлы', detail: 'Получайте готовые файлы для соцсетей, рекламы, web и кампаний.', icon: Download, tone: 'from-amber-500/25 to-orange-300/10 border-amber-300/35' },
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
            <Rocket className="w-3.5 h-3.5" /> {copy.rail}
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
