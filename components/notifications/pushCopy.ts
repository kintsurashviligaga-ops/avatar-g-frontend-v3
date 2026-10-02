/**
 * The opt-in card's words in ka / en / ru (Georgian first). Every state says what is true on THIS device and what the
 * person can do about it — never "something went wrong" where we know the reason.
 */
export interface PushCopy {
  title: string;
  description: string;
  checking: string;
  on: string;
  off: string;
  unsupported: string;
  inApp: string;
  iosInstall: string;
  unavailable: string;
  blocked: string;
  turnOn: string;
  turnOff: string;
  sendTest: string;
  turnedOn: string;
  dismissed: string;
  signedOut: string;
  testSent: string;
  testNoDevice: string;
  rateLimited: string;
  failed: string;
}

const KA: PushCopy = {
  title: 'შეტყობინებები ამ მოწყობილობაზე',
  description: 'გაიგე, როცა ვიდეო, მუსიკა ან კვლევა მზად იქნება — ჩანართის დახურვის შემდეგაც.',
  checking: 'მოწმდება…',
  on: 'ჩართულია ამ მოწყობილობაზე.',
  off: 'გამორთულია ამ მოწყობილობაზე.',
  unsupported: 'ეს ბრაუზერი push-შეტყობინებებს არ უჭერს მხარს. სცადე Chrome, Edge, Firefox ან Safari.',
  inApp: 'აპის შიგნით push-შეტყობინებები ჯერ არ მუშაობს. გახსენი myavatar.ge Safari-ში, დაამატე მთავარ ეკრანზე და ჩართე იქიდან.',
  iosInstall:
    'iPhone-ზე ჯერ დაამატე აპი მთავარ ეკრანზე: Safari → „გაზიარება" → „მთავარ ეკრანზე დამატება". შემდეგ გახსენი იქიდან და ჩართე შეტყობინებები (iOS 16.4 ან უფრო ახალი).',
  unavailable: 'push-შეტყობინებები ამ საიტზე ჯერ არ არის ჩართული.',
  blocked: 'შეტყობინებები დაბლოკილია ამ საიტისთვის. ჩართე ბრაუზერის პარამეტრებში (საიტის ნებართვები → შეტყობინებები) და განაახლე გვერდი.',
  turnOn: 'ჩართვა',
  turnOff: 'გამორთვა',
  sendTest: 'სატესტო შეტყობინების გაგზავნა',
  turnedOn: 'ჩაირთო! სცადე სატესტო შეტყობინება.',
  dismissed: 'ნებართვა არ მიგიცია. სცადე ხელახლა, როცა მზად იქნები.',
  signedOut: 'შეტყობინებების ჩასართავად შედი ანგარიშზე.',
  testSent: 'გაიგზავნა — შეამოწმე შეტყობინებები.',
  testNoDevice: 'ეს მოწყობილობა აღარ არის რეგისტრირებული — გამორთე და ხელახლა ჩართე.',
  rateLimited: 'ძალიან ბევრი მცდელობა — სცადე რამდენიმე წუთში.',
  failed: 'ვერ მოხერხდა. სცადე ხელახლა.',
};

const EN: PushCopy = {
  title: 'Notifications on this device',
  description: 'Know when a video, song or research is ready — even with the tab closed.',
  checking: 'Checking…',
  on: 'On for this device.',
  off: 'Off for this device.',
  unsupported: 'This browser doesn’t support push notifications. Try Chrome, Edge, Firefox or Safari.',
  inApp: 'Push notifications don’t work inside the app yet. Open myavatar.ge in Safari, add it to your Home Screen and turn them on there.',
  iosInstall:
    'On iPhone, add the app to your Home Screen first: Safari → Share → “Add to Home Screen”. Then open it from there and turn notifications on (iOS 16.4 or later).',
  unavailable: 'Push notifications aren’t enabled on this site yet.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser settings (Site permissions → Notifications), then reload the page.',
  turnOn: 'Turn on',
  turnOff: 'Turn off',
  sendTest: 'Send a test notification',
  turnedOn: 'Done! Try a test notification.',
  dismissed: 'Permission wasn’t given. Try again when you’re ready.',
  signedOut: 'Sign in to turn on notifications.',
  testSent: 'Sent — check your notifications.',
  testNoDevice: 'This device is no longer registered — turn notifications off and on again.',
  rateLimited: 'Too many attempts — try again in a few minutes.',
  failed: 'Something went wrong. Please try again.',
};

const RU: PushCopy = {
  title: 'Уведомления на этом устройстве',
  description: 'Узнавайте, когда видео, музыка или исследование готовы, — даже при закрытой вкладке.',
  checking: 'Проверка…',
  on: 'Включено на этом устройстве.',
  off: 'Выключено на этом устройстве.',
  unsupported: 'Этот браузер не поддерживает push-уведомления. Попробуйте Chrome, Edge, Firefox или Safari.',
  inApp: 'Внутри приложения push-уведомления пока не работают. Откройте myavatar.ge в Safari, добавьте на экран «Домой» и включите их там.',
  iosInstall:
    'На iPhone сначала добавьте приложение на экран «Домой»: Safari → «Поделиться» → «На экран „Домой“». Затем откройте его оттуда и включите уведомления (iOS 16.4 или новее).',
  unavailable: 'Push-уведомления на этом сайте пока не включены.',
  blocked: 'Уведомления для этого сайта заблокированы. Разрешите их в настройках браузера (Разрешения сайта → Уведомления) и обновите страницу.',
  turnOn: 'Включить',
  turnOff: 'Выключить',
  sendTest: 'Отправить тестовое уведомление',
  turnedOn: 'Готово! Попробуйте тестовое уведомление.',
  dismissed: 'Разрешение не выдано. Попробуйте снова, когда будете готовы.',
  signedOut: 'Войдите, чтобы включить уведомления.',
  testSent: 'Отправлено — проверьте уведомления.',
  testNoDevice: 'Это устройство больше не зарегистрировано — выключите и снова включите уведомления.',
  rateLimited: 'Слишком много попыток — попробуйте через несколько минут.',
  failed: 'Не получилось. Попробуйте ещё раз.',
};

export type PushCardLocale = 'ka' | 'en' | 'ru';

export function asCardLocale(v: unknown): PushCardLocale {
  return v === 'en' || v === 'ru' ? v : 'ka';
}

export function pushCopy(locale: PushCardLocale): PushCopy {
  return locale === 'en' ? EN : locale === 'ru' ? RU : KA;
}
