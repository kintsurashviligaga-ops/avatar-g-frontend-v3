'use client'

import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: { label: 'Powered by the world\'s best AI models' },
  ka: { label: 'მსოფლიოს საუკეთესო AI მოდელებით' },
  ru: { label: 'На базе лучших AI моделей мира' },
}

const TECH = [
  { name: 'Flux', icon: '⚡', color: '#f59e0b', desc: 'Image Generation' },
  { name: 'ElevenLabs', icon: '🎙️', color: '#8b5cf6', desc: 'Voice AI' },
  { name: 'LTX Video', icon: '🎬', color: '#06b6d4', desc: 'Video Generation' },
  { name: 'Udio', icon: '🎵', color: '#ec4899', desc: 'Music AI' },
  { name: 'Gemini', icon: '✨', color: '#4ade80', desc: 'Language Model' },
  { name: 'Anthropic', icon: '🧠', color: '#f97316', desc: 'AI Research' },
  { name: 'Supabase', icon: '🗄️', color: '#22d3ee', desc: 'Database' },
  { name: 'Vercel', icon: '▲', color: '#ffffff', desc: 'Edge Deployment' },
]

export function TechBadgesSection() {
  const { locale } = useLanguage()
  const c = COPY[locale as keyof typeof COPY] ?? COPY.ka

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Label */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center text-sm font-medium mb-8"
          style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          {c.label}
        </motion.p>

        {/* Badge grid */}
        <div className="flex flex-wrap justify-center gap-3">
          {TECH.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              whileHover={{ scale: 1.06, y: -2 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 16px',
                borderRadius: 99,
                background: `${t.color}10`,
                border: `1px solid ${t.color}28`,
                cursor: 'default',
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.color, lineHeight: 1.2 }}>{t.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{t.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
