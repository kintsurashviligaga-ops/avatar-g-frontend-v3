'use client'

/**
 * AvatarBuilderWindow — Premium 3D Avatar Showcase Section.
 *
 * Shows the user's personal avatar on a futuristic pedestal
 * with cinematic lighting and slow rotation.
 *
 * Flow:
 *  - Authenticated + avatar ready → 3D showcase with user's GLB model
 *  - Authenticated + avatar processing → processing state
 *  - No avatar / not authenticated → premium CTA placeholder with holographic silhouette
 *
 * Camera/upload creation flow accessible via CTA buttons.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import dynamic from 'next/dynamic'

/* Lazy-load the 3D showcase to avoid SSR issues with Three.js */
const AvatarShowcase3D = dynamic(
  () => import('./AvatarShowcase3D').then(m => ({ default: m.AvatarShowcase3D })),
  { ssr: false }
)

/* ── i18n ── */
const COPY = {
  en: {
    eyebrow: 'AVATAR STUDIO',
    title: 'Your Digital Identity',
    titleCreate: 'Create Your Digital Avatar',
    sub: 'Your personal AI avatar — alive inside the platform, ready for video, workflow, and every creative experience.',
    subCreate: 'Use your camera or upload a photo — our AI transforms it into a stunning full-body avatar in seconds.',
    createAvatar: 'Create Avatar',
    openStudio: 'Open Studio',
    editAvatar: 'Edit Avatar',
    useInVideo: 'Use in Video',
    useInWorkflow: 'Use in Workflow',
    uploadPhoto: 'Upload Photo',
    processing: 'Your avatar is being generated…',
    livePreview: 'LIVE PREVIEW',
    readyStatus: 'Avatar Ready',
    features: ['AI Face Scan', 'Full Body 3D', 'Style Transfer', 'HD Export'],
  },
  ka: {
    eyebrow: 'ავატარ სტუდია',
    title: 'შენი ციფრული იდენტობა',
    titleCreate: 'შექმენი შენი ციფრული ავატარი',
    sub: 'შენი პერსონალური AI ავატარი — ცოცხალი პლატფორმაში, მზად ვიდეოსთვის, workflow-სთვის და ყველა კრეატიული გამოცდილებისთვის.',
    subCreate: 'გამოიყენე კამერა ან ატვირთე ფოტო — AI გარდაქმნის სრულ 3D ავატარად წამებში.',
    createAvatar: 'შექმენი ავატარი',
    openStudio: 'გახსენი სტუდია',
    editAvatar: 'დაარედაქტირე',
    useInVideo: 'ვიდეოში',
    useInWorkflow: 'Workflow-ში',
    uploadPhoto: 'ფოტოს ატვირთვა',
    processing: 'ავატარი იქმნება…',
    livePreview: 'პირდაპირი ხედი',
    readyStatus: 'ავატარი მზადაა',
    features: ['AI სკანი', 'სრული 3D', 'სტილი', 'HD ექსპორტი'],
  },
  ru: {
    eyebrow: 'АВАТАР СТУДИЯ',
    title: 'Ваша Цифровая Личность',
    titleCreate: 'Создайте цифровой аватар',
    sub: 'Ваш персональный AI-аватар — живёт внутри платформы, готов для видео, воркфлоу и любого креативного опыта.',
    subCreate: 'Используйте камеру или загрузите фото — AI создаст полноценный 3D-аватар за секунды.',
    createAvatar: 'Создать аватар',
    openStudio: 'Открыть студию',
    editAvatar: 'Редактировать',
    useInVideo: 'В видео',
    useInWorkflow: 'В Workflow',
    uploadPhoto: 'Загрузить фото',
    processing: 'Аватар генерируется…',
    livePreview: 'ПРЕДПРОСМОТР',
    readyStatus: 'Аватар готов',
    features: ['AI скан', 'Полный 3D', 'Стиль', 'HD экспорт'],
  },
} as const

type Lang = 'en' | 'ka' | 'ru'

type AvatarState = {
  status: 'none' | 'processing' | 'ready' | 'failed'
  modelUrl: string | null
  posterUrl: string | null
}

interface AvatarBuilderWindowProps {
  onAvatarCreated?: (avatarSrc: string) => void
}

export function AvatarBuilderWindow({ onAvatarCreated }: AvatarBuilderWindowProps) {
  const { language } = useLanguage()
  const router = useRouter()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Avatar state from backend ── */
  const [avatar, setAvatar] = useState<AvatarState>({ status: 'none', modelUrl: null, posterUrl: null })

  /* ── Fetch user's core avatar on mount ── */
  useEffect(() => {
    let cancelled = false
    async function fetchAvatar() {
      try {
        const res = await fetch('/api/avatar/core')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setAvatar({
          status: data.status || 'none',
          modelUrl: data.model_glb_url || null,
          posterUrl: data.poster_url || null,
        })
      } catch {
        // Not authenticated or network error — stay in "none" state
      }
    }
    fetchAvatar()
    return () => { cancelled = true }
  }, [])

  const hasAvatar = avatar.status === 'ready'
  const isProcessing = avatar.status === 'processing'

  /* ── Navigation ── */
  const goToStudio = useCallback(() => {
    router.push(`/${language}/services/avatar`)
  }, [language, router])

  const goToVideo = useCallback(() => {
    router.push(`/${language}/services/video`)
  }, [language, router])

  const goToWorkflow = useCallback(() => {
    const el = document.getElementById('workflow-builder')
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    router.push(`/${language}/services/workflow`)
  }, [language, router])

  /* ── Upload photo shortcut ── */
  const handleUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    onAvatarCreated?.(url)
    e.target.value = ''
    router.push(`/${language}/services/avatar`)
  }, [language, router, onAvatarCreated])

  /* ── Determine 3D model URL ── */
  const modelUrl = hasAvatar ? avatar.modelUrl : null

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-36 overflow-hidden">
      {/* ── Deep ambient background ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(167,139,250,0.04) 0%, transparent 70%)' }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px]" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(34,211,238,0.03) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(139,92,246,0.04) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* ─── HEADER ─── */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3" style={{ color: '#a78bfa' }}>
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight mb-4">
            <span style={{ color: 'var(--color-text)' }}>{hasAvatar ? c.title : c.titleCreate}</span>
          </h2>
          <p className="text-sm sm:text-base max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {hasAvatar ? c.sub : c.subCreate}
          </p>
          {/* Feature pills */}
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            {c.features.map((f, i) => (
              <span key={i} className="text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', color: 'rgba(167,139,250,0.7)' }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* ─── MAIN SHOWCASE ─── */}
        <div
          className="relative max-w-4xl mx-auto rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #060c16)',
            border: '1px solid rgba(167,139,250,0.12)',
            boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 120px rgba(167,139,250,0.05), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
              </div>
              <span className="ml-3 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>AVATAR STUDIO</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hasAvatar ? '#34d399' : isProcessing ? '#fbbf24' : '#a78bfa', boxShadow: `0 0 6px ${hasAvatar ? '#34d399' : isProcessing ? '#fbbf24' : '#a78bfa'}` }} />
              <span className="text-[9px] font-bold" style={{ color: hasAvatar ? 'rgba(52,211,153,0.7)' : isProcessing ? 'rgba(251,191,36,0.7)' : 'rgba(167,139,250,0.5)' }}>
                {hasAvatar ? c.readyStatus.toUpperCase() : isProcessing ? 'PROCESSING' : c.livePreview}
              </span>
            </div>
          </div>

          {/* ── 3D Viewport ── */}
          <div className="relative" style={{ minHeight: 420 }}>
            {/* 3D Canvas */}
            <AvatarShowcase3D modelUrl={modelUrl} className="w-full" />

            {/* Processing overlay */}
            {isProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: 'rgba(8,14,20,0.7)', backdropFilter: 'blur(4px)' }}>
                <div className="w-14 h-14 rounded-full border-2 animate-spin mb-4" style={{ borderColor: 'rgba(167,139,250,0.15)', borderTopColor: '#a78bfa' }} />
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.processing}</p>
                <div className="flex gap-1.5 mt-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#a78bfa', opacity: 0.3, animation: `pulse 1.2s ease-in-out ${i * 0.3}s infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Bottom gradient overlay for text readability */}
            <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: 'linear-gradient(to top, #080e14, transparent)' }} />
          </div>

          {/* ── Action Bar ── */}
          <div className="relative z-10 px-5 sm:px-8 pb-6 -mt-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {hasAvatar ? (
                <>
                  <button
                    onClick={goToStudio}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5"
                    style={{
                      background: 'linear-gradient(135deg, rgba(167,139,250,0.25), rgba(139,92,246,0.12))',
                      border: '1px solid rgba(167,139,250,0.4)',
                      color: '#a78bfa',
                      boxShadow: '0 0 24px rgba(167,139,250,0.1)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    {c.editAvatar}
                  </button>
                  <button
                    onClick={goToVideo}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                  >
                    🎬 {c.useInVideo}
                  </button>
                  <button
                    onClick={goToWorkflow}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(6,182,212,0.06))',
                      border: '1px solid rgba(34,211,238,0.25)',
                      color: '#22d3ee',
                    }}
                  >
                    ⚡ {c.useInWorkflow}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={goToStudio}
                    className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/15"
                    style={{
                      background: 'linear-gradient(135deg, #a78bfa, #38bdf8)',
                      color: '#fff',
                      boxShadow: '0 0 30px rgba(167,139,250,0.2)',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    {c.createAvatar}
                  </button>
                  <button
                    onClick={handleUpload}
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {c.uploadPhoto}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
    </section>
  )
}
