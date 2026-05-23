'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    label: 'Created with Avatar G',
    title: 'See What\'s Possible',
    subtitle: 'Real creations made by our users — images, videos, avatars, and music',
    cta: 'Create Yours Free →',
    kinds: { image: 'Image', video: 'Video', avatar: 'Avatar', music: 'Music' },
  },
  ka: {
    label: 'შექმნილი Avatar G-ით',
    title: 'ნახე, რა შეიძლება',
    subtitle: 'ჩვენი მომხმარებლების ნამდვილი შექმნილები — სურათები, ვიდეოები, ავატარები, მუსიკა',
    cta: 'შექმენი შენი →',
    kinds: { image: 'სურათი', video: 'ვიდეო', avatar: 'ავატარი', music: 'მუსიკა' },
  },
  ru: {
    label: 'Создано с Avatar G',
    title: 'Посмотри, что возможно',
    subtitle: 'Реальные работы наших пользователей — изображения, видео, аватары, музыка',
    cta: 'Создать своё бесплатно →',
    kinds: { image: 'Фото', video: 'Видео', avatar: 'Аватар', music: 'Музыка' },
  },
}

interface GalleryItem {
  id: string
  kind: 'image' | 'video' | 'avatar' | 'music'
  prompt: string
  color: string
  icon: string
  gradient: string
  accentColor: string
}

const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: '1',
    kind: 'image',
    prompt: 'Georgian warrior in neon cyberpunk Tbilisi at night',
    color: '#0ea5e9',
    icon: '🗡️',
    gradient: 'linear-gradient(135deg, #1a0533 0%, #4c0d7c 50%, #0284c7 100%)',
    accentColor: '#0ea5e9',
  },
  {
    id: '2',
    kind: 'avatar',
    prompt: 'Professional business avatar, Georgian style, photorealistic',
    color: '#06b6d4',
    icon: '👤',
    gradient: 'linear-gradient(135deg, #001a1f 0%, #0c4a6e 50%, #0891b2 100%)',
    accentColor: '#22d3ee',
  },
  {
    id: '3',
    kind: 'video',
    prompt: 'Flying over the Caucasus mountains at golden hour, cinematic',
    color: '#f59e0b',
    icon: '🏔️',
    gradient: 'linear-gradient(135deg, #1a0a00 0%, #78350f 50%, #d97706 100%)',
    accentColor: '#fbbf24',
  },
  {
    id: '4',
    kind: 'music',
    prompt: 'Georgian polyphony meets electronic beats, modern fusion',
    color: '#06b6d4',
    icon: '🎵',
    gradient: 'linear-gradient(135deg, #1f0014 0%, #831843 50%, #0891b2 100%)',
    accentColor: '#22d3ee',
  },
  {
    id: '5',
    kind: 'image',
    prompt: 'Ancient Svaneti tower in surreal watercolor style',
    color: '#4ade80',
    icon: '🏰',
    gradient: 'linear-gradient(135deg, #001a08 0%, #14532d 50%, #16a34a 100%)',
    accentColor: '#4ade80',
  },
  {
    id: '6',
    kind: 'avatar',
    prompt: 'Sci-fi explorer avatar with Georgian script tattoos',
    color: '#f97316',
    icon: '🚀',
    gradient: 'linear-gradient(135deg, #1a0800 0%, #7c2d12 50%, #ea580c 100%)',
    accentColor: '#fb923c',
  },
  {
    id: '7',
    kind: 'image',
    prompt: 'Old Tbilisi balcony at dusk, hyper-detailed illustration',
    color: '#38bdf8',
    icon: '🌆',
    gradient: 'linear-gradient(135deg, #0f0520 0%, #3b0764 50%, #0369a1 100%)',
    accentColor: '#a78bfa',
  },
  {
    id: '8',
    kind: 'video',
    prompt: 'Traditional Georgian Khorumi dance, slow motion, cinematic',
    color: '#14b8a6',
    icon: '💃',
    gradient: 'linear-gradient(135deg, #001a18 0%, #134e4a 50%, #0f766e 100%)',
    accentColor: '#2dd4bf',
  },
]

function GalleryCard({ item, index, c }: { item: GalleryItem; index: number; c: typeof COPY['ka'] }) {
  const [hovered, setHovered] = useState(false)
  const kindLabel = c.kinds[item.kind]

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.07 }}
      whileHover={{ y: -6, scale: 1.02 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        background: item.gradient,
        border: `1px solid ${item.accentColor}22`,
        boxShadow: hovered
          ? `0 16px 40px ${item.accentColor}30, 0 0 0 1px ${item.accentColor}30`
          : `0 4px 16px rgba(0,0,0,0.4)`,
        transition: 'box-shadow 0.3s ease',
        position: 'relative',
        aspectRatio: '4/5',
      }}
    >
      {/* Background glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 50% 30%, ${item.accentColor}20 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Main icon */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -60%)',
        fontSize: 52, lineHeight: 1,
        filter: `drop-shadow(0 0 16px ${item.accentColor}80)`,
        transition: 'transform 0.3s ease',
        ...(hovered ? { transform: 'translate(-50%, -60%) scale(1.12)' } : {}),
      }}>
        {item.icon}
      </div>

      {/* Kind badge */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        padding: '4px 10px', borderRadius: 99,
        background: `${item.accentColor}22`,
        border: `1px solid ${item.accentColor}44`,
        fontSize: 10.5, fontWeight: 700, color: item.accentColor,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {kindLabel}
      </div>

      {/* Bottom prompt */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '28px 14px 14px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
      }}>
        <p style={{
          fontSize: 11.5, color: 'rgba(255,255,255,0.75)',
          lineHeight: 1.4, margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.prompt}
        </p>
      </div>

      {/* Hover overlay */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute', inset: 0,
              background: `${item.accentColor}08`,
              borderRadius: 16,
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function ExampleGallerySection() {
  const { locale } = useLanguage()
  const c = COPY[locale as keyof typeof COPY] ?? COPY.ka

  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              display: 'inline-block',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#0ea5e9',
              background: 'rgba(14,165,233,0.1)',
              border: '1px solid rgba(14,165,233,0.25)',
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
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', maxWidth: 500, margin: '0 auto' }}
          >
            {c.subtitle}
          </motion.p>
        </div>

        {/* Gallery grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}>
          {GALLERY_ITEMS.map((item, i) => (
            <GalleryCard key={item.id} item={item} index={i} c={c} />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Link
              href="/ka/dashboard"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '13px 28px', borderRadius: 99,
                background: 'linear-gradient(135deg, #0284c7, #06b6d4)',
                color: '#fff', fontWeight: 700, fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 0 28px rgba(2,132,199,0.35), 0 4px 16px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              ✨ {c.cta}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
