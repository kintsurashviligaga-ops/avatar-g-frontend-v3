'use client'

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useRef, MouseEvent } from 'react'
import {
  UserCircle2, Film, Workflow, Cpu, Building2, ShieldCheck,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const FEATURES = [
  {
    icon: UserCircle2,
    gradient: 'from-cyan-500 to-sky-600',
    glow: 'rgba(6,182,212,0.28)',
    glowFull: 'rgba(6,182,212,0.08)',
  },
  {
    icon: Film,
    gradient: 'from-violet-500 to-indigo-600',
    glow: 'rgba(139,92,246,0.28)',
    glowFull: 'rgba(139,92,246,0.08)',
  },
  {
    icon: Workflow,
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16,185,129,0.28)',
    glowFull: 'rgba(16,185,129,0.08)',
  },
  {
    icon: Cpu,
    gradient: 'from-blue-500 to-cyan-600',
    glow: 'rgba(59,130,246,0.28)',
    glowFull: 'rgba(59,130,246,0.08)',
  },
  {
    icon: Building2,
    gradient: 'from-amber-500 to-orange-600',
    glow: 'rgba(245,158,11,0.28)',
    glowFull: 'rgba(245,158,11,0.08)',
  },
  {
    icon: ShieldCheck,
    gradient: 'from-rose-500 to-pink-600',
    glow: 'rgba(244,63,94,0.28)',
    glowFull: 'rgba(244,63,94,0.08)',
  },
]

const FEATURES_COPY = {
  en: {
    badge: 'Platform Capabilities',
    title: 'Everything Your AI',
    titleAccent: 'Factory Needs',
    subtitle: 'Six interconnected pillars powering end-to-end AI production — from identity creation to commerce at scale.',
    cards: [
      {
        title: 'AI Avatar & Identity',
        description: 'Build production-ready avatars for campaigns, channels, and branded experiences. Full facial, voice, and motion control in one workspace.',
        tag: 'Create',
      },
      {
        title: 'Video, Audio & Music',
        description: 'Generate cinematic video sequences, adaptive soundtracks, and broadcast-quality audio — all from one unified studio pipeline.',
        tag: 'Produce',
      },
      {
        title: 'Automation & Workflows',
        description: 'Connect AI modules into intelligent pipelines. Run repeatable multi-step flows with zero manual overhead and consistent output.',
        tag: 'Automate',
      },
      {
        title: 'Agent G Orchestration',
        description: 'Your AI director. Coordinates tasks across modules, manages team delegation, and executes complex multi-service strategies end-to-end.',
        tag: 'Orchestrate',
      },
      {
        title: 'Commerce & Business',
        description: 'Turn AI output into revenue. Publish products, manage operations, track KPIs, and scale execution across every business function.',
        tag: 'Scale',
      },
      {
        title: 'Enterprise-Grade Security',
        description: '99.9% uptime SLA, role-based access control, audit logs, and production-grade infrastructure engineered for high-load teams.',
        tag: 'Secure',
      },
    ],
  },
  ka: {
    badge: 'პლატფორმის შესაძლებლობები',
    title: 'ყველაფერი რაც შენს AI',
    titleAccent: 'ქარხანას სჭირდება',
    subtitle: 'ექვსი ურთიერთდაკავშირებული სვეტი — AI-ის სრული წარმოებისთვის, იდენტობის შექმნიდან კომერციის მასშტაბამდე.',
    cards: [
      {
        title: 'AI ავატარი და იდენტობა',
        description: 'შექმენი მზა ავატარები კამპანიებისთვის, არხებისთვის და ბრენდული გამოცდილებებისთვის. სახე, ხმა და მოძრაობა — სრულად კონტროლქვეშ.',
        tag: 'შექმნა',
      },
      {
        title: 'ვიდეო, აუდიო და მუსიკა',
        description: 'გენერირება კინემატოგრაფიული ვიდეოებისა, ადაპტური საუნდტრეკებისა და broadcast-ხარისხის აუდიოსი — ერთი სტუდიო პაიპლაინიდან.',
        tag: 'წარმოება',
      },
      {
        title: 'ავტომაცია და Workflow-ები',
        description: 'AI მოდულების ინტელექტუალურ პაიპლაინებად გაერთიანება. განმეორებადი პროცესები ნულოვანი ხელით შრომის გარეშე.',
        tag: 'ავტომატიზაცია',
      },
      {
        title: 'Agent G ორკესტრაცია',
        description: 'შენი AI დირექტორი. კოორდინაციას უწევს დავალებებს მოდულებს შორის, მართავს გუნდს და ასრულებს კომპლექსურ სტრატეგიებს.',
        tag: 'ორკესტრაცია',
      },
      {
        title: 'კომერცია და ბიზნესი',
        description: 'AI შედეგი — შემოსავლად. გამოაქვეყნე პროდუქტები, მართე ოპერაციები, ადევნე KPI-ებს თვალი და გაახარე ბიზნეს-ფუნქციები.',
        tag: 'მასშტაბი',
      },
      {
        title: 'Enterprise-კლასის უსაფრთხოება',
        description: '99.9% uptime SLA, როლებზე დაფუძნებული წვდომა, audit logs და Enterprise-ინფრასტრუქტურა მაღალი დატვირთვის გუნდებისთვის.',
        tag: 'უსაფრთხოება',
      },
    ],
  },
  ru: {
    badge: 'Возможности платформы',
    title: 'Всё, что нужно',
    titleAccent: 'вашей AI Фабрике',
    subtitle: 'Шесть взаимосвязанных компонентов для полного AI-производства — от создания идентичности до коммерции.',
    cards: [
      {
        title: 'AI Аватар и Идентичность',
        description: 'Создавайте производственные аватары для кампаний и каналов с полным контролем над лицом, голосом и движением.',
        tag: 'Создать',
      },
      {
        title: 'Видео, Аудио и Музыка',
        description: 'Генерация кинематографического видео, адаптивных саундтреков и аудио broadcast-качества — из единого студийного пайплайна.',
        tag: 'Производство',
      },
      {
        title: 'Автоматизация и Workflow',
        description: 'Объединяйте AI-модули в интеллектуальные пайплайны. Запускайте повторяемые многоэтапные процессы без ручного труда.',
        tag: 'Автоматизация',
      },
      {
        title: 'Оркестрация Agent G',
        description: 'Ваш AI-директор. Координирует задачи между модулями, управляет командой и выполняет сложные мульти-сервисные стратегии.',
        tag: 'Оркестрация',
      },
      {
        title: 'Коммерция и Бизнес',
        description: 'Превратите AI-результаты в доход. Публикуйте продукты, управляйте операциями и отслеживайте KPI по всем функциям бизнеса.',
        tag: 'Масштаб',
      },
      {
        title: 'Enterprise-Безопасность',
        description: 'SLA 99.9% аптайм, управление доступом по ролям, журналы аудита и инфраструктура для высоконагруженных команд.',
        tag: 'Безопасность',
      },
    ],
  },
} as const

function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 180, damping: 22 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 180, damping: 22 })

  function handleMouse(e: MouseEvent) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  function handleLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function FeaturesShowcase() {
  const { language } = useLanguage()
  const copy = FEATURES_COPY[language as keyof typeof FEATURES_COPY] || FEATURES_COPY.en

  return (
    <section className="relative py-28 px-4 sm:px-6 overflow-hidden">
      {/* Section top separator */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {/* Background atmosphere */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-cyan-500/[0.04] rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-0 w-[700px] h-[500px] bg-violet-500/[0.04] rounded-full blur-[160px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] bg-blue-500/[0.03] rounded-full blur-[120px]" />
        {/* Dot matrix */}
        <div
          className="absolute inset-0 opacity-[0.016]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-400/20 bg-violet-400/[0.06] mb-6 shadow-[0_0_20px_rgba(139,92,246,0.10)]">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
            <span className="text-[10px] font-bold text-violet-300/80 tracking-[0.16em] uppercase">{copy.badge}</span>
          </div>
          <h2 className="text-3xl md:text-5xl lg:text-[3.4rem] font-extrabold text-white mb-5 tracking-[-0.025em] leading-[1.06]">
            {copy.title}{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(34,211,238,0.2)]">
              {copy.titleAccent}
            </span>
          </h2>
          <span className="section-accent-line" />
          <p className="text-white/40 max-w-xl mx-auto text-base md:text-lg leading-relaxed mt-4">
            {copy.subtitle}
          </p>
        </motion.div>

        {/* Feature cards — 3 col on lg, 2 on sm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {FEATURES.map((feature, index) => {
            const card = copy.cards[index]
            if (!card) return null
            const Icon = feature.icon
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.07 }}
              >
                <TiltCard className="h-full">
                  <div
                    className="group relative h-full rounded-3xl border border-white/[0.08] bg-[linear-gradient(155deg,rgba(7,14,30,0.92)_0%,rgba(4,9,22,0.82)_100%)] backdrop-blur-2xl p-6 md:p-7 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
                    style={{ transition: 'border-color 0.3s, box-shadow 0.3s' }}
                  >
                    {/* Inner top shine */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />

                    {/* Corner neon glow on hover */}
                    <div
                      className="absolute top-0 right-0 w-48 h-48 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                      style={{ background: `radial-gradient(circle at 100% 0%, ${feature.glow}, transparent 65%)` }}
                    />
                    {/* Full card ambient glow on hover */}
                    <div
                      className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                      style={{ boxShadow: `0 0 60px ${feature.glow}, inset 0 0 40px ${feature.glowFull}` }}
                    />

                    <div className="relative z-10 flex flex-col h-full gap-4">
                      {/* Icon + tag row */}
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={`icon-container w-12 h-12 bg-gradient-to-br ${feature.gradient} shadow-lg flex-shrink-0`}
                          style={{ boxShadow: `0 0 20px ${feature.glow}` }}
                        >
                          <Icon className="w-5.5 h-5.5 text-white relative z-10" />
                        </div>
                        <span
                          className="mt-1 text-[9px] font-bold tracking-[0.14em] uppercase rounded-full px-3 py-1 border"
                          style={{
                            color: feature.glow.replace('0.28', '0.75'),
                            borderColor: feature.glow.replace('0.28', '0.3'),
                            background: feature.glow.replace('0.28', '0.07'),
                          }}
                        >
                          {card.tag}
                        </span>
                      </div>

                      {/* Text */}
                      <div className="flex-1">
                        <h3 className="text-[1.05rem] font-bold text-white/90 mb-2.5 tracking-[-0.01em] group-hover:text-white transition-colors leading-tight">
                          {card.title}
                        </h3>
                        <p className="text-sm text-white/37 leading-relaxed group-hover:text-white/55 transition-colors">
                          {card.description}
                        </p>
                      </div>

                      {/* Bottom accent neon line */}
                      <div className="mt-2">
                        <div
                          className={`h-[2px] w-8 rounded-full bg-gradient-to-r ${feature.gradient} opacity-0 group-hover:opacity-100 group-hover:w-16 transition-all duration-500`}
                          style={{ boxShadow: `0 0 8px ${feature.glow}` }}
                        />
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
