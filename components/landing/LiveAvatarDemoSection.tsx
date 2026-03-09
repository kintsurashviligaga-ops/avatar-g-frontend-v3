'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Camera, Upload, Wand2, Sparkles, X, RefreshCw, Download, CameraOff,
  Video, Music2, FileText, Globe, Bot, ShoppingCart, CheckCircle2,
  Users, Zap,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Stage = 'idle' | 'uploading' | 'analyzing' | 'building' | 'rendering' | 'done'
type ActiveInput = 'none' | 'camera'
type StyleId = 'realistic' | 'cinematic' | 'anime' | 'professional' | 'artistic' | 'gaming'

// ─── Avatar Styles ────────────────────────────────────────────
const AVATAR_STYLES: {
  id: StyleId; emoji: string
  en: string; ka: string; ru: string
  grad: string; border: string; activeBorder: string; glow: string
}[] = [
  { id: 'realistic',    emoji: '🎭', en: 'Realistic',    ka: 'რეალისტური', ru: 'Реализм',   grad: 'from-slate-500/25 to-blue-600/25',    border: 'border-blue-400/20',    activeBorder: 'border-blue-400/60',    glow: 'rgba(59,130,246,0.3)' },
  { id: 'cinematic',    emoji: '🎬', en: 'Cinematic',    ka: 'კინო-სტილი', ru: 'Кино',      grad: 'from-violet-500/25 to-indigo-600/25', border: 'border-violet-400/20',  activeBorder: 'border-violet-400/60',  glow: 'rgba(139,92,246,0.3)' },
  { id: 'anime',        emoji: '⚡', en: 'Anime',        ka: 'ანიმე',      ru: 'Аниме',     grad: 'from-pink-500/25 to-rose-600/25',     border: 'border-pink-400/20',    activeBorder: 'border-pink-400/60',    glow: 'rgba(236,72,153,0.3)' },
  { id: 'professional', emoji: '💼', en: 'Professional', ka: 'პროფ.',      ru: 'Профი',     grad: 'from-cyan-500/25 to-teal-600/25',     border: 'border-cyan-400/20',    activeBorder: 'border-cyan-400/60',    glow: 'rgba(34,211,238,0.3)' },
  { id: 'artistic',     emoji: '🎨', en: 'Artistic',     ka: 'მხატვრული',  ru: 'Арт',       grad: 'from-amber-500/25 to-orange-600/25',  border: 'border-amber-400/20',   activeBorder: 'border-amber-400/60',   glow: 'rgba(245,158,11,0.3)' },
  { id: 'gaming',       emoji: '🎮', en: 'Gaming',       ka: 'გეიმინგი',   ru: 'Гейминг',   grad: 'from-green-500/25 to-emerald-600/25', border: 'border-emerald-400/20', activeBorder: 'border-emerald-400/60', glow: 'rgba(16,185,129,0.3)' },
]

// ─── Avatar Powers & Deploy CTAs ─────────────────────────────
const AVATAR_POWERS = [
  { icon: Video,        en: 'AI Video',   ka: 'AI ვიდეო',   ru: 'AI Видео',   href: 'video',    color: 'text-violet-300' },
  { icon: Music2,       en: 'AI Voice',   ka: 'AI ხმა',     ru: 'AI Голос',   href: 'music',    color: 'text-pink-300' },
  { icon: FileText,     en: 'AI Script',  ka: 'სკრიპტი',    ru: 'Сценарий',   href: 'text',     color: 'text-lime-300' },
  { icon: Globe,        en: 'Brand Kit',  ka: 'ბრენდ კიტი', ru: 'Бренд',      href: 'image',    color: 'text-teal-300' },
  { icon: Bot,          en: 'Agent G',    ka: 'Agent G',    ru: 'Agent G',    href: 'agent-g',  color: 'text-cyan-300' },
  { icon: ShoppingCart, en: 'AI Shop',    ka: 'AI მაღ.',    ru: 'AI Магазин', href: 'shop',     color: 'text-amber-300' },
]

const DEPLOY_SERVICES = [
  { icon: Video,   en: 'Video AI',  ka: 'ვიდეო AI', ru: 'Видео AI', href: 'video',   grad: 'from-violet-500/15 to-violet-600/10', border: 'border-violet-400/30' },
  { icon: Music2,  en: 'Voice AI',  ka: 'ხმა AI',   ru: 'Голос AI', href: 'music',   grad: 'from-pink-500/15 to-pink-600/10',     border: 'border-pink-400/30' },
  { icon: Globe,   en: 'Brand Kit', ka: 'ბრენდი',   ru: 'Бренд',    href: 'image',   grad: 'from-teal-500/15 to-teal-600/10',     border: 'border-teal-400/30' },
  { icon: Bot,     en: 'Agent G',   ka: 'Agent G',  ru: 'Agent G',  href: 'agent-g', grad: 'from-cyan-500/15 to-cyan-600/10',     border: 'border-cyan-400/30' },
]

const COPY = {
  en: {
    badge: 'AI Avatar Studio',
    title: 'Create. Style. Deploy.',
    subtitle: 'Upload a photo or use your camera — choose a style, watch AI build your digital identity, then deploy across 17 services.',
    upload: 'Upload Photo',
    camera: 'Open Camera',
    capture: 'Capture',
    retake: 'Retake',
    generate: 'Generate Avatar',
    demo: 'Try Demo',
    before: 'Your Photo',
    after: 'AI Avatar',
    stages: {
      uploading: 'Uploading',
      analyzing: 'Analyzing Face',
      building: 'Building Avatar',
      rendering: 'Rendering Style',
      done: 'Avatar Ready!',
    },
    cameraHint: 'Position your face in the frame',
    cameraError: 'Camera unavailable — use Upload',
    resultLabel: 'Your avatar is ready!',
    fullService: 'Open Full Avatar Studio',
    tryAgain: 'Try Again',
    scanLabel: 'Scanning face…',
    idle: 'Waiting for input',
    capturing: 'Live Camera',
    styleLabel: 'Choose Style',
    statsAvatars: 'Avatars Created',
    statsStyles: 'Style Modes',
    statsTime: 'Real-time',
    statsServices: 'AI Services',
    deployLabel: 'Deploy Your Avatar To:',
    powersLabel: 'What Your Avatar Unlocks',
    cancelBtn: 'Cancel',
  },
  ka: {
    badge: 'AI ავატარ სტუდია',
    title: 'შექმენი. სტილი. განათავსე.',
    subtitle: 'ატვირთე ფოტო ან კამერა — AI გენერირებს ციფრულ იდენტობას. შემდეგ განათავსე 17 სერვისში.',
    upload: 'ფოტოს ატვირთვა',
    camera: 'კამერის გახსნა',
    capture: 'გადაღება',
    retake: 'ხელახლა',
    generate: 'ავატარის გენერაცია',
    demo: 'დემო',
    before: 'შენი ფოტო',
    after: 'AI ავატარი',
    stages: {
      uploading: 'იტვირთება',
      analyzing: 'სახის ანალიზი',
      building: 'ავატარის შექმნა',
      rendering: 'სტილის რენდერი',
      done: 'ავატარი მზადაა!',
    },
    cameraHint: 'განათავსე სახე ჩარჩოში',
    cameraError: 'კამერა მიუწვდომელია — ატვირთვა',
    resultLabel: 'შენი ავატარი მზადაა!',
    fullService: 'სრული ავატარ სტუდია',
    tryAgain: 'ხელახლა ცდა',
    scanLabel: 'სახის სკანირება…',
    idle: 'ატვირთვის მოლოდინი',
    capturing: 'პირდაპირი კამერა',
    styleLabel: 'აირჩიე სტილი',
    statsAvatars: 'ავატარი',
    statsStyles: 'სტილი',
    statsTime: 'რეალ-დრო',
    statsServices: 'AI სერვისი',
    deployLabel: 'ავატარის განსახლება:',
    powersLabel: 'რა შეგიძლია ავატარით',
    cancelBtn: 'გაუქმება',
  },
  ru: {
    badge: 'AI Avatar Studio',
    title: 'Создай. Стиль. Деплой.',
    subtitle: 'Загрузи фото или открой камеру — AI создаст цифровую идентичность, затем разверни в 17 сервисах.',
    upload: 'Загрузить фото',
    camera: 'Открыть камеру',
    capture: 'Снимок',
    retake: 'Переснять',
    generate: 'Создать аватар',
    demo: 'Демо',
    before: 'Ваше фото',
    after: 'AI аватар',
    stages: {
      uploading: 'Загрузка',
      analyzing: 'Анализ лица',
      building: 'Создание',
      rendering: 'Рендер',
      done: 'Аватар готов!',
    },
    cameraHint: 'Расположите лицо в кадре',
    cameraError: 'Камера недоступна — загрузите фото',
    resultLabel: 'Ваш аватар готов!',
    fullService: 'Открыть Avatar Studio',
    tryAgain: 'Попробовать снова',
    scanLabel: 'Сканирование лица…',
    idle: 'Ожидание загрузки',
    capturing: 'Прямая трансляция',
    styleLabel: 'Выбрать стиль',
    statsAvatars: 'Аватаров создано',
    statsStyles: 'Стилей',
    statsTime: 'Реал-тайм',
    statsServices: 'AI Сервисов',
    deployLabel: 'Развернуть аватар в:',
    powersLabel: 'Возможности аватара',
    cancelBtn: 'Отмена',
  },
} as const

const STAGE_ORDER: Exclude<Stage, 'idle' | 'done'>[] = ['uploading', 'analyzing', 'building', 'rendering']
const STAGE_DURATIONS: Record<Exclude<Stage, 'idle' | 'done'>, number> = {
  uploading: 800,
  analyzing: 1200,
  building: 1500,
  rendering: 1000,
}

const SCAN_CSS = `
@keyframes scan-sweep {
  0%   { top: 6%;  opacity: 1; }
  48%  { top: 88%; opacity: 0.7; }
  52%  { top: 88%; opacity: 0.7; }
  100% { top: 6%;  opacity: 1; }
}
@keyframes face-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50%       { opacity: 0.9;  transform: scale(1.03); }
}
@keyframes corner-blink {
  0%, 100% { opacity: 1; }
  40%       { opacity: 0.3; }
}
.av-scan-line {
  position: absolute; left: 6%; right: 6%; height: 2px; border-radius: 9999px;
  background: linear-gradient(90deg, transparent, rgba(34,211,238,0.85), rgba(34,211,238,1), rgba(34,211,238,0.85), transparent);
  box-shadow: 0 0 10px 3px rgba(34,211,238,0.55), 0 0 20px 6px rgba(34,211,238,0.25);
  animation: scan-sweep 2s ease-in-out infinite;
}
.av-face-ring { animation: face-pulse 1.8s ease-in-out infinite; }
.av-corner    { animation: corner-blink 1.4s ease-in-out infinite; }
`

export function LiveAvatarDemoSection() {
  const { language } = useLanguage()
  const text = COPY[language as keyof typeof COPY] ?? COPY.ka
  const locale = language || 'ka'

  const [stage, setStage] = useState<Stage>('idle')
  const [activeInput, setActiveInput] = useState<ActiveInput>('none')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<StyleId>('realistic')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  /* ── Stop camera ── */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraReady(false)
    setActiveInput('none')
  }, [])

  /* ── Start camera ── */
  const startCamera = useCallback(async () => {
    setCameraError(false)
    setCameraReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      setActiveInput('camera')
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
            .then(() => setCameraReady(true))
            .catch(() => setCameraReady(true))
        }
      }, 0)
    } catch {
      setCameraError(true)
    }
  }, [])

  /* ── Capture photo from camera ── */
  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(dataUrl)
    stopCamera()
  }, [stopCamera])

  /* ── Run generation pipeline ── */
  const runPipeline = useCallback((inputUrl: string) => {
    setResultImage(null)
    setStage('uploading')
    let i = 0
    const steps: Stage[] = ['uploading', 'analyzing', 'building', 'rendering', 'done']
    const advance = () => {
      i++
      if (i >= steps.length) return
      const next = steps[i] as Stage
      setStage(next)
      if (next === 'done') {
        const resultUrl = inputUrl.startsWith('data:') ? inputUrl : '/brand/rocket-3d-hq.svg'
        setResultImage(resultUrl)
        try { localStorage.setItem('GENERATED_AVATAR_URL', resultUrl) } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent('generated-avatar-updated', { detail: { url: resultUrl } }))
        return
      }
      window.setTimeout(advance, STAGE_DURATIONS[next as keyof typeof STAGE_DURATIONS])
    }
    window.setTimeout(advance, STAGE_DURATIONS.uploading)
  }, [])

  /* ── File upload ── */
  const onFileUpload = useCallback((file: File | null) => {
    if (!file) return
    stopCamera()
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '/brand/gaga.jpg'
      setCapturedImage(url)
    }
    reader.readAsDataURL(file)
  }, [stopCamera])

  /* ── Reset ── */
  const reset = useCallback(() => {
    stopCamera()
    setStage('idle')
    setCapturedImage(null)
    setResultImage(null)
    setCameraError(false)
  }, [stopCamera])

  /* ── Cleanup on unmount ── */
  useEffect(() => () => { stopCamera() }, [stopCamera])

  const isGenerating = stage !== 'idle' && stage !== 'done'
  const progress = stage === 'idle' ? 0 : stage === 'done' ? 100 : (STAGE_ORDER.indexOf(stage as Exclude<Stage, 'idle' | 'done'>) + 1) * 25
  const stageLabel = stage === 'idle' ? text.idle : stage === 'done' ? text.stages.done : text.stages[stage as keyof typeof text.stages]

  const showCameraStream = activeInput === 'camera'
  const showCaptured = !!capturedImage && !showCameraStream && stage === 'idle'
  const showAnalyzing = !!capturedImage && isGenerating
  const showResult = stage === 'done' && !!resultImage
  const showEmpty = !showCameraStream && !showCaptured && !showAnalyzing && !showResult

  const activeStyle = AVATAR_STYLES.find(s => s.id === selectedStyle)!

  return (
    <section className="relative px-4 py-16 sm:px-6 md:py-24">
      {/* section neon edges */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-400/15 to-transparent" />
      <style dangerouslySetInnerHTML={{ __html: SCAN_CSS }} />

      <div className="mx-auto max-w-6xl">

        {/* ─── Header ───────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/[0.08] px-4 py-1.5 text-[11px] font-semibold tracking-[0.15em] text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.12)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-70 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            {text.badge}
          </span>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl leading-[1.08]">
            {text.title}
          </h2>
          <div className="mx-auto mt-1.5 h-0.5 w-16 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 opacity-60" />
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">{text.subtitle}</p>
        </motion.div>

        {/* ─── Stats Strip ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap justify-center gap-3 mb-8"
        >
          {([
            { icon: Users,    value: '47,231+', label: text.statsAvatars,  color: 'text-cyan-300',    glow: 'rgba(34,211,238,0.10)' },
            { icon: Sparkles, value: '6',       label: text.statsStyles,   color: 'text-violet-300',  glow: 'rgba(139,92,246,0.10)' },
            { icon: Zap,      value: '<10s',    label: text.statsTime,     color: 'text-amber-300',   glow: 'rgba(245,158,11,0.10)' },
            { icon: Bot,      value: '17',      label: text.statsServices, color: 'text-emerald-300', glow: 'rgba(52,211,153,0.10)' },
          ] as const).map((stat, i) => {
            const Icon = stat.icon
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/[0.09] bg-white/[0.04] backdrop-blur"
                style={{ boxShadow: `0 0 20px ${stat.glow}` }}
              >
                <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                <span className={`text-sm font-bold ${stat.color}`}>{stat.value}</span>
                <span className="text-xs text-white/40">{stat.label}</span>
              </div>
            )
          })}
        </motion.div>

        {/* ─── Style Selector ───────────────────────────────── */}
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 text-center">{text.styleLabel}</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-xl mx-auto">
            {AVATAR_STYLES.map(style => {
              const isActive = selectedStyle === style.id
              const label = locale === 'ka' ? style.ka : locale === 'ru' ? style.ru : style.en
              return (
                <motion.button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  whileTap={{ scale: 0.95 }}
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 bg-gradient-to-br ${style.grad} ${
                    isActive
                      ? `${style.activeBorder} scale-[1.04]`
                      : `${style.border} opacity-65 hover:opacity-90`
                  }`}
                  style={isActive ? { boxShadow: `0 0 18px ${style.glow}` } : {}}
                >
                  <span className="text-2xl leading-none">{style.emoji}</span>
                  <span className={`text-[10px] font-medium leading-tight text-center ${isActive ? 'text-white' : 'text-white/55'}`}>{label}</span>
                  {isActive && (
                    <span className="absolute top-1.5 right-1.5">
                      <CheckCircle2 className="w-3 h-3 text-white/80" />
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* ─── Main Card ────────────────────────────────────── */}
        <div className="rounded-3xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(7,14,30,0.92),rgba(4,9,22,0.82))] shadow-[0_32px_80px_rgba(0,0,0,0.5)] p-5 sm:p-6 lg:p-8">

          {/* Style indicator pill */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-gradient-to-r ${activeStyle.grad} mb-5 text-[11px] text-white/80 font-medium`}
            style={{ borderColor: activeStyle.activeBorder.replace('border-', '') }}
          >
            <span>{activeStyle.emoji}</span>
            <span>
              {locale === 'ka' ? activeStyle.ka : locale === 'ru' ? activeStyle.ru : activeStyle.en}
              {locale === 'ka' ? ' რეჟიმი' : locale === 'ru' ? ' режим' : ' Mode'}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">

            {/* ══ LEFT: Camera / Upload / Controls ══ */}
            <div className="flex flex-col gap-4">

            {/* Preview window */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#050b1c] border border-white/[0.09]">

              {/* Camera stream */}
              {showCameraStream && (
                <>
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                    playsInline
                    muted
                    autoPlay
                  />
                  {/* Scanner overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="av-scan-line" />
                    <div className="absolute inset-[14%] rounded-[22%] border border-cyan-400/45 av-face-ring" />
                    <div className="av-corner absolute top-[14%] left-[14%] w-5 h-5 border-t-2 border-l-2 border-cyan-300 rounded-tl-xl" />
                    <div className="av-corner absolute top-[14%] right-[14%] w-5 h-5 border-t-2 border-r-2 border-cyan-300 rounded-tr-xl" />
                    <div className="av-corner absolute bottom-[14%] left-[14%] w-5 h-5 border-b-2 border-l-2 border-cyan-300 rounded-bl-xl" />
                    <div className="av-corner absolute bottom-[14%] right-[14%] w-5 h-5 border-b-2 border-r-2 border-cyan-300 rounded-br-xl" />
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-cyan-400/40 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 backdrop-blur-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      {cameraReady ? text.capturing : '…'}
                    </span>
                    <p className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-cyan-200/70 font-medium">{text.cameraHint}</p>
                  </div>
                  <button
                    onClick={stopCamera}
                    className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/70 border border-white/20 text-white/70 hover:text-white transition-colors backdrop-blur-sm"
                    aria-label="Close camera"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Uploaded/captured image — idle */}
              {showCaptured && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capturedImage!} alt="Input" className="absolute inset-0 w-full h-full object-cover" />
              )}

              {/* Processing — image + scan overlay */}
              {showAnalyzing && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={capturedImage!} alt="Analyzing" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/50 pointer-events-none">
                    {stage === 'analyzing' && <div className="av-scan-line" />}
                    {(stage === 'analyzing' || stage === 'building') && (
                      <>
                        <div className="absolute inset-[10%] rounded-[20%] border border-cyan-400/35 av-face-ring" />
                        <div className="av-corner absolute top-[10%] left-[10%] w-4 h-4 border-t-2 border-l-2 border-cyan-300 rounded-tl-lg" />
                        <div className="av-corner absolute top-[10%] right-[10%] w-4 h-4 border-t-2 border-r-2 border-cyan-300 rounded-tr-lg" />
                        <div className="av-corner absolute bottom-[10%] left-[10%] w-4 h-4 border-b-2 border-l-2 border-cyan-300 rounded-bl-lg" />
                        <div className="av-corner absolute bottom-[10%] right-[10%] w-4 h-4 border-b-2 border-r-2 border-cyan-300 rounded-br-lg" />
                        <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-cyan-200/80 font-medium tracking-wide">{text.scanLabel}</p>
                      </>
                    )}
                    {stage === 'building' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <Wand2 className="w-8 h-8 text-cyan-300 animate-spin" style={{ animationDuration: '1.8s' }} />
                          <span className="text-xs text-cyan-200/80 font-medium">{text.stages.building}</span>
                        </div>
                      </div>
                    )}
                    {stage === 'rendering' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
                          <span className="text-xs text-violet-200/80 font-medium">{text.stages.rendering}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Done — result */}
              {showResult && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resultImage!} alt="AI Avatar" className="absolute inset-0 w-full h-full object-contain p-4" />
              )}

              {/* Empty state */}
              {showEmpty && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-5xl">{activeStyle.emoji}</span>
                  <p className="text-sm font-medium text-white/30">
                    {locale === 'ka' ? `${activeStyle.ka} სტილი` : locale === 'ru' ? `Стиль: ${activeStyle.ru}` : `${activeStyle.en} style`}
                  </p>
                  <p className="text-xs text-white/20">
                    {locale === 'ka' ? 'ფოტო ან კამერა' : locale === 'ru' ? 'Фото или камера' : 'Photo or camera'}
                  </p>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-2.5">
              {showCameraStream ? (
                  <>
                    <button
                      onClick={capturePhoto}
                      disabled={!cameraReady}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 text-white px-4 py-2.5 text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50 transition-colors"
                    >
                      <Camera className="w-4 h-4" /> {text.capture}
                    </button>
                    <button
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/[0.05] px-4 py-2.5 text-sm text-white/70 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" /> {text.cancelBtn}
                    </button>
                  </>
              ) : isGenerating ? (
                <div className="flex-1 flex items-center justify-center gap-3 py-2">
                  <Wand2 className="w-5 h-5 text-cyan-300 animate-spin" style={{ animationDuration: '1.5s' }} />
                  <span className="text-sm text-cyan-100/80">{stageLabel}</span>
                </div>
              ) : (
                <>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/20 transition-colors active:scale-[0.97]">
                    <Upload className="w-4 h-4" />
                    {text.upload}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => onFileUpload(e.target.files?.[0] ?? null)}
                    />
                  </label>

                  {cameraError ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2 text-[11px] text-orange-200 hover:bg-orange-400/18 transition-colors">
                      <CameraOff className="w-3.5 h-3.5 shrink-0" />
                      <span>{text.cameraError}</span>
                      <input type="file" accept="image/*" capture="user" className="hidden" onChange={e => onFileUpload(e.target.files?.[0] ?? null)} />
                    </label>
                  ) : (
                    <button
                      onClick={startCamera}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/80 hover:text-white hover:border-white/35 transition-colors active:scale-[0.97]"
                    >
                      <Camera className="w-4 h-4" />
                      {text.camera}
                    </button>
                  )}

                  <button
                    onClick={() => setCapturedImage('/brand/gaga.jpg')}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-violet-400/25 bg-violet-400/10 px-3.5 py-2 text-sm font-medium text-violet-200/80 hover:bg-violet-400/18 hover:text-violet-100 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {text.demo}
                  </button>
                </>
              )}
            </div>

            {/* Generate button */}
            {capturedImage && stage === 'idle' && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => runPipeline(capturedImage)}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-600 text-white px-5 py-3 text-sm font-bold hover:brightness-110 transition-all shadow-[0_4px_24px_rgba(34,211,238,0.28)]"
              >
                <Wand2 className="w-4 h-4" />
                {text.generate} — {locale === 'ka' ? activeStyle.ka : locale === 'ru' ? activeStyle.ru : activeStyle.en}
              </motion.button>
            )}

            {/* Reset */}
            {stage === 'done' && (
              <button
                onClick={reset}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {text.tryAgain}
              </button>
            )}
          </div>

          {/* ══ RIGHT: Progress + Before/After + CTA panels ══ */}
          <div className="flex flex-col gap-4">

            {/* Progress panel */}
            <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/55">{stageLabel}</span>
                <span className="font-semibold text-cyan-100">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {STAGE_ORDER.map((s, idx) => {
                  const stageIdx = STAGE_ORDER.indexOf(stage as Exclude<Stage, 'idle' | 'done'>)
                  const isDone = stage === 'done' || stageIdx > idx
                  const isCurrent = stage === s
                  return (
                    <div
                      key={s}
                      className={`rounded-lg border px-2 py-1.5 text-center text-[10px] font-medium transition-all duration-300
                        ${isDone ? 'border-cyan-300/50 bg-cyan-300/12 text-cyan-100' :
                          isCurrent ? 'border-cyan-400/70 bg-cyan-400/18 text-white animate-pulse' :
                          'border-white/[0.08] bg-white/[0.02] text-white/35'}`}
                    >
                      {text.stages[s]}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Before / After comparison */}
            <div className="grid grid-cols-2 gap-3 flex-1">
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-3 flex flex-col">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{text.before}</p>
                <div className="flex-1 min-h-[120px] rounded-xl overflow-hidden bg-[#050b1c] border border-white/[0.07] flex items-center justify-center">
                  {capturedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capturedImage} alt="Before" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] text-white/20">
                      {locale === 'ka' ? 'ატვირთე' : locale === 'ru' ? 'Загрузить' : 'Upload'}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-300/20 bg-white/[0.025] p-3 flex flex-col">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">{text.after}</p>
                <div className="min-h-[120px] rounded-xl overflow-hidden bg-[#050b1c] border border-cyan-400/20 flex items-center justify-center relative">
                  {resultImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resultImage} alt="AI result" className="w-full h-full object-cover" />
                      <a
                        href={resultImage}
                        download="avatar.jpg"
                        className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 border border-white/20 text-white/70 hover:text-white backdrop-blur-sm transition-colors"
                        aria-label="Download avatar"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </>
                  ) : isGenerating ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full border-2 border-cyan-400/25 border-t-cyan-400 animate-spin" />
                      <span className="text-[10px] text-cyan-200/55">{stageLabel}</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-cyan-200/20 text-center px-2">
                      {locale === 'ka' ? 'შედეგი' : locale === 'ru' ? 'Резუльтат' : 'Result'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Deploy CTA (done) OR Powers panel (idle) */}
            <AnimatePresence mode="wait">
              {stage === 'done' ? (
                <motion.div
                  key="deploy"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(99,102,241,0.06))] p-4 space-y-3"
                >
                  <p className="text-xs font-semibold text-white/75">{text.deployLabel}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DEPLOY_SERVICES.map(svc => {
                      const Icon = svc.icon
                      const label = locale === 'ka' ? svc.ka : locale === 'ru' ? svc.ru : svc.en
                      return (
                        <Link
                          key={svc.href}
                          href={`/${locale}/services/${svc.href}`}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-gradient-to-br ${svc.grad} ${svc.border} text-white/80 hover:text-white text-[11px] font-medium transition-all hover:scale-[1.02]`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
                        </Link>
                      )
                    })}
                  </div>
                  <Link
                    href={`/${locale}/services/avatar`}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-2.5 text-sm font-bold hover:brightness-110 transition-all"
                  >
                    <Sparkles className="w-4 h-4" /> {text.fullService}
                  </Link>
                </motion.div>
              ) : (
                <motion.div
                  key="powers"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 mb-3">{text.powersLabel}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {AVATAR_POWERS.map(power => {
                      const Icon = power.icon
                      const label = locale === 'ka' ? power.ka : locale === 'ru' ? power.ru : power.en
                      return (
                        <Link
                          key={power.href}
                          href={`/${locale}/services/${power.href}`}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.20] hover:bg-white/[0.05] transition-all group"
                        >
                          <Icon className={`w-4 h-4 ${power.color} group-hover:scale-110 transition-transform`} />
                          <span className="text-[9px] text-white/50 group-hover:text-white/70 text-center leading-tight transition-colors">{label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
    </section>
  )
}
