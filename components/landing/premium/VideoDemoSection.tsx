'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    label: 'See it in action',
    title: 'From idea to creation',
    subtitle: 'Type a prompt. Pick a service. Get stunning AI content in seconds.',
    step1: 'Type your idea',
    step2: 'Choose AI service',
    step3: 'Download & share',
    cta: 'Try it free →',
    time: '~30 seconds',
  },
  ka: {
    label: 'ნახე სამოქმედოდ',
    title: 'იდეიდან — შექმნამდე',
    subtitle: 'დაწერე პრომფტი. აირჩიე სერვისი. მიიღე AI კონტენტი წამებში.',
    step1: 'დაწერე იდეა',
    step2: 'აირჩიე AI სერვისი',
    step3: 'ჩამოტვირთე და გაუზიარე',
    cta: 'სცადე უფასოდ →',
    time: '~30 წამი',
  },
  ru: {
    label: 'Смотри в действии',
    title: 'От идеи до создания',
    subtitle: 'Напиши промпт. Выбери сервис. Получи AI-контент за секунды.',
    step1: 'Напиши идею',
    step2: 'Выбери AI сервис',
    step3: 'Скачай и поделись',
    cta: 'Попробовать бесплатно →',
    time: '~30 секунд',
  },
}

const STEPS = [
  { emoji: '✍️', key: 'step1' as const, color: '#a855f7' },
  { emoji: '⚡', key: 'step2' as const, color: '#22d3ee' },
  { emoji: '🚀', key: 'step3' as const, color: '#4ade80' },
]

export function VideoDemoSection() {
  const { locale } = useLanguage()
  const c = COPY[locale as keyof typeof COPY] ?? COPY.ka

  return (
    <section className="py-20 px-4" id="demo">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              display: 'inline-block',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#22d3ee',
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
              borderRadius: 99, padding: '4px 14px', marginBottom: 16,
            }}
          >
            {c.label}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl font-black mb-4"
            style={{
              background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}
          >
            {c.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', maxWidth: 480, margin: '0 auto' }}
          >
            {c.subtitle}
          </motion.p>
        </div>

        {/* Demo mockup — animated terminal/chat UI */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          style={{
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(135deg, rgba(10,10,15,0.95), rgba(20,12,40,0.95))',
            overflow: 'hidden',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.12)',
            marginBottom: 40,
          }}
        >
          {/* Window chrome */}
          <div style={{
            height: 44, display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
            <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
              myavatar.ge/ka/dashboard
            </span>
          </div>

          {/* Chat simulation */}
          <div style={{ padding: '24px 24px 20px' }}>
            {/* User message */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}
            >
              <div style={{
                maxWidth: '70%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px',
                background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                color: '#fff', fontSize: 13,
              }}>
                🖼️ გამიკეთე ნათელი ნეო-ბაროკო სტილის სურათი, ძველი თბილისი ღამით
              </div>
            </motion.div>

            {/* AI response */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.7 }}
              style={{ display: 'flex', gap: 10, marginBottom: 16 }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg, #06b6d4, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff',
              }}>G</div>
              <div style={{
                flex: 1, padding: '10px 14px', borderRadius: '4px 14px 14px 14px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)', fontSize: 13,
              }}>
                ✨ სურათი გენერირდება Flux-ით...
                <div style={{
                  marginTop: 10,
                  height: 120, borderRadius: 10,
                  background: 'linear-gradient(135deg, #1a0533 0%, #4c0d7c 50%, #f59e0b30 100%)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 36,
                }}>
                  🌆
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  ✅ მზადაა! 8 კრედიტი დაიხარჯა
                </div>
              </div>
            </motion.div>
          </div>

          {/* Input bar mock */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <div style={{
              flex: 1, height: 38, borderRadius: 10,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              padding: '0 12px', display: 'flex', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>დაწერე შენი იდეა...</span>
            </div>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>→</div>
          </div>
        </motion.div>

        {/* Steps */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 36, flexWrap: 'wrap' }}>
          {STEPS.map((step, i) => (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.1 }}
              style={{
                flex: 1, minWidth: 140, padding: '14px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${step.color}22`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: `${step.color}18`, border: `1px solid ${step.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>{step.emoji}</div>
              <div>
                <div style={{ fontSize: 10, color: step.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  ნაბიჯი {i + 1}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3, marginTop: 1 }}>
                  {c[step.key]}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Badge + CTA */}
        <div className="text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'rgba(255,255,255,0.4)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#4ade80',
              boxShadow: '0 0 6px #4ade80',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            {c.time} · No card needed
          </div>
          <Link
            href="/ka/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 28px', borderRadius: 99,
              background: 'linear-gradient(135deg, #06b6d4, #7c3aed)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              textDecoration: 'none',
              boxShadow: '0 0 28px rgba(6,182,212,0.3), 0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            ✨ {c.cta}
          </Link>
        </div>
      </div>
    </section>
  )
}
