'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'

// ─── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
  ka: {
    badge: 'მომხმარებლები',
    title: 'ისინი უკვე ქმნიან',
    subtitle: 'ათასობით ქართველი იყენებს Avatar G-ს ყოველდღე',
    examples: 'მაგალითი გენერაციები',
    examplesSub: 'ნამდვილი შედეგები, ნამდვილი მომხმარებლებისგან',
  },
  en: {
    badge: 'Community',
    title: 'They\'re already creating',
    subtitle: 'Thousands of Georgians use Avatar G every day',
    examples: 'Example generations',
    examplesSub: 'Real results from real users',
  },
  ru: {
    badge: 'Сообщество',
    title: 'Они уже создают',
    subtitle: 'Тысячи грузин используют Avatar G каждый день',
    examples: 'Примеры генераций',
    examplesSub: 'Реальные результаты от реальных пользователей',
  },
} as const

// ─── Testimonials data ─────────────────────────────────────────────────────────

const TESTIMONIALS = {
  ka: [
    {
      id: 't1',
      name: 'ნინო ჩიქოვანი',
      role: 'კონტენტ შემქმნელი',
      avatar: '👩‍🎨',
      text: 'Avatar G-ით 5 წუთში ვქმნი ისეთ სურათებს, რასაც ადრე დიზაინერთან კვირის მუშაობა სჭირდებოდა. ეს ნამდვილად მომავლის ინსტრუმენტია!',
      service: 'სურათი',
      rating: 5,
    },
    {
      id: 't2',
      name: 'გიორგი ბერიძე',
      role: 'მარკეტინგის სპეციალისტი',
      avatar: '👨‍💼',
      text: 'ჩვენი ბრენდისთვის ვიდეო-კონტენტი ახლა 10x სწრაფად იქმნება. Agent G pipeline-ი ჩაანაცვლა 3 სხვადასხვა ინსტრუმენტი.',
      service: 'ვიდეო',
      rating: 5,
    },
    {
      id: 't3',
      name: 'სალომე კობახიძე',
      role: 'მუსიკოსი',
      avatar: '👩‍🎤',
      text: 'ქართული ფოლკ მუსიკის ელემენტებით AI ტრეკების შექმნა ოცნება იყო. Avatar G-მ ეს სიმართლე გახადა — პირველი სესიაში 12 ტრეკი შევქმენი!',
      service: 'მუსიკა',
      rating: 5,
    },
    {
      id: 't4',
      name: 'დავით ასათიანი',
      role: 'პოდქასტის ავტორი',
      avatar: '🎙️',
      text: 'ქართულ ენაზე ხმის კლონირება სხვა სერვისზე შეუძლებელი იყო. Avatar G-ზე 2 წუთში ჩავიწერე ჩემი ხმა და ახლა ავტომატურად ვქმნი ეპიზოდებს.',
      service: 'ხმა',
      rating: 5,
    },
    {
      id: 't5',
      name: 'ანა გაბისკირია',
      role: 'სოციალური მედიის მენეჯერი',
      avatar: '📱',
      text: 'Batch ×4 ფუნქცია ჩემი ცხოვრება შეცვალა — ერთი დაჭერით 4 ვარიაცია, A/B ტესტი, და ვირუსული კონტენტი!',
      service: 'სურათი',
      rating: 5,
    },
    {
      id: 't6',
      name: 'ლევან ჯაფარიძე',
      role: 'სტარტაპ დამაარსებელი',
      avatar: '🚀',
      text: 'Enterprise გეგმაზე ვართ და API ინტეგრაცია ჩვენს პროდუქტში ძალიან გლუვად ჩაიდო. Dedicated support-ი ნამდვილი გამარჯვებაა.',
      service: 'API',
      rating: 5,
    },
  ],
  en: [
    {
      id: 't1',
      name: 'Nino Chikovani',
      role: 'Content Creator',
      avatar: '👩‍🎨',
      text: 'With Avatar G I create images in 5 minutes that used to take a week with a designer. This is truly a tool of the future!',
      service: 'Image',
      rating: 5,
    },
    {
      id: 't2',
      name: 'Giorgi Beridze',
      role: 'Marketing Specialist',
      avatar: '👨‍💼',
      text: 'Video content for our brand is now created 10x faster. The Agent G pipeline replaced 3 different tools.',
      service: 'Video',
      rating: 5,
    },
    {
      id: 't3',
      name: 'Salome Kobakhidze',
      role: 'Musician',
      avatar: '👩‍🎤',
      text: 'Creating AI tracks with Georgian folk elements was a dream. Avatar G made it real — I created 12 tracks in my first session!',
      service: 'Music',
      rating: 5,
    },
    {
      id: 't4',
      name: 'David Asatiani',
      role: 'Podcast Author',
      avatar: '🎙️',
      text: 'Voice cloning in Georgian was impossible on other services. On Avatar G I recorded my voice in 2 minutes and now auto-generate episodes.',
      service: 'Voice',
      rating: 5,
    },
    {
      id: 't5',
      name: 'Ana Gabiskiria',
      role: 'Social Media Manager',
      avatar: '📱',
      text: 'The Batch ×4 feature changed my life — one click gives 4 variations, A/B testing, and viral content!',
      service: 'Image',
      rating: 5,
    },
    {
      id: 't6',
      name: 'Levan Jafaridze',
      role: 'Startup Founder',
      avatar: '🚀',
      text: 'We\'re on the Enterprise plan and the API integration into our product was seamless. Dedicated support is a real win.',
      service: 'API',
      rating: 5,
    },
  ],
  ru: [
    {
      id: 't1',
      name: 'Нино Чиковани',
      role: 'Создатель контента',
      avatar: '👩‍🎨',
      text: 'С Avatar G я создаю изображения за 5 минут, которые раньше требовали недели работы с дизайнером!',
      service: 'Изображение',
      rating: 5,
    },
    {
      id: 't2',
      name: 'Гиорги Беридзе',
      role: 'Маркетолог',
      avatar: '👨‍💼',
      text: 'Видео-контент для нашего бренда теперь создаётся в 10 раз быстрее. Agent G заменил 3 разных инструмента.',
      service: 'Видео',
      rating: 5,
    },
    {
      id: 't3',
      name: 'Саломе Кобахидзе',
      role: 'Музыкант',
      avatar: '👩‍🎤',
      text: 'Создание AI-треков с грузинскими folk-элементами было мечтой. Avatar G сделал это реальностью!',
      service: 'Музыка',
      rating: 5,
    },
    {
      id: 't4',
      name: 'Давид Асатиани',
      role: 'Автор подкастов',
      avatar: '🎙️',
      text: 'Клонирование голоса на грузинском было невозможно на других сервисах. На Avatar G записал голос за 2 минуты.',
      service: 'Голос',
      rating: 5,
    },
    {
      id: 't5',
      name: 'Ана Габискирия',
      role: 'SMM-менеджер',
      avatar: '📱',
      text: 'Функция Batch ×4 изменила мою жизнь — один клик, 4 вариации, A/B тест, вирусный контент!',
      service: 'Изображение',
      rating: 5,
    },
    {
      id: 't6',
      name: 'Леван Джафаридзе',
      role: 'Основатель стартапа',
      avatar: '🚀',
      text: 'Мы на тарифе Enterprise, и API-интеграция прошла очень плавно. Dedicated support — настоящая победа.',
      service: 'API',
      rating: 5,
    },
  ],
} as const

// ─── Example Gallery data (placeholder gradient cards) ─────────────────────────

const GALLERY_ITEMS = [
  { id: 'g1', label: 'AI Portrait', gradient: 'from-violet-600 to-purple-800', icon: '🎨', tag: 'Image' },
  { id: 'g2', label: 'Georgian Folk Beat', gradient: 'from-amber-500 to-orange-700', icon: '🎵', tag: 'Music' },
  { id: 'g3', label: 'Product Video', gradient: 'from-cyan-500 to-blue-700', icon: '🎬', tag: 'Video' },
  { id: 'g4', label: 'Voice Clone', gradient: 'from-emerald-500 to-green-700', icon: '🎙️', tag: 'Voice' },
  { id: 'g5', label: 'Brand Avatar', gradient: 'from-rose-500 to-pink-700', icon: '👤', tag: 'Avatar' },
  { id: 'g6', label: 'Code Generator', gradient: 'from-slate-500 to-slate-700', icon: '💻', tag: 'Code' },
]

// ─── Service badge colors ──────────────────────────────────────────────────────

const SERVICE_COLORS: Record<string, string> = {
  სურათი: '#ec4899', Image: '#ec4899', Изображение: '#ec4899',
  ვიდეო: '#f97316', Video: '#f97316', Видео: '#f97316',
  მუსიკა: '#f59e0b', Music: '#f59e0b', Музыка: '#f59e0b',
  ხმა: '#3b82f6', Voice: '#3b82f6', Голос: '#3b82f6',
  API: '#22c55e',
}

// ─── TestimonialsSection ───────────────────────────────────────────────────────

export function TestimonialsSection() {
  const { language } = useLanguage()
  const lang = (language in COPY ? language : 'ka') as keyof typeof COPY
  const c = COPY[lang]
  const testimonials = TESTIMONIALS[lang]

  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = (idx: number, dir: 1 | -1 = 1) => {
    setDirection(dir)
    setActiveIndex(idx)
  }

  const next = () => {
    setDirection(1)
    setActiveIndex(i => (i + 1) % testimonials.length)
  }

  const prev = () => {
    setDirection(-1)
    setActiveIndex(i => (i - 1 + testimonials.length) % testimonials.length)
  }

  // Auto-advance every 5s
  useEffect(() => {
    intervalRef.current = setInterval(next, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(next, 5000)
  }

  const t = testimonials[activeIndex]!

  return (
    <section
      style={{ padding: '80px 20px', maxWidth: 1200, margin: '0 auto' }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: 56 }}
      >
        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#22d3ee', padding: '4px 12px', borderRadius: 99,
            background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
          }}>
            ★ {c.badge}
          </span>
        </div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, margin: '0 0 12px', lineHeight: 1.15 }}>
          {c.title}
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
          {c.subtitle}
        </p>
      </motion.div>

      {/* ── Testimonial Carousel ── */}
      <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto 64px' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={t.id}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            style={{
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: '32px 36px',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Stars */}
            <div style={{ fontSize: 16, marginBottom: 16, letterSpacing: 2 }}>
              {'★'.repeat(t.rating)}
            </div>

            {/* Quote */}
            <p style={{
              fontSize: 17, lineHeight: 1.7, color: 'rgba(255,255,255,0.88)',
              margin: '0 0 24px', fontStyle: 'italic',
            }}>
              &ldquo;{t.text}&rdquo;
            </p>

            {/* Author row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                {t.avatar}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{t.name}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>{t.role}</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                  background: `${SERVICE_COLORS[t.service] ?? '#6366f1'}18`,
                  color: SERVICE_COLORS[t.service] ?? '#6366f1',
                  border: `1px solid ${SERVICE_COLORS[t.service] ?? '#6366f1'}30`,
                }}>
                  {t.service}
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Prev / Next arrows */}
        <button
          onClick={() => { prev(); resetTimer(); }}
          aria-label="Previous"
          style={{
            position: 'absolute', left: -20, top: '50%', transform: 'translateY(-50%)',
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >‹</button>
        <button
          onClick={() => { next(); resetTimer(); }}
          aria-label="Next"
          style={{
            position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)',
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >›</button>
      </div>

      {/* Dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 80 }}>
        {testimonials.map((t2, i) => (
          <button
            key={t2.id}
            onClick={() => { goTo(i, i > activeIndex ? 1 : -1); resetTimer(); }}
            aria-label={`Go to testimonial ${i + 1}`}
            style={{
              width: i === activeIndex ? 24 : 8,
              height: 8, borderRadius: 99,
              background: i === activeIndex ? '#22d3ee' : 'rgba(255,255,255,0.15)',
              border: 'none', cursor: 'pointer',
              transition: 'all 0.3s',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* ── Example Gallery ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: 32 }}
      >
        <h3 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, margin: '0 0 8px' }}>
          {c.examples}
        </h3>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          {c.examplesSub}
        </p>
      </motion.div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
        }}
      >
        {GALLERY_ITEMS.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
            whileHover={{ scale: 1.04, y: -4 }}
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              position: 'relative',
              cursor: 'pointer',
              aspectRatio: '4/3',
            }}
          >
            {/* Gradient bg */}
            <div
              style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(135deg, var(--from), var(--to))`,
              }}
              className={`bg-gradient-to-br ${item.gradient}`}
            />
            {/* Shimmer overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)',
            }} />
            {/* Content */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 32 }}>{item.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                {item.label}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.75)',
              }}>
                {item.tag}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
