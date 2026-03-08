'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Camera, Upload, Wand2, Sparkles, X, RefreshCw, Download, CameraOff } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Stage = 'idle' | 'uploading' | 'analyzing' | 'building' | 'rendering' | 'done'
type ActiveInput = 'none' | 'camera'

const COPY = {
  en: {
    badge: 'AI Avatar Builder',
    title: 'Create Your AI Avatar',
    subtitle: 'Upload a photo or use your camera — our AI will analyze your face and generate a stunning digital identity.',
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
    cameraError: 'Camera unavailable — use Upload instead',
    resultLabel: 'Your avatar is ready!',
    fullService: 'Open Full Avatar Service',
    tryAgain: 'Try Again',
    scanLabel: 'Scanning face…',
    idle: 'Waiting for input',
    capturing: 'Live Camera',
  },
  ka: {
    badge: 'AI ავატარის შემქმნელი',
    title: 'შექმენი შენი AI ავატარი',
    subtitle: 'ატვირთე ფოტო ან გამოიყენე კამერა — AI გაანალიზებს შენს სახეს და შექმნის ციფრულ იდენტობას.',
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
    cameraError: 'კამერა მიუწვდომელია — გამოიყენე ატვირთვა',
    resultLabel: 'შენი ავატარი მზადაა!',
    fullService: 'სრული ავატარ სერვისი',
    tryAgain: 'ხელახლა ცდა',
    scanLabel: 'სახის სკანირება…',
    idle: 'ატვირთვის მოლოდინი',
    capturing: 'პირდაპირი კამერა',
  },
  ru: {
    badge: 'AI-конструктор аватаров',
    title: 'Создай свой AI-аватар',
    subtitle: 'Загрузи фото или открой камеру — AI проанализирует лицо и создаст цифровую идентичность.',
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
      building: 'Создание аватара',
      rendering: 'Рендер стиля',
      done: 'Аватар готов!',
    },
    cameraHint: 'Расположите лицо в кадре',
    cameraError: 'Камера недоступна — используйте загрузку',
    resultLabel: 'Ваш аватар готов!',
    fullService: 'Открыть полный сервис',
    tryAgain: 'Попробовать снова',
    scanLabel: 'Сканирование лица…',
    idle: 'Ожидание загрузки',
    capturing: 'Прямая камера',
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

  const [stage, setStage] = useState<Stage>('idle')
  const [activeInput, setActiveInput] = useState<ActiveInput>('none')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)

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

  return (
    <section className="relative border-t border-white/[0.08] px-4 py-20 sm:px-6">
      <style dangerouslySetInnerHTML={{ __html: SCAN_CSS }} />

      <div className="mx-auto max-w-6xl rounded-3xl border border-white/[0.1] bg-[linear-gradient(155deg,rgba(7,14,30,0.92),rgba(4,9,22,0.82))] shadow-[0_32px_80px_rgba(0,0,0,0.5)] p-5 sm:p-7 lg:p-9">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-7 sm:mb-9"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1.5 text-[11px] font-semibold tracking-[0.15em] text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
            {text.badge}
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">{text.title}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">{text.subtitle}</p>
        </motion.div>

        {/* Main 2-col grid */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* LEFT: Input + controls */}
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/25">
                  <Camera className="w-12 h-12" />
                  <p className="text-sm font-medium">
                    {language === 'ka' ? 'ფოტო ან კამერა' : language === 'ru' ? 'Фото или камера' : 'Photo or camera'}
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
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 text-white px-4 py-2.5 text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.97]"
                  >
                    <Camera className="w-4 h-4" />
                    {text.capture}
                  </button>
                  <button
                    onClick={stopCamera}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/[0.05] px-4 py-2.5 text-sm text-white/70 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                    {language === 'ka' ? 'გახსნა' : language === 'ru' ? 'Отмена' : 'Cancel'}
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
                    <Sparkles className="w-3.5 h-3.5" />
                    {text.demo}
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
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-600 text-white px-5 py-3 text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(34,211,238,0.28),0_2px_8px_rgba(99,102,241,0.18)]"
              >
                <Wand2 className="w-4 h-4" />
                {text.generate}
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

          {/* RIGHT: Progress + before/after */}
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
                <div className="flex-1 min-h-[140px] rounded-xl overflow-hidden bg-[#050b1c] border border-white/[0.07] flex items-center justify-center">
                  {capturedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capturedImage} alt="Before" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] text-white/20">
                      {language === 'ka' ? 'ატვირთე' : language === 'ru' ? 'Загрузить' : 'Upload'}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-300/20 bg-white/[0.025] p-3 flex flex-col">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">{text.after}</p>
                <div className="flex-1 min-h-[140px] rounded-xl overflow-hidden bg-[#050b1c] border border-cyan-400/20 flex items-center justify-center relative">
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
                      {language === 'ka' ? 'შედეგი' : language === 'ru' ? 'Результат' : 'Result'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Done CTA */}
            {stage === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(99,102,241,0.07))] p-4 text-center"
              >
                <p className="text-sm font-semibold text-white mb-3">{text.resultLabel}</p>
                <a
                  href={`/${language ?? 'ka'}/services/avatar`}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white px-5 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-[0.97] transition-all shadow-[0_4px_20px_rgba(34,211,238,0.22)]"
                >
                  <Sparkles className="w-4 h-4" />
                  {text.fullService}
                </a>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
