/**
 * Every user-visible string of the video create screen, in the three languages of the product. Georgian runs 1.5–2× the
 * length of English: every row that shows these wraps (it never truncates a label that carries meaning).
 */
export type VideoLang = 'ka' | 'en' | 'ru';
export const videoLang = (l: string | null | undefined): VideoLang => (l === 'en' || l === 'ru' ? l : 'ka');

export type L3 = Record<VideoLang, string>;
const T = (ka: string, en: string, ru: string): L3 => ({ ka, en, ru });

export const VIDEO_COPY = {
  chooseTool: T('აირჩიე ხელსაწყო', 'Choose a tool', 'Выберите инструмент'),
  close: T('დახურვა', 'Close', 'Закрыть'),
  change: T('შეცვლა', 'Change', 'Сменить'),
  tabs: T('შექმნის რეჟიმი', 'What to do', 'Режим'),
  create: T('შექმნა', 'Create', 'Создать'),
  extend: T('გახანგრძლივება', 'Extend', 'Продлить'),

  modeDocumentary: T('დოკუმენტური', 'Documentary', 'Документальный'),
  modeMusicVideo: T('მუსიკალური კლიპი', 'Music video', 'Клип'),
  modeDocumentarySub: T('ნაწერიანი ფილმი', 'A narrated film', 'Фильм с диктором'),
  modeMusicVideoSub: T('მუსიკალური კლიპი სიმღერით', 'A sung music clip', 'Клип с песней'),

  // references
  refsTitle: T('დაამატე რეფერენსები', 'Add references', 'Добавьте референсы'),
  refsSub: T('სურათი ან აუდიო', 'Image or Audio', 'Изображение или аудио'),
  addImage: T('რეფერენს-სურათის დამატება', 'Add a reference image', 'Добавить изображение-референс'),
  addAudio: T('საუნდტრეკის დამატება', 'Add a soundtrack', 'Добавить саундтрек'),
  imageAlt: T('რეფერენსი', 'Reference', 'Референс'),
  remove: T('წაშლა', 'Remove', 'Удалить'),
  audioMakesMusicVideo: T('ტრეკი ფილმს მუსიკალურ კლიპად აქცევს (9:16)', 'A track makes it a music video (9:16)', 'Трек превращает фильм в клип (9:16)'),
  refsFull: T('ერთი ფოტო თითო სცენაზე — გრძელი ფილმი მეტს იტევს', 'One photo per scene — a longer film takes more', 'По фото на сцену — длинный фильм вмещает больше'),

  // prompt
  prompt: T('პრომპტი', 'Prompt', 'Промпт'),
  placeholder: T(
    'აღწერე კადრი — მაგ., „მარტოხელა მხედარი გამთენიისას უდაბნოს კვეთს“. რეფერენსის დასამატებლად გამოიყენე @…',
    'Describe the shot — e.g. “a lone rider crosses a desert at dawn”. Add reference images using @…',
    'Опишите кадр — например, «одинокий всадник пересекает пустыню на рассвете». Референсы — через @…',
  ),
  elements: T('ელემენტები', 'Elements', 'Элементы'),
  elementsEmpty: T('ჯერ დაამატე რეფერენს-სურათი', 'Add a reference image first', 'Сначала добавьте изображение-референс'),
  elementsAdd: T('სურათის დამატება', 'Add an image', 'Добавить изображение'),
  sound: T('ხმა', 'Sound', 'Звук'),
  on: T('ჩართ.', 'On', 'Вкл'),
  off: T('გამორთ.', 'Off', 'Выкл'),
  soundLocked: T('ამ კავშირზე Veo ხმას ყოველთვის ქმნის', 'On this connection Veo always renders sound', 'В этом режиме Veo всегда создаёт звук'),
  promptNeeded: T('ჯერ აღწერე ვიდეო', 'Describe your video first', 'Сначала опишите видео'),

  // rows and tiles
  model: T('მოდელი', 'Model', 'Модель'),
  length: T('ხანგრძლივობა', 'Length', 'Длительность'),
  format: T('ფორმატი', 'Format', 'Формат'),
  resolution: T('გარჩევადობა', 'Resolution', 'Разрешение'),
  quality: T('ხარისხი', 'Quality', 'Качество'),
  tierLite: T('ეკონომი', 'Economy', 'Эконом'),
  tierFast: T('სწრაფი', 'Fast', 'Быстро'),
  tierStandard: T('მაქს. ხარისხი', 'Max quality', 'Макс. качество'),
  tierDefault: T('ძირითადი', 'Default', 'Основной'),
  tierDefaultNote: T('ძირითადი', 'default', 'основной'),

  // generate
  generate: T('შექმნა', 'Generate', 'Создать'),
  rendering: T('იქმნება…', 'Rendering…', 'Создаётся…'),

  // disclosures
  story: T('ისტორია და სტილი', 'Story & style', 'История и стиль'),
  voice: T('ხმა და მუსიკა', 'Voice & music', 'Голос и музыка'),
  advanced: T('დამატებითი', 'Advanced', 'Дополнительно'),

  // length picker
  lengthTitle: T('ხანგრძლივობა', 'Length', 'Длительность'),
  scenes: (n: number): L3 => T(`${n} სცენა`, n === 1 ? '1 scene' : `${n} scenes`, `${n} ${n === 1 ? 'сцена' : n < 5 ? 'сцены' : 'сцен'}`),
  oneClip: T('ერთი კლიპი', 'One clip', 'Один клип'),
  price: T('ფასი', 'Price', 'Цена'),
  presets: T('სწრაფი არჩევანი', 'Quick picks', 'Быстрый выбор'),
  soon: T('მალე', 'Soon', 'Скоро'),
  openingSoon: T('მალე გაიხსნება', 'opening soon', 'скоро откроется'),
  longformNote: T(
    'ფილმები 1:36-ზე გრძელი გრძელფორმატიან პაიპლაინზე იქმნება.',
    'Films longer than 1:36 are made by the long-form pipeline.',
    'Фильмы длиннее 1:36 делает длинный формат.',
  ),
  done: T('მზადაა', 'Done', 'Готово'),

  // format picker
  formatTitle: T('ფორმატი', 'Format', 'Формат'),
  vertical: T('ვერტიკალური', 'Vertical', 'Вертикальный'),
  square: T('კვადრატული', 'Square', 'Квадрат'),
  landscape: T('ჰორიზონტალური', 'Landscape', 'Горизонтальный'),
  portrait: T('პორტრეტი', 'Portrait', 'Портрет'),
  verticalUse: T('Reels · TikTok · Shorts', 'Reels · TikTok · Shorts', 'Reels · TikTok · Shorts'),
  squareUse: T('ლენტა', 'Feed posts', 'Лента'),
  landscapeUse: T('YouTube · კინო', 'YouTube · cinema', 'YouTube · кино'),
  portraitUse: T('Instagram-ის ლენტა', 'Instagram feed', 'Лента Instagram'),
  musicVideoLocksFormat: T('მუსიკალური კლიპი ყოველთვის 9:16-ია', 'A music video is always 9:16', 'Клип всегда 9:16'),

  // model picker (components/studio/ui/ModelPicker — no prices: the price is on Generate)
  modelTitle: T('მოდელი', 'Model', 'Модель'),
  modelsLabel: T('მოდელები', 'Models', 'Модели'),
  modeLabel: T('რეჟიმი', 'Mode', 'Режим'),
  engineLabel: T('ძრავა და ფასი', 'Engine & price', 'Движок и цена'),
  liteBlurb: T('ყველაზე დაბალი ფასი', 'Lowest price', 'Самая низкая цена'),
  fastBlurb: T('ბალანსი — ძირითადი არჩევანი', 'Balanced — the default', 'Баланс — основной выбор'),
  standardBlurb: T('მაქსიმალური ხარისხი · Fast-ზე 3.3-ჯერ ძვირი', 'Max quality · 3.3× the price of Fast', 'Максимум качества · в 3,3 раза дороже Fast'),
  musicVideoSurcharge: (pct: number): L3 => T(
    `მუსიკალური კლიპი +${pct}% (სიმღერა და ტუჩების სინქრონი)`,
    `A music video adds ${pct}% (the song and lip-synced close-ups)`,
    `Клип +${pct}% (песня и синхрон губ)`,
  ),
  creditsPerFilm: T('კრედიტი ფილმზე, ხანგრძლივობის მიხედვით', 'Credits per film, by length', 'Кредитов за фильм, по длительности'),
  perSecond: T('წმ-ზე', 'per second', 'за секунду'),

  // desktop stage
  result: T('შედეგი', 'Result', 'Результат'),
  resultEmpty: T('შენი ვიდეო აქ გამოჩნდება', 'Your video will appear here', 'Ваше видео появится здесь'),
  resultEmptySub: T('აღწერე კადრი პანელში და დააჭირე „შექმნას“', 'Describe a shot in the panel and press Generate', 'Опишите кадр в панели и нажмите «Создать»'),
  resultRendering: T('ვიდეო იქმნება…', 'Your video is rendering…', 'Видео создаётся…'),
  openInEditor: T('რედაქტორში გახსნა', 'Open in editor', 'Открыть в редакторе'),
  modelsPrices: T('მოდელები და ფასები', 'Models & prices', 'Модели и цены'),

  // extend
  extendSoon: T(
    'ვიდეოს გახანგრძლივება მალე გაიხსნება. Veo კლიპს მისი ბოლო კადრიდან აგრძელებს — სანამ ეს გზა მზად იქნება, გრძელი ფილმი ხანგრძლივობის არჩევით შექმენი.',
    'Extending a video is opening soon. Veo continues a clip from its last frame — until that is ready, make a longer film with the length picker.',
    'Продление видео скоро откроется. Veo продолжает клип с его последнего кадра — а пока создайте длинный фильм через выбор длительности.',
  ),
  addVideoToExtend: T('დაამატე ვიდეო გასახანგრძლივებლად', 'Add video to extend', 'Добавьте видео для продления'),
  extendRefsTitle: T('დაამატე ელემენტები ან რეფერენსები', 'Add elements or references', 'Добавьте элементы или референсы'),
  direction: T('მიმართულება', 'Direction', 'Направление'),
  sequel: T('გაგრძელება', 'Sequel', 'Продолжение'),
  prequel: T('წინა ნაწილი — Veo-ში შეუძლებელია', 'Prequel — not possible with Veo', 'Предыстория — в Veo невозможно'),
  extendPlaceholder: T(
    'აღწერე, რა ხდება შემდეგ — მაგ., „ის ტრიალდება და მიდის“ ან „კამერა შორდება“. რეფერენსის დასამატებლად გამოიყენე @…',
    'Describe what happens next — e.g. “she turns and walks away” or “the camera pulls back”. Add reference images or elements using @…',
    'Опишите, что происходит дальше — например, «она оборачивается и уходит» или «камера отъезжает». Референсы — через @…',
  ),
} as const;

export type VideoCopyKey = keyof typeof VIDEO_COPY;

/** Resolve a copy entry for a language (functions such as `scenes` are resolved by the caller). */
export function vc(entry: L3, locale: string): string {
  return entry[videoLang(locale)];
}
