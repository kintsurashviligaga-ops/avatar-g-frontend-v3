'use client'

/**
 * ServiceWorkspaceView — Modern "tool panel + preview" layout for every service.
 * Replaces the chat-only view with a professional workspace reminiscent of myavatar-plus.
 *
 * Layout: Left tool panel (controls) + Right preview area (output)
 * Adapts per service using the service registry config.
 *
 * Neo-Cosmic + Clean Modern hybrid design.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICE_REGISTRY, getLocalizedServices } from '@/lib/service-registry'

type LocaleKey = 'en' | 'ka' | 'ru'

/* ── Service workspace config per service type ── */
interface WorkspaceField {
  id: string
  type: 'textarea' | 'select' | 'slider' | 'upload' | 'text'
  label: Record<string, string>
  placeholder?: Record<string, string>
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  defaultValue?: string | number
}

interface ServiceWorkspace {
  fields: WorkspaceField[]
  creditCost: number
  actionLabel: Record<string, string>
  outputType: 'image' | 'video' | 'audio' | 'text' | 'mixed'
  previewHint: Record<string, string>
}

const SERVICE_WORKSPACES: Record<string, ServiceWorkspace> = {
  'agent-g': {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Message', ka: 'შეტყობინება', ru: 'Сообщение' }, placeholder: { en: 'Ask Agent G anything...', ka: 'ჰკითხეთ Agent G-ს ნებისმიერი...', ru: 'Спросите Agent G что угодно...' } },
    ],
    creditCost: 10,
    actionLabel: { en: 'Send Message', ka: 'გაგზავნა', ru: 'Отправить' },
    outputType: 'text',
    previewHint: { en: 'Agent G will respond here', ka: 'Agent G აქ უპასუხებს', ru: 'Agent G ответит здесь' },
  },
  avatar: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Description', ka: 'აღწერა', ru: 'Описание' }, placeholder: { en: 'Describe your avatar...', ka: 'აღწერეთ თქვენი ავატარი...', ru: 'Опишите ваш аватар...' } },
      { id: 'style', type: 'select', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, options: [{ value: 'photorealistic', label: 'Photorealistic' }, { value: 'artistic', label: 'Artistic' }, { value: '3d', label: '3D Render' }, { value: 'anime', label: 'Anime' }], defaultValue: 'photorealistic' },
      { id: 'reference', type: 'upload', label: { en: 'Reference Photo', ka: 'რეფერენსი', ru: 'Референс' } },
    ],
    creditCost: 10,
    actionLabel: { en: 'Generate Avatar', ka: 'ავატარის გენერაცია', ru: 'Создать аватар' },
    outputType: 'image',
    previewHint: { en: 'Your avatar will appear here', ka: 'ავატარი აქ გამოჩნდება', ru: 'Ваш аватар появится здесь' },
  },
  image: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Prompt', ka: 'პრომპტი', ru: 'Промпт' }, placeholder: { en: 'Describe the image you want to create...', ka: 'აღწერეთ სურათი რომლის შექმნაც გსურთ...', ru: 'Опишите изображение, которое хотите создать...' } },
      { id: 'style', type: 'select', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, options: [{ value: 'photorealistic', label: 'Photorealistic' }, { value: 'artistic', label: 'Artistic' }, { value: 'cartoon', label: 'Cartoon' }, { value: 'abstract', label: 'Abstract' }], defaultValue: 'photorealistic' },
      { id: 'aspect', type: 'select', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Пропорции' }, options: [{ value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '4:3', label: '4:3' }], defaultValue: '1:1' },
    ],
    creditCost: 5,
    actionLabel: { en: 'Generate Image', ka: 'სურათის გენერაცია', ru: 'Создать изображение' },
    outputType: 'image',
    previewHint: { en: 'Your generated image will appear here', ka: 'სურათი აქ გამოჩნდება', ru: 'Изображение появится здесь' },
  },
  video: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Prompt', ka: 'პრომპტი', ru: 'Промпт' }, placeholder: { en: 'Describe the video scene...', ka: 'აღწერეთ ვიდეო სცენა...', ru: 'Опишите видеосцену...' } },
      { id: 'duration', type: 'select', label: { en: 'Duration', ka: 'ხანგრძლივობა', ru: 'Длительность' }, options: [{ value: '5', label: '5s' }, { value: '10', label: '10s' }, { value: '15', label: '15s' }, { value: '30', label: '30s' }], defaultValue: '15' },
      { id: 'ratio', type: 'select', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Пропорции' }, options: [{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }], defaultValue: '16:9' },
    ],
    creditCost: 15,
    actionLabel: { en: 'Generate Video', ka: 'ვიდეოს გენერაცია', ru: 'Создать видео' },
    outputType: 'video',
    previewHint: { en: 'Your video will appear here', ka: 'ვიდეო აქ გამოჩნდება', ru: 'Ваше видео появится здесь' },
  },
  editing: {
    fields: [
      { id: 'upload', type: 'upload', label: { en: 'Upload Video', ka: 'ვიდეოს ატვირთვა', ru: 'Загрузить видео' } },
      { id: 'instruction', type: 'textarea', label: { en: 'Edit Instructions', ka: 'რედაქტირების ინსტრუქცია', ru: 'Инструкции' }, placeholder: { en: 'Describe edits: trim, effects, transitions...', ka: 'აღწერეთ ცვლილებები...', ru: 'Опишите изменения...' } },
      { id: 'effect', type: 'select', label: { en: 'Effect', ka: 'ეფექტი', ru: 'Эффект' }, options: [{ value: 'none', label: 'None' }, { value: 'cinematic', label: 'Cinematic' }, { value: 'retro', label: 'Retro' }, { value: 'slowmo', label: 'Slow Motion' }], defaultValue: 'none' },
    ],
    creditCost: 8,
    actionLabel: { en: 'Apply Edits', ka: 'ცვლილებების გამოყენება', ru: 'Применить' },
    outputType: 'video',
    previewHint: { en: 'Edited video preview', ka: 'რედაქტირებული ვიდეო', ru: 'Предпросмотр' },
  },
  music: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Describe Music', ka: 'მუსიკის აღწერა', ru: 'Описание музыки' }, placeholder: { en: 'Describe the music you want...', ka: 'აღწერეთ სასურველი მუსიკა...', ru: 'Опишите желаемую музыку...' } },
      { id: 'genre', type: 'select', label: { en: 'Genre', ka: 'ჟანრი', ru: 'Жанр' }, options: [{ value: 'electronic', label: 'Electronic' }, { value: 'orchestral', label: 'Orchestral' }, { value: 'pop', label: 'Pop' }, { value: 'ambient', label: 'Ambient' }, { value: 'hiphop', label: 'Hip-Hop' }], defaultValue: 'electronic' },
      { id: 'duration', type: 'select', label: { en: 'Duration', ka: 'ხანგრძლივობა', ru: 'Длительность' }, options: [{ value: '30', label: '30s' }, { value: '60', label: '1 min' }, { value: '120', label: '2 min' }, { value: '180', label: '3 min' }], defaultValue: '60' },
    ],
    creditCost: 8,
    actionLabel: { en: 'Generate Music', ka: 'მუსიკის გენერაცია', ru: 'Создать музыку' },
    outputType: 'audio',
    previewHint: { en: 'Your music will play here', ka: 'მუსიკა აქ დაიკვრება', ru: 'Музыка будет воспроизводиться здесь' },
  },
  photo: {
    fields: [
      { id: 'upload', type: 'upload', label: { en: 'Upload Photo', ka: 'ფოტოს ატვირთვა', ru: 'Загрузить фото' } },
      { id: 'action', type: 'select', label: { en: 'Enhancement', ka: 'გაუმჯობესება', ru: 'Улучшение' }, options: [{ value: 'upscale', label: 'Upscale 4x' }, { value: 'denoise', label: 'Denoise' }, { value: 'colorize', label: 'Colorize' }, { value: 'restore', label: 'Restore' }], defaultValue: 'upscale' },
    ],
    creditCost: 5,
    actionLabel: { en: 'Enhance Photo', ka: 'ფოტოს გაუმჯობესება', ru: 'Улучшить фото' },
    outputType: 'image',
    previewHint: { en: 'Enhanced photo will appear here', ka: 'გაუმჯობესებული ფოტო', ru: 'Улучшенное фото' },
  },
  media: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Campaign Brief', ka: 'კამპანიის ბრიფი', ru: 'Бриф кампании' }, placeholder: { en: 'Describe your media campaign...', ka: 'აღწერეთ მედია კამპანია...', ru: 'Опишите медиа-кампанию...' } },
      { id: 'format', type: 'select', label: { en: 'Format', ka: 'ფორმატი', ru: 'Формат' }, options: [{ value: 'social', label: 'Social Media Pack' }, { value: 'presentation', label: 'Presentation' }, { value: 'commercial', label: 'Commercial' }], defaultValue: 'social' },
    ],
    creditCost: 12,
    actionLabel: { en: 'Generate Media Pack', ka: 'მედია პაკის გენერაცია', ru: 'Создать медиа-пакет' },
    outputType: 'mixed',
    previewHint: { en: 'Media assets will appear here', ka: 'მედია ფაილები', ru: 'Медиа-контент' },
  },
  text: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Content Brief', ka: 'კონტენტის ბრიფი', ru: 'Бриф контента' }, placeholder: { en: 'Describe what you need written...', ka: 'აღწერეთ რა უნდა დაიწეროს...', ru: 'Опишите, что нужно написать...' } },
      { id: 'type', type: 'select', label: { en: 'Content Type', ka: 'ტიპი', ru: 'Тип' }, options: [{ value: 'article', label: 'Article' }, { value: 'copy', label: 'Marketing Copy' }, { value: 'email', label: 'Email' }, { value: 'seo', label: 'SEO Content' }], defaultValue: 'article' },
      { id: 'tone', type: 'select', label: { en: 'Tone', ka: 'ტონი', ru: 'Тон' }, options: [{ value: 'professional', label: 'Professional' }, { value: 'casual', label: 'Casual' }, { value: 'creative', label: 'Creative' }], defaultValue: 'professional' },
    ],
    creditCost: 2,
    actionLabel: { en: 'Generate Text', ka: 'ტექსტის გენერაცია', ru: 'Создать текст' },
    outputType: 'text',
    previewHint: { en: 'Generated text will appear here', ka: 'ტექსტი აქ გამოჩნდება', ru: 'Текст появится здесь' },
  },
  prompt: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Base Prompt', ka: 'საწყისი პრომპტი', ru: 'Базовый промпт' }, placeholder: { en: 'Enter your prompt to optimize...', ka: 'შეიყვანეთ პრომპტი ოპტიმიზაციისთვის...', ru: 'Введите промпт для оптимизации...' } },
      { id: 'target', type: 'select', label: { en: 'Target Model', ka: 'მოდელი', ru: 'Модель' }, options: [{ value: 'gpt4', label: 'GPT-4o' }, { value: 'claude', label: 'Claude' }, { value: 'flux', label: 'FLUX (Image)' }, { value: 'kling', label: 'Kling (Video)' }], defaultValue: 'gpt4' },
    ],
    creditCost: 1,
    actionLabel: { en: 'Optimize Prompt', ka: 'პრომპტის ოპტიმიზაცია', ru: 'Оптимизировать' },
    outputType: 'text',
    previewHint: { en: 'Optimized prompt will appear here', ka: 'ოპტიმიზებული პრომპტი', ru: 'Оптимизированный промпт' },
  },
  'visual-intel': {
    fields: [
      { id: 'upload', type: 'upload', label: { en: 'Upload Image', ka: 'სურათის ატვირთვა', ru: 'Загрузить изображение' } },
      { id: 'task', type: 'select', label: { en: 'Analysis Type', ka: 'ანალიზის ტიპი', ru: 'Тип анализа' }, options: [{ value: 'describe', label: 'Describe' }, { value: 'detect', label: 'Object Detection' }, { value: 'compare', label: 'A/B Compare' }, { value: 'extract', label: 'Extract Text (OCR)' }], defaultValue: 'describe' },
    ],
    creditCost: 3,
    actionLabel: { en: 'Analyze', ka: 'ანალიზი', ru: 'Анализировать' },
    outputType: 'text',
    previewHint: { en: 'Analysis results will appear here', ka: 'ანალიზის შედეგები', ru: 'Результаты анализа' },
  },
  shop: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Store Description', ka: 'მაღაზიის აღწერა', ru: 'Описание магазина' }, placeholder: { en: 'Describe your store concept...', ka: 'აღწერეთ მაღაზიის კონცეფცია...', ru: 'Опишите концепцию магазина...' } },
      { id: 'category', type: 'select', label: { en: 'Category', ka: 'კატეგორია', ru: 'Категория' }, options: [{ value: 'digital', label: 'Digital Products' }, { value: 'physical', label: 'Physical Goods' }, { value: 'services', label: 'Services' }], defaultValue: 'digital' },
    ],
    creditCost: 0,
    actionLabel: { en: 'Create Store', ka: 'მაღაზიის შექმნა', ru: 'Создать магазин' },
    outputType: 'mixed',
    previewHint: { en: 'Store preview will appear here', ka: 'მაღაზიის გადახედვა', ru: 'Предпросмотр магазина' },
  },
  software: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Specification', ka: 'სპეციფიკაცია', ru: 'Спецификация' }, placeholder: { en: 'Describe what you want to build...', ka: 'აღწერეთ რა გსურთ შექმნათ...', ru: 'Опишите, что хотите создать...' } },
      { id: 'language', type: 'select', label: { en: 'Language', ka: 'ენა', ru: 'Язык' }, options: [{ value: 'typescript', label: 'TypeScript' }, { value: 'python', label: 'Python' }, { value: 'react', label: 'React' }, { value: 'swift', label: 'Swift' }], defaultValue: 'typescript' },
    ],
    creditCost: 5,
    actionLabel: { en: 'Generate Code', ka: 'კოდის გენერაცია', ru: 'Создать код' },
    outputType: 'text',
    previewHint: { en: 'Generated code will appear here', ka: 'კოდი აქ გამოჩნდება', ru: 'Код появится здесь' },
  },
  business: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Business Query', ka: 'ბიზნეს მოთხოვნა', ru: 'Бизнес-запрос' }, placeholder: { en: 'What business insight do you need?', ka: 'რა ბიზნეს ინფორმაცია გჭირდებათ?', ru: 'Какой бизнес-инсайт вам нужен?' } },
      { id: 'type', type: 'select', label: { en: 'Report Type', ka: 'ანგარიშის ტიპი', ru: 'Тип отчёта' }, options: [{ value: 'market', label: 'Market Research' }, { value: 'pitch', label: 'Pitch Deck' }, { value: 'financial', label: 'Financial Model' }, { value: 'competitor', label: 'Competitor Analysis' }], defaultValue: 'market' },
    ],
    creditCost: 5,
    actionLabel: { en: 'Generate Report', ka: 'ანგარიშის გენერაცია', ru: 'Создать отчёт' },
    outputType: 'text',
    previewHint: { en: 'Report will appear here', ka: 'ანგარიში აქ გამოჩნდება', ru: 'Отчёт появится здесь' },
  },
  tourism: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Travel Query', ka: 'მოგზაურობის მოთხოვნა', ru: 'Запрос о путешествии' }, placeholder: { en: 'Where do you want to visit?', ka: 'სად გსურთ მოგზაურობა?', ru: 'Куда хотите отправиться?' } },
      { id: 'type', type: 'select', label: { en: 'Plan Type', ka: 'გეგმის ტიპი', ru: 'Тип плана' }, options: [{ value: 'itinerary', label: 'Itinerary' }, { value: 'guide', label: 'Local Guide' }, { value: 'budget', label: 'Budget Plan' }], defaultValue: 'itinerary' },
    ],
    creditCost: 4,
    actionLabel: { en: 'Plan Trip', ka: 'მოგზაურობის დაგეგმვა', ru: 'Спланировать' },
    outputType: 'text',
    previewHint: { en: 'Travel plan will appear here', ka: 'მოგზაურობის გეგმა', ru: 'План путешествия' },
  },
  game: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Game Concept', ka: 'თამაშის კონცეფცია', ru: 'Концепция игры' }, placeholder: { en: 'Describe your game idea...', ka: 'აღწერეთ თამაშის იდეა...', ru: 'Опишите идею игры...' } },
      { id: 'genre', type: 'select', label: { en: 'Genre', ka: 'ჟანრი', ru: 'Жанр' }, options: [{ value: 'puzzle', label: 'Puzzle' }, { value: 'rpg', label: 'RPG' }, { value: 'arcade', label: 'Arcade' }, { value: 'simulation', label: 'Simulation' }], defaultValue: 'puzzle' },
    ],
    creditCost: 15,
    actionLabel: { en: 'Create Game', ka: 'თამაშის შექმნა', ru: 'Создать игру' },
    outputType: 'mixed',
    previewHint: { en: 'Game preview will appear here', ka: 'თამაშის გადახედვა', ru: 'Предпросмотр игры' },
  },
  interior: {
    fields: [
      { id: 'upload', type: 'upload', label: { en: 'Upload Room Photo', ka: 'ოთახის ფოტოს ატვირთვა', ru: 'Загрузить фото комнаты' } },
      { id: 'prompt', type: 'textarea', label: { en: 'Design Brief', ka: 'დიზაინის ბრიფი', ru: 'Бриф дизайна' }, placeholder: { en: 'Describe desired interior style...', ka: 'აღწერეთ სასურველი სტილი...', ru: 'Опишите желаемый стиль...' } },
      { id: 'style', type: 'select', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, options: [{ value: 'modern', label: 'Modern' }, { value: 'minimalist', label: 'Minimalist' }, { value: 'rustic', label: 'Rustic' }, { value: 'industrial', label: 'Industrial' }], defaultValue: 'modern' },
    ],
    creditCost: 10,
    actionLabel: { en: 'Design Room', ka: 'ოთახის დიზაინი', ru: 'Дизайн' },
    outputType: 'image',
    previewHint: { en: 'Redesigned room will appear here', ka: 'დიზაინი აქ გამოჩნდება', ru: 'Дизайн появится здесь' },
  },
  workflow: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Workflow Description', ka: 'პროცესის აღწერა', ru: 'Описание процесса' }, placeholder: { en: 'Describe the automation workflow...', ka: 'აღწერეთ ავტომატიზაციის პროცესი...', ru: 'Опишите процесс автоматизации...' } },
    ],
    creditCost: 0,
    actionLabel: { en: 'Build Workflow', ka: 'პროცესის შექმნა', ru: 'Создать процесс' },
    outputType: 'mixed',
    previewHint: { en: 'Workflow diagram will appear here', ka: 'პროცესის დიაგრამა', ru: 'Диаграмма процесса' },
  },
}

/* ── Fallback workspace for unknown services ── */
const DEFAULT_WORKSPACE: ServiceWorkspace = {
  fields: [
    { id: 'prompt', type: 'textarea', label: { en: 'Describe your request', ka: 'აღწერეთ თქვენი მოთხოვნა', ru: 'Опишите ваш запрос' }, placeholder: { en: 'What would you like to create?', ka: 'რა გსურთ შექმნათ?', ru: 'Что вы хотите создать?' } },
  ],
  creditCost: 5,
  actionLabel: { en: 'Generate', ka: 'გენერაცია', ru: 'Создать' },
  outputType: 'mixed',
  previewHint: { en: 'Output will appear here', ka: 'შედეგი აქ გამოჩნდება', ru: 'Результат появится здесь' },
}

/* ── Component ── */
interface ServiceWorkspaceViewProps {
  serviceId: string
  serviceName: string
  serviceIcon: string
  locale: string
  description: string
}

export default function ServiceWorkspaceView({
  serviceId,
  serviceName,
  serviceIcon,
  locale,
  description,
}: ServiceWorkspaceViewProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'
  const workspace = SERVICE_WORKSPACES[serviceId] || DEFAULT_WORKSPACE
  const [values, setValues] = useState<Record<string, string | number>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize defaults
  useEffect(() => {
    const defaults: Record<string, string | number> = {}
    workspace.fields.forEach(f => {
      if (f.defaultValue !== undefined) defaults[f.id] = f.defaultValue
    })
    setValues(defaults)
  }, [serviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateValue = useCallback((id: string, value: string | number) => {
    setValues(prev => ({ ...prev, [id]: value }))
  }, [])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setOutput(null)
    // Simulate generation (real API call would go here)
    await new Promise(r => setTimeout(r, 2000))
    setOutput(`✅ ${serviceName} output generated successfully.\n\nThis is a demo preview. Connect your API endpoints to see real results.`)
    setIsGenerating(false)
  }, [serviceName])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setUploadedFile(file)
  }, [])

  const T = {
    credits: { en: 'credits', ka: 'კრედიტი', ru: 'кредитов' },
    preview: { en: 'Preview', ka: 'გადახედვა', ru: 'Предпросмотр' },
    generating: { en: 'Generating...', ka: 'გენერაცია...', ru: 'Генерация...' },
    download: { en: 'Download', ka: 'ჩამოტვირთვა', ru: 'Скачать' },
    share: { en: 'Share', ka: 'გაზიარება', ru: 'Поделиться' },
    retry: { en: 'Try Again', ka: 'ხელახლა', ru: 'Повторить' },
    stats: { en: 'Stats', ka: 'სტატისტიკა', ru: 'Статистика' },
    generated: { en: 'Generated', ka: 'გენერირებული', ru: 'Создано' },
    thisMonth: { en: 'This Month', ka: 'ამ თვეში', ru: 'В этом месяце' },
    quickTip: { en: 'Quick Tip', ka: 'რჩევა', ru: 'Совет' },
    tipText: { en: 'Be specific with your descriptions for better results', ka: 'იყავით კონკრეტული უკეთესი შედეგისთვის', ru: 'Будьте конкретны для лучших результатов' },
  }

  const primaryPrompt = values['prompt'] as string || ''
  const canGenerate = workspace.fields.some(f => f.type === 'textarea')
    ? primaryPrompt.trim().length > 0
    : true

  return (
    <div className="h-full w-full overflow-y-auto" style={{ background: '#0a0a0f' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}
            >
              {serviceIcon}
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#f8fafc' }}>{serviceName}</h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>{description}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold" style={{ color: '#00d4ff' }}>1000</div>
            <p className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>{T.credits[lang]}</p>
          </div>
        </div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: T.credits[lang], value: '1000', sub: 'Available' },
            { label: T.generated[lang], value: '0', sub: 'Total' },
            { label: T.thisMonth[lang], value: '0', sub: T.credits[lang] },
            { label: T.stats[lang], value: '—', sub: 'Avg time' },
          ].map((stat, i) => (
            <div
              key={i}
              className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.5)' }}>{stat.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: '#f8fafc' }}>{stat.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Main Grid: Tool Panel + Preview ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Tool Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div
              className="rounded-2xl p-5 space-y-5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: '#f8fafc' }}>
                {workspace.actionLabel[lang] || workspace.actionLabel.en}
              </h3>

              {workspace.fields.map(field => (
                <div key={field.id}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(148,163,184,0.7)' }}>
                    {field.label[lang] || field.label.en}
                  </label>

                  {field.type === 'textarea' && (
                    <textarea
                      value={(values[field.id] as string) || ''}
                      onChange={e => updateValue(field.id, e.target.value)}
                      placeholder={field.placeholder?.[lang] || field.placeholder?.en || ''}
                      rows={4}
                      className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition-colors placeholder:text-slate-600"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#f8fafc',
                      }}
                    />
                  )}

                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={(values[field.id] as string) || ''}
                      onChange={e => updateValue(field.id, e.target.value)}
                      placeholder={field.placeholder?.[lang] || field.placeholder?.en || ''}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-600"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#f8fafc',
                      }}
                    />
                  )}

                  {field.type === 'select' && (
                    <div className="relative">
                      <select
                        value={(values[field.id] as string) || field.defaultValue || ''}
                        onChange={e => updateValue(field.id, e.target.value)}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#f8fafc',
                        }}
                      >
                        {field.options?.map(opt => (
                          <option key={opt.value} value={opt.value} style={{ background: '#1a1a2e', color: '#f8fafc' }}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(148,163,184,0.5)' }}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  )}

                  {field.type === 'upload' && (
                    <div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full rounded-xl px-3 py-6 text-sm flex flex-col items-center gap-2 transition-colors"
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '2px dashed rgba(255,255,255,0.08)',
                          color: 'rgba(148,163,184,0.6)',
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                        {uploadedFile ? uploadedFile.name : (field.placeholder?.[lang] || 'Click to upload')}
                      </button>
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,video/*,audio/*" />
                    </div>
                  )}
                </div>
              ))}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !canGenerate}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: isGenerating ? 'rgba(0,212,255,0.1)' : 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                  color: '#fff',
                  boxShadow: !isGenerating && canGenerate ? '0 4px 20px rgba(0,212,255,0.25)' : 'none',
                }}
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {T.generating[lang]}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    {workspace.actionLabel[lang] || workspace.actionLabel.en}
                    {workspace.creditCost > 0 && (
                      <span className="ml-1 opacity-70">({workspace.creditCost} {T.credits[lang]})</span>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* Quick tip card */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.08)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: '#00d4ff' }}>
                💡 {T.quickTip[lang]}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {T.tipText[lang]}
              </p>
            </div>
          </div>

          {/* Right: Preview Area */}
          <div className="lg:col-span-2">
            <div
              className="rounded-2xl min-h-[400px] h-full flex flex-col"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#f8fafc' }}>
                  {T.preview[lang]}
                </h3>
                {output && (
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                        {T.download[lang]}
                      </span>
                    </button>
                    <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></svg>
                        {T.share[lang]}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 flex items-center justify-center p-6">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-violet-500 border-b-transparent border-l-transparent animate-spin" />
                      <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-transparent border-b-cyan-400 border-l-violet-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                    </div>
                    <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>{T.generating[lang]}</p>
                  </div>
                ) : output ? (
                  <div className="w-full max-w-xl">
                    <div className="rounded-xl p-5 whitespace-pre-wrap text-sm leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0' }}>
                      {output}
                    </div>
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => { setOutput(null); setIsGenerating(false) }}
                        className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.15)' }}
                      >
                        {T.retry[lang]}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {serviceIcon}
                    </div>
                    <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>
                      {workspace.previewHint[lang] || workspace.previewHint.en}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="w-20 h-1 rounded-full" style={{ background: 'rgba(0,212,255,0.1)' }} />
                      <div className="w-12 h-1 rounded-full" style={{ background: 'rgba(124,58,237,0.1)' }} />
                      <div className="w-16 h-1 rounded-full" style={{ background: 'rgba(0,212,255,0.06)' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
