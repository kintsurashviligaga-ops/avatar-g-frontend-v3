/**
 * lib/chat/config/quickActionConfig.ts
 * Config-driven quick actions + service shortcuts + i18n labels.
 * Migrated and extended from the previous lib/chat/constants.ts.
 */

import type { SuggestionChip } from '../types';

// ─── Quick Action Model ──────────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: { en: string; ka: string; ru: string };
  icon: string;
  intent: string;
  targetService?: string;
  targetAgent?: string;
  workflowTemplate?: string;
  visibilityRule: 'always' | 'no-project' | 'has-project' | 'service-context';
  priority: number;
  category: 'create' | 'workflow' | 'project' | 'discover' | 'tools';
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create-avatar',
    label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать Аватар' },
    icon: '👤',
    intent: 'Create a professional AI avatar',
    targetService: 'avatar',
    targetAgent: 'avatar-agent',
    visibilityRule: 'always',
    priority: 1,
    category: 'create',
  },
  {
    id: 'generate-video',
    label: { en: 'Generate Video', ka: 'ვიდეოს შექმნა', ru: 'Создать Видео' },
    icon: '🎬',
    intent: 'Generate an AI video',
    targetService: 'video',
    targetAgent: 'video-agent',
    visibilityRule: 'always',
    priority: 2,
    category: 'create',
  },
  {
    id: 'create-poster',
    label: { en: 'Create Poster', ka: 'პოსტერის შექმნა', ru: 'Создать Постер' },
    icon: '🖼️',
    intent: 'Generate a poster design',
    targetService: 'image',
    targetAgent: 'image-agent',
    visibilityRule: 'always',
    priority: 3,
    category: 'create',
  },
  {
    id: 'generate-music',
    label: { en: 'Generate Music', ka: 'მუსიკის შექმნა', ru: 'Создать Музыку' },
    icon: '🎵',
    intent: 'Generate AI music',
    targetService: 'music',
    targetAgent: 'music-agent',
    visibilityRule: 'always',
    priority: 4,
    category: 'create',
  },
  {
    id: 'business-plan',
    label: { en: 'Business Plan', ka: 'ბიზნეს გეგმა', ru: 'Бизнес-план' },
    icon: '📊',
    intent: 'Create a business plan',
    targetService: 'business',
    targetAgent: 'business-agent',
    visibilityRule: 'always',
    priority: 5,
    category: 'create',
  },
  {
    id: 'store-setup',
    label: { en: 'Setup Store', ka: 'მაღაზიის დაყენება', ru: 'Настройка Магазина' },
    icon: '🏪',
    intent: 'Help me set up an online store',
    targetService: 'shop',
    targetAgent: 'store-agent',
    visibilityRule: 'always',
    priority: 6,
    category: 'create',
  },
  {
    id: 'build-workflow',
    label: { en: 'Build Workflow', ka: 'სამუშაო პროცესი', ru: 'Построить Воркфлоу' },
    icon: '⚡',
    intent: 'Help me build a multi-step workflow',
    visibilityRule: 'always',
    priority: 7,
    category: 'workflow',
  },
  {
    id: 'creator-flow',
    label: { en: 'Creator Flow', ka: 'კრეატორ ფლოუ', ru: 'Креатор-флоу' },
    icon: '🎬',
    intent: 'Start a Creator Flow: Avatar → Video → Music → Subtitles → Reels',
    workflowTemplate: 'creator-flow',
    visibilityRule: 'always',
    priority: 8,
    category: 'workflow',
  },
  {
    id: 'reels-pack',
    label: { en: 'Reels Pack', ka: 'რილსების პაკეტი', ru: 'Пакет Reels' },
    icon: '📱',
    intent: 'Create a pack of social reels',
    workflowTemplate: 'social-content-pack',
    visibilityRule: 'always',
    priority: 9,
    category: 'workflow',
  },
  {
    id: 'start-project',
    label: { en: 'Start Project', ka: 'პროექტის დაწყება', ru: 'Начать Проект' },
    icon: '📁',
    intent: 'Start a new project',
    visibilityRule: 'no-project',
    priority: 10,
    category: 'project',
  },
  {
    id: 'continue-project',
    label: { en: 'Continue Project', ka: 'პროექტის გაგრძელება', ru: 'Продолжить Проект' },
    icon: '▶️',
    intent: 'Continue my last project',
    visibilityRule: 'has-project',
    priority: 10,
    category: 'project',
  },
  {
    id: 'show-tools',
    label: { en: 'Show All Tools', ka: 'ყველა ინსტრუმენტი', ru: 'Все Инструменты' },
    icon: '🧰',
    intent: 'Show all available AI tools',
    visibilityRule: 'always',
    priority: 20,
    category: 'discover',
  },
  {
    id: 'seo-audit',
    label: { en: 'SEO Audit', ka: 'SEO აუდიტი', ru: 'SEO Аудит' },
    icon: '🔍',
    intent: 'Run an SEO audit for my content',
    targetService: 'seo',
    targetAgent: 'seo-agent',
    visibilityRule: 'always',
    priority: 11,
    category: 'tools',
  },
  {
    id: 'pricing-info',
    label: { en: 'See Pricing', ka: 'ფასების ნახვა', ru: 'Посмотреть Цены' },
    icon: '💰',
    intent: 'Show me pricing information',
    visibilityRule: 'always',
    priority: 30,
    category: 'discover',
  },
];

// ─── Service Shortcuts ───────────────────────────────────────────────────────

export interface ServiceShortcut {
  slug: string;
  label: { en: string; ka: string; ru: string };
  icon: string;
  agentId: string;
}

export const SERVICE_SHORTCUTS: ServiceShortcut[] = [
  { slug: 'avatar', label: { en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' }, icon: '👤', agentId: 'avatar-agent' },
  { slug: 'video', label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' }, icon: '🎬', agentId: 'video-agent' },
  { slug: 'image', label: { en: 'Image', ka: 'სურათი', ru: 'Изображение' }, icon: '🖼️', agentId: 'image-agent' },
  { slug: 'music', label: { en: 'Music', ka: 'მუსიკა', ru: 'Музыка' }, icon: '🎵', agentId: 'music-agent' },
  { slug: 'subtitle', label: { en: 'Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, icon: '💬', agentId: 'subtitle-agent' },
  { slug: 'shop', label: { en: 'Store', ka: 'მაღაზია', ru: 'Магазин' }, icon: '🏪', agentId: 'store-agent' },
  { slug: 'seo', label: { en: 'SEO', ka: 'SEO', ru: 'SEO' }, icon: '🔍', agentId: 'seo-agent' },
  { slug: 'business', label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' }, icon: '📊', agentId: 'business-agent' },
  { slug: 'reels', label: { en: 'Reels', ka: 'რილსები', ru: 'Reels' }, icon: '📱', agentId: 'reels-agent' },
  { slug: 'marketing', label: { en: 'Marketing', ka: 'მარკეტინგი', ru: 'Маркетинг' }, icon: '📣', agentId: 'marketing-agent' },
  { slug: 'content', label: { en: 'Content', ka: 'კონტენტი', ru: 'Контент' }, icon: '✍️', agentId: 'content-agent' },
  { slug: 'dev', label: { en: 'Development', ka: 'დეველოპმენტი', ru: 'Разработка' }, icon: '💻', agentId: 'dev-agent' },
];

// ─── Default follow-up chips ─────────────────────────────────────────────────

export const DEFAULT_FOLLOW_UP_CHIPS: SuggestionChip[] = [
  { label: 'Continue', action: 'Continue with the next step', variant: 'primary' },
  { label: 'Use Last Result', action: 'Use the last result in a new workflow', variant: 'secondary' },
  { label: 'Add Music', action: 'Add music to this result', icon: '🎵', variant: 'secondary' },
  { label: 'Add Captions', action: 'Add captions/subtitles', icon: '💬', variant: 'secondary' },
  { label: 'Make Poster', action: 'Create a poster from this', icon: '🖼️', variant: 'secondary' },
  { label: 'Export', action: 'Export the final result', icon: '📤', variant: 'secondary' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getVisibleQuickActions(
  hasProject: boolean,
  serviceContext?: string
): QuickAction[] {
  return QUICK_ACTIONS
    .filter(qa => {
      if (qa.visibilityRule === 'has-project' && !hasProject) return false;
      if (qa.visibilityRule === 'no-project' && hasProject) return false;
      if (qa.visibilityRule === 'service-context' && !serviceContext) return false;
      return true;
    })
    .sort((a, b) => a.priority - b.priority);
}
