'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export function CTABanner() {
  const { language: locale } = useLanguage()

  return (
    <section className="relative py-24 px-4 sm:px-6 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/[0.08] via-blue-600/[0.06] to-purple-600/[0.08]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-cyan-500/[0.08] to-purple-500/[0.08] rounded-full blur-3xl animate-glow-pulse" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <motion.div
        className="relative mx-auto max-w-3xl text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      >
        <motion.div
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-cyan-400/30 bg-cyan-400/[0.08] backdrop-blur-sm mb-6"
          animate={{ boxShadow: ['0 0 0 rgba(6,182,212,0)', '0 0 30px rgba(6,182,212,0.15)', '0 0 0 rgba(6,182,212,0)'] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-cyan-300">Start building for free today</span>
        </motion.div>

        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
          Ready to Create{' '}
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent animate-gradient-x">
            Something Amazing?
          </span>
        </h2>

        <p className="text-gray-400 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Join thousands of creators using MyAvatar to produce professional content with AI — no technical skills required.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/signup`}
            className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-base shadow-[0_0_40px_rgba(6,182,212,0.3)] hover:shadow-[0_0_60px_rgba(6,182,212,0.45)] transition-all duration-300"
          >
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative">Get Started Free</span>
            <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href={`/${locale}/services/agent-g`}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-sm text-white font-semibold text-base hover:bg-white/[0.08] hover:border-white/[0.2] transition-all duration-300"
          >
            Talk to Agent G
          </Link>
        </div>
      </motion.div>
    </section>
  )
}
