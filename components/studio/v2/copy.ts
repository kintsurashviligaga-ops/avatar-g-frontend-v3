/**
 * Studio V2 copy — Georgian first (brief §0), English and Russian for the other two locales. Inline, the
 * studio convention (ChatChrome, CreditsModal, serviceError): no catalogue round-trip for a screen this size.
 */
import type { StudioTab, Tier } from '@/lib/studio/ui/dock';

export type Lang = 'ka' | 'en' | 'ru';
export const langOf = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

type Dict = Record<Lang, string>;
const d = (ka: string, en: string, ru: string): Dict => ({ ka, en, ru });

export const TAB_LABEL: Record<StudioTab, Dict> = {
  video: d('ვიდეო', 'Video', 'Видео'),
  image: d('სურათი', 'Image', 'Изображение'),
  avatar: d('ავატარი', 'Avatar', 'Аватар'),
  music: d('მუსიკა', 'Music', 'Музыка'),
  voice: d('ხმა', 'Voice', 'Голос'),
  motion: d('მოძრაობა', 'Motion', 'Движение'),
  remix: d('რემიქსი', 'Remix', 'Ремикс'),
};

export const MODE_LABEL: Record<string, Dict> = {
  'text-to-image': d('ტექსტიდან', 'From text', 'Из текста'),
  'text-to-video': d('ტექსტიდან', 'From text', 'Из текста'),
  'image-to-video': d('ფოტოდან', 'From a photo', 'Из фото'),
  'reference-to-video': d('რეფერენსებით', 'With references', 'По референсам'),
  'motion-transfer': d('მოძრაობის გადატანა', 'Motion transfer', 'Перенос движения'),
};

export const TIER_LABEL: Record<Tier, Dict> = {
  fast: d('სწრაფი', 'Fast', 'Быстро'),
  standard: d('სტანდარტი', 'Standard', 'Стандарт'),
  pro: d('Pro', 'Pro', 'Pro'),
};

/** Field names, as a person would say them. */
export const PARAM_LABEL: Record<string, Dict> = {
  prompt: d('აღწერა', 'Description', 'Описание'),
  aspect_ratio: d('კადრის ფორმა', 'Aspect ratio', 'Формат'),
  duration: d('ხანგრძლივობა', 'Duration', 'Длительность'),
  resolution: d('ხარისხი', 'Quality', 'Качество'),
  sound: d('ხმა', 'Sound', 'Звук'),
  generate_audio: d('ხმა', 'Sound', 'Звук'),
  keep_original_sound: d('ვიდეოს ხმა', 'Video’s sound', 'Звук видео'),
  character_orientation: d('მიმართულება', 'Facing', 'Ориентация'),
  image_url: d('ფოტო', 'Photo', 'Фото'),
  last_image_url: d('ბოლო კადრი', 'Last frame', 'Последний кадр'),
  video_url: d('მოძრაობის ვიდეო', 'Motion video', 'Видео движения'),
  image_urls: d('ფოტოები', 'Photos', 'Фото'),
  audio_urls: d('ხმის ნიმუში', 'Sound sample', 'Образец звука'),
};

/** image_url means "first frame" on image→video. */
export const FIRST_FRAME = d('პირველი კადრი', 'First frame', 'Первый кадр');

export const VALUE_LABEL: Record<string, Record<string, Dict>> = {
  sound: { on: d('ხმით', 'With sound', 'Со звуком'), off: d('უხმოდ', 'Silent', 'Без звука') },
  generate_audio: { true: d('ხმით', 'With sound', 'Со звуком'), false: d('უხმოდ', 'Silent', 'Без звука') },
  keep_original_sound: { yes: d('ორიგინალი ხმით', 'Original sound', 'Со звуком видео'), no: d('უხმოდ', 'Silent', 'Без звука') },
  character_orientation: { image: d('როგორც ფოტოზე', 'As in the photo', 'Как на фото'), video: d('როგორც ვიდეოში', 'As in the video', 'Как в видео') },
};

export const STATUS_LABEL: Record<string, Dict> = {
  reserving: d('იწყება', 'Starting', 'Запуск'),
  reserved: d('იწყება', 'Starting', 'Запуск'),
  pending: d('რიგში', 'Queued', 'В очереди'),
  submitting: d('იგზავნება', 'Sending', 'Отправка'),
  submit_unknown: d('იგზავნება', 'Sending', 'Отправка'),
  queued: d('რიგში', 'Queued', 'В очереди'),
  in_progress: d('მზადდება', 'Generating', 'Создаётся'),
  finalizing: d('სრულდება', 'Finishing', 'Завершение'),
  completed: d('მზადაა', 'Ready', 'Готово'),
  failed: d('ვერ შესრულდა', 'Failed', 'Не удалось'),
  nsfw: d('უარყოფილია', 'Rejected', 'Отклонено'),
  canceled: d('გაუქმდა', 'Canceled', 'Отменено'),
};

export const HERO: Record<StudioTab, { title: Dict; accent: Dict; sub: Dict }> = {
  video: {
    title: d('შექმენი პროფესიონალური ვიდეო', 'Make a professional video', 'Создай профессиональное видео'),
    accent: d('ერთი იდეიდან.', 'from one idea.', 'из одной идеи.'),
    sub: d('აღწერე სცენა ქართულად — ფასს დაინახავ, სანამ დაიწყებ.', 'Describe the scene in any language — you see the price before you start.', 'Опиши сцену — цену увидишь до старта.'),
  },
  image: {
    title: d('ფოტორეალისტური სურათი', 'A photoreal image', 'Фотореалистичное изображение'),
    accent: d('წამებში.', 'in seconds.', 'за секунды.'),
    sub: d('პორტრეტი, პროდუქტი, მოდა — აღწერე, რაც გინდა.', 'Portrait, product, fashion — describe what you want.', 'Портрет, продукт, мода — опиши, что нужно.'),
  },
  motion: {
    title: d('გადაიტანე მოძრაობა', 'Transfer the motion', 'Перенеси движение'),
    accent: d('შენს ფოტოზე.', 'onto your photo.', 'на своё фото.'),
    sub: d('ატვირთე ვიდეო მოძრაობით და ფოტო — პერსონაჟი ზუსტად გაიმეორებს.', 'Upload a video with the motion and a photo — the character repeats it.', 'Загрузи видео с движением и фото — персонаж повторит.'),
  },
  avatar: { title: d('ავატარი', 'Avatar', 'Аватар'), accent: d('', '', ''), sub: d('', '', '') },
  music: { title: d('მუსიკა', 'Music', 'Музыка'), accent: d('', '', ''), sub: d('', '', '') },
  voice: { title: d('ხმა', 'Voice', 'Голос'), accent: d('', '', ''), sub: d('', '', '') },
  remix: { title: d('რემიქსი', 'Remix', 'Ремикс'), accent: d('', '', ''), sub: d('', '', '') },
};

export const FLOW = d('იდეა → ვიდეო → შედეგი', 'Idea → video → result', 'Идея → видео → результат');

/** Tabs that already work elsewhere in the product: where they go, and what the card says. */
export const ELSEWHERE: Partial<Record<StudioTab, { href: (locale: string) => string; body: Dict; cta: Dict }>> = {
  music: {
    href: (l) => `/${l}/dashboard?mode=music`,
    body: d('მუსიკა ჯერ ჩატში იქმნება — იქ უკვე მუშაობს: სიმღერა ქართულად, ინსტრუმენტალი, ფონი.', 'Music is made in the chat for now — it already works there: songs, instrumentals, backgrounds.', 'Музыка пока создаётся в чате — там она уже работает.'),
    cta: d('მუსიკის გახსნა', 'Open music', 'Открыть музыку'),
  },
  voice: {
    href: (l) => `/${l}/dashboard?voice=1`,
    body: d('ხმოვანი რეჟიმი: ელაპარაკე Agent G-ს ქართულად — ის გიპასუხებს ხმით.', 'Voice mode: talk to Agent G — it answers out loud.', 'Голосовой режим: говори с Agent G — он ответит голосом.'),
    cta: d('ხმის ჩართვა', 'Start voice', 'Включить голос'),
  },
  avatar: {
    href: (l) => `/${l}/dashboard#lipsync`,
    body: d('ერთი და იგივე პერსონაჟი ყველა კადრში (Soul ID) მალე დაემატება. ახლა შეგიძლია ფოტოს ალაპარაკება.', 'The same character in every shot (Soul ID) is coming soon. Today you can make a photo talk.', 'Один персонаж во всех кадрах (Soul ID) — скоро. Сейчас можно оживить фото.'),
    cta: d('ფოტოს ალაპარაკება', 'Make a photo talk', 'Оживить фото'),
  },
  remix: {
    href: (l) => `/${l}/dashboard#film`,
    body: d('ობიექტის ჩანაცვლება და ვიდეოს რედაქტირება სტუდიაში მალე დაემატება.', 'Object swap and video editing are coming to the studio soon.', 'Замена объектов и редактирование видео скоро появятся.'),
    cta: d('კინო სტუდიის გახსნა', 'Open the film studio', 'Открыть киностудию'),
  },
};

export const T = {
  studio: d('სტუდია', 'Studio', 'Студия'),
  beta: d('ბეტა', 'Beta', 'Бета'),
  create: d('შექმნა', 'Create', 'Создать'),
  library: d('ბიბლიოთეკა', 'Library', 'Библиотека'),
  more: d('მეტი', 'More', 'Ещё'),
  model: d('მოდელი', 'Model', 'Модель'),
  settings: d('პარამეტრები', 'Settings', 'Параметры'),
  references: d('რეფერენსები', 'References', 'Референсы'),
  add: d('დამატება', 'Add', 'Добавить'),
  remove: d('წაშლა', 'Remove', 'Удалить'),
  close: d('დახურვა', 'Close', 'Закрыть'),
  uploading: d('იტვირთება…', 'Uploading…', 'Загрузка…'),
  placeholder: {
    video: d('აღწერე სცენა: ვინ, სად, რა ხდება, კამერის მოძრაობა…', 'Describe the scene: who, where, what happens, camera movement…', 'Опиши сцену: кто, где, что происходит, движение камеры…'),
    image: d('აღწერე სურათი: სუბიექტი, გარემო, სინათლე, სტილი…', 'Describe the image: subject, setting, light, style…', 'Опиши изображение: объект, место, свет, стиль…'),
    motion: d('სურვილისამებრ: დამატებითი მითითება (ფონი, სტილი)…', 'Optional: extra direction (background, style)…', 'Необязательно: уточнения (фон, стиль)…'),
  } as Partial<Record<StudioTab, Dict>>,
  generate: d('გენერაცია', 'Generate', 'Создать'),
  pricing: d('ფასი ითვლება…', 'Pricing…', 'Считаем цену…'),
  starting: d('იწყება…', 'Starting…', 'Запуск…'),
  signIn: d('შედი და შექმენი', 'Sign in to create', 'Войди, чтобы создать'),
  topUp: d('ბალანსის შევსება', 'Top up', 'Пополнить'),
  notEnough: d('ბალანსი არ კმარა', 'Not enough balance', 'Недостаточно средств'),
  confirmHigh: d('ეს გენერაცია ღირს', 'This generation costs', 'Эта генерация стоит'),
  confirmYes: d('დიახ, დაიწყე', 'Yes, start', 'Да, начать'),
  confirmNo: d('არა', 'No', 'Нет'),
  newPrice: d('ფასი შეიცვალა', 'The price changed', 'Цена изменилась'),
  need: {
    prompt: d('დაწერე აღწერა', 'Write a description', 'Напиши описание'),
    image_url: d('დაამატე ფოტო', 'Add a photo', 'Добавь фото'),
    video_url: d('დაამატე ვიდეო მოძრაობით', 'Add the motion video', 'Добавь видео с движением'),
    image_urls: d('დაამატე ფოტო ან ხმა', 'Add a photo or a sound', 'Добавь фото или звук'),
  } as Record<string, Dict>,
  balance: d('ბალანსი', 'Balance', 'Баланс'),
  cancel: d('გაუქმება', 'Cancel', 'Отмена'),
  download: d('ჩამოტვირთვა', 'Download', 'Скачать'),
  animate: d('გაცოცხლება', 'Animate', 'Оживить'),
  useAsRef: d('რეფერენსად', 'Use as reference', 'Как референс'),
  openLibrary: d('ბიბლიოთეკაში', 'In the library', 'В библиотеке'),
  sentToModel: d('მოდელმა მიიღო', 'Sent to the model', 'Отправлено модели'),
  refunded: d('თანხა დაგიბრუნდა', 'Refunded', 'Средства возвращены'),
  recent: d('ბოლო გენერაციები', 'Recent', 'Недавние'),
  failed: d('ვერ შესრულდა. სცადე თავიდან.', 'It failed. Try again.', 'Не удалось. Попробуй снова.'),
  modelsUnavailable: d('მოდელების სია ვერ ჩაიტვირთა.', 'Could not load the models.', 'Не удалось загрузить модели.'),
  retry: d('თავიდან', 'Retry', 'Повторить'),
  seconds: d('წმ', 's', 'с'),
  lost: d('მოთხოვნის პასუხი ვერ მივიღეთ. თუ გენერაცია დაიწყო, ის აქ, სიაში გამოჩნდება — ხელახლა ნუ დააჭერ.', 'We lost the answer. If the generation started, it will appear in this list — don’t press again.', 'Ответ потерян. Если генерация началась, она появится в списке — не нажимай повторно.'),
};

export const tx = (dict: Dict, lang: Lang) => dict[lang] || dict.ka;
