'use client'

import React, { useState, useEffect } from 'react'
import { Brain, Sparkles, Video, Music, Image as ImageIcon, MessageSquare, Bot, Cpu, Monitor, Zap, LayoutTemplate, PenTool, Database, Users, Mic, Layers, type LucideIcon } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { OrbitAvatar3D } from '@/components/OrbitAvatar3D'

/* â”€â”€ Slug map: use SHORT slugs that match app/[locale]/services/[slug]/page.tsx â”€â”€ */
const ORBIT_SERVICES = [
  { id: 'video', label: { ka: 'áƒ•áƒ˜áƒ“áƒ”áƒ áƒ¡áƒ¢áƒ£áƒ“áƒ˜áƒ', en: 'Video Studio', ru: 'Ð’Ð¸Ð´ÐµÐ¾ÑÑ‚ÑƒÐ´Ð¸Ñ' }, description: { ka: 'áƒ™áƒ˜áƒœáƒ”áƒ›áƒáƒ¢áƒ˜áƒ™áƒ£áƒ áƒ˜ áƒ•áƒ˜áƒ“áƒ”áƒ áƒ’áƒ”áƒœáƒ”áƒ áƒáƒªáƒ˜áƒ', en: 'Cinematic video generation', ru: 'ÐšÐ¸Ð½ÐµÐ¼Ð°Ñ‚Ð¾Ð³Ñ€Ð°Ñ„Ð¸Ñ‡Ð½Ð°Ñ Ð³ÐµÐ½ÐµÑ€Ð°Ñ†Ð¸Ñ Ð²Ð¸Ð´ÐµÐ¾' }, icon: Video, color: '#3b82f6', slug: 'video' },
  { id: 'music', label: { ka: 'áƒ›áƒ£áƒ¡áƒ˜áƒ™áƒ˜áƒ¡ áƒ¡áƒ¢áƒ£áƒ“áƒ˜áƒ', en: 'Music Studio', ru: 'ÐœÑƒÐ·ÑÑ‚ÑƒÐ´Ð¸Ñ' }, description: { ka: 'áƒ‘áƒ˜áƒ—áƒ”áƒ‘áƒ˜, áƒ•áƒáƒ™áƒáƒšáƒ˜, áƒ›áƒáƒ¡áƒ¢áƒ”áƒ áƒ˜áƒœáƒ’áƒ˜', en: 'Beats, vocals, mastering', ru: 'Ð‘Ð¸Ñ‚Ñ‹, Ð²Ð¾ÐºÐ°Ð» Ð¸ Ð¼Ð°ÑÑ‚ÐµÑ€Ð¸Ð½Ð³' }, icon: Music, color: '#8b5cf6', slug: 'music' },
  { id: 'photo', label: { ka: 'áƒ¤áƒáƒ¢áƒ áƒ¡áƒ¢áƒ£áƒ“áƒ˜áƒ', en: 'Photo Studio', ru: 'Ð¤Ð¾Ñ‚Ð¾ÑÑ‚ÑƒÐ´Ð¸Ñ' }, description: { ka: 'áƒ áƒ”áƒ¢áƒ£áƒ¨áƒ˜ áƒ“áƒ batch áƒ“áƒáƒ›áƒ£áƒ¨áƒáƒ•áƒ”áƒ‘áƒ', en: 'Retouch and batch processing', ru: 'Ð ÐµÑ‚ÑƒÑˆÑŒ Ð¸ Ð¿Ð°ÐºÐµÑ‚Ð½Ð°Ñ Ð¾Ð±Ñ€Ð°Ð±Ð¾Ñ‚ÐºÐ°' }, icon: ImageIcon, color: '#ec4899', slug: 'photo' },
  { id: 'image', label: { ka: 'áƒ¡áƒ£áƒ áƒáƒ—áƒ”áƒ‘áƒ˜áƒ¡ áƒ¨áƒ”áƒ¥áƒ›áƒœáƒ', en: 'Image Creator', ru: 'Ð“ÐµÐ½ÐµÑ€Ð°Ñ‚Ð¾Ñ€' }, description: { ka: 'áƒžáƒáƒ¡áƒ¢áƒ”áƒ áƒ”áƒ‘áƒ˜ áƒ“áƒ áƒ áƒ”áƒ™áƒšáƒáƒ›áƒ”áƒ‘áƒ˜', en: 'Posters and ad creatives', ru: 'ÐŸÐ¾ÑÑ‚ÐµÑ€Ñ‹ Ð¸ Ñ€ÐµÐºÐ»Ð°Ð¼Ð½Ñ‹Ðµ ÐºÑ€ÐµÐ°Ñ‚Ð¸Ð²Ñ‹' }, icon: PenTool, color: '#f43f5e', slug: 'image' },
  { id: 'editing', label: { ka: 'áƒ•áƒ˜áƒ“áƒ”áƒ áƒ áƒ”áƒ“áƒáƒ¥áƒ¢áƒ˜áƒ áƒ”áƒ‘áƒ', en: 'Video Editing', ru: 'Ð ÐµÐ´Ð°ÐºÑ‚Ð¾Ñ€' }, description: { ka: 'AI áƒ›áƒáƒœáƒ¢áƒáƒŸáƒ˜ áƒ“áƒ subtitle', en: 'AI editing and subtitles', ru: 'AI-Ð¼Ð¾Ð½Ñ‚Ð°Ð¶ Ð¸ ÑÑƒÐ±Ñ‚Ð¸Ñ‚Ñ€Ñ‹' }, icon: Users, color: '#f59e0b', slug: 'editing' },
  { id: 'agent-g', label: { ka: 'áƒáƒ’áƒ”áƒœáƒ¢áƒ˜ G', en: 'Agent G', ru: 'ÐÐ³ÐµÐ½Ñ‚ G' }, description: { ka: 'áƒ™áƒáƒáƒ áƒ“áƒ˜áƒœáƒáƒªáƒ˜áƒ˜áƒ¡ áƒ›áƒ—áƒáƒ•áƒáƒ áƒ˜ áƒáƒ’áƒ”áƒœáƒ¢áƒ˜', en: 'Primary coordination agent', ru: 'Ð“Ð»Ð°Ð²Ð½Ñ‹Ð¹ Ð°Ð³ÐµÐ½Ñ‚ ÐºÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ†Ð¸Ð¸' }, icon: Bot, color: '#06b6d4', slug: 'agent-g' },
  { id: 'text', label: { ka: 'áƒ¢áƒ”áƒ¥áƒ¡áƒ¢áƒ˜áƒ¡ áƒ’áƒ”áƒœáƒ”áƒ áƒáƒªáƒ˜áƒ', en: 'Text AI', ru: 'Ð¢ÐµÐºÑÑ‚ AI' }, description: { ka: 'áƒ áƒ”áƒ™áƒšáƒáƒ›áƒ, SEO áƒ“áƒ áƒ™áƒáƒœáƒ¢áƒ”áƒœáƒ¢áƒ˜', en: 'Ads, SEO and content', ru: 'Ð ÐµÐºÐ»Ð°Ð¼Ð°, SEO Ð¸ ÐºÐ¾Ð½Ñ‚ÐµÐ½Ñ‚' }, icon: MessageSquare, color: '#6366f1', slug: 'text' },
  { id: 'workflow', label: { ka: 'áƒáƒ•áƒ¢áƒáƒ›áƒáƒ¢áƒ˜áƒ–áƒáƒªáƒ˜áƒ', en: 'Workflows', ru: 'ÐŸÑ€Ð¾Ñ†ÐµÑÑÑ‹' }, description: { ka: 'áƒžáƒ áƒáƒªáƒ”áƒ¡áƒ”áƒ‘áƒ˜áƒ¡ áƒáƒ•áƒ¢áƒáƒ›áƒáƒ¢áƒ˜áƒ–áƒáƒªáƒ˜áƒ', en: 'Pipeline automation', ru: 'ÐÐ²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ð·Ð°Ñ†Ð¸Ñ Ð¿Ñ€Ð¾Ñ†ÐµÑÑÐ¾Ð²' }, icon: Zap, color: '#eab308', slug: 'workflow' },
  { id: 'prompt', label: { ka: 'áƒžáƒ áƒáƒ›áƒžáƒ¢ áƒ‘áƒ˜áƒšáƒ“áƒ”áƒ áƒ˜', en: 'Prompt Builder', ru: 'ÐŸÑ€Ð¾Ð¼Ð¿Ñ‚' }, description: { ka: 'áƒ¡áƒ¢áƒáƒ‘áƒ˜áƒšáƒ£áƒ áƒ˜ prompt áƒ¡áƒ˜áƒ¡áƒ¢áƒ”áƒ›áƒ”áƒ‘áƒ˜', en: 'Reusable prompt systems', ru: 'ÐŸÐµÑ€ÐµÐ¸ÑÐ¿Ð¾Ð»ÑŒÐ·ÑƒÐµÐ¼Ñ‹Ðµ Ð¿Ñ€Ð¾Ð¼Ð¿Ñ‚Ñ‹' }, icon: Database, color: '#0ea5e9', slug: 'prompt' },
  { id: 'visual-intel', label: { ka: 'áƒ•áƒ˜áƒ–áƒ£áƒáƒšáƒ£áƒ áƒ˜ AI', en: 'Visual Intel', ru: 'Ð’Ð¸Ð·ÑƒÐ°Ð»ÑŒÐ½Ñ‹Ð¹ AI' }, description: { ka: 'áƒ•áƒ˜áƒ–áƒ£áƒáƒšáƒ”áƒ‘áƒ˜áƒ¡ áƒáƒœáƒáƒšáƒ˜áƒ–áƒ˜', en: 'Visual quality analysis', ru: 'ÐÐ½Ð°Ð»Ð¸Ð· Ð²Ð¸Ð·ÑƒÐ°Ð»ÑŒÐ½Ð¾Ð³Ð¾ ÐºÐ°Ñ‡ÐµÑÑ‚Ð²Ð°' }, icon: Cpu, color: '#d946ef', slug: 'visual-intel' },
  { id: 'media', label: { ka: 'áƒ›áƒ”áƒ“áƒ˜áƒ áƒžáƒ áƒáƒ“áƒ£áƒ¥áƒªáƒ˜áƒ', en: 'Media', ru: 'ÐœÐµÐ´Ð¸Ð°' }, description: { ka: 'áƒ¡áƒ áƒ£áƒšáƒ˜ áƒ™áƒáƒ›áƒžáƒáƒœáƒ˜áƒ˜áƒ¡ áƒžáƒáƒ™áƒ”áƒ¢áƒ˜', en: 'Full campaign pack', ru: 'ÐŸÐ¾Ð»Ð½Ñ‹Ð¹ Ð¿Ð°ÐºÐµÑ‚ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸' }, icon: Monitor, color: '#84cc16', slug: 'media' },
  { id: 'software', label: { ka: 'áƒžáƒ áƒáƒ’áƒ áƒáƒ›áƒ˜áƒ áƒ”áƒ‘áƒ', en: 'Software', ru: 'Ð¡Ð¾Ñ„Ñ‚' }, description: { ka: 'áƒáƒžáƒ”áƒ‘áƒ˜áƒ¡/áƒ¡áƒáƒ˜áƒ¢áƒ”áƒ‘áƒ˜áƒ¡ áƒ¨áƒ”áƒ¥áƒ›áƒœáƒ', en: 'Build apps and sites', ru: 'Ð¡Ð¾Ð·Ð´Ð°Ð½Ð¸Ðµ Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ð¹ Ð¸ ÑÐ°Ð¹Ñ‚Ð¾Ð²' }, icon: LayoutTemplate, color: '#f97316', slug: 'software' },
  { id: 'business', label: { ka: 'áƒ‘áƒ˜áƒ–áƒœáƒ”áƒ¡áƒ˜', en: 'Business', ru: 'Ð‘Ð¸Ð·Ð½ÐµÑ' }, description: { ka: 'áƒ¡áƒ¢áƒ áƒáƒ¢áƒ”áƒ’áƒ˜áƒ áƒ“áƒ CRM', en: 'Strategy and CRM flows', ru: 'Ð¡Ñ‚Ñ€Ð°Ñ‚ÐµÐ³Ð¸Ñ Ð¸ CRM-Ð¿Ñ€Ð¾Ñ†ÐµÑÑÑ‹' }, icon: Layers, color: '#14b8a6', slug: 'business' },
  { id: 'tourism', label: { ka: 'áƒ¢áƒ£áƒ áƒ˜áƒ–áƒ›áƒ˜', en: 'Tourism', ru: 'Ð¢ÑƒÑ€Ð¸Ð·Ð¼' }, description: { ka: 'áƒ›áƒáƒ’áƒ–áƒáƒ£áƒ áƒáƒ‘áƒ˜áƒ¡ AI áƒ’áƒ”áƒ’áƒ›áƒ”áƒ‘áƒ˜', en: 'AI travel planning', ru: 'AI-Ð¿Ð»Ð°Ð½Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð¿ÑƒÑ‚ÐµÑˆÐµÑÑ‚Ð²Ð¸Ð¹' }, icon: Mic, color: '#10b981', slug: 'tourism' },
  { id: 'avatar', label: { ka: 'áƒáƒ•áƒáƒ¢áƒáƒ áƒ˜', en: 'Avatar', ru: 'ÐÐ²Ð°Ñ‚Ð°Ñ€' }, description: { ka: 'áƒªáƒ˜áƒ¤áƒ áƒ£áƒšáƒ˜ áƒ˜áƒ“áƒ”áƒœáƒ¢áƒáƒ‘áƒ˜áƒ¡ áƒ¨áƒ”áƒ¥áƒ›áƒœáƒ', en: 'Digital identity creation', ru: 'Ð¡Ð¾Ð·Ð´Ð°Ð½Ð¸Ðµ Ñ†Ð¸Ñ„Ñ€Ð¾Ð²Ð¾Ð¹ Ð¸Ð´ÐµÐ½Ñ‚Ð¸Ñ‡Ð½Ð¾ÑÑ‚Ð¸' }, icon: Brain, color: '#64748b', slug: 'avatar' },
  { id: 'shop', label: { ka: 'áƒ›áƒáƒ¦áƒáƒ–áƒ˜áƒ', en: 'Shop', ru: 'ÐœÐ°Ð³Ð°Ð·Ð¸Ð½' }, description: { ka: 'áƒ›áƒáƒœáƒ”áƒ¢áƒ˜áƒ–áƒáƒªáƒ˜áƒ áƒ“áƒ áƒ’áƒáƒ§áƒ˜áƒ“áƒ•áƒ”áƒ‘áƒ˜', en: 'Monetization and storefront', ru: 'ÐœÐ¾Ð½ÐµÑ‚Ð¸Ð·Ð°Ñ†Ð¸Ñ Ð¸ Ð²Ð¸Ñ‚Ñ€Ð¸Ð½Ð°' }, icon: Sparkles, color: '#f43f5e', slug: 'shop' },
]

interface OrbitService {
  id: string
  label: Record<string, string>
  description: Record<string, string>
  icon: LucideIcon
  color: string
  slug: string
}

const ORBIT_CSS = `
@keyframes orbit-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes orbit-counter-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
@keyframes orbit-node-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}
@keyframes orbit-pulse-glow {
  0%, 100% { opacity: 0.35; filter: blur(8px); }
  50% { opacity: 0.9; filter: blur(12px); }
}
@keyframes orbit-chip-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes orbit-lux-flicker {
  0%, 100% { opacity: 0.62; }
  50% { opacity: 0.98; }
}
@keyframes orbit-avatar-turn-360 {
  0% { transform: rotateY(0deg) rotateZ(0deg); }
  25% { transform: rotateY(90deg) rotateZ(0.8deg); }
  50% { transform: rotateY(180deg) rotateZ(0deg); }
  75% { transform: rotateY(270deg) rotateZ(-0.8deg); }
  100% { transform: rotateY(360deg) rotateZ(0deg); }
}
@keyframes orbit-avatar-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-4px); }
}
.orbit-container {
  animation: orbit-spin 60s linear infinite;
}
.orbit-item-counter {
  animation: orbit-counter-spin 60s linear infinite;
}
.orbit-paused {
  animation-play-state: paused !important;
}
.orbit-running {
  animation-play-state: running;
}
.orbit-node-shell {
  animation: orbit-node-float 3.2s ease-in-out infinite;
}
.orbit-node-shell:hover {
  animation-duration: 1.9s;
}
.orbit-node-active-glow {
  animation: orbit-pulse-glow 1.8s ease-in-out infinite;
}
.orbit-node-chip {
  animation: orbit-chip-spin 7s linear infinite;
}
.orbit-lux-frame {
  animation: orbit-lux-flicker 3.6s ease-in-out infinite;
}
.orbit-avatar-stage {
  perspective: 1200px;
  animation: orbit-avatar-float 3.4s ease-in-out infinite;
}
.orbit-avatar-turn {
  transform-style: preserve-3d;
  animation: orbit-avatar-turn-360 16s linear infinite;
}
`

export function OrbitSolarSystem() {
  const [isPaused, setIsPaused] = useState(false)
  const [radius, setRadius] = useState(165)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const { language: locale } = useLanguage()
  const total = ORBIT_SERVICES.length

  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 768) {
        setRadius(290)
        return
      }
      setRadius(window.innerWidth < 390 ? 150 : 165)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    try {
      const storedUrl = localStorage.getItem('GENERATED_AVATAR_URL')
      if (storedUrl) setAvatarUrl(storedUrl)
    } catch { /* ignore */ }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'GENERATED_AVATAR_URL') setAvatarUrl(e.newValue)
    }
    const handleAvatarUpdate = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url
      if (url) setAvatarUrl(url)
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('generated-avatar-updated', handleAvatarUpdate)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('generated-avatar-updated', handleAvatarUpdate)
    }
  }, [])

  return (
    <section className="relative w-full py-20 md:py-32 overflow-hidden bg-transparent flex items-center justify-center min-h-[560px] md:min-h-[820px] max-md:[@media(orientation:landscape)]:min-h-[420px]">
      <style dangerouslySetInnerHTML={{ __html: ORBIT_CSS }} />

      <div className="relative w-[320px] h-[320px] sm:w-[340px] sm:h-[340px] md:w-[600px] md:h-[600px] max-md:[@media(orientation:landscape)]:w-[300px] max-md:[@media(orientation:landscape)]:h-[300px] flex items-center justify-center">

        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.14)_0%,rgba(6,182,212,0.04)_42%,transparent_68%)]" />

        {/* Core Center — Real 3D Avatar */}
        <div className="absolute z-20 flex flex-col items-center justify-center select-none">
          <div className="relative w-36 h-48 md:w-52 md:h-72 rounded-2xl overflow-hidden shadow-[0_0_56px_rgba(6,182,212,0.28)]">
            <OrbitAvatar3D avatarUrl={avatarUrl} />
            {/* Neon border overlay */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-cyan-300/30" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-cyan-400/14 animate-ping" style={{ animationDuration: '3.6s' }} />
          </div>
          <div className="mt-3 text-center">
            <h3 className="text-white font-bold text-lg md:text-xl tracking-tight drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              {locale === 'ka' ? '3D ავატარი' : locale === 'ru' ? '3D Аватар' : 'Avatar 3D'}
            </h3>
            <p className="text-cyan-400/80 text-xs md:text-sm font-medium drop-shadow-md">
              {locale === 'ka' ? 'ინტერაქტიული 3D' : locale === 'ru' ? 'Наглядный 3D' : 'Interactive 3D Model'}
            </p>
          </div>
        </div>

        {/* Outer Orbit Rings */}
        <div className="pointer-events-none absolute inset-0 rounded-full border border-white/30 shadow-[0_0_42px_rgba(255,255,255,0.16)] orbit-lux-frame" />
        <div className="pointer-events-none absolute inset-[15%] rounded-full border border-white/20 shadow-[0_0_26px_rgba(255,255,255,0.12)]" />

        {/* Orbit Rotating Container â€” pause on hover at container level only */}
        <div
          className={`absolute inset-0 w-full h-full orbit-container ${isPaused ? 'orbit-paused' : 'orbit-running'}`}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {ORBIT_SERVICES.map((service, i) => {
            const angle = (360 / total) * i
            const rad = (angle * Math.PI) / 180
            const x = Math.cos(rad) * radius
            const y = Math.sin(rad) * radius

            return (
              <div
                key={service.id}
                className="absolute top-1/2 left-1/2"
                style={{ transform: `translate(${x - 28}px, ${y - 28}px)` }}
              >
                <div className={`orbit-item-counter flex items-center justify-center ${isPaused ? 'orbit-paused' : 'orbit-running'}`}>
                  <OrbitNodeContent service={service} locale={locale || 'ka'} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function OrbitNodeContent({ service, locale }: { service: OrbitService; locale: string }) {
  const Icon = service.icon
  const displayLabel = service.label[locale] || service.label.ka
  const displayDescription = service.description[locale] || service.description.ka
  const openLabel = locale === 'ka' ? 'áƒ¡áƒ”áƒ áƒ•áƒ˜áƒ¡áƒ˜áƒ¡ áƒ’áƒáƒ®áƒ¡áƒœáƒ' : locale === 'ru' ? 'ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ ÑÐµÑ€Ð²Ð¸Ñ' : 'Open service'
  const accent = service.color
  const microCode = service.id.slice(0, 2).toUpperCase()

  return (
    <a
      href={'/' + locale + '/services/' + service.slug}
      className="orbit-node-shell group relative flex items-center justify-center rounded-full transition-all duration-300 z-30
        w-16 h-16 md:w-20 md:h-20
        hover:scale-110
        border border-white/30 backdrop-blur-md overflow-hidden
      "
      style={{
        background: `radial-gradient(circle at 28% 24%, rgba(255,255,255,0.7), rgba(255,255,255,0.08) 38%, ${accent}4a 84%), linear-gradient(150deg, rgba(10,20,40,0.78), rgba(4,10,24,0.86))`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.2), 0 0 16px rgba(255,255,255,0.14), 0 0 16px ${accent}66, 0 0 32px ${accent}33, inset 0 2px 8px rgba(255,255,255,0.14)`,
      }}
      aria-label={displayLabel}
    >
      <span className="absolute inset-[3px] rounded-full border border-white/30" />
      <span className="absolute inset-0 rounded-full border border-white/30 shadow-[0_0_18px_rgba(255,255,255,0.22)] orbit-lux-frame" />
      <span
        className="absolute inset-[-16%] rounded-full orbit-node-active-glow opacity-35 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(circle, ${accent}66 0%, transparent 62%)` }}
      />
      <span className="absolute inset-[8%] rounded-full border border-white/20 border-dashed orbit-node-chip" />

      <span className="absolute top-[7px] right-[7px] z-20 rounded-full border border-white/35 bg-black/45 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.14em] text-white/90">
        {microCode}
      </span>

      <div
        className="relative z-10 flex h-[56%] w-[56%] items-center justify-center rounded-full border border-white/30 bg-black/30"
        style={{ boxShadow: `inset 0 0 14px ${accent}44, 0 0 14px ${accent}44` }}
      >
        <Icon className="w-6 h-6 md:w-7 md:h-7 text-white/85 group-hover:text-white transition-colors" />
      </div>

      {/* Tooltip â€” pure CSS hover via group-hover, no JS state */}
      <div
        className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-[220px] sm:w-[252px] px-4 py-3 rounded-2xl bg-[#0b1020]/95 border border-white/30 text-white shadow-2xl backdrop-blur-xl
          opacity-0 translate-y-2 invisible
          group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible
          transition-all duration-200 z-50
        "
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.22), 0 0 26px rgba(255,255,255,0.18), 0 30px 60px rgba(0,0,0,0.55)' }}
      >
        <div className="mb-2 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/90">
          Orbital Module
        </div>
        <p className="text-sm font-semibold text-white">{displayLabel}</p>
        <p className="mt-1 text-[11px] text-white/78 leading-relaxed">{displayDescription}</p>
        <span className="mt-3 inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90">
          {openLabel}
        </span>
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0b1020]/95 border-t border-l border-white/15 transform rotate-45" />
      </div>
    </a>
  )
}

