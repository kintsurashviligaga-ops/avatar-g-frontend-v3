'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

/* ── i18n ── */
const COPY = {
  en: {
    title: 'Avatar Studio',
    idleCta: 'Scan your face to create avatar',
    startScan: 'Start Scan',
    uploadPhoto: 'Upload Photo',
    scanning: 'Align your face',
    processing: 'Generating your avatar…',
    regenerate: 'Regenerate',
    saveAvatar: 'Save Avatar',
    useInStudio: 'Use in Studio',
    inputPlaceholder: 'Describe your avatar style…',
    inputHint: 'e.g. Cyberpunk, realistic, cinematic lighting',
    cameraError: 'Camera not available',
    permissionDenied: 'Camera permission denied',
  },
  ka: {
    title: 'ავატარის სტუდია',
    idleCta: 'დაასკანერე სახე ავატარის შესაქმნელად',
    startScan: 'სკანირების დაწყება',
    uploadPhoto: 'ფოტოს ატვირთვა',
    scanning: 'გაასწორე სახე',
    processing: 'ავატარი იქმნება…',
    regenerate: 'თავიდან',
    saveAvatar: 'შენახვა',
    useInStudio: 'სტუდიაში გამოყენება',
    inputPlaceholder: 'აღწერე ავატარის სტილი…',
    inputHint: 'მაგ: კიბერპანკი, რეალისტური, კინემატოგრაფიული',
    cameraError: 'კამერა მიუწვდომელია',
    permissionDenied: 'კამერაზე წვდომა უარყოფილია',
  },
  ru: {
    title: 'Студия аватаров',
    idleCta: 'Отсканируйте лицо для создания аватара',
    startScan: 'Начать скан',
    uploadPhoto: 'Загрузить фото',
    scanning: 'Выровняйте лицо',
    processing: 'Генерация аватара…',
    regenerate: 'Заново',
    saveAvatar: 'Сохранить',
    useInStudio: 'В студию',
    inputPlaceholder: 'Опишите стиль аватара…',
    inputHint: 'напр: Киберпанк, реалистичный, кинематографичный',
    cameraError: 'Камера недоступна',
    permissionDenied: 'Доступ к камере запрещён',
  },
} as const

type BuilderState = 'idle' | 'scanning' | 'processing' | 'result'
type Lang = 'en' | 'ka' | 'ru'

export function AvatarBuilderWindow() {
  const { language } = useLanguage()
  const router = useRouter()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  const [state, setState] = useState<BuilderState>('idle')
  const [stylePrompt, setStylePrompt] = useState('')
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Cleanup camera on unmount ── */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  /* ── Start camera scan ── */
  const startScan = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      setState('scanning')
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? c.permissionDenied
        : c.cameraError
      setCameraError(msg)
    }
  }, [c])

  /* ── Capture from camera ── */
  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setPreviewSrc(dataUrl)

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    setState('processing')
    // Simulate generation
    setTimeout(() => setState('result'), 2500)
  }, [])

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
    setTimeout(() => setState('result'), 2500)
    e.target.value = ''
  }, [])

  /* ── Regenerate ── */
  const handleRegenerate = useCallback(() => {
    setState('processing')
    setTimeout(() => setState('result'), 2500)
  }, [])

  /* ── Navigate to full studio ── */
  const goToStudio = useCallback(() => {
    const prompt = stylePrompt.trim()
    const base = `/${language}/services/avatar`
    router.push(prompt ? `${base}?prompt=${encodeURIComponent(prompt)}` : base)
  }, [language, router, stylePrompt])

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

  return (
    <div className="max-w-lg mx-auto">
      {/* Window chrome */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
          border: '1px solid rgba(34,211,238,0.12)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,95,87,0.7)' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,189,46,0.7)' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(39,201,63,0.7)' }} />
            </div>
            <span className="ml-3 text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {c.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }} />
            <span className="text-[9px] font-bold" style={{ color: 'rgba(34,211,238,0.6)' }}>ONLINE</span>
          </div>
        </div>

        {/* Camera viewport */}
        <div className="relative p-4 sm:p-5">
          <div
            className="relative w-full rounded-2xl overflow-hidden"
            style={{
              aspectRatio: '4 / 3',
              background: 'linear-gradient(135deg, #0a0e1a, #0d1225)',
              border: '1px solid rgba(34,211,238,0.08)',
              boxShadow: 'inset 0 2px 20px rgba(0,0,0,0.4)',
            }}
          >
            {/* Glow border effect */}
            <div
              className="absolute -inset-px rounded-2xl pointer-events-none z-10"
              style={{
                background: 'linear-gradient(135deg, rgba(34,211,238,0.2), transparent 50%, rgba(6,182,212,0.15))',
                padding: 1,
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
                WebkitMaskComposite: 'xor',
              }}
            />

            {/* STATE: IDLE */}
            {state === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 z-[5]">
                {/* Ambient glow */}
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }} />
                {/* Camera icon */}
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(6,182,212,0.08))', border: '1px solid rgba(34,211,238,0.25)' }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <p className="text-sm text-center font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {c.idleCta}
                </p>
                {cameraError && (
                  <p className="text-xs text-center" style={{ color: '#f87171' }}>{cameraError}</p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={startScan}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))',
                      border: '1px solid rgba(34,211,238,0.35)',
                      color: '#22d3ee',
                      boxShadow: '0 0 20px rgba(34,211,238,0.1)',
                    }}
                  >
                    {c.startScan}
                  </button>
                  <button
                    onClick={handleUpload}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 active:scale-95"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {c.uploadPhoto}
                  </button>
                </div>
              </div>
            )}

            {/* STATE: SCANNING — camera active */}
            {state === 'scanning' && (
              <div className="absolute inset-0 z-[5]">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                {/* Face alignment oval */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="w-48 h-60 sm:w-56 sm:h-72 rounded-[50%] border-2"
                    style={{
                      borderColor: 'rgba(34,211,238,0.5)',
                      boxShadow: '0 0 30px rgba(34,211,238,0.15), inset 0 0 30px rgba(34,211,238,0.05)',
                      animation: 'pulse 2s ease-in-out infinite',
                    }}
                  />
                </div>
                {/* Label */}
                <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 z-10">
                  <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: '#22d3ee', backdropFilter: 'blur(8px)' }}>
                    {c.scanning}
                  </span>
                  <button
                    onClick={capturePhoto}
                    className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{
                      background: 'linear-gradient(135deg, #22d3ee, #06b6d4)',
                      boxShadow: '0 0 30px rgba(34,211,238,0.4)',
                      border: '3px solid rgba(255,255,255,0.3)',
                    }}
                  >
                    <div className="w-10 h-10 rounded-full" style={{ border: '2px solid rgba(255,255,255,0.8)' }} />
                  </button>
                </div>
              </div>
            )}

            {/* STATE: PROCESSING */}
            {state === 'processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-[5]">
                {previewSrc && (
                  <img
                    src={previewSrc}
                    alt="Source"
                    className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm"
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-4">
                  {/* Spinner */}
                  <div
                    className="w-14 h-14 rounded-full border-2 animate-spin"
                    style={{
                      borderColor: 'rgba(34,211,238,0.15)',
                      borderTopColor: '#22d3ee',
                    }}
                  />
                  <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {c.processing}
                  </p>
                </div>
              </div>
            )}

            {/* STATE: RESULT */}
            {state === 'result' && (
              <div className="absolute inset-0 z-[5]">
                {previewSrc && (
                  <img
                    src={previewSrc}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                )}
                {/* Overlay gradient */}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)' }} />
                {/* Actions */}
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2.5 z-10 px-4">
                  <button
                    onClick={handleRegenerate}
                    className="px-4 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}
                  >
                    {c.regenerate}
                  </button>
                  <button
                    onClick={reset}
                    className="px-4 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}
                  >
                    {c.saveAvatar}
                  </button>
                  <button
                    onClick={goToStudio}
                    className="px-4 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(6,182,212,0.15))',
                      border: '1px solid rgba(34,211,238,0.4)',
                      color: '#22d3ee',
                      boxShadow: '0 0 16px rgba(34,211,238,0.15)',
                    }}
                  >
                    {c.useInStudio}
                  </button>
                </div>
              </div>
            )}

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* Style input bar */}
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364-.707.707M6.343 17.657l-.707.707m0-12.728.707.707M17.657 17.657l.707.707" />
            </svg>
            <input
              type="text"
              value={stylePrompt}
              onChange={e => setStylePrompt(e.target.value)}
              placeholder={c.inputPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            />
          </div>
          <p className="text-[10px] mt-1.5 ml-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {c.inputHint}
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />
    </div>
  )
}
