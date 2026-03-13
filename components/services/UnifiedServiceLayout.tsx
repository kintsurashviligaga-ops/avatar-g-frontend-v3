'use client';

import { useState, useRef, useEffect, useCallback, type DragEvent, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getOwnerId } from '@/lib/auth/identity';
import { SERVICE_CONTRACTS, SERVICE_PRESETS as CATALOG_PRESETS, type ServicePreset } from '@/lib/services/catalog';
import AgentBadge from '@/components/agents/AgentBadge';
import AgentHandoffSuggestions from '@/components/agents/AgentHandoffSuggestions';
import { getPrimaryAgentForService } from '@/lib/agents/contracts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  artifacts?: Artifact[];
  timestamp: Date;
}

interface Artifact {
  type: 'image' | 'video' | 'audio' | 'text' | 'file';
  url?: string;
  content?: string;
  label: string;
  mimeType: string;
  generationStatus?: 'running' | 'succeeded' | 'failed';
  generationPrompt?: string;
  generationContext?: ServiceContext;
}

interface UnifiedServiceLayoutProps {
  serviceId: string;
  serviceName: string;
  serviceIcon: string;
  agentId: string;
  locale: string;
  features: string[];
  description: string;
  onAuthRequired?: () => void;
  isAuthenticated?: boolean;
  demoMode?: boolean;
}

type LocaleCode = 'en' | 'ka' | 'ru';
type ServiceContext = 'global' | 'music' | 'video' | 'avatar' | 'voice' | 'business' | 'image' | 'photo' | 'visual-ai';

type GenerationStage = 'idle' | 'starting' | 'polling' | 'finalizing' | 'done' | 'failed';

interface GenerationProgressState {
  percent: number;
  stage: GenerationStage;
  context: ServiceContext;
}

interface DownloadMetric {
  status: 'downloading' | 'complete' | 'failed';
  percent: number;
  receivedBytes: number;
  totalBytes: number | null;
}

interface OptionSet {
  key: string;
  label: string;
  values: string[];
}

interface WorkspaceSection {
  id: string;
  title: string;
  description: string;
  metric: number;
  steps: string[];
}

interface WorkspacePreset {
  id: string;
  title: string;
  prompt: string;
}

type AvatarScanTarget = 'face' | 'fullbody';
type AvatarRenderProfile = 'realistic' | 'cinematic' | 'anime' | 'studio';

interface AvatarBuilderProfile {
  heightCm: string;
  weightKg: string;
  footSize: string;
  scanTarget: AvatarScanTarget;
  faceRecognition: boolean;
  renderProfile: AvatarRenderProfile;
}

interface PremiumCardProps {
  title?: string;
  className?: string;
  children: ReactNode;
}

interface OptionChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

interface GoldCTAButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

// ─── Translations ────────────────────────────────────────────────────────────

const T: Record<string, Record<string, string>> = {
  en: {
    useAgent: 'Use Service Agent',
    placeholder: 'Describe what you want to create...',
    send: 'Send',
    upload: 'Upload',
    record: 'Voice',
    automation: 'Automation',
    export: 'Export',
    history: 'History',
    preview: 'Preview',
    tools: 'Tools',
    dragDrop: 'Drag & drop files here',
    loginRequired: 'Login required to run',
    login: 'Log In',
    quickActions: 'Quick Actions',
    credits: 'Credits',
    generating: 'Generating...',
    features: 'Capabilities',
    powered: 'Powered by Agent G',
    recording: 'Recording...',
    stopRecord: 'Stop',
    noPreview: 'Run a task to see preview',
    camera: 'Camera',
    closeCamera: 'Close Camera',
    support: 'Support',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'Phone',
    retryNotice: 'Provider is rate-limited. Please retry in',
    seconds: 'seconds',
    dismiss: 'Dismiss',
    capture: 'Capture',
    scan: 'Scan',
    scanHint: 'Frame captured. Adjust prompt and send when ready.',
    workspaceOptions: 'Workspace Options',
    clearChat: 'Clear Chat',
    progress: 'Progress',
    download: 'Download',
    downloading: 'Downloading',
    ready: 'Ready',
    workspaceFlow: 'Workspace Flow',
    pipelineModes: 'Pipeline Modes',
    premiumAction: 'Run Premium Pipeline',
    premiumHint: 'Use Agent G orchestration for production-ready output',
    liveChat: 'Live Premium Chatbox',
    exportCenter: 'Export Center',
    fullscreen: 'Fullscreen Chat',
    exitFullscreen: 'Exit Fullscreen',
    workspaceSections: 'Workspace Sections',
    selectionChart: 'Selection Chart',
    applySection: 'Apply Section',
    loadedPreset: 'Preset from landing applied',
    optionsCoverage: 'Options Coverage',
    sectionReadiness: 'Section Readiness',
    completionScore: 'Completion Score',
    avatarBuilderTitle: 'Avatar Builder Pro',
    avatarHeight: 'Height (cm)',
    avatarWeight: 'Weight (kg)',
    avatarFootSize: 'Foot Size',
    avatarScanMode: 'Scan Mode',
    avatarFullBody: 'Full Body',
    avatarFace: 'Face',
    avatarCameraRender: 'Camera Render',
    avatarFaceRecognition: 'Enable Face Recognition',
    avatarPresetAnimeFace: 'Anime Face Preset',
    avatarPresetFullBody: 'Fullbody Pro Preset',
    importAvatar: 'Import Ready Avatar',
    clearImportedAvatar: 'Clear Imported Avatar',
    avatarImported: 'Avatar imported and ready in this service',
    avatarImportFailed: 'No ready avatar found. Create one in Avatar service first.',
    importingAvatar: 'Importing avatar...',
    noPreviewHint: 'Send a prompt to generate your first output',
    tryExample: 'Try an example',
    regenerate: 'Regenerate',
    startCreating: 'Start creating',
    examplePrompts: 'Example Prompts',
    inputTypes: 'Accepts',
    outputTypes: 'Outputs',
    orTry: 'Or try one of these',
    quickStart: 'Quick Start',
    copyOutput: 'Copy',
    shareOutput: 'Share',
  },
  ka: {
    useAgent: 'აგენტის გამოყენება',
    placeholder: 'აღწერე რა გინდა შექმნა...',
    send: 'გაგზავნა',
    upload: 'ატვირთვა',
    record: 'ხმა',
    automation: 'ავტომატიზაცია',
    export: 'ექსპორტი',
    history: 'ისტორია',
    preview: 'გადახედვა',
    tools: 'ხელსაწყოები',
    dragDrop: 'ჩააგდე ფაილები აქ',
    loginRequired: 'გაშვებისთვის საჭიროა ავტორიზაცია',
    login: 'შესვლა',
    quickActions: 'სწრაფი მოქმედებები',
    credits: 'კრედიტი',
    generating: 'იქმნება...',
    features: 'შესაძლებლობები',
    powered: 'აგენტი G-ით მართული',
    recording: 'ჩაწერა...',
    stopRecord: 'შეჩერება',
    noPreview: 'გაუშვი დავალება გადახედვისთვის',
    camera: 'კამერა',
    closeCamera: 'კამერის დახურვა',
    support: 'კონტაქტი',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'ტელეფონი',
    retryNotice: 'პროვაიდერზე ლიმიტია. თავიდან სცადე',
    seconds: 'წამში',
    dismiss: 'დახურვა',
    capture: 'დაფიქსირება',
    scan: 'სკანი',
    scanHint: 'კადრი დაფიქსირდა. შეცვალე ტექსტი და გაგზავნე.',
    workspaceOptions: 'სამუშაო პარამეტრები',
    clearChat: 'ჩატის გასუფთავება',
    progress: 'პროგრესი',
    download: 'ჩამოტვირთვა',
    downloading: 'იტვირთება',
    ready: 'მზადაა',
    workspaceFlow: 'სამუშაო ნაკადი',
    pipelineModes: 'Pipeline რეჟიმები',
    premiumAction: 'პრემიუმ Pipeline-ის გაშვება',
    premiumHint: 'აგენტი G კოორდინაციას უკეთებს production-ready შედეგს',
    liveChat: 'პრემიუმ Live ჩატი',
    exportCenter: 'ექსპორტის ცენტრი',
    fullscreen: 'სრული ეკრანის ჩატი',
    exitFullscreen: 'სრული ეკრანიდან გამოსვლა',
    workspaceSections: 'სამუშაო სექციები',
    selectionChart: 'არჩევის დიაგრამა',
    applySection: 'სექციის გამოყენება',
    loadedPreset: 'Landing-დან არჩეული პრესეტი ჩაიტვირთა',
    optionsCoverage: 'პარამეტრების დაფარვა',
    sectionReadiness: 'სექციების მზადყოფნა',
    completionScore: 'შესრულების ქულა',
    avatarBuilderTitle: 'Avatar Builder Pro',
    avatarHeight: 'სიმაღლე (cm)',
    avatarWeight: 'წონა (kg)',
    avatarFootSize: 'ფეხის ზომა',
    avatarScanMode: 'სკანის რეჟიმი',
    avatarFullBody: 'სრული ტანი',
    avatarFace: 'სახე',
    avatarCameraRender: 'კამერის Render',
    avatarFaceRecognition: 'Face Recognition ჩართული',
    avatarPresetAnimeFace: 'Anime Face Preset',
    avatarPresetFullBody: 'Fullbody Pro Preset',
    importAvatar: 'მზა ავატარის შემოტანა',
    clearImportedAvatar: 'შემოტანილი ავატარის გასუფთავება',
    avatarImported: 'ავატარი შემოტანილია და სერვისში მზადაა',
    avatarImportFailed: 'მზა ავატარი ვერ მოიძებნა. ჯერ Avatar სერვისში შექმენი.',
    importingAvatar: 'ავატარის შემოტანა...',
    noPreviewHint: 'გაგზავნე ტექსტი შედეგის სანახავად',
    tryExample: 'სცადე მაგალითი',
    regenerate: 'თავიდან გენერაცია',
    startCreating: 'დაიწყე შექმნა',
    examplePrompts: 'მაგალითები',
    inputTypes: 'მიღება',
    outputTypes: 'გამოტანა',
    orTry: 'ან სცადე ერთ-ერთი მათგანი',
    quickStart: 'სწრაფი დაწყება',
    copyOutput: 'კოპირება',
    shareOutput: 'გაზიარება',
  },
  ru: {
    useAgent: 'Использовать агента',
    placeholder: 'Опишите что хотите создать...',
    send: 'Отправить',
    upload: 'Загрузить',
    record: 'Голос',
    automation: 'Автоматизация',
    export: 'Экспорт',
    history: 'История',
    preview: 'Просмотр',
    tools: 'Инструменты',
    dragDrop: 'Перетащите файлы сюда',
    loginRequired: 'Для запуска нужна авторизация',
    login: 'Войти',
    quickActions: 'Быстрые действия',
    credits: 'Кредиты',
    generating: 'Создаём...',
    features: 'Возможности',
    powered: 'На базе Агента G',
    recording: 'Запись...',
    stopRecord: 'Стоп',
    noPreview: 'Запустите задачу для просмотра',
    camera: 'Камера',
    closeCamera: 'Закрыть камеру',
    support: 'Контакты',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'Телефон',
    retryNotice: 'Провайдер ограничен по лимиту. Повторите через',
    seconds: 'секунд',
    dismiss: 'Закрыть',
    capture: 'Снимок',
    scan: 'Скан',
    scanHint: 'Кадр сохранён. Уточните запрос и отправьте.',
    workspaceOptions: 'Параметры рабочей зоны',
    clearChat: 'Очистить чат',
    progress: 'Прогресс',
    download: 'Скачать',
    downloading: 'Загрузка',
    ready: 'Готово',
    workspaceFlow: 'Поток рабочей зоны',
    pipelineModes: 'Режимы Pipeline',
    premiumAction: 'Запустить Premium Pipeline',
    premiumHint: 'Agent G координирует production-ready результат',
    liveChat: 'Premium Live чат',
    exportCenter: 'Центр экспорта',
    fullscreen: 'Чат на весь экран',
    exitFullscreen: 'Выйти из полноэкранного',
    workspaceSections: 'Секции рабочей зоны',
    selectionChart: 'Диаграмма выбора',
    applySection: 'Применить секцию',
    loadedPreset: 'Пресет с landing применен',
    optionsCoverage: 'Покрытие параметров',
    sectionReadiness: 'Готовность секций',
    completionScore: 'Оценка выполнения',
    avatarBuilderTitle: 'Avatar Builder Pro',
    avatarHeight: 'Рост (см)',
    avatarWeight: 'Вес (кг)',
    avatarFootSize: 'Размер обуви',
    avatarScanMode: 'Режим скана',
    avatarFullBody: 'Полное тело',
    avatarFace: 'Лицо',
    avatarCameraRender: 'Render камеры',
    avatarFaceRecognition: 'Включить распознавание лица',
    avatarPresetAnimeFace: 'Anime Face Preset',
    avatarPresetFullBody: 'Fullbody Pro Preset',
    importAvatar: 'Импорт готового аватара',
    clearImportedAvatar: 'Очистить импортированный аватар',
    avatarImported: 'Аватар импортирован и готов в этом сервисе',
    avatarImportFailed: 'Готовый аватар не найден. Сначала создайте его в Avatar сервисе.',
    importingAvatar: 'Импорт аватара...',
    noPreviewHint: 'Отправьте запрос для создания первого результата',
    tryExample: 'Попробуйте пример',
    regenerate: 'Перегенерировать',
    startCreating: 'Начать создание',
    examplePrompts: 'Примеры',
    inputTypes: 'Принимает',
    outputTypes: 'Создаёт',
    orTry: 'Или попробуйте один из этих',
    quickStart: 'Быстрый старт',
    copyOutput: 'Копировать',
    shareOutput: 'Поделиться',
  },
};

function parseOptionsParam(raw: string): Record<string, string> {
  if (!raw) return {};
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const [key, ...rest] = pair.split(':');
      if (!key || !rest.length) return acc;
      acc[key.trim()] = rest.join(':').trim();
      return acc;
    }, {});
}

function extractRetryAfterSeconds(input: string): number | null {
  const match = input.match(/retry(?:_after)?[^\d]*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldTriggerGeneration(serviceContext: string, prompt: string) {
  if (!['avatar', 'video', 'music', 'image', 'photo', 'visual-ai'].includes(serviceContext)) return false;
  return /generate|create|make|render|avatar|video|music|song|audio|image|photo|enhance|upscale|remove.*bg|caption|analyze|describe|შექმ|გენერ|созд|генер/i.test(prompt);
}

function resolveReplicateEndpoint(serviceContext: string) {
  if (serviceContext === 'avatar') return '/api/replicate/avatar';
  if (serviceContext === 'image') return '/api/replicate/image';
  if (serviceContext === 'photo') return '/api/replicate/photo';
  if (serviceContext === 'video') return '/api/replicate/video';
  if (serviceContext === 'visual-ai') return '/api/replicate/visual-ai';
  return '/api/replicate/audio';
}

function mapOutputToArtifacts(serviceContext: string, output: unknown): Artifact[] {
  const outputValue = Array.isArray(output) ? output[0] : output;

  // Text-based output (visual-ai captioning)
  if (serviceContext === 'visual-ai') {
    const text = typeof outputValue === 'string' ? outputValue : typeof output === 'string' ? output : JSON.stringify(output);
    return [{ type: 'text', label: 'AI Analysis', content: text, mimeType: 'text/plain' }];
  }

  const url = typeof outputValue === 'string' ? outputValue : '';
  if (!url) return [];

  if (serviceContext === 'avatar') {
    return [{ type: 'image', url, label: 'Generated Avatar', mimeType: 'image/*' }];
  }
  if (serviceContext === 'image') {
    return [{ type: 'image', url, label: 'Generated Image', mimeType: 'image/*' }];
  }
  if (serviceContext === 'photo') {
    return [{ type: 'image', url, label: 'Enhanced Photo', mimeType: 'image/*' }];
  }
  if (serviceContext === 'video') {
    return [{ type: 'video', url, label: 'Generated Video', mimeType: 'video/*' }];
  }
  return [{ type: 'audio', url, label: 'Generated Music', mimeType: 'audio/*' }];
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function extensionForArtifact(artifact: Artifact): string {
  if (artifact.type === 'image') return 'png';
  if (artifact.type === 'video') return 'mp4';
  if (artifact.type === 'audio') return 'mp3';
  if (artifact.type === 'text') return 'txt';
  return 'bin';
}

function buildScanPrompt(
  locale: string,
  serviceName: string,
  serviceContext: ServiceContext,
  scanTarget: AvatarScanTarget,
  renderProfile: AvatarRenderProfile,
  faceRecognition: boolean,
): string {
  const scanLabel = scanTarget === 'fullbody' ? 'full-body' : 'face';
  const faceLock = faceRecognition ? 'enabled' : 'disabled';

  if (locale === 'ka') {
    const scanLabelKa = scanTarget === 'fullbody' ? 'სრული ტანი' : 'სახე';
    const faceLockKa = faceRecognition ? 'ჩართულია' : 'გამორთულია';
    return `კამერით სკანი (${serviceName}/${serviceContext}): რეჟიმი=${scanLabelKa}, render=${renderProfile}, სახის ამოცნობა=${faceLockKa}. გააანალიზე კადრი, აღწერე დეტალები და შემომთავაზე შემდეგი 3 მოქმედება.`;
  }
  if (locale === 'ru') {
    const scanLabelRu = scanTarget === 'fullbody' ? 'полное тело' : 'лицо';
    const faceLockRu = faceRecognition ? 'включено' : 'выключено';
    return `Скан с камеры (${serviceName}/${serviceContext}): режим=${scanLabelRu}, render=${renderProfile}, распознавание лица=${faceLockRu}. Проанализируй кадр, опиши детали и предложи 3 следующих действия.`;
  }
  return `Camera scan (${serviceName}/${serviceContext}): mode=${scanLabel}, render=${renderProfile}, face-recognition=${faceLock}. Analyze this frame, summarize key details, and propose 3 next actions.`;
}

function buildAvatarSpecSuffix(locale: string, profile: AvatarBuilderProfile): string {
  const scan = profile.scanTarget === 'fullbody'
    ? (locale === 'ka' ? 'სრული ტანი' : locale === 'ru' ? 'полное тело' : 'full-body')
    : (locale === 'ka' ? 'სახე' : locale === 'ru' ? 'лицо' : 'face');

  const faceRec = profile.faceRecognition
    ? (locale === 'ka' ? 'ჩართულია' : locale === 'ru' ? 'вкл' : 'on')
    : (locale === 'ka' ? 'გამორთულია' : locale === 'ru' ? 'выкл' : 'off');

  return locale === 'ka'
    ? `\nAvatar Spec: სიმაღლე=${profile.heightCm || '-'}cm; წონა=${profile.weightKg || '-'}kg; ფეხის ზომა=${profile.footSize || '-'}; სკანი=${scan}; სახის ამოცნობა=${faceRec}; render=${profile.renderProfile}`
    : locale === 'ru'
      ? `\nAvatar Spec: рост=${profile.heightCm || '-'}см; вес=${profile.weightKg || '-'}кг; размер обуви=${profile.footSize || '-'}; скан=${scan}; распознавание лица=${faceRec}; render=${profile.renderProfile}`
      : `\nAvatar Spec: height=${profile.heightCm || '-'}cm; weight=${profile.weightKg || '-'}kg; foot-size=${profile.footSize || '-'}; scan=${scan}; face-recognition=${faceRec}; render=${profile.renderProfile}`;
}

// ─── Quick Action Chips ──────────────────────────────────────────────────────

const QUICK_ACTIONS: Record<string, string[]> = {
  avatar: ['Generate Avatar', 'Full-body Scan', 'Style Transfer', 'Export GLB'],
  video: ['Create Storyboard', 'Generate Video', 'Add Captions', 'Export 9:16'],
  editing: ['Auto Subtitles', 'Color Grade', 'Lip Sync', 'Batch Export'],
  music: ['Generate Beat', 'Add Vocals', 'Mix & Master', 'Export Stems'],
  photo: ['Remove Background', 'Retouch', 'Batch Process', 'Before/After'],
  image: ['Generate Poster', 'Create Thumbnail', 'Style Pack', 'Upscale'],
  media: ['Campaign Pack', 'Brand Kit Check', 'Brief Parse', 'Asset Pipeline'],
  text: ['Write Ad Copy', 'Landing Page', 'SEO Optimize', 'Multi-lang'],
  prompt: ['Design Prompt', 'Negative Set', 'Test Run', 'Export JSON'],
  'visual-intel': ['Score Creative', 'Brand Audit', 'Improve Suggest', 'Report'],
  workflow: ['Build Pipeline', 'Set Schedule', 'Add Gate', 'Template'],
  shop: ['Create Listing', 'Optimize SEO', 'Affiliate Setup', 'Store Audit'],
  software: ['Generate App Spec', 'Review Architecture', 'Create Tasks', 'Export Roadmap'],
  business: ['Build Strategy', 'Revenue Plan', 'Risk Scan', 'Executive Summary'],
  tourism: ['Create Itinerary', 'Build Travel Promo', 'Translate Offer', 'Export Guide'],
  next: ['Research Next Steps', 'Create Upgrade Plan', 'Generate Checklist', 'Export Brief'],
  'agent-g': ['Plan Task', 'Execute Pipeline', 'Quality Check', 'Bundle Run'],
};

const SERVICE_CONTEXT: Record<string, ServiceContext> = {
  music: 'music',
  video: 'video',
  editing: 'video',
  avatar: 'avatar',
  photo: 'photo',
  image: 'image',
  'visual-intel': 'visual-ai',
  software: 'business',
  business: 'business',
};

const SERVICE_BACKGROUNDS: Record<string, string> = {
  avatar: 'radial-gradient(1200px 650px at 18% 12%, rgba(56,189,248,0.24), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(168,85,247,0.22), transparent 52%), linear-gradient(180deg, #050814 0%, #03050f 100%)',
  video: 'radial-gradient(1200px 650px at 25% 20%, rgba(59,130,246,0.22), transparent 55%), radial-gradient(850px 520px at 82% 78%, rgba(236,72,153,0.2), transparent 52%), linear-gradient(180deg, #070b1a 0%, #040711 100%)',
  editing: 'radial-gradient(1200px 650px at 22% 18%, rgba(251,191,36,0.2), transparent 55%), radial-gradient(850px 520px at 84% 82%, rgba(99,102,241,0.22), transparent 52%), linear-gradient(180deg, #0b0c17 0%, #060712 100%)',
  music: 'radial-gradient(1200px 650px at 18% 12%, rgba(139,92,246,0.24), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(20,184,166,0.2), transparent 52%), linear-gradient(180deg, #070616 0%, #04030e 100%)',
  photo: 'radial-gradient(1200px 650px at 18% 12%, rgba(34,211,238,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(251,113,133,0.2), transparent 52%), linear-gradient(180deg, #060913 0%, #04060f 100%)',
  image: 'radial-gradient(1200px 650px at 18% 12%, rgba(99,102,241,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(244,63,94,0.22), transparent 52%), linear-gradient(180deg, #060813 0%, #04060e 100%)',
  media: 'radial-gradient(1200px 650px at 18% 12%, rgba(132,204,22,0.22), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(6,182,212,0.2), transparent 52%), linear-gradient(180deg, #050b13 0%, #03060d 100%)',
  text: 'radial-gradient(1200px 650px at 18% 12%, rgba(96,165,250,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(167,139,250,0.2), transparent 52%), linear-gradient(180deg, #080c17 0%, #05070f 100%)',
  prompt: 'radial-gradient(1200px 650px at 18% 12%, rgba(14,165,233,0.22), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(217,70,239,0.2), transparent 52%), linear-gradient(180deg, #060a14 0%, #04060f 100%)',
  'visual-intel': 'radial-gradient(1200px 650px at 18% 12%, rgba(168,85,247,0.22), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(16,185,129,0.2), transparent 52%), linear-gradient(180deg, #060913 0%, #04060f 100%)',
  workflow: 'radial-gradient(1200px 650px at 18% 12%, rgba(234,179,8,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(6,182,212,0.2), transparent 52%), linear-gradient(180deg, #090b14 0%, #05070f 100%)',
  shop: 'radial-gradient(1200px 650px at 18% 12%, rgba(244,63,94,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(14,165,233,0.2), transparent 52%), linear-gradient(180deg, #0a0814 0%, #06050f 100%)',
  software: 'radial-gradient(1200px 650px at 18% 12%, rgba(249,115,22,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(59,130,246,0.2), transparent 52%), linear-gradient(180deg, #090914 0%, #06070f 100%)',
  business: 'radial-gradient(1200px 650px at 18% 12%, rgba(20,184,166,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(96,165,250,0.2), transparent 52%), linear-gradient(180deg, #070b13 0%, #04060f 100%)',
  tourism: 'radial-gradient(1200px 650px at 18% 12%, rgba(16,185,129,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(56,189,248,0.2), transparent 52%), linear-gradient(180deg, #060a13 0%, #04060f 100%)',
  next: 'radial-gradient(1200px 650px at 18% 12%, rgba(99,102,241,0.23), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(16,185,129,0.2), transparent 52%), linear-gradient(180deg, #050a13 0%, #04060f 100%)',
  'agent-g': 'radial-gradient(1200px 650px at 18% 12%, rgba(6,182,212,0.25), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(99,102,241,0.22), transparent 52%), linear-gradient(180deg, #050914 0%, #03060e 100%)',
};

const SERVICE_OPTION_SETS: Record<string, OptionSet[]> = {
  editing: [
    { key: 'source', label: 'Source', values: ['Vertical Reels', 'Podcast', 'Interview', 'Course'] },
    { key: 'delivery', label: 'Delivery', values: ['Social Pack', 'Brand Edit', 'Broadcast'] },
    { key: 'assist', label: 'Assist', values: ['Auto-Cut', 'Smart Captions', 'Scene Match'] },
    { key: 'subtitles', label: 'Subtitles', values: ['Off', 'English', 'Georgian', 'Russian', 'Auto-Detect'] },
  ],
  avatar: [
    { key: 'quality', label: 'Quality', values: ['Standard', 'High'] },
    { key: 'style', label: 'Style', values: ['Realistic', 'Cinematic', 'Stylized', 'Anime'] },
    { key: 'ratio', label: 'Aspect Ratio', values: ['1:1', '4:5', '9:16'] },
    { key: 'pose', label: 'Pose', values: ['Portrait', 'Half Body', 'Full Body', 'Action'] },
    { key: 'lighting', label: 'Lighting', values: ['Studio', 'Natural', 'Dramatic', 'Golden Hour', 'Neon'] },
    { key: 'clothing', label: 'Clothing', values: ['Casual', 'Formal', 'Streetwear', 'Custom'] },
    { key: 'background', label: 'Background', values: ['Clean Studio', 'Gradient', 'Scene AI', 'Transparent'] },
  ],
  video: [
    { key: 'quality', label: 'Quality', values: ['HD', 'Full HD', '4K', '6K Master'] },
    { key: 'ratio', label: 'Ratio', values: ['16:9', '9:16', '1:1', '4:5'] },
    { key: 'camera', label: 'Camera Motion', values: ['Static', 'Dolly', 'Orbit', 'Drone', 'Handheld'] },
    { key: 'speed', label: 'Speed', values: ['Fast', 'Balanced', 'Premium'] },
    { key: 'narrative', label: 'Narrative', values: ['Hook-Proof-CTA', 'Story Arc', 'Demo-first'] },
    { key: 'duration', label: 'Duration', values: ['15s', '30s', '60s', '90s'] },
    { key: 'delivery', label: 'Delivery', values: ['Draft', 'Approved', 'Launch-ready'] },
  ],
  music: [
    { key: 'length', label: 'Length', values: ['15s', '30s', '60s', '90s', '3min'] },
    { key: 'genre', label: 'Genre', values: ['Ambient', 'Cinematic', 'Trap', 'House', 'Hybrid Orchestral', 'Lo-fi', 'Rock'] },
    { key: 'mood', label: 'Mood', values: ['Chill', 'Epic', 'Energetic', 'Luxury', 'Dark', 'Hopeful'] },
    { key: 'instrument', label: 'Lead Instrument', values: ['Piano', 'Guitar', 'Synth', 'Orchestra', 'Auto'] },
    { key: 'mix', label: 'Mix', values: ['Draft', 'Studio', 'Mastered'] },
    { key: 'vocal', label: 'Vocal Layer', values: ['Instrumental', 'Hook Vox', 'Full Vocal'] },
    { key: 'delivery', label: 'Delivery', values: ['Master', 'Stems', 'Master + Stems'] },
  ],
  photo: [
    { key: 'quality', label: 'Quality', values: ['Standard', 'High', 'Ultra'] },
    { key: 'variant', label: 'Mode', values: ['Upscale', 'Remove Background', 'Enhance', 'Restore'] },
    { key: 'retouch', label: 'Retouch Level', values: ['Natural', 'Editorial', 'High Fashion'] },
    { key: 'background', label: 'Background', values: ['Original', 'Clean Studio', 'AI Scene', 'Transparent'] },
    { key: 'delivery', label: 'Delivery', values: ['JPG', 'PNG', 'WebP Pack'] },
  ],
  image: [
    { key: 'quality', label: 'Quality', values: ['Standard', 'High'] },
    { key: 'variant', label: 'Model', values: ['Fast', 'Premium', 'Realistic'] },
    { key: 'style', label: 'Style', values: ['Photoreal', '3D Render', 'Commercial', 'Illustration'] },
    { key: 'ratio', label: 'Aspect Ratio', values: ['1:1', '4:5', '16:9', '9:16'] },
    { key: 'composition', label: 'Composition', values: ['Auto', 'Center', 'Rule of Thirds', 'Golden Ratio'] },
  ],
  'visual-intel': [
    { key: 'variant', label: 'Analysis', values: ['Caption', 'Quality Check', 'Brand Audit', 'Competitor Compare'] },
    { key: 'detail', label: 'Detail', values: ['Summary', 'Detailed', 'Expert'] },
    { key: 'output', label: 'Output', values: ['Report', 'Scorecard', 'Suggestions'] },
  ],
  media: [
    { key: 'package', label: 'Package', values: ['Launch Kit', 'Social Kit', 'Omni Campaign'] },
    { key: 'channels', label: 'Channels', values: ['Instagram', 'YouTube', 'TikTok', 'LinkedIn', 'Cross-platform'] },
    { key: 'strategy', label: 'Strategy', values: ['Awareness', 'Conversion', 'Retention'] },
    { key: 'tone', label: 'Brand Tone', values: ['Professional', 'Casual', 'Bold', 'Luxury'] },
  ],
  text: [
    { key: 'type', label: 'Content Type', values: ['Ad Copy', 'Landing Page', 'Blog', 'Email', 'Social'] },
    { key: 'tone', label: 'Tone', values: ['Professional', 'Conversational', 'Persuasive', 'Luxury'] },
    { key: 'length', label: 'Length', values: ['Short', 'Medium', 'Long', 'Detailed'] },
    { key: 'seo', label: 'SEO', values: ['Off', 'Basic', 'Full Optimization'] },
    { key: 'language', label: 'Target Language', values: ['English', 'Georgian', 'Russian', 'Multi-lang'] },
  ],
  prompt: [
    { key: 'model', label: 'Target Model', values: ['DALL-E', 'Midjourney', 'Stable Diffusion', 'Flux', 'Universal'] },
    { key: 'style', label: 'Prompt Style', values: ['Concise', 'Detailed', 'Negative Set', 'Template'] },
    { key: 'format', label: 'Output', values: ['Text', 'JSON', 'Batch Set'] },
  ],
  shop: [
    { key: 'action', label: 'Action', values: ['Create Listing', 'SEO Optimize', 'Affiliate Setup', 'Store Audit'] },
    { key: 'platform', label: 'Platform', values: ['Shopify', 'WooCommerce', 'Custom', 'Multi-platform'] },
    { key: 'detail', label: 'Detail', values: ['Quick', 'Standard', 'Comprehensive'] },
    { key: 'market', label: 'Market', values: ['Local', 'Regional', 'Global'] },
  ],
  software: [
    { key: 'output', label: 'Output', values: ['App Spec', 'Architecture', 'Tasks', 'CI/CD Setup', 'Roadmap'] },
    { key: 'stack', label: 'Stack', values: ['React', 'Next.js', 'Python', 'Mobile', 'Full-Stack'] },
    { key: 'detail', label: 'Detail', values: ['Overview', 'Detailed', 'Production-Ready'] },
  ],
  business: [
    { key: 'detail', label: 'Detail', values: ['Summary', 'Balanced', 'Deep Dive', 'Board-ready'] },
    { key: 'tone', label: 'Tone', values: ['Formal', 'Executive', 'Persuasive'] },
    { key: 'output', label: 'Output', values: ['Plan', 'Report', 'Deck Outline', 'Investor Memo'] },
    { key: 'risk', label: 'Risk Lens', values: ['Low', 'Balanced', 'Aggressive'] },
    { key: 'timeframe', label: 'Timeframe', values: ['30 Days', '90 Days', '12 Months', '3 Years'] },
  ],
  tourism: [
    { key: 'type', label: 'Type', values: ['Itinerary', 'Promo Video Script', 'Travel Guide', 'Tour Package'] },
    { key: 'audience', label: 'Audience', values: ['Solo', 'Couples', 'Family', 'Group', 'Business'] },
    { key: 'duration', label: 'Duration', values: ['Day Trip', '3 Days', 'Week', '2 Weeks'] },
    { key: 'style', label: 'Style', values: ['Adventure', 'Cultural', 'Luxury', 'Budget'] },
  ],
  workflow: [
    { key: 'type', label: 'Type', values: ['Pipeline', 'Schedule', 'Quality Gate', 'Template'] },
    { key: 'complexity', label: 'Complexity', values: ['Simple', 'Multi-step', 'Enterprise'] },
    { key: 'trigger', label: 'Trigger', values: ['Manual', 'Scheduled', 'Event-based'] },
  ],
  global: [
    { key: 'quality', label: 'Quality', values: ['Fast', 'Balanced', 'Premium', 'Enterprise'] },
    { key: 'format', label: 'Format', values: ['Concise', 'Structured', 'Detailed'] },
    { key: 'focus', label: 'Focus', values: ['Creative', 'Accuracy', 'Conversion', 'Scalability'] },
    { key: 'validation', label: 'Validation', values: ['Basic', 'Advanced', 'Strict'] },
  ],
};

const SERVICE_WORKSPACE_SECTIONS: Record<string, WorkspaceSection[]> = {
  avatar: [
    { id: 'brief', title: 'Avatar Brief', description: 'Identity, audience, and use-case framing.', metric: 82, steps: ['Profile', 'Audience', 'Platform'] },
    { id: 'style', title: 'Style Direction', description: 'Visual language, lighting, and outfit.', metric: 88, steps: ['Moodboard', 'Look', 'Lighting'] },
    { id: 'delivery', title: 'Delivery Pack', description: 'Export strategy for all channels.', metric: 76, steps: ['Formats', 'Variants', 'QC'] },
  ],
  video: [
    { id: 'strategy', title: 'Video Strategy', description: 'Narrative shape and conversion intent.', metric: 84, steps: ['Hook', 'Body', 'CTA'] },
    { id: 'production', title: 'Production Flow', description: 'Scene plan, shot logic, and timing.', metric: 81, steps: ['Scenes', 'Timing', 'Transitions'] },
    { id: 'delivery', title: 'Distribution', description: 'Platform-tailored exports and captions.', metric: 79, steps: ['Ratios', 'Captions', 'A/B'] },
  ],
  music: [
    { id: 'concept', title: 'Music Concept', description: 'Mood, genre blend, and reference zone.', metric: 80, steps: ['Mood', 'Genre', 'References'] },
    { id: 'composition', title: 'Composition', description: 'Structure, motifs, and progression.', metric: 86, steps: ['Intro', 'Drop', 'Resolve'] },
    { id: 'mix', title: 'Mix & Delivery', description: 'Balance, polish, and export packaging.', metric: 78, steps: ['Balance', 'Master', 'Stems'] },
  ],
  editing: [
    { id: 'source', title: 'Source Analysis', description: 'Analyze input footage and plan edits.', metric: 85, steps: ['Import', 'Review', 'Tags'] },
    { id: 'edit', title: 'Edit Pipeline', description: 'Auto-cut, captions, and color grading.', metric: 82, steps: ['Cut', 'Caption', 'Grade'] },
    { id: 'export', title: 'Export Suite', description: 'Multi-format batch export and QC.', metric: 77, steps: ['Formats', 'Batch', 'Review'] },
  ],
  image: [
    { id: 'concept', title: 'Visual Concept', description: 'Style, composition, and brand alignment.', metric: 83, steps: ['Style', 'Layout', 'Brand'] },
    { id: 'generation', title: 'Generation', description: 'Prompt, generate, and iterate.', metric: 88, steps: ['Prompt', 'Generate', 'Refine'] },
    { id: 'delivery', title: 'Asset Delivery', description: 'Export in all needed formats.', metric: 75, steps: ['Resize', 'Format', 'QC'] },
  ],
  photo: [
    { id: 'input', title: 'Photo Input', description: 'Upload and analysis of source photos.', metric: 84, steps: ['Upload', 'Analyze', 'Tag'] },
    { id: 'enhance', title: 'Enhancement', description: 'AI upscale, retouch, and background.', metric: 87, steps: ['Upscale', 'Retouch', 'BG'] },
    { id: 'output', title: 'Output Pack', description: 'Export ready for web and print.', metric: 79, steps: ['Web', 'Print', 'Pack'] },
  ],
  shop: [
    { id: 'setup', title: 'Store Setup', description: 'Product catalog and listing optimization.', metric: 81, steps: ['Products', 'SEO', 'Images'] },
    { id: 'marketing', title: 'Marketing Engine', description: 'Affiliate, pricing, and promotions.', metric: 78, steps: ['Affiliate', 'Pricing', 'Promo'] },
    { id: 'analytics', title: 'Store Analytics', description: 'Performance audit and recommendations.', metric: 74, steps: ['Traffic', 'Conv.', 'Revenue'] },
  ],
  software: [
    { id: 'spec', title: 'App Specification', description: 'Define features, flows, and requirements.', metric: 83, steps: ['Features', 'Flows', 'API'] },
    { id: 'architecture', title: 'Architecture', description: 'System design and tech stack.', metric: 86, steps: ['Design', 'Stack', 'Infra'] },
    { id: 'delivery', title: 'Dev Delivery', description: 'Tasks, timeline, and CI/CD.', metric: 76, steps: ['Tasks', 'Timeline', 'Deploy'] },
  ],
  text: [
    { id: 'brief', title: 'Content Brief', description: 'Define audience, tone, and goals.', metric: 82, steps: ['Audience', 'Tone', 'Goals'] },
    { id: 'write', title: 'Writing', description: 'Generate and refine content.', metric: 87, steps: ['Draft', 'Edit', 'SEO'] },
    { id: 'publish', title: 'Publish Pack', description: 'Multi-format and localized export.', metric: 78, steps: ['Format', 'Localize', 'QC'] },
  ],
  tourism: [
    { id: 'plan', title: 'Trip Planning', description: 'Destination, duration, and audience.', metric: 80, steps: ['Dest.', 'Duration', 'Audience'] },
    { id: 'content', title: 'Content Pack', description: 'Itinerary, promo, and guides.', metric: 84, steps: ['Itinerary', 'Promo', 'Guide'] },
    { id: 'localize', title: 'Localization', description: 'Multi-language and market adapting.', metric: 76, steps: ['Translate', 'Adapt', 'Review'] },
  ],
  business: [
    { id: 'analysis', title: 'Business Analysis', description: 'Current-state, constraints, and opportunities.', metric: 83, steps: ['State', 'Gaps', 'Opportunities'] },
    { id: 'strategy', title: 'Strategy Layer', description: 'Action plan with priorities and risks.', metric: 87, steps: ['Priorities', 'KPIs', 'Risk'] },
    { id: 'executive', title: 'Executive Delivery', description: 'Board-ready narrative and next steps.', metric: 74, steps: ['Summary', 'Roadmap', 'Review'] },
  ],
  global: [
    { id: 'plan', title: 'Plan Section', description: 'Set objective, constraints, and scope.', metric: 79, steps: ['Goal', 'Scope', 'Constraints'] },
    { id: 'execution', title: 'Execution Section', description: 'Generate output with quality gates.', metric: 85, steps: ['Draft', 'QA', 'Refine'] },
    { id: 'handoff', title: 'Handoff Section', description: 'Finalize assets and export package.', metric: 77, steps: ['Bundle', 'Checklist', 'Owner'] },
  ],
};

const SERVICE_PRESETS: Record<string, WorkspacePreset[]> = {
  avatar: [
    { id: 'avatar-brand-shot', title: 'Brand Hero Avatar', prompt: 'Create a premium brand-ready avatar with cinematic lighting and clean studio background.' },
    { id: 'avatar-streamer-pack', title: 'Streamer Pack', prompt: 'Generate a multi-pose avatar pack for livestream overlays and profile usage.' },
    { id: 'avatar-linkedin', title: 'Executive Portrait', prompt: 'Create an executive portrait with realistic face detail and professional styling.' },
  ],
  video: [
    { id: 'video-launch', title: 'Product Launch Reel', prompt: 'Build a 20-second product launch video with hook, proof, and CTA.' },
    { id: 'video-story', title: 'Story Sequence', prompt: 'Generate a cinematic 3-scene story sequence with transitions.' },
    { id: 'video-ads', title: 'Ad Variations', prompt: 'Create three ad variations optimized for 9:16 social channels.' },
  ],
  editing: [
    { id: 'edit-subtitles', title: 'Subtitle Ready', prompt: 'Edit my source into short clips with accurate auto subtitles and bold hooks.' },
    { id: 'edit-color', title: 'Color Grade Pass', prompt: 'Apply polished cinematic color grade while preserving skin tones.' },
    { id: 'edit-batch', title: 'Batch Export', prompt: 'Prepare social batch exports in 16:9, 9:16 and 1:1 with correct trims.' },
  ],
  music: [
    { id: 'music-trailer', title: 'Trailer Score', prompt: 'Compose an epic trailer score with rising tension and punchy finale.' },
    { id: 'music-brand', title: 'Brand Sonic Logo', prompt: 'Create a short sonic logo and matching 30-second brand loop.' },
    { id: 'music-social', title: 'Social Beat Pack', prompt: 'Generate upbeat short-form beats in multiple tempo variations.' },
  ],
  image: [
    { id: 'image-campaign', title: 'Campaign Poster', prompt: 'Generate a high-impact campaign poster with modern typography cues.' },
    { id: 'image-thumbnail', title: 'Thumbnail Set', prompt: 'Create a thumbnail set with strong contrast and high click-through focus.' },
    { id: 'image-packshot', title: 'Packshot Visual', prompt: 'Produce clean e-commerce packshot visuals on brand background.' },
  ],
  photo: [
    { id: 'photo-portrait', title: 'Portrait Retouch', prompt: 'Enhance portrait with natural retouch, clean skin, and studio lighting.' },
    { id: 'photo-product', title: 'Product Enhance', prompt: 'Upscale product photo, remove background, place on clean studio scene.' },
    { id: 'photo-batch', title: 'Batch Process', prompt: 'Process batch of photos: upscale, enhance colors, and export in web-ready formats.' },
  ],
  media: [
    { id: 'media-full', title: 'Omni Campaign', prompt: 'Assemble a full campaign pack: visuals, copy variants, and distribution notes.' },
    { id: 'media-influencer', title: 'Influencer Bundle', prompt: 'Generate an influencer-ready content bundle for launch week.' },
    { id: 'media-calendar', title: '30-Day Calendar', prompt: 'Build a 30-day content calendar with themes and asset checklist.' },
  ],
  text: [
    { id: 'text-landing', title: 'Landing Page Copy', prompt: 'Write high-converting landing page copy with H1, subtitle, features, and CTA.' },
    { id: 'text-seo', title: 'SEO Blog Article', prompt: 'Generate a 1500-word SEO-optimized blog article with meta tags and headers.' },
    { id: 'text-email', title: 'Email Sequence', prompt: 'Create a 5-email marketing sequence for product launch with subject lines.' },
  ],
  prompt: [
    { id: 'prompt-avatar', title: 'Avatar Prompt Kit', prompt: 'Design an optimized prompt set for realistic avatar generation across styles.' },
    { id: 'prompt-negative', title: 'Negative Prompt Set', prompt: 'Build comprehensive negative prompt library for commercial photography.' },
    { id: 'prompt-batch', title: 'Batch Prompt Generator', prompt: 'Generate 20 prompt variations for A/B testing creative outputs.' },
  ],
  shop: [
    { id: 'shop-listings', title: 'Product Listings', prompt: 'Generate optimized product listings with SEO titles, descriptions, and tags.' },
    { id: 'shop-audit', title: 'Store Audit', prompt: 'Run complete store audit with conversion rate optimization recommendations.' },
    { id: 'shop-affiliate', title: 'Affiliate Setup', prompt: 'Create affiliate marketing program structure with commission tiers and tracking.' },
  ],
  software: [
    { id: 'software-spec', title: 'App Specification', prompt: 'Generate full application specification from feature description with user flows.' },
    { id: 'software-arch', title: 'Architecture Review', prompt: 'Review system architecture and suggest improvements for scalability.' },
    { id: 'software-tasks', title: 'Sprint Planning', prompt: 'Break down features into development tasks with time estimates and priorities.' },
  ],
  business: [
    { id: 'business-strategy', title: 'Growth Strategy', prompt: 'Build comprehensive growth strategy with revenue projections and risk analysis.' },
    { id: 'business-investor', title: 'Investor Deck', prompt: 'Create investor-ready executive summary with market analysis and financial model.' },
    { id: 'business-validate', title: 'Idea Validation', prompt: 'Validate business idea with market sizing, competitor analysis, and feasibility score.' },
  ],
  tourism: [
    { id: 'tourism-itinerary', title: 'Travel Itinerary', prompt: 'Create detailed day-by-day travel itinerary with activities, transport, and costs.' },
    { id: 'tourism-promo', title: 'Tourism Promo', prompt: 'Build tourism promotional content package with visuals script and copy.' },
    { id: 'tourism-guide', title: 'Travel Guide', prompt: 'Generate comprehensive travel guide with local tips, maps, and photo suggestions.' },
  ],
  workflow: [
    { id: 'workflow-pipeline', title: 'Content Pipeline', prompt: 'Build automated content creation pipeline from brief to published assets.' },
    { id: 'workflow-template', title: 'Workflow Template', prompt: 'Create reusable workflow template with quality gates and approval steps.' },
    { id: 'workflow-multi', title: 'Multi-Service Flow', prompt: 'Design multi-service workflow connecting avatar, video, music, and text services.' },
  ],
  global: [
    { id: 'global-brief', title: 'Smart Brief', prompt: 'Turn this idea into a structured execution brief with milestones.' },
    { id: 'global-qa', title: 'Quality Pass', prompt: 'Run a quality check and provide improvements for output readiness.' },
    { id: 'global-export', title: 'Delivery Bundle', prompt: 'Package outputs and provide handoff checklist for the team.' },
  ],
};

const SERVICE_BACKGROUND_IMAGES: Record<string, string> = {
  avatar: '/backgrounds/services/avatar.svg',
  video: '/backgrounds/services/video.svg',
  editing: '/backgrounds/services/editing.svg',
  music: '/backgrounds/services/music.svg',
  photo: '/backgrounds/services/photo.svg',
  image: '/backgrounds/services/image.svg',
  media: '/backgrounds/services/media.svg',
  text: '/backgrounds/services/text.svg',
  prompt: '/backgrounds/services/prompt.svg',
  'visual-intel': '/backgrounds/services/visual-intel.svg',
  workflow: '/backgrounds/services/workflow.svg',
  shop: '/backgrounds/services/shop.svg',
  software: '/backgrounds/services/software.svg',
  business: '/backgrounds/services/business.svg',
  tourism: '/backgrounds/services/tourism.svg',
  next: '/backgrounds/services/next.svg',
  'agent-g': '/backgrounds/services/agent-g.svg',
};

// ─── Per-Service Example Prompts (Smart Empty State) ─────────────────────────

const SERVICE_EXAMPLE_PROMPTS: Record<string, { icon: string; text: Record<string, string> }[]> = {
  avatar: [
    { icon: '🎭', text: { en: 'Create a cinematic avatar with neon cyberpunk lighting', ka: 'შექმენი კინემატოგრაფიული ავატარი ნეონის კიბერპანკ განათებით', ru: 'Создай кинематографический аватар с неоновым кибер-освещением' } },
    { icon: '👔', text: { en: 'Generate a professional LinkedIn portrait with studio lighting', ka: 'შექმენი პროფესიული LinkedIn პორტრეტი სტუდიური განათებით', ru: 'Создай профессиональный портрет для LinkedIn со студийным освещением' } },
    { icon: '🎮', text: { en: 'Design an anime-style avatar for streaming overlays', ka: 'შექმენი anime სტილის ავატარი სტრიმინგისთვის', ru: 'Создай аватар в стиле аниме для стриминга' } },
    { icon: '✨', text: { en: 'Create a full-body avatar with realistic face detail', ka: 'შექმენი სრული ტანის ავატარი რეალისტური სახის დეტალებით', ru: 'Создай аватар в полный рост с реалистичной детализацией лица' } },
  ],
  video: [
    { icon: '🎬', text: { en: 'Create a 20-second product launch video with cinematic transitions', ka: 'შექმენი 20-წამიანი პროდუქტის ვიდეო კინემატოგრაფიული გადასვლებით', ru: 'Создай 20-секундный лаунч видео с кинематографическими переходами' } },
    { icon: '📱', text: { en: 'Generate a vertical reel for Instagram with hook-proof-CTA structure', ka: 'შექმენი ვერტიკალური Reel Instagram-ისთვის Hook-Proof-CTA სტრუქტურით', ru: 'Создай вертикальный Reel для Instagram со структурой Hook-Proof-CTA' } },
    { icon: '🎥', text: { en: 'Build a 3-scene story sequence with dramatic lighting', ka: 'შექმენი 3-სცენიანი ამბავი დრამატული განათებით', ru: 'Создай 3-сценарную историю с драматическим освещением' } },
    { icon: '📺', text: { en: 'Create ad variations optimized for multiple platforms', ka: 'შექმენი რეკლამის ვარიაციები მრავალი პლატფორმისთვის', ru: 'Создай вариации рекламы для нескольких платформ' } },
  ],
  music: [
    { icon: '🎵', text: { en: 'Compose an epic cinematic trailer score with rising tension', ka: 'შექმენი ეპიკური კინემატოგრაფიული თრეილერის მუსიკა', ru: 'Создай эпический кинематографический трейлер с нарастающим напряжением' } },
    { icon: '🎹', text: { en: 'Generate a chill lo-fi beat for study background', ka: 'შექმენი lo-fi ბითი სწავლის ფონისთვის', ru: 'Создай чилл lo-fi бит для фона учёбы' } },
    { icon: '🎸', text: { en: 'Create a brand sonic logo with matching 30-second loop', ka: 'შექმენი ბრენდის ხმოვანი ლოგო 30-წამიანი ლუპით', ru: 'Создай звуковой логотип бренда с 30-секундным лупом' } },
    { icon: '🎤', text: { en: 'Produce upbeat trap beats for social media content', ka: 'შექმენი ენერგიული trap ბითები სოციალური მედიისთვის', ru: 'Создай энергичные trap биты для соцсетей' } },
  ],
  image: [
    { icon: '🖼️', text: { en: 'Generate a high-impact campaign poster with modern typography', ka: 'შექმენი მძლავრი კამპანიის პოსტერი თანამედროვე ტიპოგრაფიით', ru: 'Создай мощный рекламный постер с современной типографикой' } },
    { icon: '📐', text: { en: 'Create thumbnail designs with strong contrast and CTR focus', ka: 'შექმენი თამბნეილები ძლიერი კონტრასტით', ru: 'Создай превью с сильным контрастом и фокусом на CTR' } },
    { icon: '🛒', text: { en: 'Produce clean e-commerce product shots on white background', ka: 'შექმენი პროდუქტის სურათები თეთრ ფონზე', ru: 'Создай чистые фото товаров на белом фоне' } },
    { icon: '🎨', text: { en: 'Design a social media visual pack in brand colors', ka: 'შექმენი სოციალური მედიის ვიზუალური პაკეტი ბრენდის ფერებში', ru: 'Создай визуальный пакет для соцсетей в фирменных цветах' } },
  ],
  photo: [
    { icon: '✨', text: { en: 'Remove background and place subject in AI studio scene', ka: 'წაშალე ფონი და მოათავსე AI სტუდიურ სცენაში', ru: 'Убери фон и помести субъект в AI-студийную сцену' } },
    { icon: '📸', text: { en: 'Upscale photo to ultra resolution with detail enhancement', ka: 'გაადიდე ფოტო ულტრა გაფართოებით', ru: 'Увеличь фото до ультра-разрешения с улучшением деталей' } },
    { icon: '💄', text: { en: 'Apply editorial retouch while preserving natural skin tones', ka: 'გააკეთე რედაქტორული რეტუში ბუნებრივი ტონალობით', ru: 'Примени редакционную ретушь с сохранением естественных тонов кожи' } },
    { icon: '🎭', text: { en: 'Create before/after comparison with batch processing', ka: 'შექმენი მანამდე/შემდეგ შედარება ჯგუფური დამუშავებით', ru: 'Создай сравнение до/после с пакетной обработкой' } },
  ],
  editing: [
    { icon: '✂️', text: { en: 'Auto-cut source video into short clips with smart captions', ka: 'ავტო-დაჭრა წყაროს ვიდეო მოკლე კლიპებად ჭკვიანი სუბტიტრებით', ru: 'Авто-нарезка видео на короткие клипы с умными субтитрами' } },
    { icon: '🎨', text: { en: 'Apply cinematic color grade while preserving skin tones', ka: 'გააკეთე კინემატოგრაფიული ფერების კორექცია', ru: 'Примени кинематографическую цветокоррекцию' } },
    { icon: '📦', text: { en: 'Batch export in 16:9, 9:16 and 1:1 with correct trims', ka: 'ჯგუფური ექსპორტი 16:9, 9:16 და 1:1 ფორმატებში', ru: 'Пакетный экспорт в 16:9, 9:16 и 1:1 с правильной обрезкой' } },
    { icon: '👄', text: { en: 'Add lip sync to talking head video with AI voice', ka: 'დაამატე ტუჩის სინქრონიზაცია AI ხმით', ru: 'Добавь синхронизацию губ с AI-голосом' } },
  ],
  shop: [
    { icon: '🛍️', text: { en: 'Generate optimized product listings with SEO copy', ka: 'შექმენი ოპტიმიზებული პროდუქტის ჩამონათვალი SEO ტექსტით', ru: 'Создай оптимизированные карточки товаров с SEO-текстом' } },
    { icon: '📊', text: { en: 'Create an affiliate marketing setup for my store', ka: 'შექმენი აფილიატ მარკეტინგის სისტემა ჩემი მაღაზიისთვის', ru: 'Создай партнёрскую систему для моего магазина' } },
    { icon: '🔍', text: { en: 'Run a full store audit with conversion recommendations', ka: 'გაუკეთე სრული აუდიტი მაღაზიას კონვერსიის რეკომენდაციებით', ru: 'Проведи полный аудит магазина с рекомендациями по конверсии' } },
    { icon: '📈', text: { en: 'Build automated pricing and inventory strategy', ka: 'შექმენი ავტომატიზებული ფასების და მარაგის სტრატეგია', ru: 'Создай автоматическую стратегию ценообразования и инвентаря' } },
  ],
  business: [
    { icon: '📋', text: { en: 'Build a comprehensive business strategy with revenue projections', ka: 'შექმენი სრული ბიზნეს სტრატეგია შემოსავლის პროგნოზებით', ru: 'Создай комплексную бизнес-стратегию с прогнозом доходов' } },
    { icon: '⚠️', text: { en: 'Run a risk analysis scan on my business plan', ka: 'გაუკეთე რისკის ანალიზი ჩემს ბიზნეს გეგმას', ru: 'Проведи анализ рисков моего бизнес-плана' } },
    { icon: '💰', text: { en: 'Create an investor-ready executive summary', ka: 'შექმენი ინვესტორისთვის მზა აღმასრულებელი შეჯამება', ru: 'Создай резюме для инвесторов' } },
    { icon: '🎯', text: { en: 'Validate my startup idea with market analysis', ka: 'შეამოწმე ჩემი სტარტაპის იდეა ბაზრის ანალიზით', ru: 'Валидируй мою идею стартапа с анализом рынка' } },
  ],
  software: [
    { icon: '💻', text: { en: 'Generate a full app specification from my idea description', ka: 'შექმენი აპლიკაციის სრული სპეციფიკაცია ჩემი იდეიდან', ru: 'Создай полную спецификацию приложения из описания идеи' } },
    { icon: '🏗️', text: { en: 'Review and improve my system architecture design', ka: 'გადახედე და გააუმჯობესე სისტემის არქიტექტურა', ru: 'Проверь и улучши архитектуру моей системы' } },
    { icon: '📝', text: { en: 'Break down features into development tasks with estimates', ka: 'დაშალე ფუნქციონალი დავალებებად შეფასებებით', ru: 'Разбей фичи на задачи разработки с оценками' } },
    { icon: '🚀', text: { en: 'Generate CI/CD pipeline setup and deployment checklist', ka: 'შექმენი CI/CD პაიპლაინი და deploy ჩეკლისტი', ru: 'Создай CI/CD пайплайн и чеклист деплоя' } },
  ],
  media: [
    { icon: '📱', text: { en: 'Assemble a full omni-channel campaign pack', ka: 'შექმენი სრული ომნი-არხიანი კამპანიის პაკეტი', ru: 'Собери полный омни-канальный пакет кампании' } },
    { icon: '📅', text: { en: 'Build a 30-day content calendar with themes and assets', ka: 'შექმენი 30-დღიანი კონტენტ კალენდარი თემებით', ru: 'Создай 30-дневный контент-календарь с темами и ассетами' } },
    { icon: '🤝', text: { en: 'Generate an influencer-ready content bundle for launch week', ka: 'შექმენი ინფლუენსერისთვის მზა კონტენტ პაკეტი', ru: 'Создай контент-пакет для инфлюенсеров на неделю запуска' } },
    { icon: '🎯', text: { en: 'Create targeted ad copy and visuals for A/B testing', ka: 'შექმენი მიზნობრივი რეკლამა A/B ტესტირებისთვის', ru: 'Создай таргетированную рекламу и визуалы для A/B тестирования' } },
  ],
  text: [
    { icon: '✍️', text: { en: 'Write high-converting landing page copy in 3 languages', ka: 'დაწერე მაღალი კონვერსიის Landing Page ტექსტი 3 ენაზე', ru: 'Напиши конвертирующий текст лендинга на 3 языках' } },
    { icon: '📝', text: { en: 'Generate SEO-optimized blog article with meta tags', ka: 'შექმენი SEO-ოპტიმიზებული ბლოგ სტატია მეტა ტეგებით', ru: 'Создай SEO-оптимизированную статью для блога с мета-тегами' } },
    { icon: '💡', text: { en: 'Create social media ad copy pack with variations', ka: 'შექმენი სოციალური მედიის რეკლამის ტექსტის პაკეტი', ru: 'Создай пакет текстов для рекламы в соцсетях с вариациями' } },
    { icon: '📧', text: { en: 'Write email marketing sequence for product launch', ka: 'დაწერე ელ-ფოსტის მარკეტინგის თანმიმდევრობა პროდუქტის გაშვებისთვის', ru: 'Напиши серию email-рассылок для запуска продукта' } },
  ],
  prompt: [
    { icon: '🧪', text: { en: 'Design an optimized prompt for realistic avatar generation', ka: 'შექმენი ოპტიმიზებული prompt რეალისტური ავატარისთვის', ru: 'Создай оптимизированный промпт для реалистичного аватара' } },
    { icon: '🎯', text: { en: 'Build a negative prompt set for commercial photography', ka: 'შექმენი negative prompt სეტი კომერციული ფოტოგრაფიისთვის', ru: 'Создай набор негативных промптов для коммерческой фотографии' } },
    { icon: '📋', text: { en: 'Generate a prompt template library for my brand', ka: 'შექმენი prompt-ების ბიბლიოთეკა ჩემი ბრენდისთვის', ru: 'Создай библиотеку шаблонов промптов для моего бренда' } },
    { icon: '🔄', text: { en: 'Test and compare prompt variations for best output', ka: 'შეამოწმე და შეადარე prompt ვარიაციები საუკეთესო შედეგისთვის', ru: 'Протестируй и сравни вариации промптов для лучшего результата' } },
  ],
  'visual-intel': [
    { icon: '🔍', text: { en: 'Score my creative assets for brand consistency', ka: 'შეაფასე ჩემი ვიზუალები ბრენდის თანმიმდევრულობისთვის', ru: 'Оцени мои креативы на соответствие бренду' } },
    { icon: '📊', text: { en: 'Run a full brand visual audit with improvement suggestions', ka: 'გაუკეთე სრული ბრენდის ვიზუალური აუდიტი გაუმჯობესებებით', ru: 'Проведи полный визуальный аудит бренда с предложениями' } },
    { icon: '🎨', text: { en: 'Analyze image quality and suggest AI enhancements', ka: 'გააანალიზე სურათის ხარისხი და შემოთავაზე AI გაუმჯობესებები', ru: 'Анализируй качество изображений и предложи AI-улучшения' } },
    { icon: '🏆', text: { en: 'Compare my visuals against competitor benchmarks', ka: 'შეადარე ჩემი ვიზუალები კონკურენტების სტანდარტებს', ru: 'Сравни мои визуалы с бенчмарками конкурентов' } },
  ],
  workflow: [
    { icon: '⚡', text: { en: 'Build an automated content pipeline for weekly publishing', ka: 'შექმენი ავტომატიზებული კონტენტ პაიპლაინი ყოველკვირეული გამოქვეყნებისთვის', ru: 'Создай автоматический пайплайн контента для еженедельной публикации' } },
    { icon: '🔗', text: { en: 'Create a multi-service workflow: avatar → video → music', ka: 'შექმენი მულტი-სერვისის ნაკადი: ავატარი → ვიდეო → მუსიკა', ru: 'Создай мульти-сервисный воркфлоу: аватар → видео → музыка' } },
    { icon: '📋', text: { en: 'Set up quality gates and approval flow for team output', ka: 'დააყენე ხარისხის კონტროლი და დამტკიცების ნაკადი', ru: 'Настрой контроль качества и поток утверждений для командного выхода' } },
    { icon: '📦', text: { en: 'Generate a reusable workflow template for brand content', ka: 'შექმენი მრავალჯერადი workflow შაბლონი ბრენდის კონტენტისთვის', ru: 'Создай переиспользуемый шаблон воркфлоу для контента бренда' } },
  ],
  tourism: [
    { icon: '🗺️', text: { en: 'Create a detailed travel itinerary for Georgian wine region', ka: 'შექმენი დეტალური მოგზაურობის გეგმა საქართველოს ღვინის რეგიონისთვის', ru: 'Создай подробный маршрут по винному региону Грузии' } },
    { icon: '🏔️', text: { en: 'Build a travel promo video script for Tbilisi sightseeing', ka: 'შექმენი თბილისის ტურისტული ვიდეოს სცენარი', ru: 'Создай сценарий промо-видео для достопримечательностей Тбилиси' } },
    { icon: '🌍', text: { en: 'Translate and localize a tourism offer for 3 markets', ka: 'თარგმნე და ლოკალიზე ტურისტული შეთავაზება 3 ბაზრისთვის', ru: 'Переведи и локализуй туристическое предложение для 3 рынков' } },
    { icon: '📸', text: { en: 'Generate a visual travel guide with AI-enhanced photos', ka: 'შექმენი ვიზუალური მოგზაურობის გზამკვლევი AI ფოტოებით', ru: 'Создай визуальный путеводитель с AI-улучшенными фото' } },
  ],
  next: [
    { icon: '🔮', text: { en: 'Research next steps and create an upgrade plan', ka: 'შეისწავლე შემდეგი ნაბიჯები და შექმენი განახლების გეგმა', ru: 'Исследуй следующие шаги и создай план обновления' } },
    { icon: '📋', text: { en: 'Generate a comprehensive project checklist', ka: 'შექმენი სრული პროექტის ჩეკლისტი', ru: 'Создай полный чеклист проекта' } },
    { icon: '🚀', text: { en: 'Create an export brief for handoff to team', ka: 'შექმენი ექსპორტის ბრიფი გუნდისთვის გადასაცემად', ru: 'Создай экспортный бриф для передачи команде' } },
    { icon: '💡', text: { en: 'Brainstorm ideas and validate with market data', ka: 'მოიფიქრე იდეები და შეამოწმე ბაზრის მონაცემებით', ru: 'Придумай идеи и валидируй рыночными данными' } },
  ],
  'agent-g': [
    { icon: '🤖', text: { en: 'Plan and execute a multi-service creative pipeline', ka: 'დაგეგმე და შეასრულე მულტი-სერვისის კრეატიული პაიპლაინი', ru: 'Спланируй и выполни мульти-сервисный креативный пайплайн' } },
    { icon: '🎯', text: { en: 'Run quality check on all my generated assets', ka: 'გაუკეთე ხარისხის შემოწმება ყველა ჩემს შექმნილ ასეტს', ru: 'Проведи проверку качества всех моих сгенерированных ассетов' } },
    { icon: '📦', text: { en: 'Bundle my assets into a production-ready delivery pack', ka: 'შეკრიბე ჩემი ასეტები production-ready მიწოდების პაკეტში', ru: 'Собери мои ассеты в готовый к продакшену пакет' } },
    { icon: '⚡', text: { en: 'Execute a full brand content creation workflow', ka: 'შეასრულე სრული ბრენდის კონტენტის შექმნის ნაკადი', ru: 'Выполни полный воркфлоу создания контента бренда' } },
  ],
};

function PremiumCard({ title, className = '', children }: PremiumCardProps) {
  return (
    <div className={`rounded-xl p-3 space-y-2 ${className}`.trim()} style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {title ? <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{title}</p> : null}
      {children}
    </div>
  );
}

function OptionChip({ active, label, onClick }: OptionChipProps) {
  return (
    <button
      onClick={onClick}
      className='px-2 py-1 text-[11px] rounded-full transition-colors min-h-[34px] sm:min-h-[30px] px-2.5 sm:px-2'
      style={active ? { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' } : { backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
    >
      {label}
    </button>
  );
}

function GoldCTAButton({ label, disabled, onClick }: GoldCTAButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="order-4 sm:order-none w-full sm:w-auto max-md:[@media(orientation:landscape)]:w-auto flex-shrink-0 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
    >
      {label}
    </button>
  );
}

function buildSectionPrompt(locale: string, serviceName: string, sectionTitle: string) {
  if (locale === 'ka') {
    return `${serviceName}: გამოიყენე "${sectionTitle}" სექცია და შექმენი დეტალური ნაბიჯ-ნაბიჯ შედეგი.`;
  }
  if (locale === 'ru') {
    return `${serviceName}: используй секцию "${sectionTitle}" и создай пошаговый детальный результат.`;
  }
  return `${serviceName}: use the "${sectionTitle}" section and produce a detailed step-by-step output.`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function UnifiedServiceLayout({
  serviceId,
  serviceName,
  serviceIcon,
  agentId,
  locale,
  features,
  description,
  onAuthRequired,
  isAuthenticated = false,
  demoMode = false,
}: UnifiedServiceLayoutProps) {
  const t = T[(locale as LocaleCode)] ?? T['en']!;
  const quickActions = QUICK_ACTIONS[serviceId] ?? QUICK_ACTIONS['agent-g']!;

  // ─── State ───────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const [retryingArtifactPrompt, setRetryingArtifactPrompt] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressState | null>(null);
  const [downloadMetrics, setDownloadMetrics] = useState<Record<string, DownloadMetric>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [cameraCaptureBusy, setCameraCaptureBusy] = useState(false);
  const [chatInputFocused, setChatInputFocused] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [landingPresetNote, setLandingPresetNote] = useState<string | null>(null);
  const [importedAvatarUrl, setImportedAvatarUrl] = useState<string | null>(null);
  const [avatarImporting, setAvatarImporting] = useState(false);
  const [avatarImportNotice, setAvatarImportNotice] = useState<string | null>(null);
  const [avatarProfile, setAvatarProfile] = useState<AvatarBuilderProfile>({
    heightCm: '',
    weightKg: '',
    footSize: '',
    scanTarget: 'fullbody',
    faceRecognition: true,
    renderProfile: 'realistic',
  });
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  const [optionsPanelTab, setOptionsPanelTab] = useState<'pipeline' | 'params' | 'builder' | 'sections'>('params');
  const [userMode, setUserMode] = useState<'beginner' | 'advanced'>('beginner');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const serviceContext = SERVICE_CONTEXT[serviceId] ?? 'global';
  const optionSets = SERVICE_OPTION_SETS[serviceId] ?? SERVICE_OPTION_SETS[serviceContext] ?? SERVICE_OPTION_SETS['global']!;
  const workspacePresets = SERVICE_PRESETS[serviceId] ?? SERVICE_PRESETS[serviceContext] ?? SERVICE_PRESETS['global']!;
  const workspaceSections = SERVICE_WORKSPACE_SECTIONS[serviceId] ?? SERVICE_WORKSPACE_SECTIONS[serviceContext] ?? SERVICE_WORKSPACE_SECTIONS['global']!;
  const serviceBackground = SERVICE_BACKGROUNDS[serviceId] ?? SERVICE_BACKGROUNDS['agent-g']!;
  const serviceBackgroundImage = SERVICE_BACKGROUND_IMAGES[serviceId] ?? SERVICE_BACKGROUND_IMAGES['agent-g']!;
  const agentButtonLabel = `${t.useAgent} — ${serviceName}`;
  const contract = SERVICE_CONTRACTS[serviceId];
  const catalogPresets = (CATALOG_PRESETS[serviceId] ?? []).filter(
    p => p.mode === 'both' || p.mode === userMode
  );
  const workspaceFlowLabels = [
    locale === 'ka' ? 'Prompt' : locale === 'ru' ? 'Промпт' : 'Prompt',
    locale === 'ka' ? 'გენერაცია' : locale === 'ru' ? 'Генерация' : 'Generation',
    locale === 'ka' ? 'რევიუ' : locale === 'ru' ? 'Ревью' : 'Review',
    locale === 'ka' ? 'ექსპორტი' : locale === 'ru' ? 'Экспорт' : 'Export',
  ];

  useEffect(() => {
    const defaults: Record<string, string> = {};
    optionSets.forEach((set) => {
      defaults[set.key] = set.values[0] ?? '';
    });
    setSelectedOptions(defaults);
  }, [serviceId, optionSets]);

  useEffect(() => {
    setActiveSectionId(workspaceSections[0]?.id ?? '');
  }, [serviceId, workspaceSections]);

  useEffect(() => {
    if (serviceContext !== 'avatar') return;
    setAvatarProfile((prev) => ({
      ...prev,
      scanTarget: 'fullbody',
      faceRecognition: true,
      renderProfile: 'realistic',
    }));
  }, [serviceContext, serviceId]);

  useEffect(() => {
    const prompt = searchParams.get('prompt');
    const section = searchParams.get('section');
    const optionsRaw = searchParams.get('options');

    let applied = false;

    if (prompt) {
      setInput(prompt);
      applied = true;
    }

    if (section) {
      const found = workspaceSections.find((item) => item.id === section);
      if (found) {
        setActiveSectionId(found.id);
        applied = true;
      }
    }

    if (optionsRaw) {
      const parsed = parseOptionsParam(optionsRaw);
      const optionKeySet = new Set(optionSets.map((set) => set.key));
      const filtered = Object.entries(parsed).filter(([key]) => optionKeySet.has(key));
      if (filtered.length) {
        setSelectedOptions((prev) => ({
          ...prev,
          ...Object.fromEntries(filtered),
        }));
        applied = true;
      }
    }

    if (applied) {
      setLandingPresetNote(t.loadedPreset ?? 'Preset from landing applied');
      promptInputRef.current?.focus();
    }
  }, [searchParams, optionSets, workspaceSections, t.loadedPreset]);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraOn) return;
    if (!cameraVideoRef.current) return;
    if (!cameraStreamRef.current) return;
    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    cameraVideoRef.current.play().catch(() => undefined);
  }, [cameraOn]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement && chatPanelRef.current && document.fullscreenElement.contains(chatPanelRef.current));
      setChatFullscreen(isFullscreen);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleChatFullscreen = useCallback(async () => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await panel.requestFullscreen();
  }, []);

  const activeSection = workspaceSections.find((section) => section.id === activeSectionId) ?? workspaceSections[0] ?? null;
  const selectionCoverage = optionSets.length
    ? Math.round((Object.values(selectedOptions).filter(Boolean).length / optionSets.length) * 100)
    : 0;
  const sectionReadiness = activeSection?.metric ?? 0;
  const completionScore = Math.round((selectionCoverage * 0.55) + (sectionReadiness * 0.45));

  const broadcastAvatarUpdate = useCallback((url: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('GENERATED_AVATAR_URL', url);
      localStorage.setItem('GENERATED_AVATAR_TIMESTAMP', new Date().toISOString());
      window.dispatchEvent(new CustomEvent('generated-avatar-updated', { detail: { url } }));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const importReadyAvatar = useCallback(async () => {
    setAvatarImporting(true);
    setAvatarImportNotice(null);

    try {
      // 1) Fast local cache path
      if (typeof window !== 'undefined') {
        const cachedUrl = localStorage.getItem('GENERATED_AVATAR_URL');
        if (cachedUrl) {
          setImportedAvatarUrl(cachedUrl);
          setPreviewArtifact({
            type: 'image',
            url: cachedUrl,
            label: locale === 'ka' ? 'შემოტანილი ავატარი' : locale === 'ru' ? 'Импортированный аватар' : 'Imported Avatar',
            mimeType: 'image/jpeg',
            generationStatus: 'succeeded',
          });
          setAvatarImportNotice(t.avatarImported ?? 'Avatar imported and ready in this service');
          return;
        }
      }

      // 2) Auth core avatar endpoint
      const coreRes = await fetch('/api/avatar/core', { method: 'GET' }).catch(() => null);
      if (coreRes?.ok) {
        const coreJson = await coreRes.json().catch(() => null) as {
          data?: { status?: string; poster_url?: string | null; model_glb_url?: string | null };
        } | null;
        const coreData = coreJson?.data;
        const coreUrl = coreData?.poster_url || coreData?.model_glb_url || null;
        if (coreData?.status === 'ready' && coreUrl) {
          setImportedAvatarUrl(coreUrl);
          if (coreData.poster_url) {
            setPreviewArtifact({
              type: 'image',
              url: coreData.poster_url,
              label: locale === 'ka' ? 'Core ავატარი' : locale === 'ru' ? 'Core аватар' : 'Core Avatar',
              mimeType: 'image/jpeg',
              generationStatus: 'succeeded',
            });
          }
          setAvatarImportNotice(t.avatarImported ?? 'Avatar imported and ready in this service');
          return;
        }
      }

      // 3) Owner-based latest avatar endpoint (auth or anon)
      const ownerId = await getOwnerId();
      const latestRes = await fetch(`/api/avatars/latest?owner_id=${encodeURIComponent(ownerId)}`);
      if (latestRes.ok) {
        const latestJson = await latestRes.json() as {
          data?: {
            avatar?: {
              preview_image_url?: string | null;
              model_url?: string | null;
            } | null;
          };
        };
        const avatar = latestJson?.data?.avatar;
        const latestUrl = avatar?.preview_image_url || avatar?.model_url || null;
        if (latestUrl) {
          setImportedAvatarUrl(latestUrl);
          if (avatar?.preview_image_url) {
            setPreviewArtifact({
              type: 'image',
              url: avatar.preview_image_url,
              label: locale === 'ka' ? 'შემოტანილი ავატარი' : locale === 'ru' ? 'Импортированный аватар' : 'Imported Avatar',
              mimeType: 'image/jpeg',
              generationStatus: 'succeeded',
            });
          }
          setAvatarImportNotice(t.avatarImported ?? 'Avatar imported and ready in this service');
          return;
        }
      }

      setAvatarImportNotice(t.avatarImportFailed ?? 'No ready avatar found. Create one in Avatar service first.');
    } catch {
      setAvatarImportNotice(t.avatarImportFailed ?? 'No ready avatar found. Create one in Avatar service first.');
    } finally {
      setAvatarImporting(false);
    }
  }, [locale, t.avatarImportFailed, t.avatarImported]);

  const generationStartedLabel = locale === 'ka'
    ? 'გენერაცია დაიწყო, დაელოდე რამდენიმე წამი...'
    : locale === 'ru'
      ? 'Генерация запущена, подождите несколько секунд...'
      : 'Generation started, please wait a few seconds...';
  const generationCompleteLabel = locale === 'ka'
    ? 'გენერაცია დასრულდა ✅'
    : locale === 'ru'
      ? 'Генерация завершена ✅'
      : 'Generation completed ✅';
  const generationFailedLabel = locale === 'ka'
    ? 'გენერაცია ვერ დასრულდა. ხელახლა სცადე.'
    : locale === 'ru'
      ? 'Генерация не завершилась. Повторите попытку.'
      : 'Generation did not complete. Please retry.';

  const generationStageLabel = generationProgress?.stage === 'starting'
    ? (locale === 'ka' ? 'დაწყება' : locale === 'ru' ? 'Запуск' : 'Starting')
    : generationProgress?.stage === 'polling'
      ? (locale === 'ka' ? 'მიმდინარეობს' : locale === 'ru' ? 'Выполняется' : 'In progress')
      : generationProgress?.stage === 'finalizing'
        ? (locale === 'ka' ? 'დასრულება' : locale === 'ru' ? 'Финализация' : 'Finalizing')
        : generationProgress?.stage === 'done'
          ? t.ready
          : generationProgress?.stage === 'failed'
            ? (locale === 'ka' ? 'შეცდომა' : locale === 'ru' ? 'Ошибка' : 'Failed')
            : '';

  const decorateGeneratedArtifacts = useCallback((artifacts: Artifact[], prompt: string, context: ServiceContext, status: 'succeeded' | 'failed'): Artifact[] => {
    return artifacts.map((artifact) => ({
      ...artifact,
      generationStatus: status,
      generationPrompt: prompt,
      generationContext: context,
    }));
  }, []);

  const runDirectGeneration = useCallback(async (prompt: string, context: ServiceContext) => {
    setGenerationProgress({ percent: 8, stage: 'starting', context });

    const endpoint = resolveReplicateEndpoint(context);
    const statusArtifact: Artifact = {
      type: 'text',
      label: locale === 'ka' ? 'გენერაციის სტატუსი' : locale === 'ru' ? 'Статус генерации' : 'Generation status',
      content: generationStartedLabel,
      mimeType: 'text/plain',
      generationStatus: 'running',
      generationPrompt: prompt,
      generationContext: context,
    };

    setMessages(prev => [...prev, {
      id: `msg_${Date.now()}_gen_wait`,
      role: 'assistant',
      content: generationStartedLabel,
      artifacts: [statusArtifact],
      timestamp: new Date(),
    }]);

    try {
      const startRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          quality: selectedOptions.quality?.toLowerCase(),
          variant: selectedOptions.style?.toLowerCase() || selectedOptions.variant?.toLowerCase(),
          style: selectedOptions.style?.toLowerCase(),
          aspectRatio: selectedOptions.ratio || selectedOptions.aspectRatio,
        }),
      });
      const startData = await startRes.json() as {
        // New NormalizedOutput shape from direct routes
        success?: boolean;
        url?: string | null;
        service?: string;
        outputType?: string;
        model?: string;
        text?: string;
        error?: string;
        metadata?: { predictionId?: string; durationMs?: number; [key: string]: unknown };
        // Legacy shape from /api/replicate/generate
        id?: string;
        status?: string;
        message?: string;
        output?: unknown;
      };

      if (!startRes.ok) {
        throw new Error(startData.error ?? startData.message ?? 'Generation start failed');
      }

      if (startData.status === 'throttled' || startData.status === 'model_unavailable') {
        setGenerationProgress({ percent: 100, stage: 'failed', context });
        const hint = startData.message ?? startData.error ?? generationFailedLabel;
        const retryAfterSeconds = extractRetryAfterSeconds(hint);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}_gen_hint`,
          role: 'assistant',
          content: hint,
          artifacts: decorateGeneratedArtifacts([{
            type: 'text',
            label: locale === 'ka' ? 'გენერაცია ვერ შესრულდა' : locale === 'ru' ? 'Ошибка генерации' : 'Generation failed',
            content: hint,
            mimeType: 'text/plain',
          }], prompt, context, 'failed'),
          timestamp: new Date(),
        }]);
        return;
      }

      // ── Handle NormalizedOutput (from new direct avatar/image routes) ──
      if (startData.success && startData.url) {
        setGenerationProgress({ percent: 96, stage: 'finalizing', context });
        const artType = startData.outputType === 'video' ? 'video' as const
          : startData.outputType === 'audio' ? 'audio' as const
          : 'image' as const;
        const directArtifacts = decorateGeneratedArtifacts([{
          type: artType,
          url: startData.url,
          label: artType === 'image' && context === 'avatar' ? 'Generated Avatar' : 'Generated Image',
          mimeType: artType === 'image' ? 'image/*' : artType === 'video' ? 'video/*' : 'audio/*',
        }], prompt, context, 'succeeded');

        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}_direct_artifact`,
          role: 'assistant',
          content: generationCompleteLabel,
          artifacts: directArtifacts,
          timestamp: new Date(),
        }]);
        setPreviewArtifact(directArtifacts[0]!);

        if (context === 'avatar' && directArtifacts[0]?.url) {
          broadcastAvatarUpdate(directArtifacts[0].url);
        }
        setGenerationProgress({ percent: 100, stage: 'done', context });
        return;
      }

      // ── Handle NormalizedOutput with error ──
      if (startData.success === false && startData.error) {
        throw new Error(startData.error);
      }

      // ── Legacy flow: predictionId-based polling ──
      const predictionId = startData.id || startData.metadata?.predictionId;
      if (!predictionId) {
        if (startData.output) {
          setGenerationProgress({ percent: 96, stage: 'finalizing', context });
          const directArtifacts = decorateGeneratedArtifacts(mapOutputToArtifacts(context, startData.output), prompt, context, 'succeeded');
          if (directArtifacts.length) {
            setMessages(prev => [...prev, {
              id: `msg_${Date.now()}_direct_artifact`,
              role: 'assistant',
              content: generationCompleteLabel,
              artifacts: directArtifacts,
              timestamp: new Date(),
            }]);
            setPreviewArtifact(directArtifacts[0]!);

            if (context === 'avatar' && directArtifacts[0]?.url) {
              broadcastAvatarUpdate(directArtifacts[0].url);
            }
          }
          setGenerationProgress({ percent: 100, stage: 'done', context });
          return;
        }
        throw new Error(generationFailedLabel);
      }

      let finalArtifacts: Artifact[] = [];
      for (let attempt = 0; attempt < 16; attempt += 1) {
        setGenerationProgress({
          percent: Math.min(92, 14 + (attempt * 5)),
          stage: 'polling',
          context,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const pollRes = await fetch('/api/replicate/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ predictionId }),
        });
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json() as { status?: string; output?: unknown; error?: string };
        if (pollData.status === 'succeeded') {
          finalArtifacts = decorateGeneratedArtifacts(mapOutputToArtifacts(context, pollData.output), prompt, context, 'succeeded');
          break;
        }
        if (pollData.status === 'failed' || pollData.error) {
          throw new Error(pollData.error ?? generationFailedLabel);
        }
      }

      if (!finalArtifacts.length) {
        throw new Error(generationFailedLabel);
      }

      setGenerationProgress({ percent: 97, stage: 'finalizing', context });

      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_gen_done`,
        role: 'assistant',
        content: generationCompleteLabel,
        artifacts: finalArtifacts,
        timestamp: new Date(),
      }]);
      setPreviewArtifact(finalArtifacts[0]!);

      // Save avatar to localStorage for homepage display
      if (context === 'avatar' && finalArtifacts.length > 0 && finalArtifacts[0]?.url) {
        broadcastAvatarUpdate(finalArtifacts[0].url);
      }

      setGenerationProgress({ percent: 100, stage: 'done', context });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : generationFailedLabel;
      setGenerationProgress({ percent: 100, stage: 'failed', context });
      const loweredError = errorText.toLowerCase();
      if (loweredError.includes('throttled') || loweredError.includes('rate limit') || loweredError.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(errorText);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      }

      const failedArtifacts = decorateGeneratedArtifacts([{
        type: 'text',
        label: locale === 'ka' ? 'გენერაცია ვერ შესრულდა' : locale === 'ru' ? 'Ошибка генерации' : 'Generation failed',
        content: errorText,
        mimeType: 'text/plain',
      }], prompt, context, 'failed');

      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_gen_fail`,
        role: 'assistant',
        content: errorText,
        artifacts: failedArtifacts,
        timestamp: new Date(),
      }]);
    }
  }, [broadcastAvatarUpdate, decorateGeneratedArtifacts, generationCompleteLabel, generationFailedLabel, generationStartedLabel, locale, selectedOptions, t.retryNotice, t.seconds]);

  const retryArtifactGeneration = useCallback(async (artifact: Artifact) => {
    if (!artifact.generationPrompt) return;
    const context = artifact.generationContext ?? serviceContext;
    if (!['avatar', 'video', 'music', 'image', 'photo', 'visual-ai'].includes(context)) return;

    setRetryingArtifactPrompt(artifact.generationPrompt);
    try {
      await runDirectGeneration(artifact.generationPrompt, context);
    } finally {
      setRetryingArtifactPrompt(null);
    }
  }, [runDirectGeneration, serviceContext]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setPreviewArtifact(null);
    setGenerationProgress(null);
    setRateLimitNotice(null);
  }, []);

  const captureFrame = useCallback((scanMode: boolean) => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    if (!cameraOn) {
      setCameraError(locale === 'ka' ? 'კამერა გამორთულია.' : locale === 'ru' ? 'Камера выключена.' : 'Camera is off.');
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCameraError(locale === 'ka' ? 'კამერა იტვირთება, სცადე რამდენიმე წამში.' : locale === 'ru' ? 'Камера загружается, повторите через пару секунд.' : 'Camera is still loading, please retry in a moment.');
      return;
    }
    const width = video.videoWidth || Math.max(960, video.clientWidth * 2);
    const height = video.videoHeight || Math.max(540, video.clientHeight * 2);
    if (width <= 0 || height <= 0) {
      setCameraError(locale === 'ka' ? 'კადრი ჯერ მზად არ არის.' : locale === 'ru' ? 'Кадр пока не готов.' : 'Frame is not ready yet.');
      return;
    }

    setCameraCaptureBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setCameraError(locale === 'ka' ? 'კადრის დაფიქსირება ვერ მოხერხდა.' : locale === 'ru' ? 'Не удалось захватить кадр.' : 'Unable to capture camera frame.');
        return;
      }
      if (avatarProfile.renderProfile === 'cinematic') {
        ctx.filter = 'contrast(1.12) saturate(1.08) brightness(0.96)';
      } else if (avatarProfile.renderProfile === 'anime') {
        ctx.filter = 'contrast(1.18) saturate(1.22) brightness(1.02)';
      } else if (avatarProfile.renderProfile === 'studio') {
        ctx.filter = 'contrast(1.08) saturate(1.02) brightness(1.03)';
      } else {
        ctx.filter = 'none';
      }

      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCameraError(null);

      const scanTargetLabel = avatarProfile.scanTarget === 'fullbody'
        ? (locale === 'ka' ? 'სრული ტანი' : locale === 'ru' ? 'полное тело' : 'Full Body')
        : (locale === 'ka' ? 'სახე' : locale === 'ru' ? 'Лицо' : 'Face');

      const artifact: Artifact = {
        type: 'image',
        url: dataUrl,
        label: scanMode
          ? `${serviceName} ${scanTargetLabel} Scan (${avatarProfile.renderProfile})`
          : `${serviceName} Camera Capture`,
        mimeType: 'image/jpeg',
        generationStatus: 'succeeded',
      };

      setPreviewArtifact(artifact);
      const scanPrompt = buildScanPrompt(
        locale,
        serviceName,
        serviceContext,
        avatarProfile.scanTarget,
        avatarProfile.renderProfile,
        avatarProfile.faceRecognition,
      );
      setInput((prev) => {
        if (scanMode) {
          const spec = serviceContext === 'avatar' ? buildAvatarSpecSuffix(locale, avatarProfile) : '';
          const combined = `${scanPrompt}${spec}`;
          return prev ? `${prev}\n${combined}` : combined;
        }
        const note = locale === 'ka'
          ? '[კამერის კადრი დაფიქსირდა]'
          : locale === 'ru'
            ? '[Кадр с камеры сохранён]'
            : '[Camera frame captured]';
        return prev ? `${prev} ${note}` : note;
      });

      if (scanMode) {
        const scanHintMessage = t.scanHint ?? 'Frame captured. Adjust prompt and send when ready.';
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}_scan_frame`,
          role: 'assistant',
          content: scanHintMessage,
          artifacts: [artifact],
          timestamp: new Date(),
        }]);
      }
    } finally {
      setCameraCaptureBusy(false);
    }
  }, [avatarProfile, cameraOn, locale, serviceContext, serviceName, t.scanHint]);

  const downloadArtifact = useCallback(async (artifact: Artifact) => {
    if (!artifact.url) return;
    const url = artifact.url;

    setDownloadMetrics(prev => ({
      ...prev,
      [url]: {
        status: 'downloading',
        percent: 2,
        receivedBytes: 0,
        totalBytes: null,
      },
    }));

    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        window.open(url, '_blank', 'noopener,noreferrer');
        setDownloadMetrics(prev => ({
          ...prev,
          [url]: {
            status: 'complete',
            percent: 100,
            receivedBytes: 0,
            totalBytes: null,
          },
        }));
        return;
      }

      const reader = response.body.getReader();
      const totalHeader = response.headers.get('content-length');
      const totalBytes = totalHeader ? Number(totalHeader) : null;
      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        receivedBytes += value.length;
        const percent = totalBytes ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 75;
        setDownloadMetrics(prev => ({
          ...prev,
          [url]: {
            status: 'downloading',
            percent,
            receivedBytes,
            totalBytes,
          },
        }));
      }

      const blobParts = chunks.map((chunk) => chunk.buffer as ArrayBuffer);
      const blob = new Blob(blobParts, { type: artifact.mimeType || 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filenameBase = artifact.label?.trim().replace(/\s+/g, '-').toLowerCase() || 'asset';
      a.href = blobUrl;
      a.download = `${filenameBase}.${extensionForArtifact(artifact)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      setDownloadMetrics(prev => ({
        ...prev,
        [url]: {
          status: 'complete',
          percent: 100,
          receivedBytes: receivedBytes || (totalBytes ?? 0),
          totalBytes,
        },
      }));
    } catch {
      setDownloadMetrics(prev => ({
        ...prev,
        [url]: {
          status: 'failed',
          percent: 100,
          receivedBytes: prev[url]?.receivedBytes ?? 0,
          totalBytes: prev[url]?.totalBytes ?? null,
        },
      }));
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // ─── Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    const selectedOptionEntries = Object.entries(selectedOptions).filter(([, value]) => value);
    const optionsSuffix = selectedOptionEntries.length
      ? `\nOptions: ${selectedOptionEntries.map(([key, value]) => `${key}=${value}`).join('; ')}`
      : '';
    const sectionSuffix = activeSection
      ? `\nSection: ${activeSection.title} (${activeSection.steps.join(' > ')})`
      : '';
    const avatarSuffix = serviceContext === 'avatar' ? buildAvatarSpecSuffix(locale, avatarProfile) : '';
    const importedAvatarSuffix = importedAvatarUrl
      ? `\nImported Avatar URL: ${importedAvatarUrl}`
      : '';
    const finalMessage = `${msg}${optionsSuffix}${sectionSuffix}${avatarSuffix}${importedAvatarSuffix}`;

    if (!demoMode && !isAuthenticated) {
      setShowLoginModal(true);
      onAuthRequired?.();
      return;
    }

    setInput('');
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: finalMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setSending(true);

    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // ── Unified orchestration call ──────────────────────────────────
      const res = await fetch('/api/chat/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          serviceContext,
          agentId,
          locale,
          history,
          selectedOptions,
          imageUrl: importedAvatarUrl || undefined,
          serviceId,
          demoMode,
          metadata: {
            serviceId,
            activeSectionId,
            completionScore,
          },
        }),
      });

      const chatResp = await res.json() as {
        success?: boolean;
        intent?: string;
        responseType?: string;
        message?: string;
        assetUrl?: string | null;
        assetType?: string;
        predictionId?: string;
        predictionStatus?: string;
        metadata?: Record<string, unknown>;
        // Legacy fallback fields
        data?: { response?: string; artifacts?: Artifact[] };
        response?: string;
        error?: string;
      };

      if (!res.ok && !chatResp.success) {
        throw new Error(chatResp.error || chatResp.message || 'Request failed');
      }

      // ── Extract reply text ──────────────────────────────────────────
      const reply = chatResp.message || chatResp.data?.response || chatResp.response || 'Processing…';

      // ── Check throttle / rate limit ─────────────────────────────────
      const loweredReply = reply.toLowerCase();
      if (loweredReply.includes('throttled') || loweredReply.includes('rate limit') || loweredReply.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(reply);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      } else {
        setRateLimitNotice(null);
      }

      // ── Build assistant message ─────────────────────────────────────
      const assistantArtifacts: Artifact[] = [];

      // If an asset URL came back immediately (sync model), create artifact
      if (chatResp.assetUrl) {
        const artType = chatResp.responseType === 'video' ? 'video'
          : chatResp.responseType === 'audio' ? 'audio'
          : chatResp.responseType === 'analysis' ? 'text'
          : 'image';
        assistantArtifacts.push({
          type: artType,
          url: chatResp.assetUrl,
          label: reply,
          mimeType: artType === 'image' ? 'image/*' : artType === 'video' ? 'video/*' : artType === 'audio' ? 'audio/*' : 'text/plain',
          ...(artType === 'text' ? { content: reply } : {}),
        });
      }

      // Add any legacy artifacts from the response
      const legacyArtifacts = chatResp.data?.artifacts;
      if (legacyArtifacts?.length) {
        assistantArtifacts.push(...legacyArtifacts);
      }

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_reply`,
        role: 'assistant',
        content: reply,
        artifacts: assistantArtifacts.length ? assistantArtifacts : undefined,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (assistantArtifacts.length) {
        setPreviewArtifact(assistantArtifacts[0]!);
      }

      // ── If prediction is async, poll for result ─────────────────────
      if (chatResp.predictionId && chatResp.predictionStatus !== 'succeeded') {
        setGenerationProgress({ percent: 10, stage: 'starting', context: serviceContext });

        let finalArtifacts: Artifact[] = [];
        for (let attempt = 0; attempt < 30; attempt += 1) {
          setGenerationProgress({
            percent: Math.min(92, 14 + attempt * 2.8),
            stage: 'polling',
            context: serviceContext,
          });
          await new Promise((r) => setTimeout(r, 2000));

          const pollRes = await fetch('/api/chat/orchestrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: msg,
              serviceContext,
              predictionId: chatResp.predictionId,
            }),
          });
          if (!pollRes.ok) continue;

          const pollData = await pollRes.json() as {
            predictionStatus?: string;
            assetUrl?: string | null;
            message?: string;
            responseType?: string;
          };

          if (pollData.predictionStatus === 'succeeded') {
            const artType = pollData.responseType === 'video' ? 'video'
              : pollData.responseType === 'audio' ? 'audio'
              : pollData.responseType === 'analysis' ? 'text'
              : 'image';

            if (pollData.assetUrl) {
              finalArtifacts = decorateGeneratedArtifacts([{
                type: artType,
                url: pollData.assetUrl,
                label: pollData.message || generationCompleteLabel,
                mimeType: artType === 'image' ? 'image/*' : artType === 'video' ? 'video/*' : artType === 'audio' ? 'audio/*' : 'text/plain',
              }], msg, serviceContext, 'succeeded');
            } else if (pollData.message && artType === 'text') {
              finalArtifacts = decorateGeneratedArtifacts([{
                type: 'text',
                label: 'AI Analysis',
                content: pollData.message,
                mimeType: 'text/plain',
              }], msg, serviceContext, 'succeeded');
            }
            break;
          }

          if (pollData.predictionStatus === 'failed' || pollData.predictionStatus === 'error') {
            throw new Error(pollData.message || generationFailedLabel);
          }
        }

        if (finalArtifacts.length) {
          setGenerationProgress({ percent: 97, stage: 'finalizing', context: serviceContext });
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}_gen_done`,
            role: 'assistant',
            content: generationCompleteLabel,
            artifacts: finalArtifacts,
            timestamp: new Date(),
          }]);
          setPreviewArtifact(finalArtifacts[0]!);

          if (serviceContext === 'avatar' && finalArtifacts[0]?.url) {
            broadcastAvatarUpdate(finalArtifacts[0].url);
          }
          setGenerationProgress({ percent: 100, stage: 'done', context: serviceContext });
        } else {
          setGenerationProgress({ percent: 100, stage: 'failed', context: serviceContext });
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}_gen_timeout`,
            role: 'assistant',
            content: generationFailedLabel,
            artifacts: decorateGeneratedArtifacts([{
              type: 'text',
              label: locale === 'ka' ? 'დრო ამოიწურა' : locale === 'ru' ? 'Тайм-аут' : 'Timed out',
              content: generationFailedLabel,
              mimeType: 'text/plain',
            }], msg, serviceContext, 'failed'),
            timestamp: new Date(),
          }]);
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Unknown error';
      const loweredError = errorText.toLowerCase();
      if (loweredError.includes('throttled') || loweredError.includes('rate limit') || loweredError.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(errorText);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      }

      setGenerationProgress(prev => prev ? { ...prev, percent: 100, stage: 'failed' } : null);
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: `Error: ${errorText}`,
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, demoMode, isAuthenticated, selectedOptions, activeSection, activeSectionId, completionScore, agentId, avatarProfile, importedAvatarUrl, locale, serviceId, serviceContext, messages, onAuthRequired, t.retryNotice, t.seconds, broadcastAvatarUpdate, decorateGeneratedArtifacts, generationCompleteLabel, generationFailedLabel]);

  // ─── File upload ─────────────────────────────────────────────────────────
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const names = Array.from(files).map(f => f.name).join(', ');
    setInput(prev => `${prev} [Files: ${names}]`);
  };

  // ─── Drag & Drop ────────────────────────────────────────────────────────
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length) {
      const names = Array.from(files).map(f => f.name).join(', ');
      setInput(prev => `${prev} [Dropped: ${names}]`);
    }
  };

  // ─── Voice recording (STT UI) ───────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length) {
          setInput(prev => `${prev} [Voice message recorded]`);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      // Microphone not available
    }
  };

  const toggleCamera = async () => {
    if (cameraOn) {
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }
      setCameraOn(false);
      return;
    }

    try {
      if (!window.isSecureContext) {
        setCameraError(locale === 'ka'
          ? 'კამერისთვის საჭიროა უსაფრთხო (HTTPS) გარემო.'
          : locale === 'ru'
            ? 'Для камеры требуется защищённое соединение (HTTPS).'
            : 'Camera requires a secure HTTPS context.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(locale === 'ka'
          ? 'ამ ბრაუზერში კამერა არ არის მხარდაჭერილი.'
          : locale === 'ru'
            ? 'Камера не поддерживается в этом браузере.'
            : 'Camera is not supported in this browser.');
        return;
      }

      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: avatarProfile.scanTarget === 'fullbody' ? 1920 : 1280 },
          height: { ideal: avatarProfile.scanTarget === 'fullbody' ? 1080 : 960 },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.onloadedmetadata = () => {
          cameraVideoRef.current?.play().catch(() => undefined);
        };
      }
      setCameraOn(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const denied = /denied|permission|notallowed/i.test(message);
      setCameraError(locale === 'ka'
        ? denied
          ? 'კამერის ნებართვა უარყოფილია. გადაამოწმე ბრაუზერის ნებართვები.'
          : 'კამერაზე წვდომა ვერ მოხერხდა.'
        : locale === 'ru'
          ? denied
            ? 'Доступ к камере запрещён. Проверьте разрешения браузера.'
            : 'Не удалось получить доступ к камере.'
          : denied
            ? 'Camera permission was denied. Please check browser permissions.'
            : 'Unable to access camera.');
    }
  };

  const previewDownloadMetric = previewArtifact?.url ? downloadMetrics[previewArtifact.url] : undefined;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 px-3 sm:px-5 lg:px-6 py-4 sm:py-5" style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--nav-bg)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-[94rem] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(139,92,246,0.8))', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}>
              <span className="text-xl sm:text-2xl filter drop-shadow">{serviceIcon}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{serviceName}</h1>
                <AgentBadge serviceSlug={serviceId} locale={locale} size="sm" />
              </div>
              <p className="text-xs truncate max-w-xs sm:max-w-md" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {demoMode && (
              <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
                Demo
              </span>
            )}
            {/* Input/Output type badges (advanced mode) */}
            {userMode === 'advanced' && contract && (
              <div className="hidden md:flex items-center gap-1.5">
                <span className="px-2 py-0.5 text-[10px] rounded-md" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
                  {t.inputTypes}: {contract.inputTypes.slice(0, 2).join(', ')}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>→</span>
                <span className="px-2 py-0.5 text-[10px] rounded-md" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
                  {t.outputTypes}: {contract.outputTypes.slice(0, 2).join(', ')}
                </span>
              </div>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 rounded-lg transition-colors"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}
              title={t.history}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            </button>
            <button
              onClick={() => setShowExport(!showExport)}
              className="p-2 rounded-lg transition-colors"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}
              title={t.export}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button
              onClick={toggleChatFullscreen}
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
              title={chatFullscreen ? t.exitFullscreen : t.fullscreen}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{chatFullscreen ? <><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></> : <><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></>}</svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mode Toggle + Quick Presets Bar ─────────────────────────────── */}
      <div className="relative z-10 max-w-[94rem] mx-auto px-2 sm:px-3 md:px-4 lg:px-6 pt-2 sm:pt-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          {/* Beginner / Advanced toggle */}
          <div className="flex items-center rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setUserMode('beginner')}
              className="text-[11px] font-medium px-3 py-1.5 transition-all"
              style={{
                color: userMode === 'beginner' ? '#fff' : 'var(--color-text-tertiary)',
                backgroundColor: userMode === 'beginner' ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {locale === 'ka' ? 'დამწყები' : locale === 'ru' ? 'Базовый' : 'Beginner'}
            </button>
            <button
              onClick={() => setUserMode('advanced')}
              className="text-[11px] font-medium px-3 py-1.5 transition-all"
              style={{
                color: userMode === 'advanced' ? '#fff' : 'var(--color-text-tertiary)',
                backgroundColor: userMode === 'advanced' ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {locale === 'ka' ? 'გაფართოებული' : locale === 'ru' ? 'Продвинутый' : 'Advanced'}
            </button>
          </div>
          {/* Quick preset tags */}
          {catalogPresets.length > 0 && (
            <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
              {catalogPresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setActivePresetId(preset.id);
                    setInput(preset.prompt);
                  }}
                  className="flex-shrink-0 px-3 py-1.5 text-[11px] rounded-full transition-all whitespace-nowrap"
                  style={
                    activePresetId === preset.id
                      ? { backgroundColor: 'var(--color-accent)', color: '#fff', border: '1px solid var(--color-accent)' }
                      : { backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }
                  }
                >
                  {preset.label[locale as 'ka' | 'en' | 'ru'] || preset.label.en}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Layout: Chat (70%) + Preview (30%) ─────────────────────── */}
      <div className={`relative z-10 max-w-[94rem] mx-auto flex flex-col lg:flex-row min-h-[calc(100vh-60px)] sm:min-h-[calc(100vh-64px)] px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 gap-2 lg:gap-3 ${chatFullscreen ? 'max-w-full px-1 sm:px-2 md:px-3 lg:px-3' : ''}`}>

        {/* ── Chat Window (70%) ─────────────────────────────────────────── */}
        <div
          ref={chatPanelRef}
          className="flex-1 lg:w-[68%] flex flex-col rounded-2xl"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 border-2 border-dashed rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent-soft)', borderColor: 'var(--color-accent)' }}>
              <p className="font-semibold" style={{ color: 'var(--color-accent)' }}>{t.dragDrop}</p>
            </div>
          )}

          {/* ── Smart Toolbar: Quick Actions + Options Dropdown ─────────── */}
          <div className="px-3 sm:px-4 pt-3 pb-2.5 rounded-t-2xl space-y-2" style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>

            {/* Row 1: Quick actions + Options button + Clear */}
            <div className="flex items-center gap-2">
              {/* Compact quick action chips — horizontal scroll */}
              <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
                {quickActions.map(action => (
                  <button
                    key={action}
                    onClick={() => sendMessage(action)}
                    className="flex-shrink-0 px-2.5 py-1.5 text-[11px] rounded-full transition-all whitespace-nowrap"
                    style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    {action}
                  </button>
                ))}
              </div>

              {/* Options Dropdown Button */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowOptionsPanel(v => !v)}
                  className='flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-xl transition-all select-none'
                  style={showOptionsPanel ? { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' } : { backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                >
                  {/* Settings gear SVG */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                  <span className="hidden sm:inline">{t.workspaceOptions}</span>
                  {/* Score badge */}
                  <span className='inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold' style={completionScore >= 70 ? { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' } : { backgroundColor: 'var(--card-bg)', color: 'var(--color-text-tertiary)' }}>
                    {completionScore}%
                  </span>
                  {/* Chevron */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showOptionsPanel ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                {/* ── Dropdown panel ─────────────────────────────────────── */}
                {showOptionsPanel && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-[55]" onClick={() => setShowOptionsPanel(false)} />

                    <div className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 w-[min(660px,calc(100vw-20px))] z-[60] rounded-2xl backdrop-blur-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-elevated)', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
                      {/* Tab navigation */}
                      <div className="flex" style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                        {([
                          { id: 'pipeline', label: locale === 'ka' ? '⚡ Pipeline' : locale === 'ru' ? '⚡ Pipeline' : '⚡ Pipeline' },
                          { id: 'params',   label: locale === 'ka' ? '🎛 პარამეტრები' : locale === 'ru' ? '🎛 Параметры' : '🎛 Params' },
                          ...(serviceContext === 'avatar' ? [{ id: 'builder', label: '🧬 Builder' }] : []),
                          { id: 'sections', label: locale === 'ka' ? '📐 სექციები' : locale === 'ru' ? '📐 Секции' : '📐 Sections' },
                        ] as { id: string; label: string }[]).map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setOptionsPanelTab(tab.id as typeof optionsPanelTab)}
                            className='flex-1 px-3 py-2.5 text-[11px] font-medium transition-colors border-b-2'
                            style={optionsPanelTab === tab.id ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)' } : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab content */}
                      <div className="p-3 max-h-[58vh] overflow-y-auto space-y-3">

                        {/* ── Pipeline tab ── */}
                        {optionsPanelTab === 'pipeline' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{t.pipelineModes}</p>
                              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: 'var(--color-accent)', border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)' }}>Agent G Premium</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {workspacePresets.map((preset) => (
                                <button
                                  key={preset.id}
                                  onClick={() => { setInput(preset.prompt); setShowOptionsPanel(false); promptInputRef.current?.focus(); }}
                                  className="text-left rounded-xl px-3 py-2.5 transition-all"
                                  style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}
                                >
                                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{preset.title}</p>
                                  <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{preset.prompt}</p>
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => { sendMessage(`${serviceName}: ${t.premiumAction ?? 'Run Premium Pipeline'}. ${t.premiumHint ?? ''}.`); setShowOptionsPanel(false); }}
                              disabled={sending}
                              className="w-full px-4 py-2.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                            >
                              {t.premiumAction ?? 'Run Premium Pipeline'}
                            </button>
                          </div>
                        )}

                        {/* ── Params tab ── */}
                        {optionsPanelTab === 'params' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {optionSets.map((set) => (
                                <div key={set.key} className="rounded-xl p-2.5 space-y-2" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
                                  <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{set.label}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {set.values.map((value) => (
                                      <OptionChip
                                        key={value}
                                        active={selectedOptions[set.key] === value}
                                        label={value}
                                        onClick={() => setSelectedOptions((prev) => ({ ...prev, [set.key]: value }))}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Inline metrics summary */}
                            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}>
                              {[
                                { label: t.optionsCoverage, value: selectionCoverage, bg: 'var(--color-accent)' },
                                { label: t.sectionReadiness, value: sectionReadiness, bg: 'var(--color-accent)' },
                                { label: t.completionScore, value: completionScore, bg: 'var(--color-accent)' },
                              ].map(m => (
                                <div key={m.label} className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                                    <span className="truncate">{m.label}</span>
                                    <span className="ml-1 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{m.value}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${m.value}%`, backgroundColor: m.bg }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Builder tab (avatar only) ── */}
                        {optionsPanelTab === 'builder' && serviceContext === 'avatar' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <label className="text-[11px] space-y-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                <span className="block">{t.avatarHeight}</span>
                                <input type="number" min={120} max={240} value={avatarProfile.heightCm} onChange={(e) => setAvatarProfile((prev) => ({ ...prev, heightCm: e.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--color-text)' }} placeholder="172" />
                              </label>
                              <label className="text-[11px] space-y-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                <span className="block">{t.avatarWeight}</span>
                                <input type="number" min={30} max={220} value={avatarProfile.weightKg} onChange={(e) => setAvatarProfile((prev) => ({ ...prev, weightKg: e.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--color-text)' }} placeholder="68" />
                              </label>
                              <label className="text-[11px] space-y-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                <span className="block">{t.avatarFootSize}</span>
                                <input type="number" min={20} max={55} step={0.5} value={avatarProfile.footSize} onChange={(e) => setAvatarProfile((prev) => ({ ...prev, footSize: e.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--color-text)' }} placeholder="42" />
                              </label>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="rounded-xl p-2.5" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}>
                                <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>{t.avatarScanMode}</p>
                                <div className="flex gap-2">
                                  <OptionChip active={avatarProfile.scanTarget === 'fullbody'} label={t.avatarFullBody ?? 'Full Body'} onClick={() => setAvatarProfile((prev) => ({ ...prev, scanTarget: 'fullbody' }))} />
                                  <OptionChip active={avatarProfile.scanTarget === 'face'} label={t.avatarFace ?? 'Face'} onClick={() => setAvatarProfile((prev) => ({ ...prev, scanTarget: 'face' }))} />
                                </div>
                              </div>
                              <div className="rounded-xl p-2.5" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}>
                                <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>{t.avatarCameraRender}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(['realistic', 'cinematic', 'anime', 'studio'] as AvatarRenderProfile[]).map((mode) => (
                                    <OptionChip key={mode} active={avatarProfile.renderProfile === mode} label={mode} onClick={() => setAvatarProfile((prev) => ({ ...prev, renderProfile: mode }))} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                              <input type="checkbox" checked={avatarProfile.faceRecognition} onChange={() => setAvatarProfile((prev) => ({ ...prev, faceRecognition: !prev.faceRecognition }))} className="h-4 w-4" style={{ accentColor: 'var(--color-accent)' }} />
                              <span>{t.avatarFaceRecognition}</span>
                            </label>
                            <div className="flex gap-2">
                              <button onClick={() => { setAvatarProfile((prev) => ({ ...prev, scanTarget: 'face', faceRecognition: true, renderProfile: 'anime' })); setInput((prev) => `${prev ? `${prev}\n` : ''}${locale === 'ka' ? 'შექმენი თანამედროვე anime avatar profile.' : locale === 'ru' ? 'Создай современный anime avatar profile.' : 'Create a modern anime avatar profile.'}`); setShowOptionsPanel(false); }} className="text-[11px] px-3 py-2 rounded-xl transition-colors" style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>{t.avatarPresetAnimeFace}</button>
                              <button onClick={() => { setAvatarProfile((prev) => ({ ...prev, scanTarget: 'fullbody', renderProfile: 'cinematic' })); setInput((prev) => `${prev ? `${prev}\n` : ''}${locale === 'ka' ? 'შექმენი სრული ტანის cinematic avatar სტუდიური ხარისხით.' : locale === 'ru' ? 'Создай full-body cinematic avatar студийного качества.' : 'Create a studio-quality full-body cinematic avatar.'}`); setShowOptionsPanel(false); }} className="text-[11px] px-3 py-2 rounded-xl transition-colors" style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>{t.avatarPresetFullBody}</button>
                            </div>
                          </div>
                        )}

                        {/* ── Sections tab ── */}
                        {optionsPanelTab === 'sections' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {workspaceSections.map((section) => {
                                const active = section.id === activeSectionId;
                                return (
                                  <button
                                    key={section.id}
                                    onClick={() => setActiveSectionId(section.id)}
                                    className='text-left rounded-xl border p-2.5 transition-colors'
                                    style={active ? { borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)' } : { borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' }}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>{section.title}</p>
                                      <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--color-accent)' }}>{section.metric}%</span>
                                    </div>
                                    <p className="text-[10px] line-clamp-2" style={{ color: 'var(--color-text-tertiary)' }}>{section.description}</p>
                                    <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                                      <div className="h-full rounded-full" style={{ width: `${section.metric}%`, backgroundColor: 'var(--color-accent)' }} />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {activeSection && (
                              <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)' }}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>{activeSection.title}</p>
                                  <button
                                    onClick={() => { setInput(buildSectionPrompt(locale, serviceName, activeSection.title)); setShowOptionsPanel(false); promptInputRef.current?.focus(); }}
                                    className="text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                                    style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                                  >
                                    {t.applySection}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {activeSection.steps.map((step) => (
                                    <span key={step} className="text-[10px] px-2 py-1 rounded-full" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>{step}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Inline support links in sections tab */}
                            <div className="pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)' }}>{t.support}</p>
                              <div className="flex gap-2">
                                <a href="https://wa.me/995000000000" target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[11px] rounded-lg transition-colors" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}>{t.whatsapp}</a>
                                <a href="https://t.me/myavatar_ge" target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[11px] rounded-lg transition-colors" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}>{t.telegram}</a>
                                <a href="tel:+995000000000" className="px-3 py-1.5 text-[11px] rounded-lg transition-colors" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}>{t.phone}</a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Clear Chat */}
              <button
                onClick={clearChat}
                className="flex-shrink-0 px-2.5 py-1.5 text-[11px] rounded-xl transition-colors"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}
              >
                {t.clearChat}
              </button>
            </div>

            {/* Row 2: Active state pills */}
            {(activeSection || Object.values(selectedOptions).some(Boolean)) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeSection && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-tertiary)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M3 10h18v4H3z"/><path d="M3 17h18v4H3z"/></svg>
                    {activeSection.title}
                  </span>
                )}
                {Object.entries(selectedOptions).filter(([, v]) => v).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]" style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-6 text-center py-8 md:py-12">
                {/* Icon with glow effect */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-3xl blur-2xl opacity-20" style={{ backgroundColor: 'var(--color-accent)' }} />
                  <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(139,92,246,0.8))', boxShadow: '0 8px 32px rgba(99,102,241,0.2)' }}>
                    <span className="text-4xl filter drop-shadow">{serviceIcon}</span>
                  </div>
                </div>

                {/* Title + Description */}
                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{serviceName}</h2>
                  <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
                </div>

                {/* Workspace flow (compact) */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {workspaceFlowLabels.map((label, idx) => (
                    <div key={label} className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-[11px] sm:text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
                        {label}
                      </span>
                      {idx < workspaceFlowLabels.length - 1 && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                      )}
                    </div>
                  ))}
                </div>

                {/* Example prompts grid */}
                <div className="w-full max-w-xl space-y-3">
                  <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.orTry}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(SERVICE_EXAMPLE_PROMPTS[serviceId] ?? SERVICE_EXAMPLE_PROMPTS['agent-g'] ?? []).slice(0, 4).map((ep, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setInput(ep.text[locale] ?? ep.text.en ?? ''); promptInputRef.current?.focus(); }}
                        className="group text-left rounded-xl p-3 sm:p-3.5 transition-all hover:scale-[1.01]"
                        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base flex-shrink-0 mt-0.5">{ep.icon}</span>
                          <span className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{ep.text[locale] ?? ep.text.en ?? ''}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Features row */}
                <div className="flex flex-wrap justify-center gap-1.5 max-w-lg">
                  {features.slice(0, 6).map(f => (
                    <span key={f} className="text-[10px] sm:text-[11px] rounded-full px-2.5 py-1 flex items-center gap-1.5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                      <span style={{ color: 'var(--color-accent)' }}>✦</span> {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[96%] sm:max-w-[88%] lg:max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className='px-4 py-3 rounded-2xl text-sm leading-relaxed'
                    style={msg.role === 'user'
                      ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
                      : { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }
                    }
                  >
                    {msg.content}
                  </div>

                  {/* Artifact preview cards */}
                  {msg.artifacts?.map((art, i) => {
                    const canRetry = Boolean(art.generationPrompt);
                    const retryBusy = retryingArtifactPrompt === art.generationPrompt;
                    const artifactDownloadMetric = art.url ? downloadMetrics[art.url] : undefined;
                    const badgeText = art.generationStatus === 'running'
                      ? (locale === 'ka' ? 'მიმდინარეობს' : locale === 'ru' ? 'В процессе' : 'Running')
                      : art.generationStatus === 'succeeded'
                        ? (locale === 'ka' ? 'მზადაა' : locale === 'ru' ? 'Готово' : 'Ready')
                        : art.generationStatus === 'failed'
                          ? (locale === 'ka' ? 'შეცდომა' : locale === 'ru' ? 'Ошибка' : 'Failed')
                          : null;

                    return (
                      <div
                        key={i}
                        className="w-full rounded-xl p-3 transition-colors"
                        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                          <button
                            onClick={() => setPreviewArtifact(art)}
                            className="flex items-center gap-2 text-left min-w-0 flex-1"
                          >
                            <span className="text-xs">
                              {art.type === 'image' ? '🖼️' : art.type === 'video' ? '🎬' : art.type === 'audio' ? '🎵' : '📄'}
                            </span>
                            <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{art.label}</span>
                          </button>

                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            {badgeText && (
                              <span
                                className='text-[10px] px-2 py-0.5 rounded-full border'
                                style={art.generationStatus === 'running'
                                  ? { borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }
                                  : art.generationStatus === 'succeeded'
                                    ? { borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.15)', color: '#6ee7b7' }
                                    : { borderColor: '#fb7185', backgroundColor: 'rgba(251,113,133,0.15)', color: '#fda4af' }
                                }
                              >
                                {badgeText}
                              </span>
                            )}

                            {canRetry && (
                              <button
                                onClick={() => retryArtifactGeneration(art)}
                                disabled={retryBusy || sending || art.generationStatus === 'running'}
                                className="text-[11px] px-2 py-1 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}
                              >
                                {retryBusy
                                  ? (locale === 'ka' ? 'ცდა...' : locale === 'ru' ? 'Повтор...' : 'Retrying...')
                                  : (locale === 'ka' ? 'თავიდან' : locale === 'ru' ? 'Повтор' : 'Retry')}
                              </button>
                            )}

                            {art.url && (
                              <button
                                onClick={() => downloadArtifact(art)}
                                className="text-[11px] px-2 py-1 rounded-md"
                                style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                              >
                                {t.download}
                              </button>
                            )}
                          </div>
                        </div>

                        {art.url && artifactDownloadMetric && (
                          <div className="mt-2 space-y-1">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                              <div
                                className="h-full transition-all"
                                style={{ width: `${artifactDownloadMetric.percent}%`, backgroundColor: artifactDownloadMetric.status === 'failed' ? '#f87171' : 'var(--color-accent)' }}
                              />
                            </div>
                            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                              {artifactDownloadMetric.status === 'downloading' ? t.downloading : artifactDownloadMetric.status === 'failed' ? 'Failed' : t.ready}
                              {' · '}{artifactDownloadMetric.percent}%
                              {' · '}{formatBytes(artifactDownloadMetric.receivedBytes)}
                              {artifactDownloadMetric.totalBytes ? ` / ${formatBytes(artifactDownloadMetric.totalBytes)}` : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Generating indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 text-sm flex items-center gap-2" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-accent)' }} />
                  {t.generating}
                </div>
              </div>
            )}
          </div>

          {/* ── Sticky Action Bar ───────────────────────────────────────── */}
          <div className="sticky bottom-0 backdrop-blur-xl p-3 md:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-3 max-md:[@media(orientation:landscape)]:space-y-1.5 max-md:[@media(orientation:landscape)]:py-1.5 transition-shadow rounded-b-2xl" style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-elevated)' }}>
            {rateLimitNotice && (
              <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{rateLimitNotice}</p>
                <button
                  onClick={() => setRateLimitNotice(null)}
                  className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t.dismiss}
                </button>
              </div>
            )}

            {landingPresetNote && (
              <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)' }}>
                <p className="text-xs" style={{ color: 'var(--color-accent)' }}>{landingPresetNote}</p>
                <button
                  onClick={() => setLandingPresetNote(null)}
                  className="text-[11px]" style={{ color: 'var(--color-accent)' }}
                >
                  {t.dismiss}
                </button>
              </div>
            )}

            {generationProgress && (
              <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)' }}>
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--color-accent)' }}>
                  <span>{t.progress} · {generationProgress.context}</span>
                  <span>{generationProgress.percent}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                  <div className="h-full transition-all" style={{ width: `${generationProgress.percent}%`, backgroundColor: 'var(--color-accent)' }} />
                </div>
                <p className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{generationStageLabel}</p>
              </div>
            )}

            <PremiumCard className="px-3 py-2">
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-accent)' }}>{t.liveChat}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.premiumHint}</p>
            </PremiumCard>

            {/* Automation toggle */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap max-md:[@media(orientation:landscape)]:flex-nowrap max-md:[@media(orientation:landscape)]:overflow-x-auto">              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAutomation}
                  onChange={() => setShowAutomation(!showAutomation)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 rounded-full transition-colors relative" style={{ backgroundColor: showAutomation ? 'var(--color-accent)' : 'var(--color-border)' }}>
                  <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t.automation}</span>
              </label>

              <button
                onClick={toggleCamera}
                className='px-3 py-2 text-xs border rounded-lg transition-colors'
                style={cameraOn
                  ? { borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                }
              >
                {cameraOn ? t.closeCamera : t.camera}
              </button>

              <button
                onClick={() => {
                  if (!demoMode && !isAuthenticated) {
                    setShowLoginModal(true);
                    onAuthRequired?.();
                    return;
                  }
                  if (!input.trim()) {
                    const defaultPrompt = locale === 'ka'
                      ? `${serviceName} - დავალება: შექმენი შედეგი ნაბიჯ-ნაბიჯ.`
                      : locale === 'ru'
                        ? `${serviceName} — задача: создай результат пошагово.`
                        : `${serviceName} task: create output step by step.`;
                    setInput(defaultPrompt);
                  }
                  promptInputRef.current?.focus();
                }}
                className="px-3 py-2 text-xs border rounded-lg transition-colors max-w-full truncate"
                style={{ borderColor: 'var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {agentButtonLabel}
              </button>
            </div>

            {(cameraOn || cameraError) && (
              <div className="rounded-xl p-2" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                {cameraOn ? (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full max-h-52 max-md:[@media(orientation:landscape)]:max-h-28 rounded-xl object-cover"
                      />
                      {/* Minimal overlay */}
                      <div className="absolute inset-0 pointer-events-none">
                        <span className="absolute top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-black/75 border border-red-400/50 px-2 py-0.5 text-[9px] font-bold text-red-200 backdrop-blur-sm tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                          REC
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => captureFrame(false)}
                        disabled={cameraCaptureBusy}
                        className="w-full px-3 py-2 text-xs rounded-lg disabled:opacity-40 transition-colors"
                        style={{ backgroundColor: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-soft)', color: 'var(--color-accent)' }}
                      >
                        {t.capture}
                      </button>
                      <button
                        onClick={() => captureFrame(true)}
                        disabled={cameraCaptureBusy}
                        className="w-full px-3 py-2 text-xs rounded-lg disabled:opacity-40 transition-colors"
                        style={{ backgroundColor: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-soft)', color: 'var(--color-accent)' }}
                      >
                        {serviceContext === 'avatar'
                          ? `${t.scan} (${avatarProfile.scanTarget === 'fullbody' ? (locale === 'ka' ? 'სრული ტანი' : locale === 'ru' ? 'тело' : 'full-body') : (locale === 'ka' ? 'სახე' : locale === 'ru' ? 'лицо' : 'face')})`
                          : t.scan}
                      </button>
                    </div>
                  </div>
                ) : null}
                {cameraError ? <p className="text-xs text-red-300 mt-1">{cameraError}</p> : null}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={importReadyAvatar}
                disabled={avatarImporting}
                className="px-3 py-2 text-xs rounded-lg disabled:opacity-40"
                style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {avatarImporting ? (t.importingAvatar ?? 'Importing avatar...') : (t.importAvatar ?? 'Import Ready Avatar')}
              </button>

              {importedAvatarUrl && (
                <button
                  onClick={() => {
                    setImportedAvatarUrl(null);
                    setAvatarImportNotice(null);
                  }}
                  className="px-3 py-2 text-xs rounded-lg"
                  style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--card-bg)', color: 'var(--color-text-secondary)' }}
                >
                  {t.clearImportedAvatar ?? 'Clear Imported Avatar'}
                </button>
              )}
            </div>

            {avatarImportNotice && (
              <div className="rounded-xl px-3 py-2" style={{ border: '1px solid var(--color-accent-soft)', backgroundColor: 'var(--color-accent-soft)' }}>
                <p className="text-xs" style={{ color: 'var(--color-accent)' }}>{avatarImportNotice}</p>
              </div>
            )}

            {/* Input row */}
            <div className="space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
              />

              <div className={`relative rounded-2xl transition-all ${chatInputFocused ? 'ring-2' : ''}`} style={chatInputFocused ? { '--tw-ring-color': 'var(--color-accent)', backgroundColor: 'var(--input-bg)', border: '1px solid var(--color-accent)' } as React.CSSProperties : { backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
                <textarea
                  ref={promptInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setChatInputFocused(true)}
                  onBlur={() => setChatInputFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t.placeholder}
                  rows={2}
                  className="w-full min-h-[72px] sm:min-h-[64px] max-md:[@media(orientation:landscape)]:min-h-[44px] rounded-t-2xl px-4 pt-3 pb-1 text-sm focus:outline-none resize-none bg-transparent"
                  style={{ color: 'var(--color-text)' }}
                />
                {/* Integrated input toolbar */}
                <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      title={t.upload}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    </button>
                    <button
                      onClick={toggleRecording}
                      className={`p-1.5 rounded-lg transition-colors ${isRecording ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/5'}`}
                      style={isRecording ? {} : { color: 'var(--color-text-tertiary)' }}
                      title={isRecording ? t.stopRecord : t.record}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                    </button>
                    {userMode === 'advanced' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        {Object.values(selectedOptions).filter(Boolean).length}/{optionSets.length} options
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => sendMessage(`${serviceName}: ${t.premiumAction ?? 'Run Premium Pipeline'}. ${t.premiumHint ?? ''}.`)}
                      disabled={sending}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
                    >
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        {locale === 'ka' ? 'პრემიუმ' : locale === 'ru' ? 'Премиум' : 'Premium'}
                      </span>
                    </button>
                    <button
                      onClick={() => sendMessage()}
                      disabled={sending || !input.trim()}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                    >
                      {sending ? (
                        <span className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          {t.generating}
                        </span>
                      ) : t.send}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Preview/Tools Panel (30%) ─────────────────────────────────── */}
        {!chatFullscreen && (
        <div className="lg:w-[32%] rounded-2xl flex flex-col md:max-h-[50vh] lg:max-h-none overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          {/* Panel header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-elevated)' }}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: previewArtifact ? '#34d399' : 'var(--color-text-tertiary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.preview}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {previewArtifact && (
                <button
                  onClick={() => setShowExport(!showExport)}
                  className="px-2 py-1 text-[10px] rounded-md transition-colors"
                  style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
                >
                  {t.exportCenter}
                </button>
              )}
            </div>
          </div>

          {/* Preview content */}
          <div className="flex-1 p-3 sm:p-4 flex flex-col overflow-auto">
            {previewArtifact ? (
              <div className="w-full space-y-3 flex-1">
                {/* Media preview */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  {previewArtifact.type === 'image' && previewArtifact.url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={previewArtifact.url} alt={previewArtifact.label} className="w-full" />
                  )}
                  {previewArtifact.type === 'video' && previewArtifact.url && (
                    <video src={previewArtifact.url} controls className="w-full" />
                  )}
                  {previewArtifact.type === 'audio' && previewArtifact.url && (
                    <div className="p-4" style={{ backgroundColor: 'var(--card-bg)' }}>
                      <audio src={previewArtifact.url} controls className="w-full" />
                    </div>
                  )}
                  {previewArtifact.type === 'text' && (
                    <pre className="text-xs whitespace-pre-wrap p-4 max-h-64 overflow-y-auto" style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--card-bg)' }}>
                      {previewArtifact.content ?? ''}
                    </pre>
                  )}
                </div>

                {/* Label */}
                <p className="text-xs text-center truncate" style={{ color: 'var(--color-text-tertiary)' }}>{previewArtifact.label}</p>

                {/* Action buttons row */}
                <div className="grid grid-cols-2 gap-2">
                  {previewArtifact.url && (
                    <button
                      onClick={() => downloadArtifact(previewArtifact)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {t.download}
                    </button>
                  )}
                  {previewArtifact.generationPrompt && (
                    <button
                      onClick={() => retryArtifactGeneration(previewArtifact)}
                      disabled={sending}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                      {t.regenerate}
                    </button>
                  )}
                </div>

                {/* Download progress */}
                {previewDownloadMetric && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                      <div className="h-full transition-all rounded-full" style={{ width: `${previewDownloadMetric.percent}%`, backgroundColor: previewDownloadMetric.status === 'failed' ? '#f87171' : 'var(--color-accent)' }} />
                    </div>
                    <p className="text-[10px] text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                      {previewDownloadMetric.status === 'downloading' ? t.downloading : previewDownloadMetric.status === 'failed' ? 'Failed' : t.ready}
                      {' · '}{previewDownloadMetric.percent}%
                    </p>
                  </div>
                )}

                {/* Export format chips */}
                {showExport && contract && (
                  <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.exportCenter}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(contract.exportFormats ?? []).map(fmt => (
                        <button
                          key={fmt}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg transition-colors"
                          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Smart Empty State */
              <div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 py-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl opacity-10 animate-pulse" style={{ backgroundColor: 'var(--color-accent)' }} />
                  <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
                    <span className="text-2xl opacity-40">{serviceIcon}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.noPreview}</p>
                  <p className="text-[11px] max-w-[200px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.noPreviewHint}</p>
                </div>
                <button
                  onClick={() => promptInputRef.current?.focus()}
                  className="text-[11px] font-medium px-4 py-2 rounded-lg transition-all"
                  style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
                >
                  {t.startCreating} →
                </button>
                {/* Export format preview */}
                {contract && (
                  <div className="pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.outputTypes}</p>
                    <div className="flex flex-wrap justify-center gap-1">
                      {contract.exportFormats.slice(0, 5).map(fmt => (
                        <span key={fmt} className="px-2 py-0.5 text-[10px] rounded-md" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
                          {fmt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export menu (legacy fallback) */}
          {showExport && !previewArtifact && (
            <div className="p-3 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
              {(contract?.exportFormats ?? ['PNG', 'MP4', 'MP3', 'JSON', 'PDF']).map(fmt => (
                <button
                  key={fmt}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Export as {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Cross-service Next Steps */}
          {contract && contract.nextTools.length > 0 && (
            <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                {locale === 'ka' ? 'შემდეგი ნაბიჯი' : locale === 'ru' ? 'Следующий шаг' : 'Next Step'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contract.nextTools.map(tool => (
                  <Link
                    key={tool.slug}
                    href={`/${locale}/services/${tool.slug}`}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all hover:scale-[1.02]"
                    style={{ backgroundColor: previewArtifact ? 'var(--color-accent)' : 'var(--color-accent-soft)', color: previewArtifact ? '#fff' : 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
                  >
                    {tool.label[locale as 'ka' | 'en' | 'ru'] || tool.label.en}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Login Modal (NOT redirect) ──────────────────────────────────── */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLoginModal(false)}>
          <div className="rounded-2xl p-8 max-w-sm w-full space-y-4" style={{ backgroundColor: 'var(--color-elevated)', border: '1px solid var(--color-border)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{t.loginRequired}</h2>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {locale === 'ka' ? 'სერვისის გამოსაყენებლად გთხოვთ შეხვიდეთ ანგარიშში.' :
               locale === 'ru' ? 'Для использования сервиса войдите в аккаунт.' :
               'Please log in to use this service.'}
            </p>
            <div className="flex gap-3">
              <a
                href={`/${locale}/login?redirect=/${locale}/services/${serviceId}`}
                className="flex-1 text-center px-4 py-2.5 font-semibold rounded-xl transition-all"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                {t.login}
              </a>
              <button
                onClick={() => setShowLoginModal(false)}
                className="px-4 py-2.5 rounded-xl transition-colors"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
