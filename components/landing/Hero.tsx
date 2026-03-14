'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { PlayCircle, Sparkles, Zap, ArrowRight, Shield, Globe2 } from 'lucide-react';

type HeroProps = {
  locale: string;
};

const PARTICLES = [
  { x: '15%', y: '25%', size: 2.5,  delay: 0,    color: '#22d3ee', tx: '20px',  ty: '-90px'  },
  { x: '72%', y: '18%', size: 1.5,  delay: 0.8,  color: '#22d3ee', tx: '-30px', ty: '-70px'  },
  { x: '85%', y: '60%', size: 2,    delay: 1.6,  color: '#22d3ee', tx: '-20px', ty: '-80px'  },
  { x: '8%',  y: '70%', size: 1.5,  delay: 2.4,  color: '#f472b6', tx: '30px',  ty: '-60px'  },
  { x: '55%', y: '82%', size: 2,    delay: 3.2,  color: '#22d3ee', tx: '10px',  ty: '-100px' },
  { x: '30%', y: '12%', size: 1.5,  delay: 0.4,  color: '#34d399', tx: '-15px', ty: '-75px'  },
]

export function Hero({ locale }: HeroProps) {
  const content = {
    en: {
      badge: 'Georgian-first AI Platform',
      badgeDot: 'v3 Live',
      titleLine1: 'Create. Automate.',
      titleLine2: 'Scale with AI.',
      description: 'The most powerful AI production platform in Georgia. Avatars, video, music, automation — all connected in one command center.',
      ctaPrimary: 'Start Free',
      ctaSecondary: 'See how it works',
      highlights: [
        { icon: Zap, text: '17 AI Services' },
        { icon: Shield, text: 'Enterprise ready' },
        { icon: Globe2, text: 'ka · en · ru' },
      ],
      social: '50K+ outputs generated',
    },
    ka: {
      badge: 'Georgian-first AI პლატფორმა',
      badgeDot: 'v3 ჩართულია',
      titleLine1: 'შექმენი. ავტომატიზირე.',
      titleLine2: 'გაიზარდე AI-თი.',
      description: 'საქართველოს ყველაზე მძლავრი AI პლატფორმა. ავატარები, ვიდეო, მუსიკა, ავტომატიზაცია — ერთ სამართავ ცენტრში.',
      ctaPrimary: 'დაიწყე უფასოდ',
      ctaSecondary: 'ნახე როგორ მუშაობს',
      highlights: [
        { icon: Zap, text: '17 AI სერვისი' },
        { icon: Shield, text: 'ბიზნეს კლასი' },
        { icon: Globe2, text: 'ქა · en · ru' },
      ],
      social: '50K+ გენერირებული შედეგი',
    },
    ru: {
      badge: 'AI-платформа на грузинском',
      badgeDot: 'v3 Активно',
      titleLine1: 'Создавай. Автоматизируй.',
      titleLine2: 'Масштабируй с AI.',
      description: 'Самая мощная AI-платформа Грузии. Аватары, видео, музыка, автоматизация — всё в одном командном центре.',
      ctaPrimary: 'Начать бесплатно',
      ctaSecondary: 'Как это работает',
      highlights: [
        { icon: Zap, text: '17 AI сервисов' },
        { icon: Shield, text: 'Для бизнеса' },
        { icon: Globe2, text: 'ка · en · ru' },
      ],
      social: '50K+ результатов',
    },
  };

  const text = content[locale as 'en' | 'ka' | 'ru'] ?? content.ka;

  return (
    <section className="relative min-h-[92vh] flex items-center justify-center px-4 pb-16 pt-32 md:pt-36 overflow-hidden">

      {/* ── Background atmosphere ──────────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Deep space base */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_110%_80%_at_50%_-10%,rgba(34,211,238,0.10)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_80%_90%,rgba(34,211,238,0.09)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_10%_60%,rgba(59,130,246,0.07)_0%,transparent_55%)]" />

        {/* Neon horizon line */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 via-50% to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#030710] to-transparent" />

        {/* Top neon arc */}
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] rounded-[100%] border border-cyan-400/[0.10]"
          style={{ boxShadow: '0 0 120px rgba(34,211,238,0.06) inset' }}
        />
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-[100%] border border-cyan-400/[0.08]"
        />

        {/* Fine grid */}
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage: 'linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Floating particles */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full animate-float-particle"
            style={{
              left: p.x, top: p.y,
              width: p.size, height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${5 + i * 1.3}s`,
              '--tx': p.tx, '--ty': p.ty,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div className="relative mx-auto max-w-5xl text-center z-10">

        {/* Live badge */}
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-10 flex items-center justify-center"
        >
          <div className="group relative inline-flex items-center gap-2.5 rounded-full border border-cyan-400/25 bg-[rgba(34,211,238,0.06)] px-5 py-2 backdrop-blur-md shadow-[0_0_30px_rgba(34,211,238,0.10)]">
            {/* Shimmer swipe */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-cyan-300/10 to-transparent skew-x-12 group-hover:left-full transition-all duration-700" />
            </div>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-100">
              {text.badge}
            </span>
            <span className="text-[10px] font-semibold text-cyan-300/50 border-l border-cyan-400/20 pl-2.5">
              {text.badgeDot}
            </span>
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="mx-auto max-w-4xl text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[1.06] tracking-[-0.03em]"
        >
          <span className="block bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
            {text.titleLine1}
          </span>
          <span className="block mt-2 bg-gradient-to-r from-cyan-300 via-blue-400 to-sky-400 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(34,211,238,0.35)]">
            {text.titleLine2}
          </span>
        </motion.h1>

        {/* Neon underline */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
          className="mx-auto mt-5 h-0.5 w-40 bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded-full"
          style={{ boxShadow: '0 0 20px rgba(34,211,238,0.6), 0 0 60px rgba(34,211,238,0.2)' }}
        />

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-8 max-w-xl text-lg md:text-xl text-slate-300/80 font-normal leading-relaxed"
        >
          {text.description}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.35 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
        >
          <Link href={`/${locale}/signup`}>
            <button className="ag-btn-primary px-8 py-4 text-base rounded-2xl font-bold focus-ring group">
              <Sparkles className="w-4 h-4" />
              {text.ctaPrimary}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </Link>
          <Link
            href="#how"
            className="btn-ghost px-7 py-4 text-base rounded-2xl font-semibold group focus-ring"
          >
            <PlayCircle className="w-5 h-5 text-cyan-300/70 group-hover:text-cyan-300 transition-colors" />
            {text.ctaSecondary}
          </Link>
        </motion.div>

        {/* Social proof strip */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="mt-5 text-xs text-white/30 font-medium"
        >
          ★★★★★ &nbsp; {text.social}
        </motion.p>

        {/* Highlight pills */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.45 }}
          className="mt-10 flex flex-wrap justify-center gap-2.5"
        >
          {text.highlights.map(({ icon: Icon, text: label }, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/60 font-medium backdrop-blur-md hover:border-white/[0.15] hover:text-white/80 transition-all"
            >
              <Icon className="w-3.5 h-3.5 text-cyan-400/70" />
              {label}
            </span>
          ))}
        </motion.div>

      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#030710] to-transparent pointer-events-none" />

    </section>
  );
}
