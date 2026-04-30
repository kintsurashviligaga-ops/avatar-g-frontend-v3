import type { CommandLanguage, ServiceId, ServiceStatus } from './types';

export type OmniLocale = 'ka' | 'en' | 'ru';
export type ServiceGroup = 'business' | 'creative' | 'analytics';

export const SERVICE_GROUP_ORDER: ServiceGroup[] = ['business', 'creative', 'analytics'];

const SERVICE_LOCALIZATION: Record<
  ServiceId,
  Record<OmniLocale, { title: string; subtitle: string; short: string; group: ServiceGroup }>
> = {
  'agent-g': {
    ka: {
      title: 'აგენტი G ბირთვი',
      subtitle: 'ცენტრალური ორკესტრაციის ტვინი',
      short: 'AG',
      group: 'business',
    },
    en: {
      title: 'Agent G Core',
      subtitle: 'Primary orchestration brain',
      short: 'AG',
      group: 'business',
    },
    ru: {
      title: 'Ядро Agent G',
      subtitle: 'Главный оркестратор',
      short: 'AG',
      group: 'business',
    },
  },
  'business-strategy': {
    ka: {
      title: 'ბიზნეს სტრატეგია',
      subtitle: 'ზრდა და მონეტიზაციის დაგეგმვა',
      short: 'BS',
      group: 'business',
    },
    en: {
      title: 'Business Strategy',
      subtitle: 'Growth and monetization strategy',
      short: 'BS',
      group: 'business',
    },
    ru: {
      title: 'Бизнес-стратегия',
      subtitle: 'Рост и монетизация',
      short: 'BS',
      group: 'business',
    },
  },
  'executive-ops': {
    ka: {
      title: 'აღმასრულებელი ოპერაციები',
      subtitle: 'მენეჯერული გადაწყვეტილებები და ბრიფები',
      short: 'EO',
      group: 'business',
    },
    en: {
      title: 'Executive Ops',
      subtitle: 'Decision board and executive briefs',
      short: 'EO',
      group: 'business',
    },
    ru: {
      title: 'Операции руководства',
      subtitle: 'Брифы и решение рисков',
      short: 'EO',
      group: 'business',
    },
  },
  'avatar-studio': {
    ka: {
      title: 'ავატარის სტუდია',
      subtitle: 'იდენტობის და პერსონის გენერირება',
      short: 'AV',
      group: 'creative',
    },
    en: {
      title: 'Avatar Studio',
      subtitle: 'Identity and persona generation',
      short: 'AV',
      group: 'creative',
    },
    ru: {
      title: 'Студия аватаров',
      subtitle: 'Генерация образа и персонажа',
      short: 'AV',
      group: 'creative',
    },
  },
  'image-gen': {
    ka: {
      title: 'სურათების გენერატორი',
      subtitle: 'ვიზუალური კონცეპტები და სტილები',
      short: 'IM',
      group: 'creative',
    },
    en: {
      title: 'Image Generator',
      subtitle: 'Campaign visuals and still assets',
      short: 'IM',
      group: 'creative',
    },
    ru: {
      title: 'Генератор изображений',
      subtitle: 'Визуалы и ключевые кадры',
      short: 'IM',
      group: 'creative',
    },
  },
  'video-gen': {
    ka: {
      title: 'ვიდეო გენერატორი',
      subtitle: 'სცენარიზაცია და მოძრავი კონტენტი',
      short: 'VD',
      group: 'creative',
    },
    en: {
      title: 'Video Generator',
      subtitle: 'Motion concepts and scene planning',
      short: 'VD',
      group: 'creative',
    },
    ru: {
      title: 'Генератор видео',
      subtitle: 'Сцены и динамический контент',
      short: 'VD',
      group: 'creative',
    },
  },
  'voice-synth': {
    ka: {
      title: 'ხმის სინთეზი',
      subtitle: 'ხმოვანი ნარაცია და ტექსტის გახმოვანება',
      short: 'VS',
      group: 'creative',
    },
    en: {
      title: 'Voice Synth',
      subtitle: 'Voiceover and speech synthesis',
      short: 'VS',
      group: 'creative',
    },
    ru: {
      title: 'Синтез голоса',
      subtitle: 'Озвучка и TTS',
      short: 'VS',
      group: 'creative',
    },
  },
  'music-lab': {
    ka: {
      title: 'მუსიკის ლაბი',
      subtitle: 'ფონური მუსიკა და საუნდტრეკები',
      short: 'MU',
      group: 'creative',
    },
    en: {
      title: 'Music Lab',
      subtitle: 'Mood bed and soundtrack generation',
      short: 'MU',
      group: 'creative',
    },
    ru: {
      title: 'Музыкальная лаборатория',
      subtitle: 'Саундтрек и аудиодорожка',
      short: 'MU',
      group: 'creative',
    },
  },
  'copy-engine': {
    ka: {
      title: 'ტექსტის ძრავი',
      subtitle: 'სარეკლამო ტექსტი და სცენარები',
      short: 'CP',
      group: 'creative',
    },
    en: {
      title: 'Copy Engine',
      subtitle: 'Narrative, ad copy, and scripts',
      short: 'CP',
      group: 'creative',
    },
    ru: {
      title: 'Текстовый движок',
      subtitle: 'Сценарии и рекламные тексты',
      short: 'CP',
      group: 'creative',
    },
  },
  'workflow-automation': {
    ka: {
      title: 'პროცესების ავტომაცია',
      subtitle: 'სერვისებს შორის ავტომატური ჯაჭვები',
      short: 'WF',
      group: 'business',
    },
    en: {
      title: 'Workflow Automation',
      subtitle: 'Cross-service pipeline control',
      short: 'WF',
      group: 'business',
    },
    ru: {
      title: 'Автоматизация процессов',
      subtitle: 'Сценарии между сервисами',
      short: 'WF',
      group: 'business',
    },
  },
  'analytics-hub': {
    ka: {
      title: 'ანალიტიკის ჰაბი',
      subtitle: 'მაჩვენებლები, ხარჯები და პროგნოზი',
      short: 'AN',
      group: 'analytics',
    },
    en: {
      title: 'Analytics Hub',
      subtitle: 'Telemetry and spend intelligence',
      short: 'AN',
      group: 'analytics',
    },
    ru: {
      title: 'Центр аналитики',
      subtitle: 'Метрики, расходы и прогноз',
      short: 'AN',
      group: 'analytics',
    },
  },
  'commerce-pilot': {
    ka: {
      title: 'კომერციის პილოტი',
      subtitle: 'ოფერის და გაყიდვების სტრატეგია',
      short: 'CM',
      group: 'business',
    },
    en: {
      title: 'Commerce Pilot',
      subtitle: 'Offer design and storefront strategy',
      short: 'CM',
      group: 'business',
    },
    ru: {
      title: 'Коммерческий пилот',
      subtitle: 'Офферы и стратегия продаж',
      short: 'CM',
      group: 'business',
    },
  },
  'fulfillment-hq': {
    ka: {
      title: 'მიწოდების ცენტრი',
      subtitle: 'შესრულება, ლოჯისტიკა და ვადები',
      short: 'FH',
      group: 'business',
    },
    en: {
      title: 'Fulfillment HQ',
      subtitle: 'Delivery tracking and operations',
      short: 'FH',
      group: 'business',
    },
    ru: {
      title: 'Центр выполнения',
      subtitle: 'Доставка, логистика и сроки',
      short: 'FH',
      group: 'business',
    },
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
