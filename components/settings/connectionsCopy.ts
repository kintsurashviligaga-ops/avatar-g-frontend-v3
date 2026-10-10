/**
 * Settings → Connections words, KA / EN / RU. The owner's rule (Omnichannel A3): short, natural, and only four status
 * words — Connect, Connected, Temporarily unavailable, Disconnect. No technical terms.
 */
import type { ConnectionId, ConnectionState } from '@/lib/connections/model';
import type { NotifyEventKind } from '@/lib/notifications/preferences';

export type ConnLang = 'ka' | 'en' | 'ru';

export interface ConnCopy {
  title: string;
  subtitle: string;
  rows: Record<ConnectionId, string>;
  state: Record<ConnectionState, string>;
  loadFailed: string;
  retry: string;
  phoneOff: string;
  telegramOff: string;
  signIn: string;
  signInButton: string;
  prefsTitle: string;
  prefsLead: string;
  events: Record<NotifyEventKind, string>;
  site: string;
  whatsapp: string;
  siteAlways: string;
  connectWhatsAppFirst: string;
  laterPlaces: string;
  saveFailed: string;
  prefsLoadFailed: string;
}

const KA: ConnCopy = {
  title: 'კავშირები',
  subtitle: 'სად დაგიკავშირდეს Agent G და სად მოგივიდეს შედეგი.',
  rows: { phone: 'ტელეფონი: ზარი და SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', notifications: 'შეტყობინებები' },
  state: { connect: 'დაკავშირება', connected: 'დაკავშირებულია', unavailable: 'დროებით მიუწვდომელია', signin: 'შედი ანგარიშზე', on: 'ჩართულია' },
  loadFailed: 'სტატუსი ვერ ჩაიტვირთა.',
  retry: 'თავიდან',
  phoneOff: 'Agent G-ის ზარები და SMS ჯერ არ არის ხელმისაწვდომი.',
  telegramOff: 'Telegram-ის დაკავშირება ჯერ არ არის ხელმისაწვდომი.',
  signIn: 'კავშირების სამართავად შედი ანგარიშზე.',
  signInButton: 'შესვლა',
  prefsTitle: 'რა სად მოგივიდეს',
  prefsLead: 'საიტზე ყოველთვის ნახავ. აირჩიე, რა გინდა WhatsApp-ზეც.',
  events: {
    task_completed: 'დავალება დასრულდა',
    approval_required: 'საჭიროა შენი თანხმობა',
    needs_attention: 'რაღაც შენს ყურადღებას საჭიროებს',
    scheduled_report: 'დაგეგმილი რეპორტი',
    reminder: 'შეხსენება',
  },
  site: 'საიტზე',
  whatsapp: 'WhatsApp',
  siteAlways: 'საიტზე ყოველთვის',
  connectWhatsAppFirst: 'WhatsApp-ზე მისაღებად ჯერ დააკავშირე WhatsApp.',
  laterPlaces: 'Telegram, SMS და ზარი დროებით მიუწვდომელია.',
  saveFailed: 'ვერ შეინახა. სცადე თავიდან.',
  prefsLoadFailed: 'პარამეტრები ვერ ჩაიტვირთა.',
};

const EN: ConnCopy = {
  title: 'Connections',
  subtitle: 'Where Agent G can reach you and send your results.',
  rows: { phone: 'Phone: calls & SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', notifications: 'Notifications' },
  state: { connect: 'Connect', connected: 'Connected', unavailable: 'Temporarily unavailable', signin: 'Sign in', on: 'On' },
  loadFailed: 'Could not load the status.',
  retry: 'Retry',
  phoneOff: 'Agent G calls and SMS are not available yet.',
  telegramOff: 'Connecting Telegram is not available yet.',
  signIn: 'Sign in to manage your connections.',
  signInButton: 'Sign in',
  prefsTitle: 'What reaches you where',
  prefsLead: 'You always see it on the site. Choose what should also come to WhatsApp.',
  events: {
    task_completed: 'A task is finished',
    approval_required: 'Your approval is needed',
    needs_attention: 'Something needs your attention',
    scheduled_report: 'A scheduled report',
    reminder: 'A reminder',
  },
  site: 'On the site',
  whatsapp: 'WhatsApp',
  siteAlways: 'Always on the site',
  connectWhatsAppFirst: 'Connect WhatsApp first to get news there.',
  laterPlaces: 'Telegram, SMS and calls are temporarily unavailable.',
  saveFailed: 'Could not save. Try again.',
  prefsLoadFailed: 'Could not load your settings.',
};

const RU: ConnCopy = {
  title: 'Подключения',
  subtitle: 'Где Agent G может связаться с вами и куда прислать результат.',
  rows: { phone: 'Телефон: звонки и SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', notifications: 'Уведомления' },
  state: { connect: 'Подключить', connected: 'Подключено', unavailable: 'Временно недоступно', signin: 'Войдите', on: 'Включены' },
  loadFailed: 'Не удалось загрузить статус.',
  retry: 'Повторить',
  phoneOff: 'Звонки и SMS от Agent G пока недоступны.',
  telegramOff: 'Подключение Telegram пока недоступно.',
  signIn: 'Войдите, чтобы управлять подключениями.',
  signInButton: 'Войти',
  prefsTitle: 'Что и куда приходит',
  prefsLead: 'На сайте вы видите всё. Выберите, что присылать ещё и в WhatsApp.',
  events: {
    task_completed: 'Задача выполнена',
    approval_required: 'Нужно ваше подтверждение',
    needs_attention: 'Что-то требует внимания',
    scheduled_report: 'Отчёт по расписанию',
    reminder: 'Напоминание',
  },
  site: 'На сайте',
  whatsapp: 'WhatsApp',
  siteAlways: 'Всегда на сайте',
  connectWhatsAppFirst: 'Чтобы получать в WhatsApp, сначала подключите WhatsApp.',
  laterPlaces: 'Telegram, SMS и звонки временно недоступны.',
  saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.',
  prefsLoadFailed: 'Не удалось загрузить настройки.',
};

export const CONN_COPY: Record<ConnLang, ConnCopy> = { ka: KA, en: EN, ru: RU };
export const connLang = (l: string | null | undefined): ConnLang => (l === 'en' || l === 'ru' ? l : 'ka');
