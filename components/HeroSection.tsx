'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Play, Zap } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface HeroSectionProps {
  onPremiumClick?: () => void
}

/**
 * HeroSection — Landing page hero with CTAs.
 * Renders badges, headline, subtext, and 3 action buttons.
 * All visible text is driven by LanguageContext translations.
 */
export function HeroSection({ onPremiumClick }: HeroSectionProps) {
  const { t } = useLanguage()

  return (
    <section className="relative pt-28 pb-10 px-4 sm:px-6 text-center">
      <motion.div
        className="mx-auto max-w-3xl space-y-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Badge className="w-fit">
            <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2" />
            Orbit Experience v5.0
          </Badge>
          <Badge variant="primary" className="w-fit">
            {t('hero.badge')}
          </Badge>
        </div>

        <p className="text-sm md:text-base text-cyan-300 tracking-[0.18em] uppercase">
          {t('hero.subtitle')}
        </p>

        <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] text-balance">
          {t('hero.title')}
          <br />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            {t('hero.titleAccent')}
          </span>
        </h1>

        <p className="text-lg md:text-xl text-gray-300 text-balance max-w-xl mx-auto">
          {t('hero.description')}
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              variant="primary"
              size="lg"
              className="gap-2 shadow-[0_0_32px_rgba(34,211,238,0.35)] hover:shadow-[0_0_40px_rgba(34,211,238,0.45)]"
            >
              {t('hero.cta')}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              variant="outline"
              size="lg"
              className="gap-2 border-white/30"
            >
              <Play className="w-4 h-4" />
              {t('hero.ctaDemo')}
            </Button>
          </motion.div>
          {onPremiumClick && (
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                onClick={onPremiumClick}
                className="gap-2 bg-gradient-to-r from-amber-300 to-orange-500 hover:from-amber-400 hover:to-orange-600 text-black font-semibold shadow-[0_0_20px_rgba(251,191,36,0.25)] hover:shadow-[0_0_26px_rgba(251,191,36,0.35)]"
                size="lg"
              >
                <Zap className="w-4 h-4" />
                {t('hero.ctaPremium')}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </section>
  )
}
