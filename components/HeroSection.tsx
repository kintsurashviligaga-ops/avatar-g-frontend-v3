'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Play, Zap, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import Link from 'next/link'

interface HeroSectionProps {
  onPremiumClick?: () => void
}

/* ── Particle field background ─────────────────────────── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animFrameId: number
    const particles: Array<{
      x: number; y: number; vx: number; vy: number; size: number; opacity: number; hue: number
    }> = []

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1)
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1)
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        hue: 180 + Math.random() * 40,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      particles.forEach((p, i) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1
        if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${p.opacity})`
        ctx.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]!
          const dx = p.x - p2.x
          const dy = p.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `hsla(190, 80%, 60%, ${0.08 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      })

      animFrameId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animFrameId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  )
}

/* ── Meteor streaks ─────────────────────────────────────── */
function MeteorShower() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="absolute w-[2px] h-20 bg-gradient-to-b from-cyan-400/80 to-transparent rounded-full animate-meteor"
          style={{
            top: `${Math.random() * 50}%`,
            left: `${Math.random() * 100}%`,
            animationDelay: `${i * 3 + Math.random() * 4}s`,
            animationDuration: `${6 + Math.random() * 4}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ── Hero badge with shimmer ────────────────────────────── */
function ShimmerBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/[0.07] backdrop-blur-sm overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />
      <span className="relative text-xs sm:text-sm font-medium text-cyan-300">{children}</span>
    </div>
  )
}

/* ── Main Hero ──────────────────────────────────────────── */
export function HeroSection({ onPremiumClick }: HeroSectionProps) {
  const { t, language: locale } = useLanguage()
  const sectionRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })
  const y = useTransform(scrollYProgress, [0, 1], [0, 150])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  const [count, setCount] = useState(0)
  useEffect(() => {
    let frame: number
    const target = 16
    const duration = 1500
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setCount(Math.round(progress * target))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[100vh] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* ── Background layers ─────────────────────────────── */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 animate-aurora"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.15), transparent), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(99,102,241,0.1), transparent), radial-gradient(ellipse 50% 50% at 20% 80%, rgba(168,85,247,0.08), transparent)',
            backgroundSize: '200% 200%',
          }}
        />
      </div>

      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <ParticleField />
      <MeteorShower />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] md:w-[900px] md:h-[900px] rounded-full bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-purple-500/[0.05] blur-3xl pointer-events-none" />

      {/* ── Content ───────────────────────────────────────── */}
      <motion.div
        style={{ y, opacity }}
        className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 text-center space-y-8"
      >
        <motion.div
          className="flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <ShimmerBadge>
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse mr-1" />
            {count} Active AI Modules
          </ShimmerBadge>
          <ShimmerBadge>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            {t('hero.badge')}
          </ShimmerBadge>
        </motion.div>

        <motion.p
          className="hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {t('hero.subtitle')}
        </motion.p>

        <motion.h1
          className="text-5xl sm:text-6xl md:text-8xl font-extrabold leading-[1] tracking-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <span className="block text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            შენი AI ქარხანა
          </span>
          <span
            className="block mt-2 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent text-3xl sm:text-4xl md:text-5xl tracking-normal"
            style={{ backgroundSize: '200% auto', animation: 'gradient-x 5s ease infinite' }}
          >
            ყველაფერი ერთ სივრცეში.
          </span>
        </motion.h1>

        <motion.p
          className="text-base sm:text-lg md:text-xl text-gray-300/90 max-w-2xl mx-auto leading-relaxed text-balance"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          {t('hero.description')}
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row justify-center gap-4 pt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <Link href={`/${locale}/signup`}>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="primary"
                size="lg"
                className="relative gap-2 px-8 py-6 text-base font-semibold overflow-hidden
                  bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500
                  shadow-[0_0_40px_rgba(34,211,238,0.3)] hover:shadow-[0_0_60px_rgba(34,211,238,0.4)]
                  transition-all duration-300"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                <span className="relative flex items-center gap-2">
                  {t('hero.cta')}
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Button>
            </motion.div>
          </Link>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="lg"
              className="gap-2 px-8 py-6 text-base border-white/20 bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/30 transition-all duration-300"
            >
              <Play className="w-4 h-4" />
              {t('hero.ctaDemo')}
            </Button>
          </motion.div>

          {onPremiumClick && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={onPremiumClick}
                className="gap-2 px-8 py-6 text-base font-semibold
                  bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500
                  hover:from-amber-300 hover:via-orange-400 hover:to-rose-400
                  text-black shadow-[0_0_30px_rgba(251,191,36,0.25)]
                  hover:shadow-[0_0_50px_rgba(251,191,36,0.35)] transition-all duration-300"
                size="lg"
              >
                <Zap className="w-4 h-4" />
                {t('hero.ctaPremium')}
              </Button>
            </motion.div>
          )}
        </motion.div>

        <motion.div
          className="pt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Scroll</span>
            <div className="w-5 h-8 rounded-full border border-gray-600 flex items-start justify-center p-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
