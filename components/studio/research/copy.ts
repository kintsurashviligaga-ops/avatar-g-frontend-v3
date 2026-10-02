/**
 * components/studio/research/copy.ts — every sentence of the Deep Research UI, in ka / en / ru, in ONE place.
 *
 * ⚠️ NO PRICE INSIDE ANY SENTENCE. The price lives only on the start button (GenerateButton + the server's capabilities
 * number). A sentence here may say "your credits go back" — never "120 credits" — so a price change can never leave a
 * stale number in prose (copy.test.ts fails on a digit next to the word credit in any language).
 */
import type { ResearchJobPublic } from '@/lib/research/types';

export type Lang = 'ka' | 'en' | 'ru';
export const researchLang = (l?: string | null): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

const ruPlural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export interface ResearchCopy {
  // ── where it is offered
  toolTitle: string; toolSub: string; connectorsTitle: string; connectorsSub: string; sidebarRow: string;
  // ── start sheet
  startTitle: string; startLead: string; promptLabel: string; promptPlaceholder: string;
  docsLabel: string; docsNone: string; docsManage: string; docsAdd: string; docsLimit: (max: number) => string;
  timeNote: string; refundNote: string; startButton: string; starting: string; startFailed: string; signInNeeded: string; topUp: string;
  close: string;
  // ── thread card + list
  cardRunning: string; cardCloseHint: string; cardWorking: string; cardSearches: (n: number) => string; cardElapsed: (min: number) => string;
  cardReady: (sources: number) => string; cardOpen: string; cardCancel: string; cardCancelAsk: string; cardCancelYes: string; cardCancelNo: string;
  cardCanceling: string; cardCanceled: string; cardLoading: string; cardMissing: string;
  statusRunning: string; statusReady: string; statusFailed: string; statusCanceled: string;
  listTitle: string; listEmpty: string; listNew: string;
  // ── toasts
  toastStarted: string; threadNote: string; toastReady: string; toastReadyBody: (sources: number) => string; toastFailed: string; toastOpen: string; toastDismiss: string; toastLiveOff: string;
  // ── viewer
  readMinutes: (n: number) => string; sourcesCount: (n: number) => string; sourcesHeading: string; incompleteNote: string;
  copy: string; copied: string; download: string; goLive: string; readAloud: string; readStop: string; readPause: string; readResume: string;
  readLoading: string; readReading: string; readPaused: string; readPartial: string; readFailed: string; summarize: string; takeaways: string;
  askLabel: string; askPlaceholder: string; askSend: string; askBusy: string; askHint: string; askYou: string; answerReadAloud: string;
  micStart: string; micStop: string; loadingReport: string; loadFailed: string; retry: string; runningNote: string; openSource: string;
  // ── connectors
  connHeading: string; connLead: string; connLocal: string; connLocalSub: string; connAdd: string; connAdding: string; connEmpty: string;
  connChars: (n: number) => string; connRemove: (name: string) => string; connSoon: string; connSoonNote: string; connUnavailable: string;
  connFormats: string; connFilesLimit: (max: number) => string; connUploadFailed: string; connUnreadable: string; connLoadFailed: string; connSignIn: string; connTooLarge: string; connSignInButton: string;
}

const ka: ResearchCopy = {
  toolTitle: 'Deep Research', toolSub: 'ეძებს ინტერნეტში და წერს ანგარიშს წყაროებით', connectorsTitle: 'კონექტორები', connectorsSub: 'შენი დოკუმენტები კვლევისთვის', sidebarRow: 'Deep Research',
  startTitle: 'Deep Research', startLead: 'აგენტი ეძებს ინტერნეტში, კითხულობს ნაპოვნს და წერს ანგარიშს წყაროებით. მუშაობს ფონურად.',
  promptLabel: 'რა გავიკვლიოთ?', promptPlaceholder: 'მაგ. როგორ ვითარდება ელექტრომობილების ბაზარი კავკასიაში და ვინ არიან მთავარი მოთამაშეები?',
  docsLabel: 'შენი დოკუმენტები (არასავალდებულო)', docsNone: 'დოკუმენტები ჯერ არ გაქვს.', docsManage: 'მართვა', docsAdd: 'დოკუმენტის დამატება', docsLimit: (m) => `კვლევას მაქსიმუმ ${m} დოკუმენტი შეიძლება დაერთოს.`,
  timeNote: 'გრძელდება 5-დან 60 წუთამდე. აპლიკაციის დახურვა შეგიძლია — მზად რომ იქნება, გაცნობებთ.', refundNote: 'თუ ვერ დასრულდა ან გააუქმე, კრედიტი ავტომატურად დაგიბრუნდება.',
  startButton: 'კვლევის დაწყება', starting: 'იწყება…', startFailed: 'კვლევის დაწყება ვერ მოხერხდა. კრედიტი არ ჩამოგეჭრა.', signInNeeded: 'კვლევის დასაწყებად შედი ანგარიშში.', topUp: 'ბალანსის შევსება',
  close: 'დახურვა',
  cardRunning: 'კვლევა მიმდინარეობს…', cardCloseHint: 'შეგიძლია დახურო — მზად რომ იქნება, გაცნობებთ.', cardWorking: 'აგენტი მუშაობს', cardSearches: (n) => `${n} ძიება`, cardElapsed: (m) => (m < 1 ? '1 წუთზე ნაკლები' : `${m} წუთი`),
  cardReady: (n) => `ანგარიში მზადაა · წყაროები: ${n}`, cardOpen: 'ანგარიშის გახსნა', cardCancel: 'გაუქმება', cardCancelAsk: 'შევაჩერო ეს კვლევა? კრედიტი დაგიბრუნდება.', cardCancelYes: 'შეჩერება', cardCancelNo: 'გაგრძელება',
  cardCanceling: 'ვაუქმებთ…', cardCanceled: 'კვლევა გაუქმდა.', cardLoading: 'კვლევის მდგომარეობა იტვირთება…', cardMissing: 'ეს კვლევა ვერ ვიპოვეთ.',
  statusRunning: 'მიმდინარეობს', statusReady: 'მზადაა', statusFailed: 'ვერ დასრულდა', statusCanceled: 'გაუქმდა',
  listTitle: 'კვლევები', listEmpty: 'კვლევები ჯერ არ გაქვს.', listNew: 'ახალი კვლევა',
  toastStarted: 'კვლევა დაიწყო. მზად რომ იქნება, გაცნობებთ.', threadNote: 'Deep Research დავიწყე. ანგარიში აქვე გამოჩნდება.', toastReady: 'ანგარიში მზადაა', toastReadyBody: (n) => `წყაროები: ${n}`, toastFailed: 'კვლევა ვერ დასრულდა', toastOpen: 'გახსნა', toastDismiss: 'დახურვა', toastLiveOff: 'ცოცხალი საუბარი ახლა მიუწვდომელია. შეკითხვა დაწერილადაც შეგიძლია დასვა.',
  readMinutes: (n) => `${n} წთ კითხვა`, sourcesCount: (n) => `წყაროები: ${n}`, sourcesHeading: 'წყაროები', incompleteNote: 'ყურადღება: აგენტმა ეს ანგარიში არასრულად მონიშნა.',
  copy: 'კოპირება', copied: 'დაკოპირდა', download: 'ჩამოტვირთვა (.md)', goLive: 'ცოცხალი საუბარი', readAloud: 'ხმამაღლა წაკითხვა', readStop: 'შეჩერება', readPause: 'პაუზა', readResume: 'გაგრძელება',
  readLoading: 'ხმა მზადდება…', readReading: 'იკითხება', readPaused: 'პაუზაზეა', readPartial: 'იკითხება ანგარიშის დასაწყისი. მთლიანის მოსასმენად გამოიყენე „შეაჯამე“ ან ცოცხალი საუბარი.', readFailed: 'წაკითხვა ვერ მოხერხდა. სცადე თავიდან.', summarize: 'შეაჯამე', takeaways: 'ამოიღე მთავარი არსი',
  askLabel: 'შეკითხვა ანგარიშზე', askPlaceholder: 'დასვი შეკითხვა ანგარიშზე…', askSend: 'გაგზავნა', askBusy: 'პასუხს ვამზადებთ…', askHint: 'დაწერე ან თქვი: „შეაჯამე“, „ამოიღე მთავარი არსი“, „წამიკითხე“.', askYou: 'შენ', answerReadAloud: 'პასუხის წაკითხვა',
  micStart: 'მიკროფონის ჩართვა', micStop: 'მიკროფონის გამორთვა', loadingReport: 'ანგარიში იტვირთება…', loadFailed: 'ანგარიშის ჩატვირთვა ვერ მოხერხდა.', retry: 'თავიდან ცდა', runningNote: 'ანგარიში ჯერ მზად არ არის. შეგიძლია დახურო — გაცნობებთ.', openSource: 'წყაროს გახსნა',
  connHeading: 'კონექტორები', connLead: 'ბმული შენს დოკუმენტებთან. კვლევა მათ ვებთან ერთად გამოიყენებს.', connLocal: 'ლოკალური ფაილები', connLocalSub: 'ატვირთე PDF, DOCX, TXT ან MD — ვინახავთ მხოლოდ ტექსტს.',
  connAdd: 'ფაილის დამატება', connAdding: 'იტვირთება…', connEmpty: 'ფაილები ჯერ არ გაქვს.', connChars: (n) => `${n.toLocaleString('en')} სიმბოლო`, connRemove: (name) => `წაშლა: ${name}`,
  connSoon: 'მალე', connSoonNote: 'ჯერ არ არის ხელმისაწვდომი. დაკავშირების ღილაკს არ გაჩვენებთ, სანამ ნამდვილად არ იმუშავებს.', connUnavailable: 'ფაილების შენახვა ჯერ არ არის ჩართული.',
  connFormats: 'PDF · DOCX · TXT · MD', connFilesLimit: (m) => `მაქსიმუმ ${m} დოკუმენტი. წაშალე ერთი, რომ ახალი დაამატო.`, connUploadFailed: 'ფაილის ატვირთვა ვერ მოხერხდა.', connUnreadable: 'ფაილში წასაკითხი ტექსტი ვერ ვიპოვეთ (სკანირებული PDF?).', connLoadFailed: 'სია ვერ ჩაიტვირთა.', connSignIn: 'ფაილების დასამატებლად შედი ანგარიშში.', connTooLarge: 'ფაილი ძალიან დიდია (მაქსიმუმ 3 მბ).', connSignInButton: 'შესვლა',
};

const en: ResearchCopy = {
  toolTitle: 'Deep Research', toolSub: 'Searches the web and writes a cited report', connectorsTitle: 'Connectors', connectorsSub: 'Your own documents for research', sidebarRow: 'Deep Research',
  startTitle: 'Deep Research', startLead: 'An agent searches the web, reads what it finds and writes a report with sources. It runs in the background.',
  promptLabel: 'What should we research?', promptPlaceholder: 'e.g. How is the electric-car market in the Caucasus developing, and who are the main players?',
  docsLabel: 'Your documents (optional)', docsNone: 'No documents yet.', docsManage: 'Manage', docsAdd: 'Add documents', docsLimit: (m) => `A research can use up to ${m} documents.`,
  timeNote: 'Takes 5 to 60 minutes. You can close the app — we will tell you when it is ready.', refundNote: 'If it fails or you cancel, your credits go back automatically.',
  startButton: 'Start research', starting: 'Starting…', startFailed: 'The research could not be started. You have not been charged.', signInNeeded: 'Sign in to start a research.', topUp: 'Top up',
  close: 'Close',
  cardRunning: 'Researching…', cardCloseHint: 'You can close this — we will tell you when it is ready.', cardWorking: 'The agent is working', cardSearches: (n) => `${n} ${n === 1 ? 'search' : 'searches'}`, cardElapsed: (m) => (m < 1 ? 'under a minute' : `${m} min`),
  cardReady: (n) => `Report ready · ${n} ${n === 1 ? 'source' : 'sources'}`, cardOpen: 'Open report', cardCancel: 'Cancel', cardCancelAsk: 'Stop this research? Your credits go back.', cardCancelYes: 'Stop it', cardCancelNo: 'Keep going',
  cardCanceling: 'Canceling…', cardCanceled: 'Research canceled.', cardLoading: 'Loading the research…', cardMissing: 'We could not find this research.',
  statusRunning: 'Running', statusReady: 'Ready', statusFailed: 'Could not finish', statusCanceled: 'Canceled',
  listTitle: 'Research', listEmpty: 'No research yet.', listNew: 'New research',
  toastStarted: 'Research started. We will tell you when it is ready.', threadNote: 'I started a Deep Research on this. The report will appear right here.', toastReady: 'Your report is ready', toastReadyBody: (n) => `${n} ${n === 1 ? 'source' : 'sources'}`, toastFailed: 'Research could not finish', toastOpen: 'Open', toastDismiss: 'Dismiss', toastLiveOff: 'Live conversation is not available right now. You can still ask in writing.',
  readMinutes: (n) => `${n} min read`, sourcesCount: (n) => `${n} ${n === 1 ? 'source' : 'sources'}`, sourcesHeading: 'Sources', incompleteNote: 'Heads up: the agent marked this report as incomplete.',
  copy: 'Copy', copied: 'Copied', download: 'Download (.md)', goLive: 'Go live', readAloud: 'Read aloud', readStop: 'Stop', readPause: 'Pause', readResume: 'Resume',
  readLoading: 'Preparing the voice…', readReading: 'Reading aloud', readPaused: 'Paused', readPartial: 'Reading the start of the report. To hear all of it, use Summarize or go live.', readFailed: 'Reading aloud did not work. Please try again.', summarize: 'Summarize', takeaways: 'Key takeaways',
  askLabel: 'Ask about this report', askPlaceholder: 'Ask about this report…', askSend: 'Send', askBusy: 'Preparing the answer…', askHint: 'Type or say: “Summarize”, “Key takeaways”, “Read it to me”.', askYou: 'You', answerReadAloud: 'Read the answer aloud',
  micStart: 'Start the microphone', micStop: 'Stop the microphone', loadingReport: 'Loading the report…', loadFailed: 'The report could not be loaded.', retry: 'Try again', runningNote: 'The report is not ready yet. You can close this — we will tell you.', openSource: 'Open source',
  connHeading: 'Connectors', connLead: 'Bring your own documents. A research reads them alongside the web.', connLocal: 'Local files', connLocalSub: 'Upload a PDF, DOCX, TXT or MD — we keep the text only.',
  connAdd: 'Add a file', connAdding: 'Uploading…', connEmpty: 'No files yet.', connChars: (n) => `${n.toLocaleString('en')} characters`, connRemove: (name) => `Delete ${name}`,
  connSoon: 'Soon', connSoonNote: 'Not available yet. There is no connect button until it truly works.', connUnavailable: 'File storage is not switched on yet.',
  connFormats: 'PDF · DOCX · TXT · MD', connFilesLimit: (m) => `Up to ${m} documents. Delete one to add another.`, connUploadFailed: 'The file could not be uploaded.', connUnreadable: 'We could not find readable text in that file (a scanned PDF?).', connLoadFailed: 'The list could not be loaded.', connSignIn: 'Sign in to add files.', connTooLarge: 'That file is too large (3 MB at most).', connSignInButton: 'Sign in',
};

const ru: ResearchCopy = {
  toolTitle: 'Deep Research', toolSub: 'Ищет в сети и пишет отчёт с источниками', connectorsTitle: 'Коннекторы', connectorsSub: 'Ваши документы для исследований', sidebarRow: 'Deep Research',
  startTitle: 'Deep Research', startLead: 'Агент ищет в интернете, читает найденное и пишет отчёт с источниками. Работает в фоне.',
  promptLabel: 'Что исследовать?', promptPlaceholder: 'Напр.: как развивается рынок электромобилей на Кавказе и кто основные игроки?',
  docsLabel: 'Ваши документы (необязательно)', docsNone: 'Документов пока нет.', docsManage: 'Управлять', docsAdd: 'Добавить документы', docsLimit: (m) => `К исследованию можно приложить до ${m} документов.`,
  timeNote: 'Занимает от 5 до 60 минут. Приложение можно закрыть — мы сообщим, когда отчёт будет готов.', refundNote: 'Если исследование не завершится или вы отмените его, кредиты вернутся автоматически.',
  startButton: 'Начать исследование', starting: 'Запускаем…', startFailed: 'Не удалось запустить исследование. Средства не списаны.', signInNeeded: 'Войдите, чтобы начать исследование.', topUp: 'Пополнить',
  close: 'Закрыть',
  cardRunning: 'Идёт исследование…', cardCloseHint: 'Можно закрыть — мы сообщим, когда будет готово.', cardWorking: 'Агент работает', cardSearches: (n) => `${n} ${ruPlural(n, 'поиск', 'поиска', 'поисков')}`, cardElapsed: (m) => (m < 1 ? 'меньше минуты' : `${m} мин`),
  cardReady: (n) => `Отчёт готов · источников: ${n}`, cardOpen: 'Открыть отчёт', cardCancel: 'Отменить', cardCancelAsk: 'Остановить это исследование? Кредиты вернутся.', cardCancelYes: 'Остановить', cardCancelNo: 'Продолжить',
  cardCanceling: 'Отменяем…', cardCanceled: 'Исследование отменено.', cardLoading: 'Загружаем исследование…', cardMissing: 'Не удалось найти это исследование.',
  statusRunning: 'Идёт', statusReady: 'Готово', statusFailed: 'Не завершилось', statusCanceled: 'Отменено',
  listTitle: 'Исследования', listEmpty: 'Исследований пока нет.', listNew: 'Новое исследование',
  toastStarted: 'Исследование началось. Мы сообщим, когда оно будет готово.', threadNote: 'Запустил Deep Research по этому вопросу. Отчёт появится здесь.', toastReady: 'Отчёт готов', toastReadyBody: (n) => `Источников: ${n}`, toastFailed: 'Исследование не завершилось', toastOpen: 'Открыть', toastDismiss: 'Закрыть', toastLiveOff: 'Живой разговор сейчас недоступен. Вопрос можно задать письменно.',
  readMinutes: (n) => `${n} мин чтения`, sourcesCount: (n) => `Источников: ${n}`, sourcesHeading: 'Источники', incompleteNote: 'Внимание: агент отметил этот отчёт как неполный.',
  copy: 'Копировать', copied: 'Скопировано', download: 'Скачать (.md)', goLive: 'Говорить вживую', readAloud: 'Прочитать вслух', readStop: 'Остановить', readPause: 'Пауза', readResume: 'Продолжить',
  readLoading: 'Готовим голос…', readReading: 'Читаю вслух', readPaused: 'На паузе', readPartial: 'Читается начало отчёта. Чтобы услышать всё, используйте «Суммируй» или живой разговор.', readFailed: 'Не удалось прочитать вслух. Попробуйте снова.', summarize: 'Суммируй', takeaways: 'Выдели главное',
  askLabel: 'Вопрос по отчёту', askPlaceholder: 'Задайте вопрос по отчёту…', askSend: 'Отправить', askBusy: 'Готовим ответ…', askHint: 'Напишите или скажите: «Суммируй», «Выдели главное», «Прочитай».', askYou: 'Вы', answerReadAloud: 'Прочитать ответ вслух',
  micStart: 'Включить микрофон', micStop: 'Выключить микрофон', loadingReport: 'Загружаем отчёт…', loadFailed: 'Не удалось загрузить отчёт.', retry: 'Повторить', runningNote: 'Отчёт ещё не готов. Можно закрыть — мы сообщим.', openSource: 'Открыть источник',
  connHeading: 'Коннекторы', connLead: 'Ваши собственные документы. Исследование читает их наряду с сетью.', connLocal: 'Локальные файлы', connLocalSub: 'Загрузите PDF, DOCX, TXT или MD — мы храним только текст.',
  connAdd: 'Добавить файл', connAdding: 'Загружаем…', connEmpty: 'Файлов пока нет.', connChars: (n) => `${n.toLocaleString('en')} символов`, connRemove: (name) => `Удалить ${name}`,
  connSoon: 'Скоро', connSoonNote: 'Пока недоступно. Кнопки подключения не будет, пока оно по-настоящему не заработает.', connUnavailable: 'Хранение файлов пока не включено.',
  connFormats: 'PDF · DOCX · TXT · MD', connFilesLimit: (m) => `До ${m} документов. Удалите один, чтобы добавить новый.`, connUploadFailed: 'Не удалось загрузить файл.', connUnreadable: 'В файле не удалось найти читаемый текст (скан PDF?).', connLoadFailed: 'Не удалось загрузить список.', connSignIn: 'Войдите, чтобы добавлять файлы.', connTooLarge: 'Файл слишком большой (не более 3 МБ).', connSignInButton: 'Войти',
};

const COPY: Record<Lang, ResearchCopy> = { ka, en, ru };
export const researchCopy = (locale?: string | null): ResearchCopy => COPY[researchLang(locale)];
/** For the copy parity test. */
export const ALL_RESEARCH_COPY = COPY;

/** The four connectors that are not wired. Names are brand names — the same in every language. */
export const SOON_CONNECTOR_NAMES = ['Google Drive', 'OneDrive', 'Notion', 'Dropbox'] as const;

// ─── a settled job, in words ──────────────────────────────────────────────────────────────────────────────────

const FAILURE: Record<Lang, { generic: string; empty: string; timeout: string; context: string; unfunded: string }> = {
  ka: {
    generic: 'კვლევა ჩვენი მხრიდან ვერ დასრულდა.', empty: 'აგენტმა ანგარიში ვერ მოამზადა.', timeout: 'კვლევამ დროის ლიმიტს გადააჭარბა.',
    context: 'დართული დოკუმენტი აღარ არსებობს.', unfunded: 'კვლევის სერვისი ახლა მიუწვდომელია.',
  },
  en: {
    generic: 'The research could not be completed on our side.', empty: 'The agent finished without a report.', timeout: 'The research ran past the time limit.',
    context: 'An attached document is no longer there.', unfunded: 'The research service is unavailable right now.',
  },
  ru: {
    generic: 'Исследование не удалось завершить с нашей стороны.', empty: 'Агент завершил работу без отчёта.', timeout: 'Исследование превысило лимит времени.',
    context: 'Прикреплённого документа больше нет.', unfunded: 'Сервис исследований сейчас недоступен.',
  },
};
const REFUND: Record<Lang, { done: string; pending: string }> = {
  ka: { done: 'კრედიტი დაგიბრუნდა.', pending: 'კრედიტი მალე დაგიბრუნდება.' },
  en: { done: 'Your credits were returned.', pending: 'Your credits will be returned shortly.' },
  ru: { done: 'Кредиты возвращены.', pending: 'Кредиты скоро будут возвращены.' },
};

/** Why a settled job did not produce a report, plus what happened to the money. Never a provider body — only a code is known here. */
export function jobFailureText(job: Pick<ResearchJobPublic, 'errorCode' | 'refunded' | 'refundPending' | 'status'>, locale?: string | null): string {
  const l = researchLang(locale);
  const f = FAILURE[l];
  const code = job.errorCode;
  const why = job.status === 'canceled' || code === 'user_canceled' ? researchCopy(l).cardCanceled
    : code === 'empty_report' ? f.empty
      : code === 'timeout' ? f.timeout
        : code === 'context_missing' ? f.context
          : code === 'provider_unfunded' || code === 'provider_unavailable' || code === 'provider_rate_limited' ? f.unfunded
            : f.generic;
  const r = REFUND[l];
  return job.refunded ? `${why} ${r.done}` : job.refundPending ? `${why} ${r.pending}` : why;
}

/** Elapsed whole minutes since `startedAt` (or `createdAt`), never negative. */
export function elapsedMinutes(job: Pick<ResearchJobPublic, 'startedAt' | 'createdAt'>, nowMs: number): number {
  const from = Date.parse(job.startedAt ?? job.createdAt);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((nowMs - from) / 60_000));
}

/** The one line that names a job in a list or a toast: its title, else its question, shortened. */
export function jobLabel(job: Pick<ResearchJobPublic, 'title' | 'prompt'>, max = 90): string {
  const t = (job.title || job.prompt || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
