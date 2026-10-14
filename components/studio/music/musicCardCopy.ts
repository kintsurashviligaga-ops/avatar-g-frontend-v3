/** components/studio/music/musicCardCopy.ts — every sentence of the Music Studio card, in Georgian, English and Russian. */
type L = 'ka' | 'en' | 'ru';
const pick = (l: string): L => (l === 'en' || l === 'ru' ? l : 'ka');

const COPY = {
  ka: {
    planTitle: 'მუსიკის გეგმა', song: 'სიმღერა', instrumental: 'ინსტრუმენტული', pricing: 'ფასს ვითვლი…',
    tempo: { slow: 'ნელი', medium: 'საშუალო', fast: 'სწრაფი' },
    approxLength: (s: number) => `≈ ${s} წმ`,
    confirm: (n: number) => `შექმნა · ${n} კრედიტი`, confirmAria: (n: number) => `დადასტურება: ${n} კრედიტი ჩამოგეჭრება`,
    lengthNote: 'სიგრძეს მოდელი თავად განსაზღვრავს — მიახლოებითია.',
    cancel: 'გაუქმება', retry: 'ხელახლა', regenerate: 'ახალი ვარიანტი', download: 'ჩამოტვირთვა', apply: 'შესრულება',
    playerAria: 'შექმნილი ტრეკი', editLabel: 'რედაქტირების ბრძანება',
    editPlaceholder: 'მაგ.: პირველი 20 წამი, ფეიდ აუტ 3 წმ, wav-ად', editNotUnderstood: 'ბრძანება ვერ გავიგე — სცადე: „მოჭერი 5-დან 20-მდე", „ფეიდ აუტ 3 წმ", „wav-ად".',
    unsupportedOp: 'ეს ფუნქცია (რემიქსი, სტემები, ვოკალის მოშორება, გაგრძელება, ქავერი, ხმის შეცვლა, სიჩქარე/ტონი) Music Studio-ში ჯერ არ არის.',
    editFailed: 'რედაქტირება ვერ შესრულდა. ორიგინალი უცვლელია.', genericError: 'რაღაც შეფერხდა.',
    refundPending: 'კრედიტის დაბრუნება მუშავდება — ავტომატურად დაგიბრუნდება.',
    failed: (cancelled: boolean, code: string | null) => (cancelled ? 'გაუქმდა. დაკავებული კრედიტი დაგიბრუნდა.' : `ვერ შეიქმნა${code ? ` (${code})` : ''}. დაკავებული კრედიტი დაგიბრუნდა.`),
    delivered: (s: number, cr: number, m: string) => `${s} წმ · ${cr} კრედიტი · ${m}`,
    version: (label: string, s: number) => `ახალი ვერსია: ${label} · ${s} წმ`,
    savedToLibrary: 'შენახულია ბიბლიოთეკაში. ორიგინალი არასდროს იცვლება.',
  },
  en: {
    planTitle: 'Music plan', song: 'Song', instrumental: 'Instrumental', pricing: 'Getting the price…',
    tempo: { slow: 'slow', medium: 'medium', fast: 'fast' },
    approxLength: (s: number) => `≈ ${s} s`,
    confirm: (n: number) => `Create · ${n} credits`, confirmAria: (n: number) => `Confirm: ${n} credits will be charged`,
    lengthNote: 'The model sets the exact length — it is approximate.',
    cancel: 'Cancel', retry: 'Try again', regenerate: 'New version', download: 'Download', apply: 'Apply',
    playerAria: 'Generated track', editLabel: 'Edit command',
    editPlaceholder: 'e.g. first 20 seconds, fade out 3s, convert to wav', editNotUnderstood: 'I did not get that — try “trim from 5 to 20”, “fade out 3s”, “convert to wav”.',
    unsupportedOp: 'That (remix, stems, vocal removal, extend, cover, voice change, speed/pitch) is not available in Music Studio yet.',
    editFailed: 'The edit failed. Your original is unchanged.', genericError: 'Something went wrong.',
    refundPending: 'Your refund is being processed — it is returned automatically.',
    failed: (cancelled: boolean, code: string | null) => (cancelled ? 'Cancelled. The reserved credits were returned.' : `Could not create it${code ? ` (${code})` : ''}. The reserved credits were returned.`),
    delivered: (s: number, cr: number, m: string) => `${s} s · ${cr} credits · ${m}`,
    version: (label: string, s: number) => `New version: ${label} · ${s} s`,
    savedToLibrary: 'Saved to your Library. The original is never changed.',
  },
  ru: {
    planTitle: 'План трека', song: 'Песня', instrumental: 'Инструментал', pricing: 'Считаю цену…',
    tempo: { slow: 'медленно', medium: 'средне', fast: 'быстро' },
    approxLength: (s: number) => `≈ ${s} с`,
    confirm: (n: number) => `Создать · ${n} кредитов`, confirmAria: (n: number) => `Подтвердить: будет списано ${n} кредитов`,
    lengthNote: 'Точную длину задаёт модель — она приблизительна.',
    cancel: 'Отменить', retry: 'Ещё раз', regenerate: 'Новый вариант', download: 'Скачать', apply: 'Применить',
    playerAria: 'Созданный трек', editLabel: 'Команда редактирования',
    editPlaceholder: 'напр.: первые 20 секунд, затухание 3 с, в wav', editNotUnderstood: 'Не понял — попробуйте «обрежь с 5 по 20», «fade out 3s», «сохрани в wav».',
    unsupportedOp: 'Это (ремикс, стемы, удаление вокала, продление, кавер, смена голоса, скорость/тон) пока недоступно в Music Studio.',
    editFailed: 'Редактирование не удалось. Оригинал не изменён.', genericError: 'Что-то пошло не так.',
    refundPending: 'Возврат обрабатывается — кредиты вернутся автоматически.',
    failed: (cancelled: boolean, code: string | null) => (cancelled ? 'Отменено. Зарезервированные кредиты возвращены.' : `Не удалось создать${code ? ` (${code})` : ''}. Зарезервированные кредиты возвращены.`),
    delivered: (s: number, cr: number, m: string) => `${s} с · ${cr} кредитов · ${m}`,
    version: (label: string, s: number) => `Новая версия: ${label} · ${s} с`,
    savedToLibrary: 'Сохранено в библиотеке. Оригинал никогда не меняется.',
  },
} as const;

export function musicCardCopy(locale: string) { return COPY[pick(locale)]; }

const STAGES: Record<string, [string, string, string]> = {
  queued: ['რიგში…', 'Queued…', 'В очереди…'],
  reserving: ['კრედიტს ვაკავებ…', 'Reserving credits…', 'Резервирую кредиты…'],
  starting: ['ვიწყებ…', 'Starting…', 'Запускаю…'],
  retrying: ['ხელახლა ვცდი…', 'Retrying…', 'Повторяю…'],
  generating: ['Lyria ქმნის ტრეკს…', 'Lyria is composing…', 'Lyria сочиняет…'],
  quality_checking: ['ხარისხს ვამოწმებ…', 'Checking quality…', 'Проверяю качество…'],
};

export function stageText(stage: string, locale: string): string {
  const row = STAGES[stage] ?? STAGES.queued!;
  const l = pick(locale);
  return l === 'en' ? row[1] : l === 'ru' ? row[2] : row[0];
}

export const COPY_LANGS = Object.keys(COPY) as L[];
