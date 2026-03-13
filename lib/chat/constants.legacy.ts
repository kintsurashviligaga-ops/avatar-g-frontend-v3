/**
 * lib/chat/constants.ts
 * =====================
 * Static data for the Universal Chat — quick actions, service shortcuts,
 * suggested prompts, and i18n labels.
 */

import type { QuickAction, ServiceShortcut, SuggestionChip } from './types.legacy';

// ─── Quick Actions ───────────────────────────────────────────────────────────

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create-avatar',
    label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать Аватар' },
    icon: '👤',
    action: 'Create a professional AI avatar',
    category: 'create',
  },
  {
    id: 'generate-video',
    label: { en: 'Generate Video', ka: 'ვიდეოს შექმნა', ru: 'Создать Видео' },
    icon: '🎬',
    action: 'Generate an AI video',
    category: 'create',
  },
  {
    id: 'create-poster',
    label: { en: 'Create Poster', ka: 'პოსტერის შექმნა', ru: 'Создать Постер' },
    icon: '🖼️',
    action: 'Generate a poster design',
    category: 'create',
  },
  {
    id: 'generate-music',
    label: { en: 'Generate Music', ka: 'მუსიკის შექმნა', ru: 'Создать Музыку' },
    icon: '🎵',
    action: 'Generate AI music',
    category: 'create',
  },
  {
    id: 'build-workflow',
    label: { en: 'Build Workflow', ka: 'სამუშაო პროცესი', ru: 'Построить Воркфлоу' },
    icon: '⚡',
    action: 'Help me build a multi-step workflow',
    category: 'workflow',
  },
  {
    id: 'start-project',
    label: { en: 'Start Project', ka: 'პროექტის დაწყება', ru: 'Начать Проект' },
    icon: '📁',
    action: 'Start a new project',
    category: 'project',
  },
  {
    id: 'continue-project',
    label: { en: 'Continue Project', ka: 'პროექტის გაგრძელება', ru: 'Продолжить Проект' },
    icon: '▶️',
    action: 'Continue my last project',
    category: 'project',
  },
  {
    id: 'show-tools',
    label: { en: 'Show All Tools', ka: 'ყველა ინსტრუმენტი', ru: 'Все Инструменты' },
    icon: '🧰',
    action: 'Show all available AI tools',
    category: 'discover',
  },
  {
    id: 'business-plan',
    label: { en: 'Business Plan', ka: 'ბიზნეს გეგმა', ru: 'Бизнес-план' },
    icon: '📊',
    action: 'Create a business plan',
    category: 'create',
  },
  {
    id: 'seo-audit',
    label: { en: 'SEO Audit', ka: 'SEO აუდიტი', ru: 'SEO Аудит' },
    icon: '🔍',
    action: 'Run an SEO audit for my content',
    category: 'tools',
  },
  {
    id: 'store-setup',
    label: { en: 'Setup Store', ka: 'მაღაზიის დაყენება', ru: 'Настройка Магазина' },
    icon: '🏪',
    action: 'Help me set up an online store',
    category: 'create',
  },
  {
    id: 'reels-pack',
    label: { en: 'Reels Pack', ka: 'რილსების პაკეტი', ru: 'Пакет Reels' },
    icon: '📱',
    action: 'Create a pack of 10 social reels',
    category: 'workflow',
  },
];

// ─── Service Shortcuts ───────────────────────────────────────────────────────

export const SERVICE_SHORTCUTS: ServiceShortcut[] = [
  { slug: 'avatar', label: { en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' }, icon: '👤', agentId: 'avatar-agent' },
  { slug: 'video', label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' }, icon: '🎬', agentId: 'video-agent' },
  { slug: 'image', label: { en: 'Image', ka: 'სურათი', ru: 'Изображение' }, icon: '🖼️', agentId: 'image-agent' },
  { slug: 'music', label: { en: 'Music', ka: 'მუსიკა', ru: 'Музыка' }, icon: '🎵', agentId: 'music-agent' },
  { slug: 'poster', label: { en: 'Poster', ka: 'პოსტერი', ru: 'Постер' }, icon: '📐', agentId: 'image-agent' },
  { slug: 'subtitle', label: { en: 'Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, icon: '💬', agentId: 'subtitle-agent' },
  { slug: 'shop', label: { en: 'Store', ka: 'მაღაზია', ru: 'Магазин' }, icon: '🏪', agentId: 'store-agent' },
  { slug: 'seo', label: { en: 'SEO', ka: 'SEO', ru: 'SEO' }, icon: '🔍', agentId: 'seo-agent' },
  { slug: 'business', label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' }, icon: '📊', agentId: 'business-agent' },
  { slug: 'reels', label: { en: 'Reels', ka: 'რილსები', ru: 'Reels' }, icon: '📱', agentId: 'reels-agent' },
  { slug: 'marketing', label: { en: 'Marketing', ka: 'მარკეტინგი', ru: 'Маркетинг' }, icon: '📣', agentId: 'marketing-agent' },
  { slug: 'dev', label: { en: 'Development', ka: 'დეველოპმენტი', ru: 'Разработка' }, icon: '💻', agentId: 'dev-agent' },
];

// ─── Post-response Suggestions ───────────────────────────────────────────────

export const DEFAULT_FOLLOW_UP_CHIPS: SuggestionChip[] = [
  { label: 'Continue', action: 'Continue with the next step', variant: 'primary' },
  { label: 'Use Last Result', action: 'Use the last result in a new workflow', variant: 'secondary' },
  { label: 'Add Music', action: 'Add music to this result', icon: '🎵', variant: 'secondary' },
  { label: 'Add Captions', action: 'Add captions/subtitles', icon: '💬', variant: 'secondary' },
  { label: 'Make Poster', action: 'Create a poster from this', icon: '🖼️', variant: 'secondary' },
  { label: 'Export', action: 'Export the final result', icon: '📤', variant: 'secondary' },
];

// ─── Chat Labels (i18n) ─────────────────────────────────────────────────────

export const CHAT_LABELS = {
  en: {
    title: 'Agent G',
    subtitle: 'AI Command Center',
    placeholder: 'Ask Agent G anything…',
    placeholderAction: 'Describe what you want to create…',
    placeholderWorkflow: 'Start with an idea, task, or workflow…',
    placeholderProject: 'Continue your project through Agent G…',
    welcome: "Hi, I'm Agent G.",
    welcomeSub: 'I can help you create avatars, videos, music, stores, business plans, and full workflows.',
    starterLabel: 'Get started',
    modeAssistant: 'Assistant',
    modeAction: 'Action',
    modeWorkflow: 'Workflow',
    modeProject: 'Project',
    modeAgent: 'Agent',
    agentsLabel: 'Agents',
    servicesLabel: 'Services',
    actionsLabel: 'Quick Actions',
    clearChat: 'Clear chat',
    newSession: 'New session',
    expand: 'Expand',
    collapse: 'Collapse',
    close: 'Close',
    delegatedTo: 'Delegated to',
    handledBy: 'Handled by',
    recommendedBy: 'Recommended by Agent G',
    suggestedNext: 'Suggested next',
    nextSteps: 'Next Steps',
    retry: 'Retry',
    tryAlternative: 'Try alternative',
    workflowProgress: 'Workflow Progress',
    stepOf: 'of',
  },
  ka: {
    title: 'აგენტი G',
    subtitle: 'AI ბრძანების ცენტრი',
    placeholder: 'იკითხეთ აგენტ G-ს ნებისმიერი…',
    placeholderAction: 'აღწერეთ რა გსურთ შექმნათ…',
    placeholderWorkflow: 'დაიწყეთ იდეით, ამოცანით ან სამუშაო პროცესით…',
    placeholderProject: 'გააგრძელეთ პროექტი აგენტ G-ს მეშვეობით…',
    welcome: 'გამარჯობა, მე ვარ აგენტი G.',
    welcomeSub: 'შემიძლია დაგეხმაროთ ავატარების, ვიდეოს, მუსიკის, მაღაზიების, ბიზნეს გეგმების და სრული სამუშაო პროცესების შექმნაში.',
    starterLabel: 'დაიწყეთ',
    modeAssistant: 'ასისტენტი',
    modeAction: 'მოქმედება',
    modeWorkflow: 'პროცესი',
    modeProject: 'პროექტი',
    modeAgent: 'აგენტი',
    agentsLabel: 'აგენტები',
    servicesLabel: 'სერვისები',
    actionsLabel: 'სწრაფი მოქმედებები',
    clearChat: 'ჩეთის გასუფთავება',
    newSession: 'ახალი სესია',
    expand: 'გაფართოება',
    collapse: 'შეკუმშვა',
    close: 'დახურვა',
    delegatedTo: 'დელეგირებულია',
    handledBy: 'მოგვარებულია',
    recommendedBy: 'რეკომენდირებულია აგენტ G-ს მიერ',
    suggestedNext: 'შემდეგი რეკომენდაცია',
    nextSteps: 'შემდეგი ნაბიჯები',
    retry: 'თავიდან',
    tryAlternative: 'ალტერნატივა',
    workflowProgress: 'სამუშაო პროცესის პროგრესი',
    stepOf: '-დან',
  },
  ru: {
    title: 'Агент G',
    subtitle: 'AI Центр Управления',
    placeholder: 'Спросите Агента G что угодно…',
    placeholderAction: 'Опишите, что хотите создать…',
    placeholderWorkflow: 'Начните с идеи, задачи или воркфлоу…',
    placeholderProject: 'Продолжите проект через Агента G…',
    welcome: 'Привет, я Агент G.',
    welcomeSub: 'Я помогу создать аватары, видео, музыку, магазины, бизнес-планы и полные рабочие процессы.',
    starterLabel: 'Начать',
    modeAssistant: 'Ассистент',
    modeAction: 'Действие',
    modeWorkflow: 'Процесс',
    modeProject: 'Проект',
    modeAgent: 'Агент',
    agentsLabel: 'Агенты',
    servicesLabel: 'Сервисы',
    actionsLabel: 'Быстрые действия',
    clearChat: 'Очистить чат',
    newSession: 'Новая сессия',
    expand: 'Развернуть',
    collapse: 'Свернуть',
    close: 'Закрыть',
    delegatedTo: 'Делегировано',
    handledBy: 'Обработано',
    recommendedBy: 'Рекомендовано Агентом G',
    suggestedNext: 'Следующая рекомендация',
    nextSteps: 'Следующие шаги',
    retry: 'Повторить',
    tryAlternative: 'Альтернатива',
    workflowProgress: 'Прогресс воркфлоу',
    stepOf: 'из',
  },
} as const;

export type ChatLang = keyof typeof CHAT_LABELS;

export function getChatLabels(lang: string) {
  return CHAT_LABELS[lang as ChatLang] ?? CHAT_LABELS.en;
}

// ─── Placeholder per mode ────────────────────────────────────────────────────

export function getPlaceholder(mode: string, lang: string): string {
  const l = getChatLabels(lang);
  switch (mode) {
    case 'action': return l.placeholderAction;
    case 'workflow': return l.placeholderWorkflow;
    case 'project': return l.placeholderProject;
    default: return l.placeholder;
  }
}
