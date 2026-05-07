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

import { useState, useCallback, useRef, useEffect, type ChangeEvent } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { buildInteriorDesignBrief } from '@/lib/interior/smart-intake'
import type { WorkspaceResult } from '@/types/dashboard'
import { Interior3DViewer } from './Interior3DViewer'
import { InteriorSmartIntake } from './InteriorSmartIntake'

type LocaleKey = 'en' | 'ka' | 'ru'
type OutputKind = 'text' | 'image' | 'video' | 'audio'
type JsonRecord = Record<string, unknown>
type WorkspaceViewLabels = {
  credits: string
  preview: string
  generating: string
  download: string
  copy: string
  retry: string
  stats: string
  generated: string
  thisMonth: string
  quickTip: string
  tipText: string
  progress: string
  processingStep: string
  stepLabel: string
  ofLabel: string
  latestNote: string
  available: string
  total: string
  live: string
  avgTime: string
  uploadPrompt: string
  uploadPhotoFirst: string
  uploadVideoFirst: string
  requestFailed: string
  genericPreviewMode: string
}

const INTERIOR_INTAKE_FIELD_IDS = new Set(['primary_goal', 'color_palette', 'materials', 'lighting_vibe'])

export type { WorkspaceResult }

type EditingJobProgress = {
  status: string
  currentStepId: string | null
  currentStepDescription: string | null
  currentStepIndex: number
  totalSteps: number
  stepsCompleted: string[]
  percent: number
  notes: string[]
}

/* ── Service workspace config per service type ── */
interface WorkspaceField {
  id: string
  type: 'textarea' | 'select' | 'slider' | 'upload' | 'text'
  label: Record<string, string>
  placeholder?: Record<string, string>
  options?: WorkspaceFieldOption[]
  min?: number
  max?: number
  step?: number
  defaultValue?: string | number
}

interface WorkspaceFieldOption {
  value: string
  label: string
  credits?: number
}

interface ServiceWorkspace {
  fields: WorkspaceField[]
  creditCost: number
  creditSourceFieldId?: string
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
      { id: 'provider', type: 'select', label: { en: 'Provider', ka: 'პროვაიდერი', ru: 'Провайдер' }, options: [{ value: 'nanobanana', label: 'NanoBanana API' }, { value: 'replicate', label: 'Replicate (Fallback)' }], defaultValue: 'nanobanana' },
      { id: 'nanobanana_endpoint', type: 'select', label: { en: 'NanoBanana Endpoint', ka: 'NanoBanana ენდპოინტი', ru: 'NanoBanana endpoint' }, options: [
        { value: 'task-details', label: 'Task Details (0 credits)', credits: 0 },
        { value: 'text-to-image', label: 'Text -> Image (4 credits)', credits: 4 },
        { value: 'pro-1k2k', label: 'Pro 1K/2K (18 credits)', credits: 18 },
        { value: 'pro-4k', label: 'Pro 4K (24 credits)', credits: 24 },
        { value: 'v2-1k', label: 'V2 1K (8 credits)', credits: 8 },
        { value: 'v2-2k', label: 'V2 2K (12 credits)', credits: 12 },
        { value: 'v2-4k', label: 'V2 4K (18 credits)', credits: 18 },
      ], defaultValue: 'text-to-image' },
      { id: 'style', type: 'select', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, options: [{ value: 'photorealistic', label: 'Photorealistic' }, { value: 'artistic', label: 'Artistic' }, { value: 'cartoon', label: 'Cartoon' }, { value: 'abstract', label: 'Abstract' }], defaultValue: 'photorealistic' },
      { id: 'aspect', type: 'select', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Пропорции' }, options: [{ value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '4:3', label: '4:3' }], defaultValue: '1:1' },
    ],
    creditCost: 5,
    creditSourceFieldId: 'nanobanana_endpoint',
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
  'prompt-builder': {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Base Prompt', ka: 'საწყისი პრომპტი', ru: 'Базовый промпт' }, placeholder: { en: 'Enter your prompt to optimize...', ka: 'შეიყვანეთ პრომპტი ოპტიმიზაციისთვის...', ru: 'Введите промпт для оптимизации...' } },
      {
        id: 'target',
        type: 'select',
        label: { en: 'Target Model', ka: 'სამიზნე მოდელი', ru: 'Целевая модель' },
        options: [
          { value: 'gpt4', label: 'GPT-4o (Chat)' },
          { value: 'claude', label: 'Claude (Chat)' },
          { value: 'gemini', label: 'Gemini (Chat)' },
          { value: 'flux', label: 'FLUX (Image gen)' },
          { value: 'midjourney', label: 'Midjourney (Image gen)' },
          { value: 'dalle', label: 'DALL-E (Image gen)' },
          { value: 'kling', label: 'Kling (Video gen)' },
          { value: 'sora', label: 'Sora (Video gen)' },
        ],
        defaultValue: 'gpt4',
      },
      {
        id: 'style',
        type: 'select',
        label: { en: 'Optimization Style', ka: 'ოპტიმიზაციის სტილი', ru: 'Стиль оптимизации' },
        options: [
          { value: 'detailed', label: 'Detailed & Specific' },
          { value: 'concise', label: 'Concise & Direct' },
          { value: 'creative', label: 'Creative & Expressive' },
          { value: 'technical', label: 'Technical & Precise' },
          { value: 'cinematic', label: 'Cinematic (visual)' },
        ],
        defaultValue: 'detailed',
      },
    ],
    creditCost: 2,
    actionLabel: { en: 'Build Optimized Prompt', ka: 'პრომპტის ოპტიმიზაცია', ru: 'Оптимизировать промпт' },
    outputType: 'text',
    previewHint: { en: 'Your optimized prompt will appear here — ready to copy & paste', ka: 'ოპტიმიზებული პრომპტი გამოჩნდება', ru: 'Оптимизированный промпт появится здесь' },
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
      { id: 'prompt', type: 'textarea', label: { en: 'Travel Query', ka: 'მოგზაურობის მოთხოვნა', ru: 'Запрос о путешествии' }, placeholder: { en: 'Where do you want to visit? Any special interests?', ka: 'სად გსურთ მოგზაურობა? განსაკუთრებული ინტერესები?', ru: 'Куда хотите отправиться? Особые интересы?' } },
      {
        id: 'type',
        type: 'select',
        label: { en: 'Plan Type', ka: 'გეგმის ტიპი', ru: 'Тип плана' },
        options: [
          { value: 'itinerary', label: 'Full Itinerary' },
          { value: 'guide', label: 'Local Guide' },
          { value: 'budget', label: 'Budget Plan' },
          { value: 'hidden_gems', label: 'Hidden Gems' },
          { value: 'weekend', label: 'Weekend Escape' },
        ],
        defaultValue: 'itinerary',
      },
      {
        id: 'duration',
        type: 'select',
        label: { en: 'Duration', ka: 'ხანგრძლივობა', ru: 'Длительность' },
        options: [
          { value: '1', label: '1 day' },
          { value: '3', label: '3 days' },
          { value: '5', label: '5 days' },
          { value: '7', label: '1 week' },
          { value: '14', label: '2 weeks' },
        ],
        defaultValue: '5',
      },
      {
        id: 'style',
        type: 'select',
        label: { en: 'Travel Style', ka: 'მოგზაურობის სტილი', ru: 'Стиль путешествия' },
        options: [
          { value: 'cultural', label: 'Cultural & Historical' },
          { value: 'adventure', label: 'Adventure & Outdoors' },
          { value: 'luxury', label: 'Luxury & Comfort' },
          { value: 'backpacker', label: 'Backpacker / Budget' },
          { value: 'family', label: 'Family-friendly' },
          { value: 'food', label: 'Food & Culinary' },
        ],
        defaultValue: 'cultural',
      },
    ],
    creditCost: 4,
    actionLabel: { en: 'Plan My Trip', ka: 'მოგზაურობის დაგეგმვა', ru: 'Спланировать поездку' },
    outputType: 'text',
    previewHint: { en: 'Your personalised travel plan will appear here', ka: 'პირადი მოგზაურობის გეგმა გამოჩნდება', ru: 'Ваш персонализированный план путешествия появится здесь' },
  },
  'content-writer': {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Topic / Brief', ka: 'თემა / ბრიფი', ru: 'Тема / Бриф' }, placeholder: { en: 'Describe what you need written — article topic, target audience, key points...', ka: 'აღწერეთ რა უნდა დაიწეროს — სტატიის თემა, სამიზნე აუდიტორია...', ru: 'Опишите что нужно написать — тема статьи, аудитория, ключевые моменты...' } },
      {
        id: 'type',
        type: 'select',
        label: { en: 'Content Type', ka: 'კონტენტის ტიპი', ru: 'Тип контента' },
        options: [
          { value: 'article', label: 'Blog Article' },
          { value: 'seo', label: 'SEO Article' },
          { value: 'social', label: 'Social Media Post' },
          { value: 'email', label: 'Email Campaign' },
          { value: 'ad', label: 'Ad Copy' },
          { value: 'product', label: 'Product Description' },
        ],
        defaultValue: 'article',
      },
      {
        id: 'tone',
        type: 'select',
        label: { en: 'Tone', ka: 'ტონი', ru: 'Тон' },
        options: [
          { value: 'professional', label: 'Professional' },
          { value: 'casual', label: 'Casual & Friendly' },
          { value: 'persuasive', label: 'Persuasive' },
          { value: 'educational', label: 'Educational' },
          { value: 'creative', label: 'Creative & Bold' },
        ],
        defaultValue: 'professional',
      },
      {
        id: 'language',
        type: 'select',
        label: { en: 'Language', ka: 'ენა', ru: 'Язык' },
        options: [
          { value: 'ka', label: 'ქართული' },
          { value: 'en', label: 'English' },
          { value: 'ru', label: 'Русский' },
        ],
        defaultValue: 'ka',
      },
    ],
    creditCost: 3,
    actionLabel: { en: 'Write Content', ka: 'კონტენტის დაწერა', ru: 'Написать контент' },
    outputType: 'text',
    previewHint: { en: 'Your content will appear here', ka: 'კონტენტი გამოჩნდება', ru: 'Контент появится здесь' },
  },
  podcast: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Episode Topic', ka: 'ეპიზოდის თემა', ru: 'Тема эпизода' }, placeholder: { en: 'What is this episode about? Key discussion points, guests, tone...', ka: 'რაზე არის ეს ეპიზოდი? ძირითადი სადისკუსიო წერტილები...', ru: 'О чём этот эпизод? Ключевые темы для обсуждения...' } },
      {
        id: 'format',
        type: 'select',
        label: { en: 'Format', ka: 'ფორმატი', ru: 'Формат' },
        options: [
          { value: 'interview', label: 'Interview' },
          { value: 'solo', label: 'Solo Monologue' },
          { value: 'panel', label: 'Panel Discussion' },
          { value: 'storytelling', label: 'Narrative Storytelling' },
          { value: 'educational', label: 'Educational / How-to' },
        ],
        defaultValue: 'interview',
      },
      {
        id: 'duration',
        type: 'select',
        label: { en: 'Target Duration', ka: 'სიგრძე', ru: 'Длительность' },
        options: [
          { value: '5', label: '5 minutes' },
          { value: '15', label: '15 minutes' },
          { value: '30', label: '30 minutes' },
          { value: '60', label: '1 hour' },
        ],
        defaultValue: '30',
      },
      {
        id: 'tone',
        type: 'select',
        label: { en: 'Tone', ka: 'ტონი', ru: 'Тон' },
        options: [
          { value: 'conversational', label: 'Conversational' },
          { value: 'professional', label: 'Professional' },
          { value: 'entertaining', label: 'Entertaining' },
          { value: 'investigative', label: 'Investigative' },
        ],
        defaultValue: 'conversational',
      },
    ],
    creditCost: 8,
    actionLabel: { en: 'Write Episode Script', ka: 'ეპიზოდის სცენარი', ru: 'Написать сценарий' },
    outputType: 'text',
    previewHint: { en: 'Full episode script will appear here', ka: 'სრული ეპიზოდის სცენარი გამოჩნდება', ru: 'Полный сценарий эпизода появится здесь' },
  },
  character: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Character Concept', ka: 'პერსონაჟის კონცეფცია', ru: 'Концепция персонажа' }, placeholder: { en: 'Describe your character — role, personality, setting, purpose...', ka: 'აღწერეთ თქვენი პერსონაჟი — როლი, პიროვნება, კონტექსტი...', ru: 'Опишите персонажа — роль, личность, контекст...' } },
      {
        id: 'archetype',
        type: 'select',
        label: { en: 'Archetype', ka: 'არქეტიპი', ru: 'Архетип' },
        options: [
          { value: 'hero', label: 'Hero / Protagonist' },
          { value: 'villain', label: 'Villain / Antagonist' },
          { value: 'mentor', label: 'Mentor / Guide' },
          { value: 'trickster', label: 'Trickster / Joker' },
          { value: 'npc', label: 'NPC / Supporting' },
          { value: 'ai', label: 'AI Character' },
        ],
        defaultValue: 'hero',
      },
      {
        id: 'world',
        type: 'select',
        label: { en: 'World / Setting', ka: 'სამყარო', ru: 'Мир / Сеттинг' },
        options: [
          { value: 'fantasy', label: 'Fantasy' },
          { value: 'scifi', label: 'Sci-Fi' },
          { value: 'modern', label: 'Modern Day' },
          { value: 'historical', label: 'Historical' },
          { value: 'post_apocalyptic', label: 'Post-Apocalyptic' },
          { value: 'georgian', label: 'Georgian Folklore / Culture' },
        ],
        defaultValue: 'fantasy',
      },
      {
        id: 'depth',
        type: 'select',
        label: { en: 'Detail Level', ka: 'დეტალიზაციის დონე', ru: 'Уровень детализации' },
        options: [
          { value: 'brief', label: 'Brief Overview' },
          { value: 'standard', label: 'Standard Profile' },
          { value: 'deep', label: 'Deep Profile + Dialogue' },
        ],
        defaultValue: 'standard',
      },
    ],
    creditCost: 5,
    actionLabel: { en: 'Create Character', ka: 'პერსონაჟის შექმნა', ru: 'Создать персонажа' },
    outputType: 'text',
    previewHint: { en: 'Character profile will appear here', ka: 'პერსონაჟის პროფილი გამოჩნდება', ru: 'Профиль персонажа появится здесь' },
  },
  event: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Event Description', ka: 'ღონისძიების აღწერა', ru: 'Описание мероприятия' }, placeholder: { en: 'Describe your event — type, audience, theme, date, goals...', ka: 'აღწერეთ ღონისძიება — ტიპი, აუდიტორია, თემა, თარიღი...', ru: 'Опишите мероприятие — тип, аудитория, тема, дата...' } },
      {
        id: 'type',
        type: 'select',
        label: { en: 'Event Type', ka: 'ღონისძიების ტიპი', ru: 'Тип мероприятия' },
        options: [
          { value: 'conference', label: 'Conference / Summit' },
          { value: 'wedding', label: 'Wedding' },
          { value: 'concert', label: 'Concert / Festival' },
          { value: 'corporate', label: 'Corporate Event' },
          { value: 'launch', label: 'Product Launch' },
          { value: 'birthday', label: 'Birthday / Celebration' },
          { value: 'gala', label: 'Gala / Award Ceremony' },
        ],
        defaultValue: 'conference',
      },
      {
        id: 'output',
        type: 'select',
        label: { en: 'What to Generate', ka: 'რა გამოვიმუშავოთ', ru: 'Что сгенерировать' },
        options: [
          { value: 'program', label: 'Full Event Program' },
          { value: 'mc_script', label: 'MC / Host Script' },
          { value: 'invitation', label: 'Invitation Text' },
          { value: 'promo', label: 'Promo Copy Pack' },
          { value: 'full', label: 'Everything (Full Pack)' },
        ],
        defaultValue: 'full',
      },
    ],
    creditCost: 6,
    actionLabel: { en: 'Generate Event Materials', ka: 'ივენთ მასალების გენერაცია', ru: 'Создать материалы' },
    outputType: 'text',
    previewHint: { en: 'Event materials will appear here', ka: 'ივენთ მასალები გამოჩნდება', ru: 'Материалы мероприятия появятся здесь' },
  },
  terminal: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Task Description', ka: 'დავალების აღწერა', ru: 'Описание задачи' }, placeholder: { en: 'Describe what you need coded — function, script, API, algorithm...', ka: 'აღწერეთ რა უნდა დაიკოდოს — ფუნქცია, სკრიპტი, API...', ru: 'Опишите что нужно закодировать — функция, скрипт, API...' } },
      {
        id: 'language',
        type: 'select',
        label: { en: 'Language / Framework', ka: 'ენა / ფრეიმვორქი', ru: 'Язык / Фреймворк' },
        options: [
          { value: 'typescript', label: 'TypeScript' },
          { value: 'python', label: 'Python' },
          { value: 'javascript', label: 'JavaScript' },
          { value: 'react', label: 'React / Next.js' },
          { value: 'swift', label: 'Swift (iOS)' },
          { value: 'kotlin', label: 'Kotlin (Android)' },
          { value: 'go', label: 'Go' },
          { value: 'rust', label: 'Rust' },
          { value: 'bash', label: 'Bash / Shell' },
          { value: 'sql', label: 'SQL' },
        ],
        defaultValue: 'typescript',
      },
      {
        id: 'style',
        type: 'select',
        label: { en: 'Code Style', ka: 'კოდის სტილი', ru: 'Стиль кода' },
        options: [
          { value: 'production', label: 'Production-ready' },
          { value: 'minimal', label: 'Minimal / Clean' },
          { value: 'commented', label: 'Heavily Commented' },
          { value: 'tests', label: 'With Tests' },
        ],
        defaultValue: 'production',
      },
    ],
    creditCost: 3,
    actionLabel: { en: 'Generate Code', ka: 'კოდის გენერაცია', ru: 'Создать код' },
    outputType: 'text',
    previewHint: { en: 'Generated code will appear here', ka: 'კოდი გამოჩნდება', ru: 'Код появится здесь' },
  },
  voice: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Text to Speak', ka: 'ტექსტი გამოსახვისთვის', ru: 'Текст для озвучки' }, placeholder: { en: 'Enter the text you want to convert to speech...', ka: 'შეიყვანეთ ტექსტი ხმოვან ჩაწერად გადასაყვანად...', ru: 'Введите текст для преобразования в речь...' } },
      {
        id: 'voice_style',
        type: 'select',
        label: { en: 'Voice Style', ka: 'ხმის სტილი', ru: 'Стиль голоса' },
        options: [
          { value: 'neutral', label: 'Neutral / Natural' },
          { value: 'warm', label: 'Warm & Friendly' },
          { value: 'professional', label: 'Professional' },
          { value: 'dramatic', label: 'Dramatic / Expressive' },
          { value: 'calm', label: 'Calm & Soothing' },
        ],
        defaultValue: 'neutral',
      },
      {
        id: 'language',
        type: 'select',
        label: { en: 'Language', ka: 'ენა', ru: 'Язык' },
        options: [
          { value: 'ka', label: 'ქართული' },
          { value: 'en', label: 'English' },
          { value: 'ru', label: 'Русский' },
        ],
        defaultValue: 'ka',
      },
    ],
    creditCost: 12,
    actionLabel: { en: 'Generate Voice', ka: 'ხმის გენერაცია', ru: 'Создать голос' },
    outputType: 'audio',
    previewHint: { en: 'Generated audio will be playable here', ka: 'გენერირებული აუდიო გაიჩვენება', ru: 'Сгенерированное аудио будет воспроизводиться здесь' },
  },
  game: {
    fields: [
      { id: 'prompt', type: 'textarea', label: { en: 'Game Concept', ka: 'თამაშის კონცეფცია', ru: 'Концепция игры' }, placeholder: { en: 'Describe your game idea — characters, world, mechanics, target audience...', ka: 'აღწერეთ თამაშის იდეა — პერსონაჟები, სამყარო, მექანიკა...', ru: 'Опишите идею игры — персонажи, мир, механика...' } },
      {
        id: 'genre',
        type: 'select',
        label: { en: 'Genre', ka: 'ჟანრი', ru: 'Жанр' },
        options: [
          { value: 'puzzle', label: 'Puzzle' },
          { value: 'rpg', label: 'RPG' },
          { value: 'arcade', label: 'Arcade' },
          { value: 'simulation', label: 'Simulation' },
          { value: 'platformer', label: 'Platformer' },
          { value: 'strategy', label: 'Strategy / RTS' },
          { value: 'shooter', label: 'Shooter / FPS' },
          { value: 'horror', label: 'Horror / Survival' },
          { value: 'adventure', label: 'Adventure' },
          { value: 'fighting', label: 'Fighting' },
        ],
        defaultValue: 'rpg',
      },
      {
        id: 'platform',
        type: 'select',
        label: { en: 'Target Platform', ka: 'პლათფორმა', ru: 'Платформа' },
        options: [
          { value: 'mobile', label: 'Mobile (iOS/Android)' },
          { value: 'pc', label: 'PC / Steam' },
          { value: 'web', label: 'Web Browser' },
          { value: 'console', label: 'Console' },
          { value: 'cross', label: 'Cross-Platform' },
        ],
        defaultValue: 'mobile',
      },
      {
        id: 'art_style',
        type: 'select',
        label: { en: 'Art Style', ka: 'არტ სტილი', ru: 'Арт-стиль' },
        options: [
          { value: 'pixel', label: 'Pixel Art' },
          { value: 'cartoon', label: 'Cartoon / 2D' },
          { value: 'realistic', label: 'Realistic 3D' },
          { value: 'low_poly', label: 'Low-Poly 3D' },
          { value: 'stylized', label: 'Stylized / Cel-Shaded' },
          { value: 'anime', label: 'Anime / Manga' },
        ],
        defaultValue: 'pixel',
      },
    ],
    creditCost: 15,
    actionLabel: { en: 'Create Game Design', ka: 'GDD-ს შექმნა', ru: 'Создать GDD' },
    outputType: 'text',
    previewHint: { en: 'Game Design Document (GDD) will appear here', ka: 'GDD გამოჩნდება აქ', ru: 'GDD появится здесь' },
  },
  interior: {
    fields: [
      { id: 'upload', type: 'upload', label: { en: 'Upload Room Photo', ka: 'ოთახის ფოტოს ატვირთვა', ru: 'Загрузить фото комнаты' } },
      { id: 'prompt', type: 'textarea', label: { en: 'Design Brief', ka: 'დიზაინის ბრიფი', ru: 'Бриф дизайна' }, placeholder: { en: 'Describe desired interior style...', ka: 'აღწერეთ სასურველი სტილი...', ru: 'Опишите желаемый стиль...' } },
      { id: 'provider', type: 'select', label: { en: 'Provider', ka: 'პროვაიდერი', ru: 'Провайдер' }, options: [{ value: 'worldlabs', label: 'World Labs (Primary)' }, { value: 'replicate', label: 'Replicate (Fallback)' }], defaultValue: 'worldlabs' },
      { id: 'style', type: 'select', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, options: [{ value: 'minimalist_scandi', label: 'Minimalist Scandi' }, { value: 'industrial_loft', label: 'Industrial Loft' }, { value: 'modern_luxury', label: 'Modern Luxury' }, { value: 'warm_japandi', label: 'Warm Japandi' }], defaultValue: 'minimalist_scandi' },
      { id: 'aspect', type: 'select', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Пропорции' }, options: [{ value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '1:1', label: '1:1' }], defaultValue: '16:9' },
      { id: 'primary_goal', type: 'select', label: { en: 'Primary Goal', ka: 'ძირითადი მიზანი', ru: 'Основная цель' }, options: [{ value: 'full_renovation', label: 'Full Renovation' }, { value: 'furniture_layout', label: 'Furniture Layout' }, { value: 'lighting_update', label: 'Lighting Update' }, { value: 'staging', label: 'Real-Estate Staging' }], defaultValue: 'full_renovation' },
      { id: 'color_palette', type: 'select', label: { en: 'Color Palette', ka: 'ფერთა პალიტრა', ru: 'Цветовая палитра' }, options: [{ value: 'warm_earth', label: 'Warm Earth Tones' }, { value: 'cold_industrial', label: 'Cold Industrial' }, { value: 'vibrant_bold', label: 'Vibrant / Bold' }, { value: 'neutral_scandi', label: 'Neutral Scandi' }], defaultValue: 'neutral_scandi' },
      { id: 'materials', type: 'select', label: { en: 'Materials', ka: 'მასალები', ru: 'Материалы' }, options: [{ value: 'natural_wood', label: 'Natural Wood' }, { value: 'concrete_steel', label: 'Concrete & Steel' }, { value: 'luxury_marble', label: 'Luxury Marble' }, { value: 'glass_metal', label: 'Glass & Metal' }], defaultValue: 'natural_wood' },
      { id: 'lighting_vibe', type: 'select', label: { en: 'Lighting Vibe', ka: 'განათების ატმოსფერო', ru: 'Световая атмосфера' }, options: [{ value: 'natural_sunlight', label: 'Natural Sunlight' }, { value: 'cozy_dimmable', label: 'Cozy Dimmable' }, { value: 'studio_bright', label: 'Studio Bright' }, { value: 'ambient_layered', label: 'Layered Ambient' }], defaultValue: 'natural_sunlight' },
    ],
    creditCost: 22,
    actionLabel: { en: 'Build 3D Interior', ka: '3D ინტერიერის აწყობა', ru: 'Построить 3D интерьер' },
    outputType: 'mixed',
    previewHint: { en: 'Interactive 3D interior will appear here', ka: 'ინტერაქტიული 3D ინტერიერი აქ გამოჩნდება', ru: 'Интерактивный 3D интерьер появится здесь' },
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

const UI_COPY: Record<LocaleKey, WorkspaceViewLabels> = {
  en: {
    credits: 'credits',
    preview: 'Preview',
    generating: 'Generating...',
    download: 'Download',
    copy: 'Copy',
    retry: 'Try Again',
    stats: 'Stats',
    generated: 'Generated',
    thisMonth: 'This Month',
    quickTip: 'Quick Tip',
    tipText: 'Be specific with your descriptions for better results',
    progress: 'Progress',
    processingStep: 'Processing edit pipeline',
    stepLabel: 'Step',
    ofLabel: 'of',
    latestNote: 'Latest note',
    available: 'Available',
    total: 'Total',
    live: 'Live',
    avgTime: 'Avg time',
    uploadPrompt: 'Click to upload',
    uploadPhotoFirst: 'Upload a photo first.',
    uploadVideoFirst: 'Upload a video first.',
    requestFailed: 'Request failed',
    genericPreviewMode: 'This workspace is still using the generic preview mode for this service.',
  },
  ka: {
    credits: 'კრედიტი',
    preview: 'გადახედვა',
    generating: 'გენერაცია...',
    download: 'ჩამოტვირთვა',
    copy: 'კოპირება',
    retry: 'ხელახლა',
    stats: 'სტატისტიკა',
    generated: 'გენერირებული',
    thisMonth: 'ამ თვეში',
    quickTip: 'რჩევა',
    tipText: 'უკეთესი შედეგისთვის იყავი მაქსიმალურად კონკრეტული აღწერაში',
    progress: 'პროგრესი',
    processingStep: 'რედაქტირების პროცესის შესრულება',
    stepLabel: 'ეტაპი',
    ofLabel: 'დან',
    latestNote: 'ბოლო შენიშვნა',
    available: 'ხელმისაწვდომი',
    total: 'სულ',
    live: 'აქტიური',
    avgTime: 'საშ. დრო',
    uploadPrompt: 'დააჭირე ასატვირთად',
    uploadPhotoFirst: 'ჯერ ატვირთე ფოტო.',
    uploadVideoFirst: 'ჯერ ატვირთე ვიდეო.',
    requestFailed: 'მოთხოვნა ვერ შესრულდა',
    genericPreviewMode: 'ეს სამუშაო სივრცე ამ სერვისისთვის ჯერ კიდევ გენერიკ პრევიუს იყენებს.',
  },
  ru: {
    credits: 'кредитов',
    preview: 'Предпросмотр',
    generating: 'Генерация...',
    download: 'Скачать',
    copy: 'Копировать',
    retry: 'Повторить',
    stats: 'Статистика',
    generated: 'Создано',
    thisMonth: 'В этом месяце',
    quickTip: 'Совет',
    tipText: 'Чем точнее описание, тем лучше результат',
    progress: 'Прогресс',
    processingStep: 'Обработка монтажного конвейера',
    stepLabel: 'Шаг',
    ofLabel: 'из',
    latestNote: 'Последняя заметка',
    available: 'Доступно',
    total: 'Всего',
    live: 'Активно',
    avgTime: 'Среднее время',
    uploadPrompt: 'Нажмите для загрузки',
    uploadPhotoFirst: 'Сначала загрузите фото.',
    uploadVideoFirst: 'Сначала загрузите видео.',
    requestFailed: 'Запрос не выполнен',
    genericPreviewMode: 'Это рабочее пространство пока использует общий режим предпросмотра для этого сервиса.',
  },
}

function getSafeLocale(locale?: string): LocaleKey {
  return locale === 'ka' || locale === 'ru' ? locale : 'en'
}

function unwrapApiData(payload: unknown): JsonRecord {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const record = payload as JsonRecord
  if (record.data && typeof record.data === 'object') {
    return record.data as JsonRecord
  }

  return record
}

function extractApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Request failed'
  }

  const record = payload as JsonRecord
  if (typeof record.error === 'string' && record.error) {
    return record.error
  }

  if (typeof record.message === 'string' && record.message) {
    return record.message
  }

  if (record.data && typeof record.data === 'object') {
    return extractApiError(record.data)
  }

  return 'Request failed'
}

function extractOutputUrl(payload: unknown): string | null {
  if (!payload) {
    return null
  }

  if (typeof payload === 'string') {
    return payload.startsWith('http') || payload.startsWith('data:') ? payload : null
  }

  if (Array.isArray(payload)) {
    const first = payload[0]
    return extractOutputUrl(first)
  }

  if (typeof payload === 'object') {
    const record = payload as JsonRecord

    for (const key of ['url', 'audio', 'audioUrl', 'output']) {
      const value = record[key]
      if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) {
        return value
      }
    }

    if (record.normalized && typeof record.normalized === 'object') {
      return extractOutputUrl(record.normalized)
    }
  }

  return null
}

function extractOutputText(payload: unknown): string | null {
  if (!payload) {
    return null
  }

  if (typeof payload === 'string') {
    return payload
  }

  if (Array.isArray(payload)) {
    const values = payload
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((item): item is string => Boolean(item))

    return values.length > 0 ? values.join('\n') : null
  }

  if (typeof payload === 'object') {
    const record = payload as JsonRecord

    for (const key of ['response', 'result', 'output', 'detail', 'text', 'summary']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        return value
      }
    }

    if (record.normalized && typeof record.normalized === 'object') {
      return extractOutputText(record.normalized)
    }
  }

  return null
}

function extractEditingProgress(payload: JsonRecord): EditingJobProgress | null {
  const job = payload.job && typeof payload.job === 'object' ? payload.job as JsonRecord : null
  const output = payload.output && typeof payload.output === 'object' ? payload.output as JsonRecord : null
  const metadata = output?.metadata && typeof output.metadata === 'object' ? output.metadata as JsonRecord : null

  const candidate = (output?.progress && typeof output.progress === 'object' ? output.progress : null)
    || (job?.progress && typeof job.progress === 'object' ? job.progress : null)
    || (metadata?.progress && typeof metadata.progress === 'object' ? metadata.progress : null)

  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const record = candidate as JsonRecord
  return {
    status: typeof record.status === 'string' ? record.status : 'processing',
    currentStepId: typeof record.currentStepId === 'string' ? record.currentStepId : null,
    currentStepDescription: typeof record.currentStepDescription === 'string' ? record.currentStepDescription : null,
    currentStepIndex: typeof record.currentStepIndex === 'number' ? record.currentStepIndex : 0,
    totalSteps: typeof record.totalSteps === 'number' ? record.totalSteps : 0,
    stepsCompleted: Array.isArray(record.stepsCompleted)
      ? record.stepsCompleted.filter((step): step is string => typeof step === 'string')
      : [],
    percent: typeof record.percent === 'number' ? record.percent : 0,
    notes: Array.isArray(record.notes)
      ? record.notes.filter((note): note is string => typeof note === 'string')
      : [],
  }
}

async function postJson(path: string, body: JsonRecord): Promise<JsonRecord> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(extractApiError(payload))
  }

  return unwrapApiData(payload)
}

function isTerminalPredictionStatus(status: string | undefined) {
  return ['succeeded', 'failed', 'canceled', 'throttled', 'model_unavailable'].includes(status || '')
}

async function pollPrediction(path: string, predictionId: string): Promise<JsonRecord> {
  let latest: JsonRecord = {}

  for (let attempt = 0; attempt < 15; attempt += 1) {
    latest = await postJson(path, { predictionId })
    const status = typeof latest.status === 'string' ? latest.status : undefined
    if (isTerminalPredictionStatus(status)) {
      return latest
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500))
  }

  return latest
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to read file'))
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new window.Image()
      image.onload = () => {
        resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 })
      }
      image.onerror = () => reject(new Error('Unable to read image metadata'))
      image.src = objectUrl
    })

    return dimensions
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function evaluateInteriorImageQuality(file: File): Promise<{
  width: number;
  height: number;
  lowQuality: boolean;
}> {
  const { width, height } = await readImageDimensions(file)
  const lowResolution = width < 960 || height < 720
  const lowBytes = file.size > 0 && file.size < 150_000

  return {
    width,
    height,
    lowQuality: lowResolution || lowBytes,
  }
}

function buildPhotoPrompt(action: string) {
  switch (action) {
    case 'restore':
      return 'Restore the uploaded photo with clean detail recovery and natural colors.'
    case 'colorize':
      return 'Enhance the uploaded photo with balanced color recovery and clean tonal detail.'
    case 'denoise':
      return 'Reduce noise, preserve facial detail, and enhance sharpness in the uploaded photo.'
    default:
      return 'Upscale and enhance the uploaded photo with studio-quality clarity.'
  }
}

function buildDownloadName(serviceId: string, kind: OutputKind) {
  if (kind === 'image') return `${serviceId}-output.png`
  if (kind === 'video') return `${serviceId}-output.mp4`
  if (kind === 'audio') return `${serviceId}-output.mp3`
  return `${serviceId}-output.txt`
}

function resolveWorkspaceCreditCost(
  workspace: ServiceWorkspace,
  values: Record<string, string | number>,
): number {
  if (!workspace.creditSourceFieldId) {
    return workspace.creditCost
  }

  if (
    workspace.creditSourceFieldId === 'nanobanana_endpoint'
    && String(values.provider || 'nanobanana') !== 'nanobanana'
  ) {
    return workspace.creditCost
  }

  const sourceField = workspace.fields.find((field) => field.id === workspace.creditSourceFieldId)
  if (!sourceField?.options || sourceField.options.length === 0) {
    return workspace.creditCost
  }

  const selectedValue = String(values[workspace.creditSourceFieldId] || '')
  const selectedOption = sourceField.options.find((option) => option.value === selectedValue)

  return typeof selectedOption?.credits === 'number'
    ? selectedOption.credits
    : workspace.creditCost
}

async function waitForEditingJob(jobId: string, onProgress?: (progress: EditingJobProgress | null) => void): Promise<JsonRecord> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`/api/editing/jobs/${jobId}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(extractApiError(payload))
    }

    const data = unwrapApiData(payload)
  onProgress?.(extractEditingProgress(data))
    const job = data.job as JsonRecord | undefined
    const status = typeof job?.status === 'string' ? job.status : undefined

    if (status === 'completed' || status === 'failed' || status === 'dead') {
      return data
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500))
  }

  throw new Error('Editing job timed out')
}

/* ── Component ── */
interface ServiceWorkspaceViewProps {
  serviceId: string
  serviceName?: string
  serviceIcon?: string
  locale?: string
  description?: string
  creditsBalance?: number
  showStats?: boolean
  showQuickTip?: boolean
  labels?: Partial<WorkspaceViewLabels>
  workspaceOverride?: Partial<ServiceWorkspace>
  onJobStart?: (label: string) => string
  onJobProgress?: (jobId: string, progress: number) => void
  onJobComplete?: (jobId: string, result: WorkspaceResult) => void
  onJobError?: (jobId: string, errorMessage: string) => void
}

export default function ServiceWorkspaceView({
  serviceId,
  serviceName,
  serviceIcon = '◈',
  locale,
  description,
  creditsBalance = 1000,
  showStats = true,
  showQuickTip = true,
  labels,
  workspaceOverride,
  onJobStart,
  onJobProgress,
  onJobComplete,
  onJobError,
}: ServiceWorkspaceViewProps) {
  const { language } = useLanguage()
  const lang = locale ? getSafeLocale(locale) : getSafeLocale(language)
  const ui = { ...UI_COPY[lang], ...(labels ?? {}) }
  const baseWorkspace = SERVICE_WORKSPACES[serviceId] || DEFAULT_WORKSPACE
  const workspace: ServiceWorkspace = {
    ...baseWorkspace,
    ...workspaceOverride,
    fields: workspaceOverride?.fields ?? baseWorkspace.fields,
    actionLabel: { ...baseWorkspace.actionLabel, ...(workspaceOverride?.actionLabel ?? {}) },
    previewHint: { ...baseWorkspace.previewHint, ...(workspaceOverride?.previewHint ?? {}) },
  }
  const safeServiceName = serviceName || serviceId
  const safeDescription = description || workspace.previewHint[lang] || workspace.previewHint.en
  const [values, setValues] = useState<Record<string, string | number>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<WorkspaceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<EditingJobProgress | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef(`workspace_${serviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

  useEffect(() => {
    const defaults: Record<string, string | number> = {}
    workspace.fields.forEach((field) => {
      if (field.defaultValue !== undefined) defaults[field.id] = field.defaultValue
    })
    if (serviceId === 'interior') {
      defaults.confirm_design_brief = 'false'
    }
    setValues(defaults)
    setResult(null)
    setError(null)
    setJobProgress(null)
    setUploadedFile(null)
    sessionRef.current = `workspace_${serviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }, [serviceId, workspace.fields])

  const updateValue = useCallback((id: string, value: string | number) => {
    setValues((prev) => {
      const next = { ...prev, [id]: value }
      if (
        serviceId === 'interior'
        && id !== 'confirm_design_brief'
        && String(prev.confirm_design_brief || 'false') === 'true'
      ) {
        next.confirm_design_brief = 'false'
      }
      return next
    })
  }, [serviceId])

  const publishResult = useCallback((jobId: string | null, nextResult: WorkspaceResult) => {
    setResult(nextResult)
    if (jobId) {
      onJobProgress?.(jobId, 100)
      onJobComplete?.(jobId, nextResult)
    }
  }, [onJobComplete, onJobProgress])

  const handleGenerate = useCallback(async () => {
    const prompt = String(values.prompt || '').trim()
    const instruction = String(values.instruction || '').trim()
    let dashboardJobId: string | null = null

    setIsGenerating(true)
    setResult(null)
    setError(null)
    setJobProgress(null)

    try {
      if (serviceId === 'photo') {
        if (!uploadedFile) {
          throw new Error(ui.uploadPhotoFirst)
        }

        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 12)
        }

        const imageUrl = await readFileAsDataUrl(uploadedFile)
        const action = String(values.action || 'upscale')
        const initialPayload = await postJson('/api/replicate/photo', {
          imageUrl,
          prompt: buildPhotoPrompt(action),
          variant: action === 'upscale' ? 'upscale' : 'enhance',
          quality: 'high',
        })

        const completedPayload = typeof initialPayload.id === 'string' && !isTerminalPredictionStatus(typeof initialPayload.status === 'string' ? initialPayload.status : undefined)
          ? await pollPrediction('/api/replicate/photo', initialPayload.id)
          : initialPayload

        if (typeof completedPayload.status === 'string' && completedPayload.status !== 'succeeded') {
          throw new Error(extractApiError(completedPayload))
        }

        const outputUrl = extractOutputUrl(completedPayload.normalized ?? completedPayload.output ?? completedPayload)
        const outputText = extractOutputText(completedPayload.normalized ?? completedPayload.output ?? completedPayload)

        if (outputUrl) {
          publishResult(dashboardJobId, {
            kind: 'image',
            title: safeServiceName,
            detail: buildPhotoPrompt(action),
            url: outputUrl,
          })
          return
        }

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: buildPhotoPrompt(action),
          text: outputText || JSON.stringify(completedPayload, null, 2),
        })
        return
      }

      if (serviceId === 'image') {
        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 18)
        }

        const provider = String(values.provider || 'nanobanana').toLowerCase()
        const endpoint = String(values.nanobanana_endpoint || 'text-to-image')
        const style = String(values.style || 'photorealistic')
        const aspect = String(values.aspect || '1:1')

        const mediaFiles: JsonRecord[] = []
        if (uploadedFile && uploadedFile.type.startsWith('image/')) {
          const imageDataUrl = await readFileAsDataUrl(uploadedFile)
          mediaFiles.push({
            id: `upload_${Date.now()}`,
            name: uploadedFile.name,
            type: 'image',
            mimeType: uploadedFile.type || 'image/jpeg',
            dataUrl: imageDataUrl,
          })
        }

        const payload = await postJson('/api/pipeline', {
          action: 'generate',
          serviceId,
          sessionId: sessionRef.current,
          userInput: prompt,
          answers: {
            provider,
            nanobanana_endpoint: endpoint,
            style,
            aspect,
          },
          mediaFiles,
        })

        if (payload.status === 'error' || payload.error) {
          throw new Error(extractApiError(payload))
        }

        const outputUrl = typeof payload.result_url === 'string'
          ? payload.result_url
          : extractOutputUrl(payload)

        const outputText = typeof payload.result === 'string'
          ? payload.result
          : extractOutputText(payload)

        if (outputUrl) {
          publishResult(dashboardJobId, {
            kind: 'image',
            title: safeServiceName,
            detail: `${provider} · ${endpoint}`,
            url: outputUrl,
          })
          return
        }

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: `${provider} · ${endpoint}`,
          text: outputText || JSON.stringify(payload, null, 2),
        })
        return
      }

      if (serviceId === 'interior') {
        if (!uploadedFile || !uploadedFile.type.startsWith('image/')) {
          throw new Error(ui.uploadPhotoFirst)
        }

        const confirmedBrief = String(values.confirm_design_brief || 'false') === 'true'
        if (!confirmedBrief) {
          throw new Error('Confirm the final Design Brief before spending credits.')
        }

        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 20)
        }

        const promptText = prompt || String(values.style || 'Minimalist Scandi style')
        const quality = await evaluateInteriorImageQuality(uploadedFile)
        if (quality.lowQuality) {
          throw new Error('To get the best 3D result, please upload a high-resolution photo with clear lighting.')
        }

        const imageDataUrl = await readFileAsDataUrl(uploadedFile)
        const designBrief = buildInteriorDesignBrief({
          userPrompt: promptText,
          answers: {
            primaryGoal: String(values.primary_goal || 'full_renovation'),
            colorPalette: String(values.color_palette || 'neutral_scandi'),
            materials: String(values.materials || 'natural_wood'),
            lightingVibe: String(values.lighting_vibe || 'natural_sunlight'),
          },
        })

        const payload = await postJson('/api/pipeline', {
          action: 'generate',
          serviceId,
          sessionId: sessionRef.current,
          userInput: promptText,
          answers: {
            provider: String(values.provider || 'worldlabs'),
            style: String(values.style || 'minimalist_scandi'),
            aspect: String(values.aspect || '16:9'),
            primary_goal: String(values.primary_goal || 'full_renovation'),
            color_palette: String(values.color_palette || 'neutral_scandi'),
            materials: String(values.materials || 'natural_wood'),
            lighting_vibe: String(values.lighting_vibe || 'natural_sunlight'),
            confirm_design_brief: 'true',
            image_width: String(quality.width),
            image_height: String(quality.height),
            final_design_brief: designBrief,
          },
          mediaFiles: [
            {
              id: `upload_${Date.now()}`,
              name: uploadedFile.name,
              type: 'image',
              mimeType: uploadedFile.type || 'image/jpeg',
              dataUrl: imageDataUrl,
            },
          ],
        })

        if (payload.status === 'error' || payload.error) {
          throw new Error(extractApiError(payload))
        }

        const viewerUrl = typeof payload.spatial_link === 'string' ? payload.spatial_link : undefined
        const modelUrl = typeof payload.model_url === 'string' ? payload.model_url : undefined
        const previewUrl = typeof payload.preview_image_url === 'string' ? payload.preview_image_url : undefined
        const outputText = typeof payload.result === 'string'
          ? payload.result
          : extractOutputText(payload)

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: `World Labs · Photo-to-3D · Iteration ${typeof payload.iteration === 'number' ? payload.iteration : 1}`,
          text: outputText || 'Interior 3D generation completed.',
          viewerUrl,
          modelUrl,
          url: previewUrl,
          provider: typeof payload.provider === 'string' ? payload.provider : 'worldlabs',
          metadata: {
            creditsRemaining: payload.credits_remaining,
            adminAlertTriggered: payload.admin_alert_triggered,
          },
        })
        return
      }

      if (serviceId === 'music') {
        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 18)
        }

        const genre = String(values.genre || 'electronic')
        const duration = String(values.duration || '60')

        const payload = await postJson('/api/pipeline', {
          action: 'generate',
          serviceId,
          sessionId: sessionRef.current,
          userInput: prompt,
          answers: {
            provider: 'udio',
            music_provider: 'udio',
            lyrics_mode: 'instrumental',
            genre,
            style: genre,
            duration,
          },
        })

        if (payload.status === 'error' || payload.error) {
          throw new Error(extractApiError(payload))
        }

        const outputUrl = typeof payload.result_url === 'string'
          ? payload.result_url
          : extractOutputUrl(payload)

        const outputText = typeof payload.result === 'string'
          ? payload.result
          : extractOutputText(payload)

        if (outputUrl) {
          publishResult(dashboardJobId, {
            kind: 'audio',
            title: safeServiceName,
            detail: `Udio · ${genre} · ${duration}s`,
            url: outputUrl,
          })
          return
        }

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: `Udio · ${genre} · ${duration}s`,
          text: outputText || JSON.stringify(payload, null, 2),
        })
        return
      }

      if (serviceId === 'software') {
        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 16)
        }

        const payload = await postJson('/api/orbit/code-generation', {
          prompt,
          language: String(values.language || 'typescript'),
          framework: 'MyAvatar.ge workspace',
        })

        publishResult(dashboardJobId, {
          kind: 'text',
          title: typeof payload.title === 'string' ? payload.title : safeServiceName,
          detail: typeof payload.detail === 'string' ? payload.detail : undefined,
          text: extractOutputText(payload) || JSON.stringify(payload, null, 2),
        })
        return
      }

      if (serviceId === 'business') {
        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 16)
        }

        const reportType = String(values.type || 'market')
        const payload = await postJson('/api/chat', {
          message: `${prompt}\n\nReport type: ${reportType}. Return an executive summary, key findings, risks, and concrete next actions.`,
          context: 'business',
          serviceId: 'business',
          language: locale,
          locale,
        })

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: reportType,
          text: extractOutputText(payload) || JSON.stringify(payload, null, 2),
        })
        return
      }

      if (serviceId === 'editing') {
        if (!uploadedFile) {
          throw new Error(ui.uploadVideoFirst)
        }

        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 10)
        }

        const effect = String(values.effect || 'none')
        const formData = new FormData()
        formData.set('file', uploadedFile)
        formData.set('instructions', instruction)
        formData.set('effect', effect)

        const createResponse = await fetch('/api/editing/jobs', {
          method: 'POST',
          body: formData,
        })
        const createPayload = await createResponse.json().catch(() => null)

        if (!createResponse.ok) {
          throw new Error(extractApiError(createPayload))
        }

        const createdJob = unwrapApiData(createPayload)
        const jobId = typeof createdJob.jobId === 'string' ? createdJob.jobId : null
        if (!jobId) {
          throw new Error('Failed to create editing job')
        }

        const completedPayload = await waitForEditingJob(jobId, (progress) => {
          setJobProgress(progress)
          if (dashboardJobId && progress) {
            onJobProgress?.(dashboardJobId, progress.percent)
          }
        })
        const job = completedPayload.job as JsonRecord | undefined
        const output = completedPayload.output as JsonRecord | undefined
        const status = typeof job?.status === 'string' ? job.status : undefined

        if (status !== 'completed') {
          throw new Error(typeof job?.error_message === 'string' ? job.error_message : 'Editing job failed')
        }

        const primaryUrl = typeof output?.primaryUrl === 'string' ? output.primaryUrl : null
        if (primaryUrl) {
          publishResult(dashboardJobId, {
            kind: 'video',
            title: safeServiceName,
            detail: effect === 'none' ? 'Rendered edit output' : `Effect: ${effect}`,
            url: primaryUrl,
          })
          return
        }

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: effect,
          text: JSON.stringify(completedPayload, null, 2),
        })
        return
      }

      // ── Pipeline text services (game, prompt-builder, content-writer, podcast, character, event, terminal) ──
      const PIPELINE_TEXT_SERVICES = ['game', 'prompt-builder', 'terminal', 'content-writer', 'podcast', 'character', 'event', 'tourism']
      if (PIPELINE_TEXT_SERVICES.includes(serviceId)) {
        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 15)
        }

        // Build answers from workspace field values
        const answers: Record<string, string> = {}
        workspace.fields.forEach((field) => {
          if (field.id !== 'prompt') {
            const val = values[field.id]
            if (val !== undefined) answers[field.id] = String(val)
          }
        })

        const payload = await postJson('/api/pipeline', {
          action: 'generate',
          serviceId,
          sessionId: sessionRef.current,
          userInput: prompt,
          answers,
        })

        if (dashboardJobId) {
          onJobProgress?.(dashboardJobId, 85)
        }

        if ((payload.status as string) === 'error' || payload.error) {
          throw new Error(extractApiError(payload))
        }

        const outputText = typeof payload.result === 'string' && payload.result.trim()
          ? payload.result
          : extractOutputText(payload)

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: typeof payload.provider === 'string' ? payload.provider : serviceId,
          text: outputText || JSON.stringify(payload, null, 2),
        })
        return
      }

      // ── Avatar / Video / Voice — pipeline media services ──────────────────
      if (serviceId === 'avatar' || serviceId === 'video' || serviceId === 'voice') {
        dashboardJobId = onJobStart?.(safeServiceName) ?? null
        if (dashboardJobId) onJobProgress?.(dashboardJobId, 10)

        const mediaFiles: JsonRecord[] = []
        if (uploadedFile && uploadedFile.type.startsWith('image/')) {
          const imageDataUrl = await readFileAsDataUrl(uploadedFile)
          mediaFiles.push({
            id: `upload_${Date.now()}`,
            name: uploadedFile.name,
            type: 'image',
            mimeType: uploadedFile.type || 'image/jpeg',
            dataUrl: imageDataUrl,
          })
        }

        const answers: Record<string, string> = {}
        workspace.fields.forEach((field) => {
          if (field.id !== 'prompt') {
            const val = values[field.id]
            if (val !== undefined) answers[field.id] = String(val)
          }
        })
        if (serviceId === 'avatar') {
          answers.voice_gender = answers.voice_gender || 'female'
          answers.voice_language = answers.voice_language || 'en'
          answers.video_format = '16:9'
        }
        if (serviceId === 'video') {
          answers.resolution = '1920x1080'
          answers.fps = '24'
          answers.ltx_model = 'ltx-2-3-fast'
        }

        const payload = await postJson('/api/pipeline', {
          action: 'generate',
          serviceId,
          sessionId: sessionRef.current,
          userInput: prompt,
          answers,
          mediaFiles,
        })

        if (payload.status === 'error' || payload.error) {
          throw new Error(extractApiError(payload))
        }

        const outputUrl = typeof payload.result_url === 'string'
          ? payload.result_url
          : extractOutputUrl(payload)
        const outputText = typeof payload.result === 'string'
          ? payload.result
          : extractOutputText(payload)

        const outputKind: 'video' | 'audio' = serviceId === 'voice' ? 'audio' : 'video'

        if (outputUrl) {
          publishResult(dashboardJobId, {
            kind: outputKind,
            title: safeServiceName,
            detail: typeof payload.provider === 'string' ? payload.provider : serviceId,
            url: outputUrl,
          })
          return
        }

        publishResult(dashboardJobId, {
          kind: 'text',
          title: safeServiceName,
          detail: serviceId,
          text: outputText || JSON.stringify(payload, null, 2),
        })
        return
      }

      dashboardJobId = onJobStart?.(safeServiceName) ?? null
      if (dashboardJobId) {
        onJobProgress?.(dashboardJobId, 24)
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      publishResult(dashboardJobId, {
        kind: 'text',
        title: safeServiceName,
        detail: workspace.previewHint[lang] || workspace.previewHint.en,
        text: ui.genericPreviewMode,
      })
    } catch (requestError) {
      const rawMessage = requestError instanceof Error ? requestError.message : ui.requestFailed
      const message = rawMessage === 'Request failed' ? ui.requestFailed : rawMessage
      setError(message)
      if (dashboardJobId) {
        onJobError?.(dashboardJobId, message)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [lang, locale, onJobError, onJobProgress, onJobStart, publishResult, safeServiceName, serviceId, ui.genericPreviewMode, ui.requestFailed, ui.uploadPhotoFirst, ui.uploadVideoFirst, uploadedFile, values, workspace.previewHint])

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setUploadedFile(file)
  }, [])

  const handleDownload = useCallback(() => {
    if (!result) {
      return
    }

    if (serviceId === 'interior' && result.modelUrl) {
      const link = document.createElement('a')
      link.href = result.modelUrl
      link.download = `${serviceId}-model.glb`
      link.click()
      return
    }

    if (result.url) {
      const link = document.createElement('a')
      link.href = result.url
      link.download = buildDownloadName(serviceId, result.kind)
      link.click()
      return
    }

    if (result.text) {
      const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = buildDownloadName(serviceId, result.kind)
      link.click()
      URL.revokeObjectURL(href)
    }
  }, [result, serviceId])

  const handleCopy = useCallback(() => {
    if (!result) {
      return
    }

    const content = result.text || result.url
    if (!content || !navigator.clipboard) {
      return
    }

    void navigator.clipboard.writeText(content)
  }, [result])

  const primaryPrompt = (values.prompt as string) || ''
  const canGenerate = (() => {
    if (serviceId === 'photo') {
      return Boolean(uploadedFile)
    }

    if (serviceId === 'interior') {
      return (
        Boolean(uploadedFile)
        && primaryPrompt.trim().length > 0
        && String(values.confirm_design_brief || 'false') === 'true'
      )
    }

    if (serviceId === 'editing') {
      return Boolean(uploadedFile) && String(values.instruction || '').trim().length > 0
    }

    if (workspace.fields.some((field) => field.type === 'textarea')) {
      return primaryPrompt.trim().length > 0
    }

    return true
  })()

  const activeCreditCost = resolveWorkspaceCreditCost(workspace, values)
  const selectedProvider = String(values.provider || (serviceId === 'interior' ? 'worldlabs' : 'nanobanana'))
  const creditSourceField = workspace.creditSourceFieldId
    ? workspace.fields.find((field) => field.id === workspace.creditSourceFieldId)
    : undefined
  const selectedTierLabel = creditSourceField?.options?.find(
    (option) => option.value === String(values[workspace.creditSourceFieldId || ''] || ''),
  )?.label

  return (
    <div className="h-full w-full overflow-y-auto" style={{ background: '#0a0a0f' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}
            >
              {serviceIcon}
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#f8fafc' }}>{safeServiceName}</h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>{safeDescription}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold" style={{ color: '#00d4ff' }}>{creditsBalance}</div>
            <p className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>{ui.credits}</p>
          </div>
        </div>

        {showStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: ui.credits, value: String(creditsBalance), sub: ui.available },
              { label: ui.generated, value: result ? '1' : '0', sub: ui.total },
                { label: ui.thisMonth, value: result ? String(activeCreditCost) : '0', sub: ui.credits },
              { label: ui.stats, value: result ? ui.live : '—', sub: ui.avgTime },
            ].map((stat, index) => (
              <div
                key={index}
                className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.5)' }}>{stat.label}</p>
                <p className="text-xl font-bold mt-1" style={{ color: '#f8fafc' }}>{stat.value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{stat.sub}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div
              className="rounded-2xl p-5 space-y-5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: '#f8fafc' }}>
                {workspace.actionLabel[lang] || workspace.actionLabel.en}
              </h3>

              {workspace.fields.map((field) => {
                if (serviceId === 'interior' && INTERIOR_INTAKE_FIELD_IDS.has(field.id)) {
                  return null
                }

                return (
                <div key={field.id}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(148,163,184,0.7)' }}>
                    {field.label[lang] || field.label.en}
                  </label>

                  {field.type === 'textarea' && (
                    <textarea
                      value={(values[field.id] as string) || ''}
                      onChange={(event) => updateValue(field.id, event.target.value)}
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
                      onChange={(event) => updateValue(field.id, event.target.value)}
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
                      {(() => {
                        const selectDisabled = field.id === 'nanobanana_endpoint' && selectedProvider !== 'nanobanana'
                        return (
                      <select
                        value={(values[field.id] as string) || field.defaultValue || ''}
                        onChange={(event) => updateValue(field.id, event.target.value)}
                        disabled={selectDisabled}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#f8fafc',
                          opacity: selectDisabled ? 0.55 : 1,
                          cursor: selectDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value} style={{ background: '#1a1a2e', color: '#f8fafc' }}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                        )
                      })()}
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
                        {uploadedFile ? uploadedFile.name : (field.placeholder?.[lang] || ui.uploadPrompt)}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        accept={serviceId === 'editing' ? 'video/*' : 'image/*'}
                      />
                    </div>
                  )}
                </div>
                )
              })}

              {serviceId === 'interior' && (
                <InteriorSmartIntake
                  prompt={String(values.prompt || '')}
                  values={values}
                  onChange={(id, value) => updateValue(id, value)}
                />
              )}

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
                    {ui.generating}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    {workspace.actionLabel[lang] || workspace.actionLabel.en}
                    {activeCreditCost > 0 && (
                      <span className="ml-1 opacity-70">({activeCreditCost} {ui.credits})</span>
                    )}
                  </>
                )}
              </button>

              {workspace.creditSourceFieldId && (
                <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.65)' }}>
                  {selectedProvider === 'nanobanana'
                    ? (selectedTierLabel || 'NanoBanana tier')
                    : `Replicate mode (${workspace.creditCost} ${ui.credits})`}
                </p>
              )}
            </div>

            {showQuickTip && (
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.08)' }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: '#00d4ff' }}>
                  💡 {ui.quickTip}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>
                  {ui.tipText}
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div
              className="rounded-2xl min-h-[400px] h-full flex flex-col"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#f8fafc' }}>
                  {ui.preview}
                </h3>
                {result && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownload}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                        {ui.download}
                      </span>
                    </button>
                    <button
                      onClick={handleCopy}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        {ui.copy}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 flex items-center justify-center p-6">
                {isGenerating ? (
                  <div className="flex w-full max-w-xl flex-col items-center gap-4">
                    {serviceId === 'interior' ? (
                      <>
                        <div className="relative h-20 w-20">
                          <div className="absolute inset-0 rounded-2xl border border-cyan-400/30 animate-pulse" />
                          <div className="absolute left-3 top-3 h-3 w-3 rounded-sm bg-cyan-400/80 animate-bounce" />
                          <div className="absolute right-4 top-6 h-2.5 w-2.5 rounded-sm bg-violet-400/80 animate-bounce" style={{ animationDelay: '120ms' }} />
                          <div className="absolute bottom-4 left-5 h-3 w-3 rounded-sm bg-emerald-400/80 animate-bounce" style={{ animationDelay: '220ms' }} />
                        </div>
                        <p className="text-sm text-center" style={{ color: 'rgba(148,163,184,0.75)' }}>
                          Building your Photo-to-3D interior world...
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="relative w-16 h-16">
                          <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-violet-500 border-b-transparent border-l-transparent animate-spin" />
                          <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-transparent border-b-cyan-400 border-l-violet-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                        </div>
                        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>{ui.generating}</p>
                      </>
                    )}

                    {serviceId === 'editing' && jobProgress && (
                      <div
                        className="w-full rounded-xl p-4 text-left"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex items-center justify-between gap-4 text-xs font-medium" style={{ color: 'rgba(148,163,184,0.72)' }}>
                          <span>{jobProgress.currentStepDescription || ui.processingStep}</span>
                          <span>{Math.max(0, Math.min(100, Math.round(jobProgress.percent)))}%</span>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.max(4, Math.min(100, Math.round(jobProgress.percent)))}%`,
                              background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 100%)',
                            }}
                          />
                        </div>

                        {jobProgress.totalSteps > 0 && (
                          <p className="mt-3 text-xs" style={{ color: 'rgba(148,163,184,0.58)' }}>
                            {ui.stepLabel} {Math.max(0, jobProgress.currentStepIndex)} {ui.ofLabel} {jobProgress.totalSteps}
                          </p>
                        )}

                        {jobProgress.notes.length > 0 && (
                          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.58)' }}>
                            {ui.latestNote}: {jobProgress.notes[jobProgress.notes.length - 1]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : error ? (
                  <div className="w-full max-w-xl">
                    <div className="rounded-xl p-5 whitespace-pre-wrap text-sm leading-relaxed" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.18)', color: '#fecdd3' }}>
                      {error}
                    </div>
                  </div>
                ) : result ? (
                  <div className="w-full max-w-xl">
                    <div className="space-y-4">
                      {result.title && (
                        <div>
                          <p className="text-lg font-semibold" style={{ color: '#f8fafc' }}>{result.title}</p>
                          {result.detail && (
                            <p className="mt-1 text-sm" style={{ color: 'rgba(148,163,184,0.7)' }}>{result.detail}</p>
                          )}
                        </div>
                      )}

                      {serviceId === 'interior' && result.viewerUrl ? (
                        <Interior3DViewer spatialLink={result.viewerUrl} modelUrl={result.modelUrl} />
                      ) : result.kind === 'image' && result.url ? (
                        <div className="overflow-hidden rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <Image src={result.url} alt={result.title || safeServiceName} width={1200} height={800} unoptimized className="w-full h-auto object-cover" />
                        </div>
                      ) : result.kind === 'video' && result.url ? (
                        <video controls className="w-full rounded-xl" src={result.url} />
                      ) : result.kind === 'audio' && result.url ? (
                        <audio controls className="w-full" src={result.url} />
                      ) : (
                        <div
                          className="rounded-xl p-5 text-sm leading-relaxed overflow-y-auto"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#e2e8f0',
                            maxHeight: '60vh',
                          }}
                        >
                          <div className="prose prose-invert prose-sm max-w-none
                            [&_h1]:text-cyan-300 [&_h1]:font-bold [&_h1]:text-base [&_h1]:mb-2 [&_h1]:mt-4
                            [&_h2]:text-violet-300 [&_h2]:font-semibold [&_h2]:text-sm [&_h2]:mb-2 [&_h2]:mt-4
                            [&_h3]:text-slate-200 [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:mb-1 [&_h3]:mt-3
                            [&_p]:text-slate-300 [&_p]:leading-relaxed [&_p]:mb-2
                            [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2
                            [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2
                            [&_li]:text-slate-300 [&_li]:mb-0.5
                            [&_strong]:text-white [&_em]:text-cyan-200/80
                            [&_code]:bg-white/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:text-emerald-300
                            [&_pre]:bg-white/[0.04] [&_pre]:rounded-xl [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:mb-3
                            [&_blockquote]:border-l-2 [&_blockquote]:border-cyan-400/40 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_blockquote]:italic
                            [&_hr]:border-white/[0.08] [&_hr]:my-3
                            [&_table]:w-full [&_table]:text-xs
                            [&_th]:text-left [&_th]:text-cyan-300 [&_th]:pb-1 [&_th]:border-b [&_th]:border-white/[0.08]
                            [&_td]:py-1 [&_td]:border-b [&_td]:border-white/[0.04] [&_td]:text-slate-300
                          ">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {result.text ?? ''}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => { setResult(null); setError(null); setIsGenerating(false) }}
                        className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.15)' }}
                      >
                        {ui.retry}
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
