'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Upload, Wand2, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Stage = 'idle' | 'uploading' | 'analyzing' | 'building' | 'rendering' | 'done'

const COPY = {
  en: {
    badge: 'Live Demo',
    title: 'Try the AI Avatar Builder',
    subtitle: 'Upload a photo or use a demo input to see the full avatar generation flow.',
    upload: 'Upload Photo',
    demo: 'Try Demo Avatar',
    before: 'Before (photo)',
    after: 'After (AI avatar)',
    stages: {
      uploading: 'Uploading',
      analyzing: 'Analyzing Face',
      building: 'Building Avatar',
      rendering: 'Rendering',
      done: 'Avatar Ready',
    },
  },
  ka: {
    badge: 'Live Demo',
    title: 'Try the AI Avatar Builder',
    subtitle: 'ატვირთე ფოტო ან სცადე დემო ავატარი, რომ ნახო გენერაციის სრული პროცესი.',
    upload: 'Upload Photo',
    demo: 'Try Demo Avatar',
    before: 'Before (photo)',
    after: 'After (AI avatar)',
    stages: {
      uploading: 'Uploading',
      analyzing: 'Analyzing Face',
      building: 'Building Avatar',
      rendering: 'Rendering',
      done: 'Avatar Ready',
    },
  },
  ru: {
    badge: 'Live Demo',
    title: 'Try the AI Avatar Builder',
    subtitle: 'Загрузите фото или запустите демо-аватар и посмотрите полный процесс генерации.',
    upload: 'Upload Photo',
    demo: 'Try Demo Avatar',
    before: 'Before (photo)',
    after: 'After (AI avatar)',
    stages: {
      uploading: 'Uploading',
      analyzing: 'Analyzing Face',
      building: 'Building Avatar',
      rendering: 'Rendering',
      done: 'Avatar Ready',
    },
  },
} as const

const STAGE_ORDER: Exclude<Stage, 'idle' | 'done'>[] = ['uploading', 'analyzing', 'building', 'rendering']

export function LiveAvatarDemoSection() {
  const { language } = useLanguage()
  const text = COPY[language as keyof typeof COPY] || COPY.ka

  const [stage, setStage] = useState<Stage>('idle')
  const [beforePreview, setBeforePreview] = useState<string | null>(null)
  const [afterPreview, setAfterPreview] = useState<string | null>(null)

  const stageText = useMemo(() => {
    if (stage === 'idle') return null
    if (stage === 'done') return text.stages.done
    return text.stages[stage]
  }, [stage, text])

  const runDemoPipeline = (source: string) => {
    setBeforePreview(source)
    setAfterPreview(null)
    setStage('uploading')

    const steps: Stage[] = ['uploading', 'analyzing', 'building', 'rendering', 'done']
    steps.forEach((nextStage, i) => {
      window.setTimeout(() => {
        setStage(nextStage)
        if (nextStage === 'done') {
          // Demo image that simulates a generated AI avatar result.
          setAfterPreview('/brand/rocket-3d-hq.svg')
        }
      }, i * 850)
    })
  }

  const onFileUpload = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      runDemoPipeline(result || '/brand/gaga.jpg')
    }
    reader.readAsDataURL(file)
  }

  const progress = stage === 'idle' ? 0 : stage === 'done' ? 100 : (STAGE_ORDER.indexOf(stage as Exclude<Stage, 'idle' | 'done'>) + 1) * 25

  return (
    <section className='relative border-t border-white/[0.08] px-4 py-24 sm:px-6'>
      <div className='mx-auto max-w-6xl rounded-3xl border border-white/12 bg-[linear-gradient(155deg,rgba(8,15,32,0.9),rgba(5,10,24,0.78))] p-6 sm:p-8 lg:p-10'>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='text-center'
        >
          <span className='inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1.5 text-xs font-semibold tracking-[0.14em] text-cyan-100'>
            <Sparkles className='h-3.5 w-3.5' />
            {text.badge}
          </span>
          <h2 className='mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl'>{text.title}</h2>
          <p className='mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/68 sm:text-base'>{text.subtitle}</p>
        </motion.div>

        <div className='mt-8 grid gap-6 lg:grid-cols-2'>
          <div className='rounded-2xl border border-white/12 bg-white/[0.03] p-5'>
            <div className='flex flex-wrap gap-3'>
              <label className='inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/12 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20'>
                <Upload className='h-4 w-4' />
                {text.upload}
                <input
                  type='file'
                  accept='image/*'
                  className='hidden'
                  onChange={(e) => onFileUpload(e.target.files?.[0] || null)}
                />
              </label>
              <button
                onClick={() => runDemoPipeline('/brand/gaga.jpg')}
                className='inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-300/45 hover:text-cyan-100'
              >
                <Camera className='h-4 w-4' />
                {text.demo}
              </button>
            </div>

            <div className='mt-6'>
              <div className='mb-2 flex items-center justify-between text-xs text-white/65'>
                <span>{stageText || 'Idle'}</span>
                <span>{progress}%</span>
              </div>
              <div className='h-2 rounded-full bg-white/10'>
                <div
                  className='h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-500'
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                {STAGE_ORDER.map((s) => (
                  <div
                    key={s}
                    className={`rounded-lg border px-2 py-1.5 text-center text-[11px] ${stage === s || (stage === 'done' && STAGE_ORDER.indexOf(s) >= 0) ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-100' : 'border-white/12 bg-white/[0.02] text-white/55'}`}
                  >
                    {text.stages[s]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='rounded-2xl border border-white/12 bg-white/[0.03] p-4'>
              <p className='mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/62'>{text.before}</p>
              <div className='aspect-[4/5] overflow-hidden rounded-xl border border-white/10 bg-[#090f20]'>
                {beforePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={beforePreview} alt='Before upload' className='h-full w-full object-cover' />
                ) : (
                  <div className='flex h-full items-center justify-center text-white/35'>No input</div>
                )}
              </div>
            </div>

            <div className='rounded-2xl border border-cyan-300/26 bg-white/[0.03] p-4'>
              <p className='mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100/88'>{text.after}</p>
              <div className='aspect-[4/5] overflow-hidden rounded-xl border border-cyan-300/30 bg-[#090f20]'>
                {afterPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={afterPreview} alt='AI avatar result' className='h-full w-full object-cover' />
                ) : (
                  <div className='flex h-full items-center justify-center text-cyan-200/45'>Waiting for result</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
