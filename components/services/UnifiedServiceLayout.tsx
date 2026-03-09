'use client';

import { useState, useRef, useEffect, useCallback, type DragEvent, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { getOwnerId } from '@/lib/auth/identity';

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
type ServiceContext = 'global' | 'music' | 'video' | 'avatar' | 'voice' | 'business';

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
  if (!['avatar', 'video', 'music'].includes(serviceContext)) return false;
  return /generate|create|make|render|avatar|video|music|song|audio|image|შექმ|გენერ|созд|генер/i.test(prompt);
}

function resolveReplicateEndpoint(serviceContext: string) {
  if (serviceContext === 'avatar') return '/api/replicate/image';
  if (serviceContext === 'video') return '/api/replicate/video';
  return '/api/replicate/audio';
}

function mapOutputToArtifacts(serviceContext: string, output: unknown): Artifact[] {
  const outputValue = Array.isArray(output) ? output[0] : output;
  const url = typeof outputValue === 'string' ? outputValue : '';
  if (!url) return [];

  if (serviceContext === 'avatar') {
    return [{ type: 'image', url, label: 'Generated Avatar', mimeType: 'image/*' }];
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
  photo: 'avatar',
  image: 'avatar',
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
  ],
  avatar: [
    { key: 'quality', label: 'Quality', values: ['Standard', 'High', 'Ultra', 'Studio Max'] },
    { key: 'style', label: 'Style', values: ['Realistic', 'Cinematic', 'Stylized', 'Luxury Editorial'] },
    { key: 'pose', label: 'Pose', values: ['Portrait', 'Half Body', 'Full Body', 'Dynamic Motion'] },
    { key: 'lighting', label: 'Lighting', values: ['Studio', 'Natural', 'Dramatic', 'Golden Hour'] },
    { key: 'outfit', label: 'Outfit', values: ['Business', 'Casual', 'Fashion', 'Custom'] },
    { key: 'render', label: 'Render Pass', values: ['Single Shot', 'Variation Pack', 'Multi-angle'] },
  ],
  video: [
    { key: 'quality', label: 'Quality', values: ['HD', 'Full HD', '4K', '6K Master'] },
    { key: 'ratio', label: 'Ratio', values: ['16:9', '9:16', '1:1', '4:5'] },
    { key: 'camera', label: 'Camera Motion', values: ['Static', 'Dolly', 'Orbit'] },
    { key: 'speed', label: 'Speed', values: ['Fast', 'Balanced', 'Premium'] },
    { key: 'narrative', label: 'Narrative', values: ['Hook-Proof-CTA', 'Story Arc', 'Demo-first'] },
    { key: 'delivery', label: 'Delivery', values: ['Draft', 'Approved', 'Launch-ready'] },
  ],
  music: [
    { key: 'length', label: 'Length', values: ['15s', '30s', '60s', '90s'] },
    { key: 'genre', label: 'Genre', values: ['Ambient', 'Cinematic', 'Trap', 'House', 'Hybrid Orchestral'] },
    { key: 'mood', label: 'Mood', values: ['Chill', 'Epic', 'Energetic', 'Luxury'] },
    { key: 'mix', label: 'Mix', values: ['Draft', 'Studio', 'Mastered'] },
    { key: 'vocal', label: 'Vocal Layer', values: ['Instrumental', 'Hook Vox', 'Full Vocal'] },
    { key: 'delivery', label: 'Delivery', values: ['Master', 'Stems', 'Master + Stems'] },
  ],
  photo: [
    { key: 'retouch', label: 'Retouch Level', values: ['Natural', 'Editorial', 'High Fashion'] },
    { key: 'background', label: 'Background', values: ['Original', 'Clean Studio', 'AI Scene'] },
    { key: 'delivery', label: 'Delivery', values: ['JPG', 'PNG', 'WebP Pack'] },
  ],
  image: [
    { key: 'model', label: 'Model', values: ['Fast Concept', 'Balanced', 'Detail Pro'] },
    { key: 'style', label: 'Style', values: ['Brand Poster', 'Photoreal', '3D Render'] },
    { key: 'size', label: 'Size', values: ['1024', '1536', '2048'] },
  ],
  media: [
    { key: 'package', label: 'Package', values: ['Launch Kit', 'Social Kit', 'Omni Campaign'] },
    { key: 'channels', label: 'Channels', values: ['Instagram', 'YouTube', 'Cross-platform'] },
    { key: 'strategy', label: 'Strategy', values: ['Awareness', 'Conversion', 'Retention'] },
  ],
  business: [
    { key: 'detail', label: 'Detail', values: ['Summary', 'Balanced', 'Deep Dive', 'Board-ready'] },
    { key: 'tone', label: 'Tone', values: ['Formal', 'Executive', 'Persuasive'] },
    { key: 'output', label: 'Output', values: ['Plan', 'Report', 'Deck Outline', 'Investor Memo'] },
    { key: 'risk', label: 'Risk Lens', values: ['Low', 'Balanced', 'Aggressive'] },
    { key: 'timeframe', label: 'Timeframe', values: ['30 Days', '90 Days', '12 Months'] },
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
  media: [
    { id: 'media-full', title: 'Omni Campaign', prompt: 'Assemble a full campaign pack: visuals, copy variants, and distribution notes.' },
    { id: 'media-influencer', title: 'Influencer Bundle', prompt: 'Generate an influencer-ready content bundle for launch week.' },
    { id: 'media-calendar', title: '30-Day Calendar', prompt: 'Build a 30-day content calendar with themes and asset checklist.' },
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

function PremiumCard({ title, className = '', children }: PremiumCardProps) {
  return (
    <div className={`rounded-xl border border-white/[0.12] bg-black/25 p-3 space-y-2 ${className}`.trim()}>
      {title ? <p className="text-[11px] uppercase tracking-wider text-white/45">{title}</p> : null}
      {children}
    </div>
  );
}

function OptionChip({ active, label, onClick }: OptionChipProps) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[11px] rounded-full border transition-colors ${
        active
          ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-100'
          : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
      } min-h-[34px] sm:min-h-[30px] px-2.5 sm:px-2`}
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
      className="order-4 sm:order-none w-full sm:w-auto max-md:[@media(orientation:landscape)]:w-auto flex-shrink-0 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-black text-xs sm:text-sm font-semibold rounded-xl hover:shadow-[0_0_24px_rgba(251,191,36,0.45)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
        body: JSON.stringify({ prompt }),
      });
      const startData = await startRes.json() as {
        id?: string;
        status?: string;
        message?: string;
        error?: string;
        output?: unknown;
      };

      if (!startRes.ok) {
        throw new Error(startData.error ?? 'Generation start failed');
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

      const predictionId = startData.id;
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
  }, [broadcastAvatarUpdate, decorateGeneratedArtifacts, generationCompleteLabel, generationFailedLabel, generationStartedLabel, locale, t.retryNotice, t.seconds]);

  const retryArtifactGeneration = useCallback(async (artifact: Artifact) => {
    if (!artifact.generationPrompt) return;
    const context = artifact.generationContext ?? serviceContext;
    if (!['avatar', 'video', 'music'].includes(context)) return;

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

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          agentId,
          language: locale,
          context: serviceContext,
          history,
          metadata: {
            serviceId,
            demoMode,
            agentEnabled: true,
            selectedOptions,
            activeSectionId,
            completionScore,
            importedAvatarUrl,
            hasImportedAvatar: Boolean(importedAvatarUrl),
          },
        }),
      });

      const data = await res.json() as {
        data?: { response?: string; artifacts?: Artifact[] };
        response?: string;
        artifacts?: Artifact[];
        error?: string;
      };

      if (!res.ok) throw new Error(data.error ?? 'Failed');

      const reply = data.data?.response ?? data.response ?? 'Processing...';
      const artifacts = data.data?.artifacts ?? data.artifacts;

      const loweredReply = reply.toLowerCase();
      if (loweredReply.includes('throttled') || loweredReply.includes('rate limit') || loweredReply.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(reply);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      } else {
        setRateLimitNotice(null);
      }

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_reply`,
        role: 'assistant',
        content: reply,
        artifacts,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Auto-preview first artifact
      if (artifacts?.length) {
        setPreviewArtifact(artifacts[0]!);
      }

      const shouldGenerate = shouldTriggerGeneration(serviceContext, msg);
      if (shouldGenerate) {
        await runDirectGeneration(msg, serviceContext);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Unknown error';
      const loweredError = errorText.toLowerCase();
      if (loweredError.includes('throttled') || loweredError.includes('rate limit') || loweredError.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(errorText);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      }

      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: `Error: ${errorText}`,
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, demoMode, isAuthenticated, selectedOptions, activeSection, activeSectionId, completionScore, agentId, avatarProfile, importedAvatarUrl, locale, serviceId, serviceContext, messages, onAuthRequired, t.retryNotice, t.seconds, runDirectGeneration]);

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
    <div className="relative min-h-screen bg-transparent text-white ag-noise ag-neon-grid-lines overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-78"
        style={{
          backgroundImage: `url('${serviceBackgroundImage}'), url('/backgrounds/services/agent-g.svg')`,
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-95" style={{ backgroundImage: serviceBackground }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.62),rgba(2,6,23,0.34)_28%,rgba(2,6,23,0.64)_100%)]" />
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 border-b border-white/[0.12] bg-black/30 backdrop-blur-xl px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 shadow-[0_10px_32px_rgba(0,0,0,0.35)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{serviceIcon}</span>
            <div>
              <h1 className="text-lg font-bold">{serviceName}</h1>
              <p className="text-xs text-white/40">{t.powered}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {demoMode && (
              <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
                Demo Mode
              </span>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 text-xs border border-white/15 rounded-lg bg-white/[0.03] hover:bg-white/[0.10] transition-colors"
            >
              {t.history}
            </button>
            <button
              onClick={() => setShowExport(!showExport)}
              className="px-3 py-1.5 text-xs border border-white/15 rounded-lg bg-white/[0.03] hover:bg-white/[0.10] transition-colors"
            >
              {t.export}
            </button>
            <button
              onClick={toggleChatFullscreen}
              className="px-3 py-1.5 text-xs border border-cyan-400/30 rounded-lg bg-cyan-500/12 hover:bg-cyan-500/20 transition-colors"
            >
              {chatFullscreen ? t.exitFullscreen : t.fullscreen}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Layout: Chat (70%) + Preview (30%) ─────────────────────── */}
      <div className={`relative z-10 max-w-[94rem] mx-auto flex flex-col lg:flex-row min-h-[calc(100vh-60px)] sm:min-h-[calc(100vh-64px)] px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 gap-2 lg:gap-3 ${chatFullscreen ? 'max-w-full px-1 sm:px-2 md:px-3 lg:px-3' : ''}`}>

        {/* ── Chat Window (70%) ─────────────────────────────────────────── */}
        <div
          ref={chatPanelRef}
          className="flex-1 lg:w-[68%] flex flex-col rounded-2xl border border-white/[0.12] bg-[linear-gradient(160deg,rgba(7,14,30,0.78),rgba(4,10,24,0.7))] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14),0_24px_72px_rgba(0,0,0,0.42)]"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-cyan-500/10 border-2 border-dashed border-cyan-500/50 rounded-xl flex items-center justify-center">
              <p className="text-cyan-300 font-semibold">{t.dragDrop}</p>
            </div>
          )}

          {/* ── Smart Toolbar: Quick Actions + Options Dropdown ─────────── */}
          <div className="px-3 sm:px-4 pt-3 pb-2.5 border-b border-white/[0.10] bg-black/20 rounded-t-2xl space-y-2">

            {/* Row 1: Quick actions + Options button + Clear */}
            <div className="flex items-center gap-2">
              {/* Compact quick action chips — horizontal scroll */}
              <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
                {quickActions.map(action => (
                  <button
                    key={action}
                    onClick={() => sendMessage(action)}
                    className="flex-shrink-0 px-2.5 py-1.5 text-[11px] bg-white/[0.05] border border-white/[0.10] rounded-full hover:bg-white/[0.10] hover:border-cyan-400/35 transition-all whitespace-nowrap"
                  >
                    {action}
                  </button>
                ))}
              </div>

              {/* Options Dropdown Button */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowOptionsPanel(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border rounded-xl transition-all select-none ${
                    showOptionsPanel
                      ? 'border-cyan-400/55 bg-cyan-500/18 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.22)]'
                      : 'border-white/20 bg-white/[0.05] text-white/70 hover:bg-white/[0.10] hover:border-white/30'
                  }`}
                >
                  {/* Settings gear SVG */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                  <span className="hidden sm:inline">{t.workspaceOptions}</span>
                  {/* Score badge */}
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold ${completionScore >= 70 ? 'bg-cyan-500/30 text-cyan-200' : 'bg-white/10 text-white/60'}`}>
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

                    <div className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 w-[min(660px,calc(100vw-20px))] z-[60] rounded-2xl border border-white/[0.15] bg-[rgba(6,12,26,0.97)] shadow-[0_24px_64px_rgba(0,0,0,0.75),0_0_0_1px_rgba(34,211,238,0.12)] backdrop-blur-xl overflow-hidden">
                      {/* Tab navigation */}
                      <div className="flex border-b border-white/[0.10] bg-black/25">
                        {([
                          { id: 'pipeline', label: locale === 'ka' ? '⚡ Pipeline' : locale === 'ru' ? '⚡ Pipeline' : '⚡ Pipeline' },
                          { id: 'params',   label: locale === 'ka' ? '🎛 პარამეტრები' : locale === 'ru' ? '🎛 Параметры' : '🎛 Params' },
                          ...(serviceContext === 'avatar' ? [{ id: 'builder', label: '🧬 Builder' }] : []),
                          { id: 'sections', label: locale === 'ka' ? '📐 სექციები' : locale === 'ru' ? '📐 Секции' : '📐 Sections' },
                        ] as { id: string; label: string }[]).map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setOptionsPanelTab(tab.id as typeof optionsPanelTab)}
                            className={`flex-1 px-3 py-2.5 text-[11px] font-medium transition-colors border-b-2 ${
                              optionsPanelTab === tab.id
                                ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10'
                                : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                            }`}
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
                              <p className="text-[11px] uppercase tracking-wider text-amber-100/80">{t.pipelineModes}</p>
                              <span className="text-[10px] text-amber-100/55 border border-amber-300/20 bg-amber-500/10 px-2 py-0.5 rounded-full">Agent G Premium</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {workspacePresets.map((preset) => (
                                <button
                                  key={preset.id}
                                  onClick={() => { setInput(preset.prompt); setShowOptionsPanel(false); promptInputRef.current?.focus(); }}
                                  className="text-left rounded-xl border border-amber-200/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.10),rgba(120,53,15,0.06))] hover:bg-[linear-gradient(145deg,rgba(251,191,36,0.18),rgba(120,53,15,0.10))] px-3 py-2.5 transition-all"
                                >
                                  <p className="text-[11px] font-semibold text-amber-100">{preset.title}</p>
                                  <p className="text-[10px] text-amber-50/60 mt-0.5 line-clamp-2">{preset.prompt}</p>
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => { sendMessage(`${serviceName}: ${t.premiumAction ?? 'Run Premium Pipeline'}. ${t.premiumHint ?? ''}.`); setShowOptionsPanel(false); }}
                              disabled={sending}
                              className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-black text-xs font-semibold rounded-xl hover:shadow-[0_0_24px_rgba(251,191,36,0.45)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                                <div key={set.key} className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-2.5 space-y-2">
                                  <p className="text-[11px] font-medium text-white/65">{set.label}</p>
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
                            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                              {[
                                { label: t.optionsCoverage, value: selectionCoverage, color: 'bg-cyan-300' },
                                { label: t.sectionReadiness, value: sectionReadiness, color: 'bg-sky-300' },
                                { label: t.completionScore, value: completionScore, color: 'bg-gradient-to-r from-cyan-300 to-blue-300' },
                              ].map(m => (
                                <div key={m.label} className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-white/50">
                                    <span className="truncate">{m.label}</span>
                                    <span className="ml-1 font-semibold text-white/70">{m.value}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div className={`h-full ${m.color}`} style={{ width: `${m.value}%` }} />
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
                              <label className="text-[11px] text-white/65 space-y-1.5">
                                <span className="block">{t.avatarHeight}</span>
                                <input type="number" min={120} max={240} value={avatarProfile.heightCm} onChange={(e) => setAvatarProfile((prev) => ({ ...prev, heightCm: e.target.value }))} className="w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-300/65" placeholder="172" />
                              </label>
                              <label className="text-[11px] text-white/65 space-y-1.5">
                                <span className="block">{t.avatarWeight}</span>
                                <input type="number" min={30} max={220} value={avatarProfile.weightKg} onChange={(e) => setAvatarProfile((prev) => ({ ...prev, weightKg: e.target.value }))} className="w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-300/65" placeholder="68" />
                              </label>
                              <label className="text-[11px] text-white/65 space-y-1.5">
                                <span className="block">{t.avatarFootSize}</span>
                                <input type="number" min={20} max={55} step={0.5} value={avatarProfile.footSize} onChange={(e) => setAvatarProfile((prev) => ({ ...prev, footSize: e.target.value }))} className="w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-300/65" placeholder="42" />
                              </label>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="rounded-xl border border-white/[0.10] bg-black/20 p-2.5">
                                <p className="text-[11px] text-white/65 mb-2">{t.avatarScanMode}</p>
                                <div className="flex gap-2">
                                  <OptionChip active={avatarProfile.scanTarget === 'fullbody'} label={t.avatarFullBody ?? 'Full Body'} onClick={() => setAvatarProfile((prev) => ({ ...prev, scanTarget: 'fullbody' }))} />
                                  <OptionChip active={avatarProfile.scanTarget === 'face'} label={t.avatarFace ?? 'Face'} onClick={() => setAvatarProfile((prev) => ({ ...prev, scanTarget: 'face' }))} />
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/[0.10] bg-black/20 p-2.5">
                                <p className="text-[11px] text-white/65 mb-2">{t.avatarCameraRender}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(['realistic', 'cinematic', 'anime', 'studio'] as AvatarRenderProfile[]).map((mode) => (
                                    <OptionChip key={mode} active={avatarProfile.renderProfile === mode} label={mode} onClick={() => setAvatarProfile((prev) => ({ ...prev, renderProfile: mode }))} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer text-[12px] text-white/75">
                              <input type="checkbox" checked={avatarProfile.faceRecognition} onChange={() => setAvatarProfile((prev) => ({ ...prev, faceRecognition: !prev.faceRecognition }))} className="h-4 w-4 accent-cyan-400" />
                              <span>{t.avatarFaceRecognition}</span>
                            </label>
                            <div className="flex gap-2">
                              <button onClick={() => { setAvatarProfile((prev) => ({ ...prev, scanTarget: 'face', faceRecognition: true, renderProfile: 'anime' })); setInput((prev) => `${prev ? `${prev}\n` : ''}${locale === 'ka' ? 'შექმენი თანამედროვე anime avatar profile.' : locale === 'ru' ? 'Создай современный anime avatar profile.' : 'Create a modern anime avatar profile.'}`); setShowOptionsPanel(false); }} className="text-[11px] px-3 py-2 rounded-xl border border-amber-300/40 bg-amber-500/15 hover:bg-amber-500/25 transition-colors">{t.avatarPresetAnimeFace}</button>
                              <button onClick={() => { setAvatarProfile((prev) => ({ ...prev, scanTarget: 'fullbody', renderProfile: 'cinematic' })); setInput((prev) => `${prev ? `${prev}\n` : ''}${locale === 'ka' ? 'შექმენი სრული ტანის cinematic avatar სტუდიური ხარისხით.' : locale === 'ru' ? 'Создай full-body cinematic avatar студийного качества.' : 'Create a studio-quality full-body cinematic avatar.'}`); setShowOptionsPanel(false); }} className="text-[11px] px-3 py-2 rounded-xl border border-cyan-300/40 bg-cyan-500/15 hover:bg-cyan-500/25 transition-colors">{t.avatarPresetFullBody}</button>
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
                                    className={`text-left rounded-xl border p-2.5 transition-colors ${active ? 'border-cyan-300/55 bg-cyan-500/16' : 'border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.07]'}`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <p className="text-[11px] font-semibold text-white/90 truncate">{section.title}</p>
                                      <span className="flex-shrink-0 text-[10px] text-cyan-200/80">{section.metric}%</span>
                                    </div>
                                    <p className="text-[10px] text-white/55 line-clamp-2">{section.description}</p>
                                    <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                                      <div className="h-full bg-cyan-400" style={{ width: `${section.metric}%` }} />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {activeSection && (
                              <div className="rounded-xl border border-white/[0.12] bg-black/20 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-medium text-white/80">{activeSection.title}</p>
                                  <button
                                    onClick={() => { setInput(buildSectionPrompt(locale, serviceName, activeSection.title)); setShowOptionsPanel(false); promptInputRef.current?.focus(); }}
                                    className="text-[10px] px-2.5 py-1 rounded-lg border border-amber-300/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 transition-colors"
                                  >
                                    {t.applySection}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {activeSection.steps.map((step) => (
                                    <span key={step} className="text-[10px] px-2 py-1 rounded-full border border-white/15 bg-white/5 text-white/65">{step}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Inline support links in sections tab */}
                            <div className="pt-1 border-t border-white/[0.08]">
                              <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">{t.support}</p>
                              <div className="flex gap-2">
                                <a href="https://wa.me/995000000000" target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[11px] rounded-lg border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] transition-colors">{t.whatsapp}</a>
                                <a href="https://t.me/myavatar_ge" target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[11px] rounded-lg border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] transition-colors">{t.telegram}</a>
                                <a href="tel:+995000000000" className="px-3 py-1.5 text-[11px] rounded-lg border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] transition-colors">{t.phone}</a>
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
                className="flex-shrink-0 px-2.5 py-1.5 text-[11px] border border-white/15 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] transition-colors"
              >
                {t.clearChat}
              </button>
            </div>

            {/* Row 2: Active state pills */}
            {(activeSection || Object.values(selectedOptions).some(Boolean)) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeSection && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/[0.10] bg-white/[0.04] text-[10px] text-white/45">
                    <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M3 10h18v4H3z"/><path d="M3 17h18v4H3z"/></svg>
                    {activeSection.title}
                  </span>
                )}
                {Object.entries(selectedOptions).filter(([, v]) => v).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-cyan-400/20 bg-cyan-500/[0.07] text-[10px] text-cyan-300/70">
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 text-center py-12 md:py-16">
                <span className="text-5xl">{serviceIcon}</span>
                <h2 className="text-xl font-bold">{serviceName}</h2>
                <p className="text-sm text-white/65 max-w-md">{description}</p>

                <div className="w-full max-w-lg rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-cyan-100/90">{t.workspaceFlow}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {workspaceFlowLabels.map((label) => (
                      <div key={label} className="text-[11px] rounded-lg border border-cyan-200/25 bg-black/20 px-2 py-1.5 text-cyan-50/85">
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 max-w-lg">
                  {features.map(f => (
                    <div key={f} className="text-xs text-white/55 bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 flex items-center gap-2">
                      <span className="text-white/35">✦</span> {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[96%] sm:max-w-[88%] lg:max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-white'
                        : 'bg-white/[0.08] border border-white/[0.14] text-white/90'
                  }`}>
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
                        className="w-full bg-white/[0.06] border border-white/[0.14] rounded-xl p-3 hover:border-cyan-400/45 hover:bg-white/[0.10] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                          <button
                            onClick={() => setPreviewArtifact(art)}
                            className="flex items-center gap-2 text-left min-w-0 flex-1"
                          >
                            <span className="text-xs">
                              {art.type === 'image' ? '🖼️' : art.type === 'video' ? '🎬' : art.type === 'audio' ? '🎵' : '📄'}
                            </span>
                            <span className="text-xs text-white/75 truncate">{art.label}</span>
                          </button>

                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            {badgeText && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                art.generationStatus === 'running'
                                  ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-100'
                                  : art.generationStatus === 'succeeded'
                                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                                    : 'border-rose-400/40 bg-rose-500/20 text-rose-100'
                              }`}>
                                {badgeText}
                              </span>
                            )}

                            {canRetry && (
                              <button
                                onClick={() => retryArtifactGeneration(art)}
                                disabled={retryBusy || sending || art.generationStatus === 'running'}
                                className="text-[11px] px-2 py-1 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {retryBusy
                                  ? (locale === 'ka' ? 'ცდა...' : locale === 'ru' ? 'Повтор...' : 'Retrying...')
                                  : (locale === 'ka' ? 'თავიდან' : locale === 'ru' ? 'Повтор' : 'Retry')}
                              </button>
                            )}

                            {art.url && (
                              <button
                                onClick={() => downloadArtifact(art)}
                                className="text-[11px] px-2 py-1 rounded-md border border-cyan-400/30 bg-cyan-500/15 hover:bg-cyan-500/25"
                              >
                                {t.download}
                              </button>
                            )}
                          </div>
                        </div>

                        {art.url && artifactDownloadMetric && (
                          <div className="mt-2 space-y-1">
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full transition-all ${artifactDownloadMetric.status === 'failed' ? 'bg-rose-400' : 'bg-cyan-400'}`}
                                style={{ width: `${artifactDownloadMetric.percent}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-white/55">
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
                <div className="bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-sm text-white/45 flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                  {t.generating}
                </div>
              </div>
            )}
          </div>

          {/* ── Sticky Action Bar ───────────────────────────────────────── */}
          <div className="sticky bottom-0 border-t border-white/[0.12] bg-black/45 backdrop-blur-xl p-3 md:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-3 max-md:[@media(orientation:landscape)]:space-y-1.5 max-md:[@media(orientation:landscape)]:py-1.5 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_0_24px_rgba(34,211,238,0.28)] transition-shadow rounded-b-2xl">
            {rateLimitNotice && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2">
                <p className="text-xs text-amber-100">{rateLimitNotice}</p>
                <button
                  onClick={() => setRateLimitNotice(null)}
                  className="text-[11px] text-amber-100/80 hover:text-amber-50"
                >
                  {t.dismiss}
                </button>
              </div>
            )}

            {landingPresetNote && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-300/40 bg-cyan-500/15 px-3 py-2">
                <p className="text-xs text-cyan-100">{landingPresetNote}</p>
                <button
                  onClick={() => setLandingPresetNote(null)}
                  className="text-[11px] text-cyan-100/80 hover:text-cyan-50"
                >
                  {t.dismiss}
                </button>
              </div>
            )}

            {generationProgress && (
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-cyan-100">
                  <span>{t.progress} · {generationProgress.context}</span>
                  <span>{generationProgress.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-cyan-900/30 overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all" style={{ width: `${generationProgress.percent}%` }} />
                </div>
                <p className="text-[11px] text-cyan-100/80">{generationStageLabel}</p>
              </div>
            )}

            <PremiumCard className="border-amber-300/35 bg-[linear-gradient(145deg,rgba(251,191,36,0.16),rgba(120,53,15,0.08))] px-3 py-2">
              <p className="text-[11px] text-amber-100 font-medium">{t.liveChat}</p>
              <p className="text-[10px] text-amber-100/75">{t.premiumHint}</p>
            </PremiumCard>

            {/* Automation toggle */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap max-md:[@media(orientation:landscape)]:flex-nowrap max-md:[@media(orientation:landscape)]:overflow-x-auto">              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAutomation}
                  onChange={() => setShowAutomation(!showAutomation)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-white/10 rounded-full peer-checked:bg-cyan-500/50 transition-colors relative">
                  <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-xs text-white/60">{t.automation}</span>
              </label>

              <button
                onClick={toggleCamera}
                className={`px-3 py-2 text-xs border rounded-lg transition-colors ${
                  cameraOn
                    ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                    : 'border-white/15 text-white/75 hover:bg-white/10'
                }`}
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
                className="px-3 py-2 text-xs border border-cyan-300/50 bg-cyan-500/15 rounded-lg hover:bg-cyan-500/25 hover:border-cyan-200/70 transition-colors max-w-full truncate"
              >
                {agentButtonLabel}
              </button>
            </div>

            {(cameraOn || cameraError) && (
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.16)] p-2">
                {cameraOn ? (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-cyan-400/[0.22] shadow-[0_0_20px_rgba(34,211,238,0.12)]">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full max-h-52 max-md:[@media(orientation:landscape)]:max-h-28 rounded-xl object-cover"
                      />
                      {/* REC badge */}
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-red-400/40 px-2 py-0.5 text-[9px] font-semibold text-red-200 backdrop-blur-sm">
                        <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                        REC
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => captureFrame(false)}
                        disabled={cameraCaptureBusy}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 disabled:opacity-40"
                      >
                        {t.capture}
                      </button>
                      <button
                        onClick={() => captureFrame(true)}
                        disabled={cameraCaptureBusy}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-cyan-400/45 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40"
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
                className="px-3 py-2 text-xs border border-cyan-300/45 bg-cyan-500/15 rounded-lg hover:bg-cyan-500/25 disabled:opacity-40"
              >
                {avatarImporting ? (t.importingAvatar ?? 'Importing avatar...') : (t.importAvatar ?? 'Import Ready Avatar')}
              </button>

              {importedAvatarUrl && (
                <button
                  onClick={() => {
                    setImportedAvatarUrl(null);
                    setAvatarImportNotice(null);
                  }}
                  className="px-3 py-2 text-xs border border-white/20 bg-white/10 rounded-lg hover:bg-white/20"
                >
                  {t.clearImportedAvatar ?? 'Clear Imported Avatar'}
                </button>
              )}
            </div>

            {avatarImportNotice && (
              <div className="rounded-xl border border-cyan-300/35 bg-cyan-500/12 px-3 py-2">
                <p className="text-xs text-cyan-100">{avatarImportNotice}</p>
              </div>
            )}

            {/* Input row */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end min-w-0 max-md:[@media(orientation:landscape)]:flex-nowrap">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-11 w-11 flex-shrink-0 flex items-center justify-center bg-white/[0.06] border border-white/[0.12] rounded-xl hover:bg-white/[0.1] transition-colors"
                title={t.upload}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </button>

              <button
                onClick={toggleRecording}
                className={`h-11 w-11 flex-shrink-0 flex items-center justify-center border rounded-xl transition-colors ${
                  isRecording
                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-white/[0.06] border-white/[0.12] hover:bg-white/[0.1] text-white/60'
                }`}
                title={isRecording ? t.stopRecord : t.record}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              </button>

              <div className={`order-3 sm:order-none basis-full sm:basis-auto flex-1 relative rounded-xl transition-all ${chatInputFocused ? 'ring-2 ring-cyan-400/70 shadow-[0_0_24px_rgba(34,211,238,0.35)]' : ''}`}>
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
                  className="w-full min-h-[82px] sm:min-h-[74px] max-md:[@media(orientation:landscape)]:min-h-[48px] bg-white/[0.08] border border-white/[0.16] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:border-cyan-400/70 focus:shadow-[0_0_20px_rgba(34,211,238,0.25)] resize-y"
                />
              </div>

              <GoldCTAButton
                label={t.premiumAction ?? 'Run Premium Pipeline'}
                disabled={sending}
                onClick={() => sendMessage(`${serviceName}: ${t.premiumAction ?? 'Run Premium Pipeline'}. ${t.premiumHint ?? ''}.`)}
              />

              <button                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                className="order-4 sm:order-none w-full sm:w-auto max-md:[@media(orientation:landscape)]:w-auto flex-shrink-0 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs sm:text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.send}
              </button>
            </div>
          </div>
        </div>

        {/* ── Preview/Tools Panel (30%) ─────────────────────────────────── */}
        {!chatFullscreen && (
        <div className="lg:w-[32%] border border-white/[0.12] bg-[linear-gradient(160deg,rgba(7,14,30,0.74),rgba(5,11,26,0.68))] rounded-2xl flex flex-col md:max-h-[50vh] lg:max-h-none overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-white/[0.10] bg-black/25 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/55 uppercase tracking-wider">{t.preview}</span>
            <span className="text-xs text-white/35">{t.exportCenter}</span>
          </div>

          {/* Preview content */}
          <div className="flex-1 p-3 sm:p-4 flex items-center justify-center overflow-auto">
            {previewArtifact ? (
              <div className="w-full space-y-4">
                {previewArtifact.type === 'image' && previewArtifact.url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewArtifact.url} alt={previewArtifact.label} className="w-full rounded-xl border border-white/[0.08]" />
                )}
                {previewArtifact.type === 'video' && previewArtifact.url && (
                  <video src={previewArtifact.url} controls className="w-full rounded-xl border border-white/[0.08]" />
                )}
                {previewArtifact.type === 'audio' && previewArtifact.url && (
                  <audio src={previewArtifact.url} controls className="w-full" />
                )}
                {previewArtifact.type === 'text' && (
                  <pre className="text-xs text-white/75 whitespace-pre-wrap bg-white/[0.04] p-4 rounded-xl border border-white/[0.1]">
                    {previewArtifact.content ?? ''}
                  </pre>
                )}
                <p className="text-xs text-white/45 text-center">{previewArtifact.label}</p>
                {previewArtifact.url && (
                  <div className="space-y-2">
                    <button
                      onClick={() => downloadArtifact(previewArtifact)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-cyan-400/35 bg-cyan-500/15 hover:bg-cyan-500/25"
                    >
                      {t.download}
                    </button>
                    {previewDownloadMetric && (
                      <div className="space-y-1">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${previewDownloadMetric.percent}%` }} />
                        </div>
                        <p className="text-[10px] text-white/55 text-center">
                          {previewDownloadMetric.status === 'downloading' ? t.downloading : previewDownloadMetric.status === 'failed' ? 'Failed' : t.ready}
                          {' · '}{previewDownloadMetric.percent}%
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-white/[0.05] border border-white/[0.1] rounded-2xl flex items-center justify-center">
                  <span className="text-2xl opacity-20">{serviceIcon}</span>
                </div>
                <p className="text-xs text-white/35">{t.noPreview}</p>
              </div>
            )}
          </div>

          {/* Export menu */}
          {showExport && (
            <div className="border-t border-white/[0.04] p-4 space-y-2">
              {['PNG', 'MP4', 'MP3', 'JSON', 'PDF'].map(fmt => (
                <button
                  key={fmt}
                  className="w-full text-left px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  Export as {fmt}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Login Modal (NOT redirect) ──────────────────────────────────── */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLoginModal(false)}>
          <div className="ag-surface-primary border-white/[0.14] rounded-2xl p-8 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">{t.loginRequired}</h2>
            <p className="text-sm text-white/40">
              {locale === 'ka' ? 'სერვისის გამოსაყენებლად გთხოვთ შეხვიდეთ ანგარიშში.' :
               locale === 'ru' ? 'Для использования сервиса войдите в аккаунт.' :
               'Please log in to use this service.'}
            </p>
            <div className="flex gap-3">
              <a
                href={`/${locale}/login?redirect=/${locale}/services/${serviceId}`}
                className="flex-1 text-center px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
              >
                {t.login}
              </a>
              <button
                onClick={() => setShowLoginModal(false)}
                className="px-4 py-2.5 border border-white/10 rounded-xl text-white/60 hover:bg-white/5 transition-colors"
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
