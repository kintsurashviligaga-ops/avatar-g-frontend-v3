import type { CommandLanguage, ServiceId, ServiceStatus } from './types';

export type OmniLocale = 'ka' | 'en' | 'ru';
export type ServiceGroup = 'business' | 'creative' | 'analytics';

export const SERVICE_GROUP_ORDER: ServiceGroup[] = ['business', 'creative', 'analytics'];

const SERVICE_LOCALIZATION: Record<
  ServiceId,
  Record<OmniLocale, { title: string; subtitle: string; short: string; group: ServiceGroup }>
> = {
    avatar: {
      ka: { title: 'ავატარი', subtitle: 'პერსონა და ვიზუალური იდენტობა', short: 'AV', group: 'creative' },
      en: { title: 'Avatar', subtitle: 'Persona and visual identity generation', short: 'AV', group: 'creative' },
      ru: { title: 'Аватар', subtitle: 'Персона и визуальная идентичность', short: 'AV', group: 'creative' },
    },
    video: {
      ka: { title: 'ვიდეო', subtitle: 'სცენები და მოძრაობის კონცეპტი', short: 'VD', group: 'creative' },
      en: { title: 'Video', subtitle: 'Scene and motion concepts', short: 'VD', group: 'creative' },
      ru: { title: 'Видео', subtitle: 'Сцены и motion-концепты', short: 'VD', group: 'creative' },
    },
    image: {
      ka: { title: 'სურათი', subtitle: 'ვიზუალები და გრაფიკული აქტივები', short: 'IM', group: 'creative' },
      en: { title: 'Image', subtitle: 'Visuals and still assets', short: 'IM', group: 'creative' },
      ru: { title: 'Изображение', subtitle: 'Визуалы и графические активы', short: 'IM', group: 'creative' },
    },
    music: {
      ka: { title: 'მუსიკა', subtitle: 'საუნდტრეკი და ატმოსფერო', short: 'MU', group: 'creative' },
      en: { title: 'Music', subtitle: 'Soundtrack and ambience design', short: 'MU', group: 'creative' },
      ru: { title: 'Музыка', subtitle: 'Саундтрек и атмосфера', short: 'MU', group: 'creative' },
    },
    'game-creation': {
      ka: { title: 'თამაშების შექმნა', subtitle: 'მექანიკა, ლეველები და კონცეფცია', short: 'GM', group: 'business' },
      en: { title: 'Game Creation', subtitle: 'Mechanics, levels, and concepting', short: 'GM', group: 'business' },
      ru: { title: 'Создание игр', subtitle: 'Механики, уровни и концепция', short: 'GM', group: 'business' },
    },
    'interior-design': {
      ka: { title: 'ინტერიერის დიზაინი', subtitle: 'სივრცის დაგეგმარება და სტილი', short: 'IN', group: 'creative' },
      en: { title: 'Interior Design', subtitle: 'Space planning and interior styling', short: 'IN', group: 'creative' },
      ru: { title: 'Дизайн интерьера', subtitle: 'Планировка и стиль пространства', short: 'IN', group: 'creative' },
    },
    'prompt-builder': {
      ka: { title: 'პრომპტ ბილდერი', subtitle: 'სტრუქტურირებული prompt-ების მშენებლობა', short: 'PR', group: 'business' },
      en: { title: 'Prompt Builder', subtitle: 'Structured prompt engineering', short: 'PR', group: 'business' },
      ru: { title: 'Prompt Builder', subtitle: 'Структурированный prompt-инжиниринг', short: 'PR', group: 'business' },
    },
    'terminal-coding': {
      ka: { title: 'ტერმინალი და კოდინგი', subtitle: 'CLI, სკრიპტები და კოდის იმპლემენტაცია', short: 'TC', group: 'business' },
      en: { title: 'Terminal & Coding', subtitle: 'CLI, scripts, and implementation', short: 'TC', group: 'business' },
      ru: { title: 'Терминал и кодинг', subtitle: 'CLI, скрипты и реализация кода', short: 'TC', group: 'business' },
    },
    'content-writer': {
      ka: { title: 'კონტენტ მწერელი', subtitle: 'სტატიები, პოსტები და მარკეტინგული ტექსტი', short: 'CW', group: 'business' },
      en: { title: 'Content Writer', subtitle: 'Articles, posts and marketing copy', short: 'CW', group: 'business' },
      ru: { title: 'Контент-писатель', subtitle: 'Статьи, посты и маркетинговый текст', short: 'CW', group: 'business' },
    },
    podcast: {
      ka: { title: 'პოდკასტი', subtitle: 'სკრიპტები, ეპიზოდები და ოდიო კონტენტი', short: 'PD', group: 'creative' },
      en: { title: 'Podcast', subtitle: 'Scripts, episodes and audio content', short: 'PD', group: 'creative' },
      ru: { title: 'Подкаст', subtitle: 'Скрипты, эпизоды и аудиоконтент', short: 'PD', group: 'creative' },
    },
    character: {
      ka: { title: 'პერსონაჟი', subtitle: 'AI ქარექტერის შექმნა და ბიოგრაფია', short: 'CH', group: 'creative' },
      en: { title: 'Character', subtitle: 'AI character creation and backstory', short: 'CH', group: 'creative' },
      ru: { title: 'Персонаж', subtitle: 'Создание AI-персонажа и биография', short: 'CH', group: 'creative' },
    },
    event: {
      ka: { title: 'ივენთ სტუდია', subtitle: 'AI ივენთ კონტენტი და სრული სცენარი', short: 'EV', group: 'business' },
      en: { title: 'Event Studio', subtitle: 'AI event content and full scenario', short: 'EV', group: 'business' },
      ru: { title: 'Event-студия', subtitle: 'AI-контент и полный сценарий мероприятия', short: 'EV', group: 'business' },
    },
    tourism: {
      ka: { title: 'ტურიზმი', subtitle: 'მოგზაურობის გეგმები და ადგილობრივი გიდი', short: 'TR', group: 'business' },
      en: { title: 'Tourism & Travel', subtitle: 'Travel plans, local guides and itineraries', short: 'TR', group: 'business' },
      ru: { title: 'Туризм и путешествия', subtitle: 'Планы путешествий и местные гиды', short: 'TR', group: 'business' },
    },
    'voice-studio': {
      ka: { title: 'ხმის სტუდია', subtitle: 'AI ხმის სინთეზი და TTS', short: 'VS', group: 'creative' },
      en: { title: 'Voice Studio', subtitle: 'AI voice synthesis and TTS', short: 'VS', group: 'creative' },
      ru: { title: 'Голосовая студия', subtitle: 'AI-синтез голоса и TTS', short: 'VS', group: 'creative' },
    },
  };

const GROUP_LABELS: Record<ServiceGroup, Record<OmniLocale, string>> = {
  business: {
    ka: 'ბიზნეს ოპერაციები',
    en: 'Business Operations',
    ru: 'Бизнес-операции',
  },
  creative: {
    ka: 'შემოქმედებითი',
    en: 'Creative',
    ru: 'Креатив',
  },
  analytics: {
    ka: 'ანალიტიკა',
    en: 'Analytics',
    ru: 'Аналитика',
  },
};

const STATUS_LABELS: Record<ServiceStatus, Record<OmniLocale, string>> = {
  idle: {
    ka: 'ლოდინი',
    en: 'Idle',
    ru: 'Ожидание',
  },
  ready: {
    ka: 'მზადაა',
    en: 'Ready',
    ru: 'Готово',
  },
  running: {
    ka: 'მუშავდება',
    en: 'Running',
    ru: 'В работе',
  },
  error: {
    ka: 'შეცდომა',
    en: 'Error',
    ru: 'Ошибка',
  },
};

const BOOLEAN_LABELS: Record<'on' | 'off', Record<OmniLocale, string>> = {
  on: {
    ka: 'ჩართული',
    en: 'On',
    ru: 'Вкл',
  },
  off: {
    ka: 'გამორთული',
    en: 'Off',
    ru: 'Выкл',
  },
};

const SMALL_NUMBER_WORDS: Record<
  OmniLocale,
  Record<number, string>
> = {
  ka: {
    0: 'ნული',
    1: 'ერთი',
    2: 'ორი',
    3: 'სამი',
    4: 'ოთხი',
    5: 'ხუთი',
    6: 'ექვსი',
    7: 'შვიდი',
    8: 'რვა',
    9: 'ცხრა',
  },
  en: {
    0: 'zero',
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
    7: 'seven',
    8: 'eight',
    9: 'nine',
  },
  ru: {
    0: 'ноль',
    1: 'один',
    2: 'два',
    3: 'три',
    4: 'четыре',
    5: 'пять',
    6: 'шесть',
    7: 'семь',
    8: 'восемь',
    9: 'девять',
  },
};

const LANGUAGE_LABELS: Record<CommandLanguage, Record<OmniLocale, string>> = {
  ka: {
    ka: 'ქართული',
    en: 'Georgian',
    ru: 'Грузинский',
  },
  en: {
    ka: 'ინგლისური',
    en: 'English',
    ru: 'Английский',
  },
  ru: {
    ka: 'რუსული',
    en: 'Russian',
    ru: 'Русский',
  },
};

export function normalizeOmniLocale(locale: string | null | undefined): OmniLocale {
  if (locale === 'en' || locale === 'ru' || locale === 'ka') {
    return locale;
  }

  if (typeof locale === 'string') {
    if (locale.startsWith('en')) return 'en';
    if (locale.startsWith('ru')) return 'ru';
    if (locale.startsWith('ka')) return 'ka';
  }

  return 'ka';
}

export function getLocalizedService(serviceId: ServiceId, locale: string | OmniLocale) {
  const normalizedLocale = normalizeOmniLocale(locale);
  return SERVICE_LOCALIZATION[serviceId][normalizedLocale];
}

export function getLocalizedGroupLabel(group: ServiceGroup, locale: string | OmniLocale) {
  const normalizedLocale = normalizeOmniLocale(locale);
  return GROUP_LABELS[group][normalizedLocale];
}

export function localizeServiceStatus(status: ServiceStatus, locale: string | OmniLocale) {
  const normalizedLocale = normalizeOmniLocale(locale);
  return STATUS_LABELS[status][normalizedLocale];
}

export function localizeBooleanState(enabled: boolean, locale: string | OmniLocale) {
  const normalizedLocale = normalizeOmniLocale(locale);
  return enabled ? BOOLEAN_LABELS.on[normalizedLocale] : BOOLEAN_LABELS.off[normalizedLocale];
}

export function formatCountWord(value: number, locale: string | OmniLocale) {
  const normalizedLocale = normalizeOmniLocale(locale);
  if (value < 10) {
    return SMALL_NUMBER_WORDS[normalizedLocale][value] ?? `${value}`;
  }
  return `${value}`;
}

export function localizeCommandLanguage(language: CommandLanguage, locale: string | OmniLocale) {
  const normalizedLocale = normalizeOmniLocale(locale);
  return LANGUAGE_LABELS[language][normalizedLocale];
}
