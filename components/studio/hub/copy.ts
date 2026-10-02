/**
 * components/studio/hub/copy.ts — every sentence of the Connectors · Plugins · Skills hub, in ka / en / ru, in ONE place
 * (the Local files part of the Connectors tab keeps its own words in components/studio/research/copy.ts — one body, one copy).
 *
 * ⚠️ HONEST BY CONSTRUCTION. A line here may say "soon", "not switched on yet" or "checking" — it never says "connected" for
 * something that is not, never names a price (copy.test.ts fails on a digit next to the word credit), and never names an
 * environment variable or a provider: the server's `note` strings on /api/agent-g/channels are for operators, not users.
 * Russian uses «вы» (docs/DESIGN.md §7).
 */
import type { Lang } from '@/components/studio/research/copy';

export type { Lang };
export const hubLang = (l?: string | null): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

export type SkillState = 'available' | 'account' | 'soon' | 'checking' | 'unknown';
export type SkillGroupId = 'talk' | 'create' | 'read' | 'research' | 'channels';
export type SkillId =
  | 'chat' | 'live'
  | 'image' | 'video' | 'music'
  | 'filesChat' | 'videoChat' | 'docs'
  | 'research'
  | 'web' | 'telegram' | 'whatsapp';

export interface HubCopy {
  // ── where it is offered
  sidebarRow: string; title: string; close: string; tabsLabel: string;
  tabs: { connectors: string; plugins: string; skills: string };
  // ── shared
  soon: string; retry: string; signIn: string; notOnYet: string;
  // ── connectors tab: the sections after the documents
  notifTitle: string; notifSub: string; waTitle: string; waSub: string; tgTitle: string; tgSub: string;
  tgChecking: string; tgReady: string; tgOff: string; tgLoadFailed: string;
  // ── plugins tab
  plugLead: string; plugNote: string; plugPrimary: string; plugMore: string; plugAlwaysOn: string;
  plugSignIn: string; plugSoon: string; plugLoadFailed: string; plugSaveFailed: string; plugSaving: string; plugSaved: string;
  // ── skills tab
  skillsLead: string; states: Record<SkillState, string>;
  groups: Record<SkillGroupId, { title: string; sub?: string }>;
  skills: Record<SkillId, string>;
  hiddenNote: string; tgSkillNote: string; waSkillNote: string; guestChatNote: string;
}

const ka: HubCopy = {
  sidebarRow: 'კონექტორები და პლაგინები', title: 'კონექტორები და პლაგინები', close: 'დახურვა', tabsLabel: 'განყოფილებები',
  tabs: { connectors: 'კონექტორები', plugins: 'პლაგინები', skills: 'უნარები' },
  soon: 'მალე', retry: 'თავიდან ცდა', signIn: 'შესვლა', notOnYet: 'ჯერ არ არის ჩართული.',
  notifTitle: 'შეტყობინებები', notifSub: 'შეტყობინება ამ მოწყობილობაზე, როცა ვიდეო, სურათი ან ანგარიში მზად იქნება.',
  waTitle: 'WhatsApp', waSub: 'დააკავშირე შენი WhatsApp ნომერი და ესაუბრე Agent G-ს იქ.',
  tgTitle: 'Telegram', tgSub: 'ესაუბრე Agent G-ს Telegram-ში.',
  tgChecking: 'მოწმდება…', tgReady: 'Agent G-ის ბოტი აქ მუშაობს, მაგრამ შენს ანგარიშთან დაკავშირება ჯერ არ არის მზად — Telegram-ის ჩატი შენს ისტორიასა და კრედიტს არ იყენებს.',
  tgOff: 'Telegram აქ ჯერ არ არის ჩართული.', tgLoadFailed: 'სტატუსი ვერ ჩაიტვირთა.',
  plugLead: 'გამორთე ხელსაწყოები, რომლებსაც არ იყენებ — ისინი გაქრება გვერდითი მენიუდან და „+“ მენიუდან. ჩართვა ნებისმიერ დროს შეგიძლია.',
  plugNote: 'გამორთვა მხოლოდ მენიუს ალაგებს: ფასები და შენი ანგარიშის შესაძლებლობები არ იცვლება.',
  plugPrimary: 'მთავარი ხელსაწყოები', plugMore: 'მეტი ხელსაწყო', plugAlwaysOn: 'ყოველთვის ჩართულია',
  plugSignIn: 'შედი ანგარიშში, რომ აირჩიო, რომელი ხელსაწყოები გამოჩნდეს.', plugSoon: 'ხელსაწყოების არჩევა მალე გაიხსნება.',
  plugLoadFailed: 'შენი არჩევანი ვერ ჩაიტვირთა.', plugSaveFailed: 'ვერ შეინახა — გადამრთველი წინა მდგომარეობას დაუბრუნდა.', plugSaving: 'ინახება…', plugSaved: 'შენახულია',
  skillsLead: 'რა შეუძლია Agent G-ს. თითოეულის სტატუსი ამ საიტზე მოწმდება — ეს არ არის დაპირება.',
  states: { available: 'ხელმისაწვდომია', account: 'ანგარიშით', soon: 'მალე', checking: 'მოწმდება…', unknown: 'ვერ შემოწმდა' },
  groups: {
    talk: { title: 'საუბარი და პასუხები' },
    create: { title: 'სურათი, ვიდეო, მუსიკა', sub: 'Agent G ჯერ გეკითხება და მხოლოდ შენი თანხმობით ქმნის.' },
    read: { title: 'ფაილები და ვიდეო' },
    research: { title: 'Deep Research' },
    channels: { title: 'არხები' },
  },
  skills: {
    chat: 'ჩატი ქართულად, ინგლისურად და რუსულად', live: 'ცოცხალი ხმოვანი საუბარი',
    image: 'სურათების შექმნა და რედაქტირება', video: 'ვიდეოს შექმნა', music: 'მუსიკა და სიმღერები',
    filesChat: 'ფოტოებისა და დოკუმენტების წაკითხვა ჩატში', videoChat: 'ვიდეოს ნახვა და აღწერა ჩატში', docs: 'შენი დოკუმენტები კვლევისთვის',
    research: 'ინტერნეტის კვლევა და ანგარიში წყაროებით',
    web: 'სტუდიაში (ვებ)', telegram: 'Telegram', whatsapp: 'WhatsApp',
  },
  hiddenNote: 'მენიუდან დამალულია (პლაგინები)', tgSkillNote: 'ბოტი მუშაობს · ანგარიშთან დაკავშირება მალე', waSkillNote: 'ნომრის დაკავშირება — კონექტორებში',
  guestChatNote: 'მოკლე საუბარი ანგარიშის გარეშეც შეიძლება.',
};

const en: HubCopy = {
  sidebarRow: 'Connectors & plugins', title: 'Connectors & plugins', close: 'Close', tabsLabel: 'Sections',
  tabs: { connectors: 'Connectors', plugins: 'Plugins', skills: 'Skills' },
  soon: 'Soon', retry: 'Try again', signIn: 'Sign in', notOnYet: 'Not switched on yet.',
  notifTitle: 'Notifications', notifSub: 'A notice on this device when a video, image or report is ready.',
  waTitle: 'WhatsApp', waSub: 'Link your WhatsApp number and talk to Agent G there.',
  tgTitle: 'Telegram', tgSub: 'Talk to Agent G in Telegram.',
  tgChecking: 'Checking…', tgReady: 'The Agent G bot runs here, but linking it to your account is not ready yet — a Telegram chat does not use your history or credits.',
  tgOff: 'Telegram is not switched on here yet.', tgLoadFailed: 'The status could not be loaded.',
  plugLead: 'Switch off the tools you do not use — they leave your sidebar and the + menu. Switch them back on any time.',
  plugNote: 'Switching a tool off only tidies your menus. Prices and what your account can do stay the same.',
  plugPrimary: 'Main tools', plugMore: 'More tools', plugAlwaysOn: 'Always on',
  plugSignIn: 'Sign in to choose which tools you see.', plugSoon: 'Choosing your tools opens soon.',
  plugLoadFailed: 'Your choices could not be loaded.', plugSaveFailed: 'That could not be saved — the switch is back as it was.', plugSaving: 'Saving…', plugSaved: 'Saved',
  skillsLead: 'What Agent G can do. Each status is checked on this site — it is not a promise.',
  states: { available: 'Available', account: 'With an account', soon: 'Soon', checking: 'Checking…', unknown: 'Not checked' },
  groups: {
    talk: { title: 'Talk and answers' },
    create: { title: 'Images, video, music', sub: 'Agent G asks first and creates only when you say so.' },
    read: { title: 'Files and video' },
    research: { title: 'Deep Research' },
    channels: { title: 'Channels' },
  },
  skills: {
    chat: 'Chat in Georgian, English and Russian', live: 'Live voice conversation',
    image: 'Create and edit images', video: 'Create video', music: 'Music and songs',
    filesChat: 'Read photos and documents in the chat', videoChat: 'Watch and describe a video in the chat', docs: 'Your documents for research',
    research: 'Research the web and write a report with sources',
    web: 'In the studio (web)', telegram: 'Telegram', whatsapp: 'WhatsApp',
  },
  hiddenNote: 'Hidden from your menus (Plugins)', tgSkillNote: 'Bot runs here · account linking soon', waSkillNote: 'Link your number under Connectors',
  guestChatNote: 'A short chat works without an account.',
};

const ru: HubCopy = {
  sidebarRow: 'Коннекторы и плагины', title: 'Коннекторы и плагины', close: 'Закрыть', tabsLabel: 'Разделы',
  tabs: { connectors: 'Коннекторы', plugins: 'Плагины', skills: 'Навыки' },
  soon: 'Скоро', retry: 'Повторить', signIn: 'Войти', notOnYet: 'Пока не включено.',
  notifTitle: 'Уведомления', notifSub: 'Уведомление на этом устройстве, когда видео, изображение или отчёт готовы.',
  waTitle: 'WhatsApp', waSub: 'Привяжите свой номер WhatsApp и общайтесь с Agent G там.',
  tgTitle: 'Telegram', tgSub: 'Общайтесь с Agent G в Telegram.',
  tgChecking: 'Проверяем…', tgReady: 'Бот Agent G здесь работает, но привязка к вашему аккаунту пока не готова — чат в Telegram не использует вашу историю и кредиты.',
  tgOff: 'Telegram здесь пока не включён.', tgLoadFailed: 'Не удалось загрузить статус.',
  plugLead: 'Отключите инструменты, которыми не пользуетесь, — они исчезнут из боковой панели и меню «+». Включить их снова можно в любой момент.',
  plugNote: 'Отключение только упрощает ваше меню. Цены и возможности аккаунта не меняются.',
  plugPrimary: 'Основные инструменты', plugMore: 'Другие инструменты', plugAlwaysOn: 'Всегда включён',
  plugSignIn: 'Войдите, чтобы выбрать, какие инструменты видеть.', plugSoon: 'Выбор инструментов скоро откроется.',
  plugLoadFailed: 'Не удалось загрузить ваш выбор.', plugSaveFailed: 'Не удалось сохранить — переключатель вернулся в прежнее положение.', plugSaving: 'Сохраняем…', plugSaved: 'Сохранено',
  skillsLead: 'Что умеет Agent G. Статус каждого пункта проверяется на этом сайте — это не обещание.',
  states: { available: 'Доступно', account: 'С аккаунтом', soon: 'Скоро', checking: 'Проверяем…', unknown: 'Не проверено' },
  groups: {
    talk: { title: 'Разговор и ответы' },
    create: { title: 'Изображения, видео, музыка', sub: 'Agent G сначала спрашивает и создаёт только с вашего согласия.' },
    read: { title: 'Файлы и видео' },
    research: { title: 'Deep Research' },
    channels: { title: 'Каналы' },
  },
  skills: {
    chat: 'Чат на грузинском, английском и русском', live: 'Живой голосовой разговор',
    image: 'Создание и редактирование изображений', video: 'Создание видео', music: 'Музыка и песни',
    filesChat: 'Чтение фото и документов в чате', videoChat: 'Просмотр и описание видео в чате', docs: 'Ваши документы для исследований',
    research: 'Исследование сети и отчёт с источниками',
    web: 'В студии (веб)', telegram: 'Telegram', whatsapp: 'WhatsApp',
  },
  hiddenNote: 'Скрыто из меню (Плагины)', tgSkillNote: 'Бот работает · привязка аккаунта скоро', waSkillNote: 'Привязка номера — в Коннекторах',
  guestChatNote: 'Короткий чат доступен без аккаунта.',
};

const COPY: Record<Lang, HubCopy> = { ka, en, ru };
export const hubCopy = (locale?: string | null): HubCopy => COPY[hubLang(locale)];
/** For the copy parity test. */
export const ALL_HUB_COPY = COPY;
