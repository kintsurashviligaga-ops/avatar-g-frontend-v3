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
  phoneLead: string;
  phoneCodeLead: string;
  phoneNumberLabel: string;
  phoneCodeLabel: string;
  phoneSendCode: string;
  phoneVerify: string;
  phoneResend: string;
  phoneToggleLead: string;
  phoneVerifiedWaiting: string;
  phoneToggleLabel: string;
  phoneCallsOn: string;
  phoneCallsOff: string;
  phoneDisconnect: string;
  phoneError: string;
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
  title: 'კავშირები', subtitle: 'სად დაგიკავშირდეს Agent G და სად მოგივიდეს შედეგი.', rows: { phone: 'ტელეფონი: ზარი და SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', notifications: 'შეტყობინებები' }, state: { connect: 'დაკავშირება', connected: 'დაკავშირებულია', unavailable: 'დროებით მიუწვდომელია', signin: 'შედი ანგარიშზე', on: 'ჩართულია' }, loadFailed: 'სტატუსი ვერ ჩაიტვირთა.', retry: 'თავიდან', phoneOff: 'Agent G-ის ზარები და SMS ჯერ არ არის ხელმისაწვდომი.', phoneLead: 'შეიყვანე ნომერი — Agent G დაგიკავშირდება ტელეფონით და SMS-ით.', phoneCodeLead: 'კოდი გამოგიგზავნეთ. შეიყვანე იგი ნომრის დასადასტურებლად.', phoneNumberLabel: 'მობილურის ნომერი', phoneCodeLabel: 'დადასტურების კოდი', phoneSendCode: 'კოდის გამოგზავნა', phoneVerify: 'ნომრის დადასტურება', phoneResend: 'სხვა ნომერი', phoneToggleLead: 'Agent G-ს შეუძლია ამ ნომერზე დარეკვა და შედეგის შეტყობინება.', phoneVerifiedWaiting: 'ნომერი დადასტურებულია. ზარების provider-ის ჩართვის შემდეგ აქედან შეძლებ Agent G-ის გააქტიურებას.', phoneToggleLabel: 'Agent G-ის ზარები', phoneCallsOn: 'ჩართულია', phoneCallsOff: 'გამორთულია', phoneDisconnect: 'ნომრის გათიშვა', phoneError: 'ვერ შესრულდა. სცადე თავიდან.', telegramOff: 'Telegram-ის დაკავშირება ჯერ არ არის ხელმისაწვდომი.', signIn: 'კავშირების სამართავად შედი ანგარიშზე.', signInButton: 'შესვლა', prefsTitle: 'რა სად მოგივიდეს', prefsLead: 'საიტზე ყოველთვის ნახავ. აირჩიე, რა გინდა WhatsApp-ზეც.', events: { task_completed: 'დავალება დასრულდა', approval_required: 'საჭიროა შენი თანხმობა', needs_attention: 'რაღაც შენს ყურადღებას საჭიროებს', scheduled_report: 'დაგეგმილი რეპორტი', reminder: 'შეხსენება' }, site: 'საიტზე', whatsapp: 'WhatsApp', siteAlways: 'საიტზე ყოველთვის', connectWhatsAppFirst: 'WhatsApp-ზე მისაღებად ჯერ დააკავშირე WhatsApp.', laterPlaces: 'Telegram, SMS და ზარი დროებით მიუწვდომელია.', saveFailed: 'ვერ შეინახა. სცადე თავიდან.', prefsLoadFailed: 'პარამეტრები ვერ ჩაიტვირთა.'
};

const EN: ConnCopy = {
  title: 'Connections', subtitle: 'Where Agent G can reach you and send your results.', rows: { phone: 'Phone: calls & SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', notifications: 'Notifications' }, state: { connect: 'Connect', connected: 'Connected', unavailable: 'Temporarily unavailable', signin: 'Sign in', on: 'On' }, loadFailed: 'Could not load the status.', retry: 'Retry', phoneOff: 'Agent G calls and SMS are not available yet.', phoneLead: 'Enter your number so Agent G can reach you by phone and SMS.', phoneCodeLead: 'We sent a code. Enter it to verify the number.', phoneNumberLabel: 'Mobile number', phoneCodeLabel: 'Verification code', phoneSendCode: 'Send code', phoneVerify: 'Verify number', phoneResend: 'Use another number', phoneToggleLead: 'Agent G can call this number and tell you when a result is ready.', phoneVerifiedWaiting: 'Your number is verified. The call provider must be enabled before Agent G calls can be turned on here.', phoneToggleLabel: 'Agent G calls', phoneCallsOn: 'On', phoneCallsOff: 'Off', phoneDisconnect: 'Disconnect number', phoneError: 'Could not complete this. Try again.', telegramOff: 'Connecting Telegram is not available yet.', signIn: 'Sign in to manage your connections.', signInButton: 'Sign in', prefsTitle: 'What reaches you where', prefsLead: 'You always see it on the site. Choose what should also come to WhatsApp.', events: { task_completed: 'A task is finished', approval_required: 'Your approval is needed', needs_attention: 'Something needs your attention', scheduled_report: 'A scheduled report', reminder: 'A reminder' }, site: 'On the site', whatsapp: 'WhatsApp', siteAlways: 'Always on the site', connectWhatsAppFirst: 'Connect WhatsApp first to get news there.', laterPlaces: 'Telegram, SMS and calls are temporarily unavailable.', saveFailed: 'Could not save. Try again.', prefsLoadFailed: 'Could not load your settings.'
};

const RU: ConnCopy = {
  title: 'Подключения', subtitle: 'Где Agent G может связаться с вами и куда прислать результат.', rows: { phone: 'Телефон: звонки и SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', notifications: 'Уведомления' }, state: { connect: 'Подключить', connected: 'Подключено', unavailable: 'Временно недоступно', signin: 'Войдите', on: 'Включены' }, loadFailed: 'Не удалось загрузить статус.', retry: 'Повторить', phoneOff: 'Звонки и SMS от Agent G пока недоступны.', phoneLead: 'Введите номер, чтобы Agent G мог связаться с вами по телефону и SMS.', phoneCodeLead: 'Мы отправили код. Введите его для подтверждения номера.', phoneNumberLabel: 'Номер мобильного', phoneCodeLabel: 'Код подтверждения', phoneSendCode: 'Отправить код', phoneVerify: 'Подтвердить номер', phoneResend: 'Другой номер', phoneToggleLead: 'Agent G сможет позвонить на этот номер и сообщить о готовом результате.', phoneVerifiedWaiting: 'Номер подтверждён. Сначала нужно включить провайдера звонков, после этого здесь можно будет включить Agent G.', phoneToggleLabel: 'Звонки Agent G', phoneCallsOn: 'Включены', phoneCallsOff: 'Выключены', phoneDisconnect: 'Отключить номер', phoneError: 'Не удалось выполнить действие. Попробуйте ещё раз.', telegramOff: 'Подключение Telegram пока недоступно.', signIn: 'Войдите, чтобы управлять подключениями.', signInButton: 'Войти', prefsTitle: 'Что и куда приходит', prefsLead: 'На сайте вы видите всё. Выберите, что присылать ещё и в WhatsApp.', events: { task_completed: 'Задача выполнена', approval_required: 'Нужно ваше подтверждение', needs_attention: 'Что-то требует внимания', scheduled_report: 'Отчёт по расписанию', reminder: 'Напоминание' }, site: 'На сайте', whatsapp: 'WhatsApp', siteAlways: 'Всегда на сайте', connectWhatsAppFirst: 'Чтобы получать в WhatsApp, сначала подключите WhatsApp.', laterPlaces: 'Telegram, SMS и звонки временно недоступны.', saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.', prefsLoadFailed: 'Не удалось загрузить настройки.'
};

export const CONN_COPY: Record<ConnLang, ConnCopy> = { ka: KA, en: EN, ru: RU };
export const connLang = (l: string | null | undefined): ConnLang => (l === 'en' || l === 'ru' ? l : 'ka');
