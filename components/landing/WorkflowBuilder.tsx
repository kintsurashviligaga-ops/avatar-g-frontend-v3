'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  UserCircle2, Clapperboard, Scissors, Music2, Camera, ImageIcon, Film,
  FileText, Wand2, Eye, Workflow, ShoppingCart, Cpu, Code2, Briefcase,
  Plane, Puzzle, ArrowRight, Plus, X, ChevronRight, Play, Sparkles,
  Bot, Send, RotateCcw, CheckCircle2, Layers, Zap, Target, Video,
  Mic, Settings, Globe, BarChart3, Package
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

// ─── Service Definitions ─────────────────────────────────────
type ServiceId =
  | 'avatar' | 'video' | 'editing' | 'music' | 'photo' | 'image'
  | 'media' | 'text' | 'prompt' | 'visual-intel' | 'workflow'
  | 'shop' | 'agent-g' | 'software' | 'business' | 'tourism' | 'next'

interface ServiceDef {
  id: ServiceId
  label: string
  shortLabel: string
  icon: React.ElementType
  color: string       // Tailwind gradient from-to
  glow: string        // rgba glow
  category: CategoryId
  outputType: string  // what does this service produce
}

type CategoryId = 'create' | 'edit' | 'automate' | 'analyze' | 'scale'

interface Category {
  id: CategoryId
  label: string
  icon: React.ElementType
  accent: string
}

const CATEGORIES: Category[] = [
  { id: 'create',   label: 'Create',   icon: Sparkles, accent: 'text-cyan-300' },
  { id: 'edit',     label: 'Edit',     icon: Scissors, accent: 'text-violet-300' },
  { id: 'automate', label: 'Automate', icon: Zap,      accent: 'text-amber-300' },
  { id: 'analyze',  label: 'Analyze',  icon: Eye,      accent: 'text-emerald-300' },
  { id: 'scale',    label: 'Scale',    icon: BarChart3, accent: 'text-rose-300' },
]

const SERVICES: ServiceDef[] = [
  { id: 'avatar',       label: 'AI Avatar',           shortLabel: 'Avatar',     icon: UserCircle2,  color: 'from-cyan-500 to-sky-600',       glow: 'rgba(6,182,212,0.45)',   category: 'create',   outputType: 'Avatar Identity' },
  { id: 'video',        label: 'AI Video Studio',      shortLabel: 'Video',      icon: Clapperboard, color: 'from-violet-500 to-indigo-600',   glow: 'rgba(139,92,246,0.45)',  category: 'create',   outputType: 'Video Clip' },
  { id: 'editing',      label: 'Video Editing',        shortLabel: 'Edit',       icon: Scissors,     color: 'from-purple-500 to-violet-600',   glow: 'rgba(168,85,247,0.45)',  category: 'edit',     outputType: 'Edited Video' },
  { id: 'music',        label: 'AI Music Studio',      shortLabel: 'Music',      icon: Music2,       color: 'from-pink-500 to-rose-600',       glow: 'rgba(236,72,153,0.45)',  category: 'create',   outputType: 'Song / Score' },
  { id: 'photo',        label: 'AI Photo Studio',      shortLabel: 'Photo',      icon: Camera,       color: 'from-sky-500 to-blue-600',        glow: 'rgba(14,165,233,0.45)',  category: 'create',   outputType: 'Photo Asset' },
  { id: 'image',        label: 'AI Image Creator',     shortLabel: 'Image',      icon: ImageIcon,    color: 'from-teal-500 to-emerald-600',    glow: 'rgba(20,184,166,0.45)',  category: 'create',   outputType: 'Visual Asset' },
  { id: 'media',        label: 'Media Production',     shortLabel: 'Media',      icon: Film,         color: 'from-blue-500 to-cyan-600',       glow: 'rgba(59,130,246,0.45)',  category: 'edit',     outputType: 'Media Package' },
  { id: 'text',         label: 'Text Intelligence',    shortLabel: 'Text',       icon: FileText,     color: 'from-lime-500 to-green-600',      glow: 'rgba(132,204,22,0.45)',  category: 'analyze',  outputType: 'Copy / Script' },
  { id: 'prompt',       label: 'Prompt Builder',       shortLabel: 'Prompt',     icon: Wand2,        color: 'from-amber-500 to-orange-600',    glow: 'rgba(245,158,11,0.45)',  category: 'analyze',  outputType: 'Prompt Set' },
  { id: 'visual-intel', label: 'Visual Intelligence',  shortLabel: 'Visual AI',  icon: Eye,          color: 'from-emerald-500 to-teal-600',    glow: 'rgba(16,185,129,0.45)',  category: 'analyze',  outputType: 'Quality Report' },
  { id: 'workflow',     label: 'Workflow Automation',  shortLabel: 'Workflow',   icon: Workflow,     color: 'from-orange-500 to-amber-600',    glow: 'rgba(249,115,22,0.45)',  category: 'automate', outputType: 'Automation' },
  { id: 'shop',         label: 'Online Shop',          shortLabel: 'Shop',       icon: ShoppingCart, color: 'from-rose-500 to-pink-600',       glow: 'rgba(244,63,94,0.45)',   category: 'scale',    outputType: 'Product Listing' },
  { id: 'agent-g',      label: 'Agent G Director',     shortLabel: 'Agent G',    icon: Cpu,          color: 'from-cyan-400 to-blue-500',       glow: 'rgba(34,211,238,0.55)',  category: 'automate', outputType: 'Full Orchestration' },
  { id: 'software',     label: 'Software Dev',         shortLabel: 'Dev',        icon: Code2,        color: 'from-slate-500 to-gray-600',      glow: 'rgba(100,116,139,0.45)', category: 'scale',    outputType: 'App / Integration' },
  { id: 'business',     label: 'Business Agent',       shortLabel: 'Business',   icon: Briefcase,    color: 'from-yellow-500 to-amber-600',    glow: 'rgba(234,179,8,0.45)',   category: 'scale',    outputType: 'Business Plan' },
  { id: 'tourism',      label: 'Tourism AI',           shortLabel: 'Tourism',    icon: Plane,        color: 'from-sky-600 to-indigo-600',      glow: 'rgba(14,165,233,0.45)',  category: 'scale',    outputType: 'Tourism Content' },
]

const BY_ID = new Map(SERVICES.map(s => [s.id, s]))

// ─── Preset Templates ─────────────────────────────────────────
interface Template {
  id: string
  icon: string
  services: ServiceId[]
  taskHint: { en: string; ka: string; ru: string }
  labelEn: string; labelKa: string; labelRu: string
}

const TEMPLATES: Template[] = [
  {
    id: 'video-avatar',
    icon: '🎬',
    labelEn: 'Avatar Video Clip',
    labelKa: 'ავატარ ვიდეო კლიპი',
    labelRu: 'Видеоклип с аватаром',
    services: ['avatar', 'video', 'editing'],
    taskHint: {
      en: 'Avatar video clip with voiceover and post-production',
      ka: 'ავატარის ვიდეო კლიპი ხმოვანი განმარტებით',
      ru: 'Видеоклип с аватаром и монтажом',
    },
  },
  {
    id: 'music-brand',
    icon: '🎵',
    labelEn: 'Music + Avatar Voice',
    labelKa: 'მუსიკა + ავატარის ხმა',
    labelRu: 'Музыка + голос аватара',
    services: ['avatar', 'music', 'video'],
    taskHint: {
      en: 'Original song with avatar voice and animated video',
      ka: 'ავტორის სიმღერა ავატარის ხმით და ვიდეოთი',
      ru: 'Оригинальная песня с голосом аватара',
    },
  },
  {
    id: 'ad-campaign',
    icon: '📣',
    labelEn: 'Ad Campaign',
    labelKa: 'სარეკლამო კამპანია',
    labelRu: 'Рекламная кампания',
    services: ['avatar', 'image', 'text', 'video'],
    taskHint: {
      en: 'Full ad campaign: visuals, copy, and avatar-led video',
      ka: 'სრული სარეკლამო კამპანია: ვიზუალი, ტექსტი, ვიდეო',
      ru: 'Полная рекламная кампания с аватаром',
    },
  },
  {
    id: 'business-video',
    icon: '📊',
    labelEn: 'Business Report Video',
    labelKa: 'ბიზნეს გეგმის ვიდეო',
    labelRu: 'Видео для бизнес-отчёта',
    services: ['business', 'text', 'video', 'editing'],
    taskHint: {
      en: 'Business strategy video with presentation graphics',
      ka: 'ბიზნეს სტრატეგიის ვიდეო პრეზენტაციით',
      ru: 'Видео бизнес-стратегии с графикой',
    },
  },
  {
    id: 'full-automation',
    icon: '⚡',
    labelEn: 'Full AI Pipeline',
    labelKa: 'სრული AI პაიფლაინი',
    labelRu: 'Полный AI Pipeline',
    services: ['avatar', 'video', 'music', 'text', 'workflow', 'agent-g'],
    taskHint: {
      en: 'Complete automated production pipeline orchestrated by Agent G',
      ka: 'სრული ავტომატური პროდაქშენი Agent G-ის ოქმით',
      ru: 'Полный автоматизированный пайплайн с Agent G',
    },
  },
  {
    id: 'content-creation',
    icon: '✨',
    labelEn: 'Content Creation Suite',
    labelKa: 'კონტენტის შექმნა',
    labelRu: 'Создание контента',
    services: ['avatar', 'image', 'text', 'prompt'],
    taskHint: {
      en: 'Multi-format content assets for social and marketing',
      ka: 'სოციალური და მარქეთინგის მრავალფორმატული კონტენტი',
      ru: 'Мультиформатный контент для соцсетей',
    },
  },
]

// ─── Avatar Presets ────────────────────────────────────────────
const AVATAR_PRESETS = [
  { id: 'custom', label: 'My Avatar', icon: UserCircle2, color: 'from-cyan-500 to-blue-600' },
  { id: 'pro-male', label: 'Pro Male', icon: UserCircle2, color: 'from-indigo-500 to-violet-600' },
  { id: 'pro-female', label: 'Pro Female', icon: UserCircle2, color: 'from-pink-500 to-rose-600' },
  { id: 'brand-voice', label: 'Brand Voice', icon: Mic, color: 'from-amber-500 to-orange-600' },
  { id: 'narrator', label: 'Narrator', icon: Video, color: 'from-teal-500 to-emerald-600' },
]

// ─── Chat Messages ────────────────────────────────────────────
interface ChatMsg {
  role: 'user' | 'agent'
  text: string
}

function generateAgentResponse(pipeline: ServiceId[], task: string, locale: string): string {
  const count = pipeline.length
  if (count === 0) {
    if (locale === 'ka') return 'გამარჯობა! მე ვარ Agent G. გადადი სერვისების პანელზე, დაამატე სასურველი სერვისები პაიფლაინში და მე დაგეხმარები საუკეთესო შედეგის მიღწევაში.'
    if (locale === 'ru') return 'Привет! Я Agent G. Добавьте сервисы в пайплайн, и я помогу вам получить лучший результат.'
    return "Hello! I'm Agent G. Add services to your pipeline and I'll help you build the optimal workflow for your goal."
  }
  const names = pipeline.map(id => BY_ID.get(id)?.shortLabel || id).join(' → ')
  if (locale === 'ka') return `შენი პაიფლაინი: ${names}. ${task ? `"${task}" — ` : ''}სერვისების კომბინაცია ოპტიმალურია. დააჭირე "გაშვება" შედეგის მისაღებად.`
  if (locale === 'ru') return `Ваш пайплайн: ${names}. ${task ? `Задача: "${task}" — ` : ''}Отличная комбинация. Нажмите "Запустить" для получения результата.`
  return `Pipeline: ${names}. ${task ? `Task: "${task}" — ` : ''}Great combination! This flow will produce a complete output. Hit Launch when ready.`
}

function getPipelineOutput(pipeline: ServiceId[]): string {
  if (pipeline.length === 0) return '—'
  const lastId = pipeline[pipeline.length - 1]
  const last = lastId ? BY_ID.get(lastId) : undefined
  return last?.outputType || 'Output'
}

// ─── Main Component ───────────────────────────────────────────
export function WorkflowBuilder() {
  const { language: locale } = useLanguage()
  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>('all')
  const [pipeline, setPipeline] = useState<ServiceId[]>([])
  const [selectedAvatar, setSelectedAvatar] = useState<string>('custom')
  const [taskName, setTaskName] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [launched, setLaunched] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // ─── Localized Copy ──────────────────────────────────────────
  const copy = {
    en: {
      badge: 'MISSION CONTROL',
      title: 'Build Your AI Pipeline',
      subtitle: 'Select your avatar, choose services, chain your pipeline — launch your project.',
      avatarLabel: 'Avatar',
      categoryLabel: 'Filter',
      pipelineLabel: 'Your Pipeline',
      pipelineEmpty: 'Click services to add them to your pipeline',
      pipelineHint: 'Services execute left → right',
      taskLabel: 'Project / Task name',
      taskPlaceholder: 'e.g. Brand video with music and avatar narration',
      templatesLabel: 'Quick Templates',
      chatLabel: 'Agent G',
      chatPlaceholder: 'Ask Agent G anything about your pipeline…',
      launchBtn: 'Launch Pipeline',
      resetBtn: 'Reset',
      outputLabel: 'Final Output',
      stepLabel: 'Step',
      clearPipeline: 'Clear pipeline',
      openWorkspace: 'Open Full Workspace →',
    },
    ka: {
      badge: 'სამართავი პანელი',
      title: 'შექმენი AI პაიფლაინი',
      subtitle: 'აირჩიე ავატარი, სერვისები და დააკავშირე — გაუშვი შენი პროექტი.',
      avatarLabel: 'ავატარი',
      categoryLabel: 'ფილტრი',
      pipelineLabel: 'შენი პაიფლაინი',
      pipelineEmpty: 'სერვისებზე დააწკაპუნე პაიფლაინში დასამატებლად',
      pipelineHint: 'სერვისები სრულდება მარცხნიდან → მარჯვნივ',
      taskLabel: 'პროექტი / დავალება',
      taskPlaceholder: 'მაგ. ბრენდ ვიდეო მუსიკით და ავატარის ხმით',
      templatesLabel: 'სწრაფი შაბლონები',
      chatLabel: 'Agent G',
      chatPlaceholder: 'ჰკითხე Agent G-ს შენს პაიფლაინზე…',
      launchBtn: 'გაშვება',
      resetBtn: 'გასუფთავება',
      outputLabel: 'საბოლოო შედეგი',
      stepLabel: 'ნაბიჯი',
      clearPipeline: 'პაიფლაინის გასუფთავება',
      openWorkspace: 'სამუშაო სივრცის გახსნა →',
    },
    ru: {
      badge: 'ЦЕНТР УПРАВЛЕНИЯ',
      title: 'Создайте AI Pipeline',
      subtitle: 'Выберите аватар, сервисы, выстройте цепочку — запустите проект.',
      avatarLabel: 'Аватар',
      categoryLabel: 'Фильтр',
      pipelineLabel: 'Ваш Pipeline',
      pipelineEmpty: 'Нажмите на сервисы, чтобы добавить в pipeline',
      pipelineHint: 'Сервисы выполняются слева → направо',
      taskLabel: 'Проект / Задача',
      taskPlaceholder: 'Напр. Брендовое видео с музыкой и аватаром',
      templatesLabel: 'Быстрые шаблоны',
      chatLabel: 'Agent G',
      chatPlaceholder: 'Спросите Agent G о вашем pipeline…',
      launchBtn: 'Запустить',
      resetBtn: 'Сбросить',
      outputLabel: 'Финальный результат',
      stepLabel: 'Шаг',
      clearPipeline: 'Очистить pipeline',
      openWorkspace: 'Открыть рабочее место →',
    },
  } as const
  const c = copy[locale as keyof typeof copy] ?? copy.en

  // ─── Filtered Services ───────────────────────────────────────
  const filteredServices = activeCategory === 'all'
    ? SERVICES
    : SERVICES.filter(s => s.category === activeCategory)

  // ─── Add / Remove from pipeline ──────────────────────────────
  const addToPipeline = useCallback((id: ServiceId) => {
    setPipeline(prev => prev.includes(id) ? prev : [...prev, id])
    setLaunched(false)
  }, [])

  const removeFromPipeline = useCallback((id: ServiceId) => {
    setPipeline(prev => prev.filter(p => p !== id))
    setLaunched(false)
  }, [])

  const applyTemplate = useCallback((t: Template) => {
    setPipeline(t.services)
    const hint = t.taskHint[locale as keyof typeof t.taskHint] ?? t.taskHint.en
    setTaskName(hint)
    setLaunched(false)
  }, [locale])

  // ─── Launch ──────────────────────────────────────────────────
  const handleLaunch = useCallback(() => {
    if (pipeline.length === 0) return
    setLaunched(true)
    const msg = generateAgentResponse(pipeline, taskName, locale)
    setChatMessages(prev => [...prev, {
      role: 'agent',
      text: msg,
    }])
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [pipeline, taskName, locale])

  // ─── Chat ─────────────────────────────────────────────────────
  const sendChat = useCallback(() => {
    const txt = chatInput.trim()
    if (!txt) return
    setChatMessages(prev => [...prev, { role: 'user', text: txt }])
    setChatInput('')
    setTyping(true)
    setTimeout(() => {
      const reply = generateAgentResponse(pipeline, txt, locale)
      setChatMessages(prev => [...prev, { role: 'agent', text: reply }])
      setTyping(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }, 820)
  }, [chatInput, pipeline, locale])

  // ─── Scroll chat on new message ──────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ─── Reset ───────────────────────────────────────────────────
  const handleReset = () => {
    setPipeline([])
    setTaskName('')
    setLaunched(false)
    setChatMessages([])
    setChatInput('')
  }

  const outputLabel = getPipelineOutput(pipeline)
  const selectedAvatarDef = AVATAR_PRESETS.find(a => a.id === selectedAvatar)!

  return (
    <section id="workflow-builder" className="relative px-3 sm:px-6 py-10 md:py-14">
      <div className="mx-auto max-w-7xl">
        {/* ─── Header ─────────────────────────────────────────── */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/[0.05] mb-4">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-300/90 tracking-[0.2em]">{c.badge}</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-3">
            {c.title}
          </h2>
          <p className="text-white/50 text-sm md:text-base max-w-2xl mx-auto">{c.subtitle}</p>
        </motion.div>

        {/* ─── Main Grid ──────────────────────────────────────── */}
        <div className="rounded-3xl border border-white/[0.10] bg-[linear-gradient(145deg,rgba(4,8,20,0.92),rgba(6,12,28,0.82))] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl overflow-hidden">
          <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_320px] divide-y xl:divide-y-0 xl:divide-x divide-white/[0.08]">

            {/* ══════════════════════════════════════════════════
                LEFT PANEL — Avatar + Templates + Categories
            ══════════════════════════════════════════════════ */}
            <div className="flex flex-col gap-0 divide-y divide-white/[0.07]">

              {/* Avatar Selector */}
              <div className="p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/45 flex items-center gap-1.5">
                  <UserCircle2 className="w-3 h-3" /> {c.avatarLabel}
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {AVATAR_PRESETS.map(av => {
                    const AIcon = av.icon
                    const active = selectedAvatar === av.id
                    return (
                      <button
                        key={av.id}
                        onClick={() => setSelectedAvatar(av.id)}
                        title={av.label}
                        className={`group flex flex-col items-center gap-1 rounded-xl p-2 border transition-all duration-200 ${
                          active
                            ? 'border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                            : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${av.color} flex items-center justify-center`}>
                          <AIcon className="w-4 h-4 text-white" />
                        </div>
                        <span className={`text-[8px] leading-none font-medium truncate w-full text-center ${active ? 'text-cyan-200' : 'text-white/50'}`}>
                          {av.label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Task name input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-white/40">{c.taskLabel}</label>
                  <input
                    value={taskName}
                    onChange={e => setTaskName(e.target.value)}
                    placeholder={c.taskPlaceholder}
                    className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-cyan-400/40 focus:bg-white/[0.06] transition-all"
                  />
                </div>
              </div>

              {/* Quick Templates */}
              <div className="p-4 space-y-2.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/45 flex items-center gap-1.5">
                  <Layers className="w-3 h-3" /> {c.templatesLabel}
                </p>
                <div className="space-y-1.5">
                  {TEMPLATES.map(t => {
                    const lbl = locale === 'ka' ? t.labelKa : locale === 'ru' ? t.labelRu : t.labelEn
                    const active = JSON.stringify(pipeline) === JSON.stringify(t.services)
                    return (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-200 ${
                          active
                            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                            : 'border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white/90'
                        }`}
                      >
                        <span className="text-base leading-none">{t.icon}</span>
                        <span className="text-xs font-medium leading-tight">{lbl}</span>
                        {active && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300 ml-auto" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Category Filter */}
              <div className="p-4 space-y-2.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/45 flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> {c.categoryLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveCategory('all')}
                    className={`px-3 py-1.5 text-[11px] rounded-full border transition-colors ${
                      activeCategory === 'all'
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-white/[0.12] text-white/55 hover:text-white/80 hover:border-white/25'
                    }`}
                  >
                    All
                  </button>
                  {CATEGORIES.map(cat => {
                    const CIcon = cat.icon
                    const active = activeCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-full border transition-colors ${
                          active
                            ? `border-white/40 bg-white/10 ${cat.accent}`
                            : 'border-white/[0.12] text-white/55 hover:text-white/80 hover:border-white/25'
                        }`}
                      >
                        <CIcon className="w-3 h-3" />
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                CENTER PANEL — Service Grid + Pipeline Builder
            ══════════════════════════════════════════════════ */}
            <div className="flex flex-col divide-y divide-white/[0.07]">

              {/* Service Grid */}
              <div className="p-4 space-y-3 flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                  <AnimatePresence mode="popLayout">
                    {filteredServices.map(svc => {
                      const SIcon = svc.icon
                      const inPipeline = pipeline.includes(svc.id)
                      return (
                        <motion.button
                          key={svc.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.18 }}
                          onClick={() => inPipeline ? removeFromPipeline(svc.id) : addToPipeline(svc.id)}
                          className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all duration-200 ${
                            inPipeline
                              ? 'border-cyan-400/50 bg-cyan-400/[0.08] shadow-[0_0_16px_rgba(34,211,238,0.18)]'
                              : 'border-white/[0.09] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.05]'
                          }`}
                        >
                          {inPipeline && (
                            <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center">
                              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                            </span>
                          )}
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${svc.color} flex items-center justify-center flex-shrink-0`}
                            style={{ boxShadow: inPipeline ? `0 0 12px ${svc.glow}` : 'none' }}>
                            <SIcon className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[11px] font-semibold leading-tight truncate ${inPipeline ? 'text-cyan-100' : 'text-white/80'}`}>
                              {svc.shortLabel}
                            </p>
                            <p className="text-[10px] text-white/35 mt-0.5 leading-snug line-clamp-2">
                              {svc.outputType}
                            </p>
                          </div>
                        </motion.button>
                      )
                    })}
                  </AnimatePresence>
                </div>
              </div>

              {/* Pipeline Builder */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/45 flex items-center gap-1.5">
                    <Workflow className="w-3 h-3" /> {c.pipelineLabel}
                    {pipeline.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-bold border border-cyan-400/25">
                        {pipeline.length}
                      </span>
                    )}
                  </p>
                  {pipeline.length > 0 && (
                    <button onClick={() => { setPipeline([]); setLaunched(false) }}
                      className="text-[10px] text-white/35 hover:text-rose-300 flex items-center gap-1 transition-colors">
                      <X className="w-3 h-3" /> {c.clearPipeline}
                    </button>
                  )}
                </div>

                {/* Pipeline Track */}
                <div className="relative min-h-[72px] rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] overflow-x-auto">
                  {pipeline.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-[11px] text-white/25 text-center px-4">{c.pipelineEmpty}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0 p-3 min-w-max">
                      {/* Avatar node always first */}
                      <div className="flex flex-col items-center gap-1 mr-1">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedAvatarDef.color} flex items-center justify-center border-2 border-cyan-300/60 shadow-[0_0_14px_rgba(34,211,238,0.35)]`}>
                          <UserCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-[8px] text-cyan-300/80 font-medium">Avatar</span>
                      </div>

                      {pipeline.map((id, idx) => {
                        const svc = BY_ID.get(id)!
                        const SIcon = svc.icon
                        return (
                          <div key={id} className="flex items-center">
                            <div className="flex items-center gap-0.5 mx-0.5">
                              <div className="w-4 h-px bg-gradient-to-r from-white/20 to-cyan-300/40" />
                              <ChevronRight className="w-3 h-3 text-cyan-300/50" />
                            </div>
                            <div className="flex flex-col items-center gap-1 group/node">
                              <div className="relative">
                                <div
                                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${svc.color} flex items-center justify-center cursor-pointer`}
                                  style={{ boxShadow: `0 0 10px ${svc.glow}` }}
                                >
                                  <SIcon className="w-4.5 h-4.5 text-white" />
                                </div>
                                <button
                                  onClick={() => removeFromPipeline(id)}
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-opacity"
                                >
                                  <X className="w-2.5 h-2.5 text-white" />
                                </button>
                              </div>
                              <span className="text-[8px] text-white/55 font-medium">{svc.shortLabel}</span>
                            </div>
                          </div>
                        )
                      })}

                      {/* Output node */}
                      <div className="flex items-center">
                        <div className="flex items-center gap-0.5 mx-0.5">
                          <div className="w-4 h-px bg-gradient-to-r from-cyan-300/40 to-emerald-400/40" />
                          <ChevronRight className="w-3 h-3 text-emerald-300/50" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-10 h-10 rounded-xl border-2 border-dashed border-emerald-400/50 bg-emerald-400/[0.06] flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-300/70" />
                          </div>
                          <span className="text-[8px] text-emerald-300/70 font-medium max-w-[52px] text-center leading-tight">{outputLabel}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {pipeline.length > 0 && (
                  <p className="text-[10px] text-white/30 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> {c.pipelineHint}
                  </p>
                )}

                {/* Launch button */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleLaunch}
                    disabled={pipeline.length === 0}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-sm transition-all duration-300 ${
                      pipeline.length > 0
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:brightness-110 shadow-[0_0_24px_rgba(6,182,212,0.35)]'
                        : 'bg-white/[0.04] border border-white/10 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    {launched ? (
                      <><CheckCircle2 className="w-4 h-4" /> {c.stepLabel} {pipeline.length} ready</>
                    ) : (
                      <><Play className="w-4 h-4" /> {c.launchBtn}</>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-3.5 py-3 rounded-xl border border-white/[0.12] bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/25 transition-colors"
                    title={c.resetBtn}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <Link
                    href={`/${locale}/workspace`}
                    className="px-3.5 py-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] text-amber-200/80 hover:border-amber-400/45 hover:text-amber-100 transition-colors flex items-center"
                    title={c.openWorkspace}
                  >
                    <Globe className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                RIGHT PANEL — Agent G Chat
            ══════════════════════════════════════════════════ */}
            <div className="flex flex-col h-full min-h-[420px] xl:min-h-0">
              {/* Chat header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.07]">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.4)]">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{c.chatLabel}</p>
                  <p className="text-[10px] text-emerald-300/80 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    Online
                  </p>
                </div>

                {/* Output badge */}
                {pipeline.length > 0 && (
                  <div className="ml-auto flex items-center gap-1.5 bg-emerald-400/[0.08] border border-emerald-400/20 rounded-lg px-2.5 py-1">
                    <Package className="w-3 h-3 text-emerald-300" />
                    <span className="text-[10px] text-emerald-200/90 font-medium">{outputLabel}</span>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[280px] xl:max-h-none">
                {chatMessages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-start gap-2"
                  >
                    <div className="bg-white/[0.05] border border-white/[0.10] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                      <p className="text-xs text-white/75 leading-relaxed">
                        {locale === 'ka'
                          ? 'გამარჯობა! მე ვარ Agent G — შენი AI დირექტორი. პაიფლაინი შეადგინე, გეგმა ჩაწერე და "გაშვება" დააჭირე. მე ვაკოორდინირებ ყველა სერვისს.'
                          : locale === 'ru'
                            ? 'Привет! Я Agent G — ваш AI директор. Составьте pipeline, введите задачу и нажмите "Запустить". Я скоординирую все сервисы.'
                            : "Hi! I'm Agent G — your AI director. Build your pipeline, type your task, then hit Launch. I'll coordinate every service for optimal output."}
                      </p>
                    </div>
                    <span className="text-[9px] text-white/25 ml-1">Agent G</span>
                  </motion.div>
                )}

                {chatMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`rounded-2xl px-3.5 py-2.5 max-w-[88%] text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 border border-cyan-400/25 text-cyan-50 rounded-tr-sm'
                        : 'bg-white/[0.05] border border-white/[0.10] text-white/78 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}

                {typing && (
                  <div className="flex justify-start">
                    <div className="bg-white/[0.05] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-cyan-300/60"
                          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-white/[0.07]">
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                    placeholder={c.chatPlaceholder}
                    className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-cyan-400/35 focus:bg-white/[0.06] transition-all"
                  />
                  <button
                    onClick={sendChat}
                    className="px-3 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/25 text-cyan-300 hover:bg-cyan-500/35 hover:border-cyan-400/45 transition-all flex items-center"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick pipeline shortcuts */}
                {pipeline.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      { en: 'Best output?', ka: 'საუკეთესო შედეგი?', ru: 'Лучший результат?' },
                      { en: 'Optimize pipeline', ka: 'პაიფლაინის ოპტიმიზაცია', ru: 'Оптимизировать' },
                      { en: 'Estimated time?', ka: 'სავარაუდო დრო?', ru: 'Сколько времени?' },
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setChatInput(locale === 'ka' ? q.ka : locale === 'ru' ? q.ru : q.en)
                          chatInputRef.current?.focus()
                        }}
                        className="text-[10px] px-2.5 py-1 rounded-full border border-white/[0.10] text-white/45 hover:text-white/70 hover:border-white/20 transition-colors"
                      >
                        {locale === 'ka' ? q.ka : locale === 'ru' ? q.ru : q.en}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick access links to actual services */}
              <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
                <Link href={`/${locale}/workspace`}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2.5 text-[11px] font-semibold text-cyan-200/90 hover:border-cyan-400/40 hover:bg-cyan-400/10 transition-all">
                  <Cpu className="w-3.5 h-3.5" /> Workspace
                </Link>
                <Link href={`/${locale}/services`}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-[11px] font-semibold text-white/60 hover:border-white/20 hover:bg-white/[0.06] transition-all">
                  <Settings className="w-3.5 h-3.5" />
                  {locale === 'ka' ? 'სერვისები' : locale === 'ru' ? 'Сервисы' : 'Services'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
