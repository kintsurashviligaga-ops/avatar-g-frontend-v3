/**
 * lib/chat/config/localization.ts
 * Complete chat label system — 3 languages, 40+ keys.
 */

import type { LocaleCode } from '@/types/core';
import type { ChatMode } from '../types';

// ─── Chat Labels ─────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    title: 'Agent G',
    subtitle: 'AI Command Center',
    placeholder: 'Ask Agent G anything…',
    placeholderAction: 'Describe what you want to create…',
    placeholderWorkflow: 'Start with an idea, task, or workflow…',
    placeholderProject: 'Continue your project through Agent G…',
    placeholderAgent: 'Talk to this agent directly…',
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
    projectLabel: 'Project',
    continueProject: 'Continue',
    lastAsset: 'Last asset',
    nextStep: 'Next step',
    errorGeneric: 'Something went wrong. Please try again.',
    errorNetwork: 'Connection error. Please check your network.',
    errorRateLimit: 'Rate limited. Please wait a moment.',
    copying: 'Copied!',
    attachFile: 'Attach file',
    voiceInput: 'Voice input',
    send: 'Send',
    stop: 'Stop',
  },
  ka: {
    title: 'აგენტი G',
    subtitle: 'AI ბრძანების ცენტრი',
    placeholder: 'იკითხეთ აგენტ G-ს ნებისმიერი…',
    placeholderAction: 'აღწერეთ რა გსურთ შექმნათ…',
    placeholderWorkflow: 'დაიწყეთ იდეით, ამოცანით ან სამუშაო პროცესით…',
    placeholderProject: 'გააგრძელეთ პროექტი აგენტ G-ს მეშვეობით…',
    placeholderAgent: 'ესაუბრეთ ამ აგენტს პირდაპირ…',
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
    projectLabel: 'პროექტი',
    continueProject: 'გაგრძელება',
    lastAsset: 'ბოლო აქტივი',
    nextStep: 'შემდეგი ნაბიჯი',
    errorGeneric: 'რაღაც შეცდომა მოხდა. გთხოვთ სცადოთ თავიდან.',
    errorNetwork: 'კავშირის შეცდომა. გთხოვთ შეამოწმოთ ინტერნეტი.',
    errorRateLimit: 'ლიმიტი ამოიწურა. გთხოვთ მოიცადოთ.',
    copying: 'დაკოპირებულია!',
    attachFile: 'ფაილის მიმაგრება',
    voiceInput: 'ხმოვანი შეყვანა',
    send: 'გაგზავნა',
    stop: 'შეჩერება',
  },
  ru: {
    title: 'Агент G',
    subtitle: 'AI Центр Управления',
    placeholder: 'Спросите Агента G что угодно…',
    placeholderAction: 'Опишите, что хотите создать…',
    placeholderWorkflow: 'Начните с идеи, задачи или воркфлоу…',
    placeholderProject: 'Продолжите проект через Агента G…',
    placeholderAgent: 'Общайтесь с этим агентом напрямую…',
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
    projectLabel: 'Проект',
    continueProject: 'Продолжить',
    lastAsset: 'Последний актив',
    nextStep: 'Следующий шаг',
    errorGeneric: 'Что-то пошло не так. Пожалуйста, попробуйте снова.',
    errorNetwork: 'Ошибка соединения. Проверьте интернет.',
    errorRateLimit: 'Лимит превышен. Подождите немного.',
    copying: 'Скопировано!',
    attachFile: 'Прикрепить файл',
    voiceInput: 'Голосовой ввод',
    send: 'Отправить',
    stop: 'Стоп',
  },
} as const;

export type ChatLabels = (typeof LABELS)['en'];
export type ChatLabelKey = keyof ChatLabels;

export function getChatLabels(lang: LocaleCode | string): ChatLabels {
  return (LABELS[lang as keyof typeof LABELS] ?? LABELS.en) as ChatLabels;
}

export function getPlaceholder(mode: ChatMode, lang: LocaleCode | string): string {
  const l = getChatLabels(lang);
  switch (mode) {
    case 'action': return l.placeholderAction;
    case 'workflow': return l.placeholderWorkflow;
    case 'project': return l.placeholderProject;
    case 'agent': return l.placeholderAgent;
    default: return l.placeholder;
  }
}

export function getModeLabel(mode: ChatMode, lang: LocaleCode | string): string {
  const l = getChatLabels(lang);
  switch (mode) {
    case 'assistant': return l.modeAssistant;
    case 'action': return l.modeAction;
    case 'workflow': return l.modeWorkflow;
    case 'project': return l.modeProject;
    case 'agent': return l.modeAgent;
    default: return l.modeAssistant;
  }
}
