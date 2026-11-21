/**
 * lib/i18n/a11yLabels.ts — the screen-reader names (aria-label, alt, iframe title) that used to be hard-coded in English
 * (Phase 8.15 polish, GG 2026-11-21). One table, ka first: a Georgian visitor's screen reader says „დახურვა“, not "Close".
 *
 * Use `a11y('close', locale)` where the component has a locale, and `a11y('close', docLang())` in the few shared widgets
 * that do not (it reads <html lang>, which the [locale] layout sets).
 */
export type A11yLang = 'ka' | 'en' | 'ru';

export const a11yLang = (locale?: string | null): A11yLang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

const LABELS = {
  close: { ka: 'დახურვა', en: 'Close', ru: 'Закрыть' },
  closeNotice: { ka: 'შეტყობინების დახურვა', en: 'Dismiss notification', ru: 'Закрыть уведомление' },
  expand: { ka: 'გადიდება', en: 'Expand', ru: 'Развернуть' },
  play: { ka: 'დაკვრა', en: 'Play', ru: 'Воспроизвести' },
  seek: { ka: 'გადახვევა', en: 'Seek', ru: 'Перемотка' },
  micLevel: { ka: 'მიკროფონის დონე', en: 'Microphone level', ru: 'Уровень микрофона' },
  language: { ka: 'ენა', en: 'Language', ru: 'Язык' },
  changePhoto: { ka: 'ფოტოს შეცვლა', en: 'Change photo', ru: 'Сменить фото' },
  editMemory: { ka: 'მოგონების რედაქტირება', en: 'Edit memory', ru: 'Изменить запись' },
  deleteMemory: { ka: 'მოგონების წაშლა', en: 'Delete memory', ru: 'Удалить запись' },
  trackInfo: { ka: 'ტრეკის ინფორმაცია', en: 'Track information', ru: 'Информация о треке' },
  attachment: { ka: 'მიმაგრებული სურათი', en: 'Attached image', ru: 'Прикреплённое изображение' },
  product: { ka: 'პროდუქტის ფოტო', en: 'Product photo', ru: 'Фото товара' },
  firstShot: { ka: 'პირველი კადრი', en: 'First shot', ru: 'Первый кадр' },
  fullscreenImage: { ka: 'სურათი სრულ ეკრანზე', en: 'Full-screen image', ru: 'Изображение на весь экран' },
  pagePreview: { ka: 'გვერდის გადახედვა', en: 'Page preview', ru: 'Предпросмотр страницы' },
  characterPreview: { ka: 'პერსონაჟის ფოტო', en: 'Character photo', ru: 'Фото персонажа' },
  email: { ka: 'ელფოსტა', en: 'Email', ru: 'Эл. почта' },
} as const satisfies Record<string, Record<A11yLang, string>>;

export type A11yKey = keyof typeof LABELS;

export function a11y(key: A11yKey, locale?: string | null): string {
  return LABELS[key][a11yLang(locale)];
}

/** The page language from <html lang> (client only; 'ka' on the server and when unset). */
export function docLang(): A11yLang {
  if (typeof document === 'undefined') return 'ka';
  return a11yLang(document.documentElement.lang);
}

/** Every key, for the parity test. */
export const A11Y_KEYS = Object.keys(LABELS) as A11yKey[];
export const a11yTable = LABELS;
