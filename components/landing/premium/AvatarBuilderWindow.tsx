'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

/* ── i18n ── */
const COPY = {
  en: {
    eyebrow: 'AVATAR STUDIO',
    title: 'Create Your Digital Avatar',
    sub: 'Use your camera or upload a photo — our AI transforms it into a stunning avatar in seconds.',
    startScan: 'Start Camera',
    uploadPhoto: 'Upload Photo',
    scanning: 'Align your face in the oval',
    capture: 'Capture',
    processing: 'Generating your avatar…',
    regenerate: 'Regenerate',
    newScan: 'New Scan',
    useInStudio: 'Open in Studio',
    useInWorkflow: 'Use in Workflow',
    inputPlaceholder: 'Describe your avatar style…',
    inputHint: 'e.g. Cyberpunk, realistic, cinematic lighting',
    cameraError: 'Camera not available',
    permissionDenied: 'Camera permission denied',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit Fullscreen',
    switchCamera: 'Switch Camera',
    features: ['AI Face Scan', 'Style Transfer', 'HD Export', 'Multi-Format'],
  },
  ka: {
    eyebrow: 'ავატარ სტუდია',
    title: 'შექმენი შენი ციფრული ავატარი',
    sub: 'გამოიყენე კამერა ან ატვირთე ფოტო — AI გარდაქმნის წამებში.',
    startScan: 'კამერის დაწყება',
    uploadPhoto: 'ფოტოს ატვირთვა',
    scanning: 'გაასწორე სახე ოვალში',
    capture: 'გადაღება',
    processing: 'ავატარი იქმნება…',
    regenerate: 'თავიდან',
    newScan: 'ახალი სკანი',
    useInStudio: 'სტუდიაში',
    useInWorkflow: 'Workflow-ში',
    inputPlaceholder: 'აღწერე ავატარის სტილი…',
    inputHint: 'მაგ: კიბერპანკი, რეალისტური, კინემატოგრაფიული',
    cameraError: 'კამერა მიუწვდომელია',
    permissionDenied: 'კამერაზე წვდომა უარყოფილია',
    fullscreen: 'სრული ეკრანი',
    exitFullscreen: 'გასვლა',
    switchCamera: 'კამერის შეცვლა',
    features: ['AI სკანი', 'სტილი', 'HD ექსპორტი', 'მულტი-ფორმატი'],
  },
  ru: {
    eyebrow: 'АВАТАР СТУДИЯ',
    title: 'Создайте цифровой аватар',
    sub: 'Используйте камеру или загрузите фото — AI создаст потрясающий аватар за секунды.',
    startScan: 'Камера',
    uploadPhoto: 'Загрузить фото',
    scanning: 'Выровняйте лицо в овале',
    capture: 'Снять',
    processing: 'Генерация аватара…',
    regenerate: 'Заново',
    newScan: 'Новый скан',
    useInStudio: 'В студию',
    useInWorkflow: 'В Workflow',
    inputPlaceholder: 'Опишите стиль аватара…',
    inputHint: 'напр: Киберпанк, реалистичный, кинематографичный',
    cameraError: 'Камера недоступна',
    permissionDenied: 'Доступ к камере запрещён',
    fullscreen: 'Полный экран',
    exitFullscreen: 'Выход',
    switchCamera: 'Сменить камеру',
    features: ['AI скан', 'Стиль', 'HD экспорт', 'Мульти-формат'],
  },
} as const

type BuilderState = 'idle' | 'scanning' | 'processing' | 'result'
type Lang = 'en' | 'ka' | 'ru'

interface AvatarBuilderWindowProps {
  onAvatarCreated?: (avatarSrc: string) => void
}

export function AvatarBuilderWindow({ onAvatarCreated }: AvatarBuilderWindowProps) {
  const { language } = useLanguage()
  const router = useRouter()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const [state, setState] = useState<BuilderState>('idle')
  const [stylePrompt, setStylePrompt] = useState('')
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  /* ── Cleanup camera on unmount ── */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  /* ── Fullscreen change listener ── */
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  /* ── Start camera scan ── */
  const startScan = useCallback(async (facing?: 'user' | 'environment') => {
    setCameraError(null)
    // Stop previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    const mode = facing || facingMode
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      setState('scanning')
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? c.permissionDenied
        : c.cameraError
      setCameraError(msg)
    }
  }, [c, facingMode])

  /* ── Attach stream to video element after it renders ── */
  useEffect(() => {
    if (state === 'scanning' && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [state])

  /* ── Toggle fullscreen ── */
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {})
    } else {
      await document.exitFullscreen().catch(() => {})
    }
  }, [])

  /* ── Switch camera (front/back) ── */
  const switchCamera = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    if (state === 'scanning') startScan(next)
  }, [facingMode, state, startScan])

  /* ── Capture from camera ── */
  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 960
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPreviewSrc(dataUrl)

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    setState('processing')
    setTimeout(() => {
      setState('result')
      if (dataUrl) onAvatarCreated?.(dataUrl)
    }, 2500)
  }, [onAvatarCreated])

  /* ── Upload photo ── */
  const handleUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    const url = URL.createObjectURL(file)
    setPreviewSrc(url)
    setState('processing')
    setTimeout(() => {
      setState('result')
      onAvatarCreated?.(url)
    }, 2500)
    e.target.value = ''
  }, [onAvatarCreated])

  /* ── Regenerate ── */
  const handleRegenerate = useCallback(() => {
    setState('processing')
    setTimeout(() => setState('result'), 2500)
  }, [])

  /* ── Navigate to full studio ── */
  const goToStudio = useCallback(() => {
    // Exit fullscreen first
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    const prompt = stylePrompt.trim()
    const base = `/${language}/services/avatar`
    router.push(prompt ? `${base}?prompt=${encodeURIComponent(prompt)}` : base)
  }, [language, router, stylePrompt])

  /* ── Scroll to Workflow Builder section below ── */
  const goToWorkflow = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    const el = document.getElementById('workflow-builder')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /* ── Reset to idle ── */
  const reset = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (previewSrc && previewSrc.startsWith('blob:')) {
      URL.revokeObjectURL(previewSrc)
    }
    setPreviewSrc(null)
    setState('idle')
    setCameraError(null)
  }, [previewSrc])

  /* ── Shared button style ── */
  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(139,92,246,0.1))',
    border: '1px solid rgba(167,139,250,0.35)',
    color: '#a78bfa',
    boxShadow: '0 0 20px rgba(167,139,250,0.1)',
  }
  const btnGhost: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
  }

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(167,139,250,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-5xl mx-auto">
        {/* ─── HEADER ─── */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3" style={{ color: '#a78bfa' }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
          <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>{c.sub}</p>
          {/* Feature pills */}
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            {c.features.map((f, i) => (
              <span key={i} className="text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', color: 'rgba(167,139,250,0.7)' }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* ─── TWO-COLUMN LAYOUT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* ── Left: Style prompt + info (2 cols) ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Style prompt card */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>STYLE PROMPT</p>
              <textarea
                value={stylePrompt}
                onChange={e => setStylePrompt(e.target.value)}
                placeholder={c.inputPlaceholder}
                rows={3}
                className="w-full bg-transparent text-sm outline-none resize-none"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              />
              <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>{c.inputHint}</p>
            </div>

            {/* Quick action buttons */}
            <div className="space-y-2">
              <button
                onClick={() => startScan()}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.98]"
                style={btnPrimary}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                {c.startScan}
              </button>
              <button
                onClick={handleUpload}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 active:scale-[0.98]"
                style={btnGhost}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {c.uploadPhoto}
              </button>
            </div>

            {cameraError && (
              <p className="text-xs text-center py-2" style={{ color: '#f87171' }}>{cameraError}</p>
            )}
          </div>

          {/* ── Right: Camera viewport (3 cols) ── */}
          <div className="lg:col-span-3" ref={containerRef} style={isFullscreen ? { background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
                boxShadow: '0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(167,139,250,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
                border: '1px solid rgba(167,139,250,0.12)',
                ...(isFullscreen ? { width: '100%', maxWidth: 1200, borderRadius: 0 } : {}),
              }}
            >
              {/* Title bar */}
              <div className="flex items-center justify-between px-5 py-3" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
                  </div>
                  <span className="ml-3 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>AVATAR STUDIO</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Fullscreen toggle */}
                  <button
                    onClick={toggleFullscreen}
                    className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    {isFullscreen ? c.exitFullscreen : c.fullscreen}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
                    <span className="text-[9px] font-bold" style={{ color: 'rgba(167,139,250,0.6)' }}>
                      {state === 'scanning' ? 'LIVE' : state === 'processing' ? 'PROCESSING' : state === 'result' ? 'READY' : 'ONLINE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Camera viewport */}
              <div className="relative p-4 sm:p-5">
                <div
                  className="relative w-full rounded-2xl overflow-hidden"
                  style={{
                    aspectRatio: isFullscreen ? '16 / 9' : '4 / 3',
                    background: 'linear-gradient(135deg, #0a0e1a, #0d1225)',
                    border: '1px solid rgba(167,139,250,0.08)',
                    boxShadow: 'inset 0 2px 20px rgba(0,0,0,0.4)',
                  }}
                >
                  {/* Glow border */}
                  <div
                    className="absolute -inset-px rounded-2xl pointer-events-none z-10"
                    style={{
                      background: 'linear-gradient(135deg, rgba(167,139,250,0.2), transparent 50%, rgba(139,92,246,0.15))',
                      padding: 1,
                      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      maskComposite: 'exclude',
                      WebkitMaskComposite: 'xor',
                    }}
                  />

                  {/* STATE: IDLE */}
                  {state === 'idle' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 z-[5]">
                      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(167,139,250,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }} />
                      <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.08))', border: '1px solid rgba(167,139,250,0.25)' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                      <p className="text-sm text-center font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {c.scanning.replace('oval', '').trim() || 'Point camera at your face'}
                      </p>
                    </div>
                  )}

                  {/* STATE: SCANNING — camera live feed */}
                  {state === 'scanning' && (
                    <div className="absolute inset-0 z-[5]">
                      <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                      {/* Face alignment oval */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div
                          className="w-48 h-60 sm:w-56 sm:h-72 rounded-[50%] border-2"
                          style={{ borderColor: 'rgba(167,139,250,0.5)', boxShadow: '0 0 30px rgba(167,139,250,0.15), inset 0 0 30px rgba(167,139,250,0.05)', animation: 'pulse 2s ease-in-out infinite' }}
                        />
                      </div>
                      {/* Corner crosshairs */}
                      {[{ top: 16, left: 16 }, { top: 16, right: 16 }, { bottom: 80, left: 16 }, { bottom: 80, right: 16 }].map((pos, i) => (
                        <div key={i} className="absolute w-5 h-5 pointer-events-none z-10" style={pos as React.CSSProperties}>
                          <div className="absolute top-0 left-0 w-5 h-0.5" style={{ backgroundColor: 'rgba(167,139,250,0.5)' }} />
                          <div className="absolute top-0 left-0 w-0.5 h-5" style={{ backgroundColor: 'rgba(167,139,250,0.5)' }} />
                        </div>
                      ))}
                      {/* Bottom controls */}
                      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 z-10">
                        <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: '#a78bfa', backdropFilter: 'blur(8px)' }}>
                          {c.scanning}
                        </span>
                        <div className="flex items-center gap-5">
                          {/* Switch camera */}
                          <button
                            onClick={switchCamera}
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
                            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
                            title={c.switchCamera}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M1 4v6h6M23 20v-6h-6" />
                              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
                            </svg>
                          </button>
                          {/* Capture */}
                          <button
                            onClick={capturePhoto}
                            className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90"
                            style={{
                              background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                              boxShadow: '0 0 30px rgba(167,139,250,0.4)',
                              border: '3px solid rgba(255,255,255,0.3)',
                            }}
                          >
                            <div className="w-11 h-11 rounded-full" style={{ border: '2px solid rgba(255,255,255,0.8)' }} />
                          </button>
                          {/* Fullscreen */}
                          <button
                            onClick={toggleFullscreen}
                            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
                            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round">
                              {isFullscreen ? (
                                <>
                                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                                  <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                                </>
                              ) : (
                                <>
                                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                </>
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STATE: PROCESSING */}
                  {state === 'processing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-[5]">
                      {previewSrc && <img src={previewSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm" />}
                      <div className="relative z-10 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(167,139,250,0.15)', borderTopColor: '#a78bfa' }} />
                        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.processing}</p>
                        {/* Progress dots */}
                        <div className="flex gap-1.5">
                          {[0, 1, 2, 3].map(i => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#a78bfa', opacity: 0.3, animation: `pulse 1.2s ease-in-out ${i * 0.3}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STATE: RESULT */}
                  {state === 'result' && (
                    <div className="absolute inset-0 z-[5]">
                      {previewSrc && <img src={previewSrc} alt="Avatar preview" className="w-full h-full object-cover" />}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)' }} />
                      {/* Success badge */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full z-10" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', backdropFilter: 'blur(8px)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                        <span className="text-[10px] font-bold" style={{ color: '#34d399' }}>GENERATED</span>
                      </div>
                      {/* Actions */}
                      <div className="absolute bottom-4 left-0 right-0 flex flex-wrap items-center justify-center gap-2.5 z-10 px-4">
                        <button onClick={handleRegenerate} className="px-4 py-2.5 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}>
                          {c.regenerate}
                        </button>
                        <button onClick={reset} className="px-4 py-2.5 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}>
                          {c.newScan}
                        </button>
                        <button onClick={goToStudio} className="px-4 py-2.5 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95" style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.35)', color: '#a78bfa', backdropFilter: 'blur(8px)' }}>
                          {c.useInStudio} →
                        </button>
                        <button onClick={goToWorkflow} className="px-4 py-2.5 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))', border: '1px solid rgba(34,211,238,0.35)', color: '#22d3ee', backdropFilter: 'blur(8px)' }}>
                          ⚡ {c.useInWorkflow}
                        </button>
                      </div>
                    </div>
                  )}

                  <canvas ref={canvasRef} className="hidden" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
    </section>
  )
}
