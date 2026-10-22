export type ImageLocale = 'ka' | 'en' | 'ru';
const words = {
  title: ['სურათების სტუდია', 'Image Studio', 'Студия изображений'],
  prompt: ['აღწერა / Agent G-ის ბრძანება', 'Prompt / Agent G command', 'Описание / команда Agent G'],
  instructions: ['დამატებითი ინსტრუქციები (თითო ხაზზე ერთი)', 'Additional instructions (one per line)', 'Дополнительные указания (по одному в строке)'],
  unchanged: ['ტექსტი უცვლელად გადაიცემა. დამატებები ფასის დადასტურებამდე გამოჩნდება.', 'Your text is sent unchanged. Additions appear before you confirm the price.', 'Текст передаётся без изменений. Дополнения видны до подтверждения цены.'],
  operation: ['მოქმედება', 'Operation', 'Действие'],
  model: ['მოდელი', 'Model', 'Модель'],
  aspect: ['ფორმატი', 'Aspect ratio', 'Формат'],
  resolution: ['ზომა', 'Resolution', 'Размер'],
  variations: ['ვარიანტები', 'Variations', 'Варианты'],
  references: ['რეფერენსები', 'References', 'Референсы'],
  add: ['ფოტოს დამატება', 'Add photo', 'Добавить фото'],
  role: ['როლი', 'Role', 'Роль'],
  remove: ['წაშლა', 'Remove', 'Убрать'],
  up: ['ზემოთ', 'Move up', 'Выше'],
  quote: ['ფასისა და გეგმის ნახვა', 'Review plan and price', 'План и цена'],
  quoting: ['გეგმა მზადდება…', 'Preparing quote…', 'Подготовка плана…'],
  confirm: ['ვადასტურებ და ვიწყებ', 'Confirm and start', 'Подтвердить и начать'],
  credits: ['კრედიტი', 'credits', 'кредитов'],
  quoteTitle: ['Agent G — დასადასტურებელი გეგმა', 'Agent G — plan to confirm', 'Agent G — план для подтверждения'],
  extras: ['ცალკე დამატებული ინსტრუქციები', 'Separate added instructions', 'Отдельные дополнительные инструкции'],
  edit: ['გეგმის შეცვლა', 'Edit plan', 'Изменить план'],
  cancel: ['გაუქმება', 'Cancel', 'Отменить'],
  paused: ['დარჩენილი ვარიანტები შეჩერებულია. უკვე გაგზავნილი დავალებების სტატუსი მოწმდება.', 'Remaining variations are paused. Submitted jobs are still checked.', 'Оставшиеся варианты приостановлены. Статус отправленных задач проверяется.'],
  resume: ['დადასტურებული გეგმის გაგრძელება', 'Resume approved plan', 'Продолжить подтверждённый план'],
  stopBatch: ['დარჩენილი ვარიანტების შეჩერება', 'Pause remaining variations', 'Приостановить оставшиеся варианты'],
  pendingRefund: ['კრედიტების დაბრუნება მოწმდება', 'Credit settlement pending', 'Возврат кредитов проверяется'],
  limitation: ['სახის, წარწერისა და უცვლელი პიქსელების სიზუსტე გარანტირებული არ არის. შედეგს გადაავლე თვალი.', 'Exact identity, lettering and unchanged pixels are not guaranteed. Review the result.', 'Точное сходство, надписи и неизменность пикселей не гарантируются. Проверьте результат.'],
  batchNote: ['თითო ვარიანტი ცალკე დავალებაა. სრულდება მიმდევრობით; ფასი და თანხის დაბრუნება თითოეულს ცალკე აქვს.', 'Each variation is a separate job, run in sequence, with its own charge and settlement.', 'Каждый вариант — отдельная задача. Выполняются последовательно, оплата и возврат отдельные.'],
  preview: ['შედეგი', 'Result', 'Результат'],
  original: ['საწყისი', 'Before', 'До'],
  compare: ['საწყისთან შედარება', 'Compare with source', 'Сравнить с исходным'],
  zoom: ['მასშტაბი', 'Zoom', 'Масштаб'],
  download: ['ჩამოტვირთვა', 'Download', 'Скачать'],
  use: ['ამ ვერსიის რედაქტირება', 'Edit this version', 'Редактировать версию'],
  library: ['ჩემი სურათები', 'My images', 'Мои изображения'],
  refresh: ['განახლება', 'Refresh', 'Обновить'],
  versions: ['ვერსიების ისტორია', 'Version history', 'История версий'],
  empty: ['ჯერ სურათი არ არის.', 'No images yet.', 'Пока нет изображений.'],
  loading: ['იტვირთება…', 'Loading…', 'Загрузка…'],
  failure: ['მოქმედება ვერ შესრულდა. მონაცემები შენარჩუნებულია; სცადე ხელახლა.', 'The action could not finish. Your draft is preserved; try again.', 'Не удалось завершить действие. Черновик сохранён; повторите попытку.'],
  insufficient: ['კრედიტი არ არის საკმარისი. შეავსე ბალანსი და სცადე ხელახლა.', 'Not enough credits. Top up your balance and try again.', 'Недостаточно кредитов. Пополните баланс и повторите попытку.'],
  queueFull: ['რიგი სავსეა. არაფერი ჩამოგეჭრა — სცადე ცოტა ხანში.', 'The queue is full. Nothing was charged — try again shortly.', 'Очередь заполнена. Ничего не списано — попробуйте чуть позже.'],
  safety: ['მოთხოვნა უსაფრთხოების წესებმა შეაჩერა. შეცვალე აღწერა.', 'The request was stopped by safety rules. Change the description.', 'Запрос остановлен правилами безопасности. Измените описание.'],
  quoteUsed: ['ეს ფასი უკვე გამოყენებულია. მოითხოვე ახალი ფასი.', 'This quote was already used. Request a new quote.', 'Эта цена уже использована. Запросите новую.'],
  cancelledJob: ['დავალება გაუქმდა.', 'The job was cancelled.', 'Задача отменена.'],
  notFound: ['სურათი ვერ მოიძებნა.', 'The image was not found.', 'Изображение не найдено.'],
  unsupported: ['ეს შესაძლებლობა ამ სამუშაო ფანჯარაში ხელმისაწვდომი არ არის.', 'This capability is unavailable in this workspace.', 'Эта возможность недоступна в этой студии.'],
  retired: ['ეს მოდელი Google-მა გააუქმა. ახალი სურათები Gemini 3.1 Flash Image-ით იქმნება. არაფერი ჩამოგეჭრა.', 'Google has retired this model. New images use Gemini 3.1 Flash Image. Nothing was charged.', 'Google вывел эту модель из эксплуатации. Новые изображения создаёт Gemini 3.1 Flash Image. Ничего не списано.'],
  config: ['გენერაციისთვის საჭირო სერვისი გამართული არ არის.', 'A required generation service is not configured.', 'Не настроен необходимый сервис генерации.'],
  size: ['აირჩიე PNG, JPEG ან WebP, მაქსიმუმ 12 MB; სულ 4 რეფერენსი.', 'Use PNG, JPEG or WebP, up to 12 MB each; at most 4 references.', 'PNG, JPEG или WebP, до 12 МБ каждый; максимум 4 референса.'],
  close: ['დახურვა', 'Close', 'Закрыть'],
  open: ['სურათების სტუდია: გეგმა, ფასი, ვერსიები', 'Image Studio: plan, price, versions', 'Студия изображений: план, цена, версии'],
  expires: ['ფასის ვადა', 'Quote expires', 'Цена действительна до'],
  parent: ['საწყისი ვერსია', 'Source version', 'Исходная версия'],
  new: ['ახალი სურათი', 'New image', 'Новое изображение'],
  copy: ['პრომპტის კოპირება', 'Copy prompt', 'Копировать описание'],
  copied: ['დაკოპირებულია', 'Copied', 'Скопировано'],
  unknown: ['პროვაიდერის პასუხი გაურკვეველია. განმეორებითი გენერაცია ავტომატურად არ შესრულდება.', 'Provider outcome is unknown. Generation will not be repeated automatically.', 'Результат провайдера неизвестен. Генерация автоматически не повторяется.'],
  auth: ['გაიარე ავტორიზაცია.', 'Sign in to continue.', 'Войдите для продолжения.'],
  expired: ['ფასის ვადა ამოიწურა. დარჩენილი ვარიანტებისთვის მოითხოვე ახალი გეგმა.', 'The quote expired. Request a new plan for remaining variations.', 'Срок цены истёк. Запросите новый план для оставшихся вариантов.'],
  more: ['ჩანს ისტორიის შეზღუდული ნაწილი. აირჩიე ვერსია გასაგრძელებლად.', 'History is bounded. Select a version to explore further.', 'Показана часть истории. Выберите версию для продолжения.'],
  uploading: ['ფოტო იტვირთება…', 'Uploading photo…', 'Загрузка фото…'],
  storageLocal: ['ამ ჩანართში აღდგენის შენახვა მიუწვდომელია. დავალებები „ჩემს სურათებსა“ და ამოცანებში დარჩება.', 'Tab recovery storage is unavailable. Jobs remain in My images and Tasks.', 'Сохранение восстановления вкладки недоступно. Задачи останутся в Моих изображениях и Задачах.'],
} as const;
const operations = {
 generate: ['შექმნა / ბრძანება', 'Create / command', 'Создать / команда'],
 edit: ['რედაქტირება', 'Edit', 'Редактировать'],
 replace_object: ['ობიექტის შეცვლა', 'Replace object', 'Заменить объект'],
 remove_object: ['ობიექტის მოშორება', 'Remove object', 'Убрать объект'],
 replace_background: ['ფონის შეცვლა', 'Replace background', 'Заменить фон'],
 extend: ['კადრის გაფართოება', 'Extend frame', 'Расширить кадр'],
 character_variation: ['პერსონაჟი და ტანსაცმელი', 'Character and outfit', 'Персонаж и одежда'],
 product_scene: ['პროდუქტის ფოტო', 'Product photo', 'Фото товара'],
} as const;
const roles = {
 subject: ['სუბიექტი', 'Subject', 'Объект'], character: ['პერსონაჟი', 'Character', 'Персонаж'],
 face: ['სახე', 'Face', 'Лицо'], clothing: ['ტანსაცმელი', 'Clothing', 'Одежда'], pose: ['პოზა', 'Pose', 'Поза'],
 style: ['სტილი', 'Style', 'Стиль'], composition: ['კომპოზიცია', 'Composition', 'Композиция'],
 product: ['პროდუქტი', 'Product', 'Товар'], background: ['ფონი', 'Background', 'Фон'], color: ['ფერი', 'Color', 'Цвет'],
} as const;
const stages = {
 queued: ['რიგშია', 'Queued', 'В очереди'], starting: ['იწყება', 'Starting', 'Запуск'], retrying: ['ხელახალი ცდა', 'Retrying', 'Повторная попытка'], reserving: ['კრედიტები მოწმდება', 'Checking credits', 'Проверка кредитов'],
 preparing: ['რეფერენსები მოწმდება', 'Checking references', 'Проверка референсов'],
 generating: ['სურათი იქმნება', 'Generating image', 'Создание изображения'],
 quality_checking: ['ხარისხი მოწმდება', 'Checking quality', 'Проверка качества'],
 saving: ['ინახება', 'Saving', 'Сохранение'], recovering: ['დავალება აღდგება', 'Recovering job', 'Восстановление задачи'],
 completed: ['მზადაა', 'Completed', 'Готово'], failed: ['ვერ შესრულდა', 'Failed', 'Ошибка'], cancelled: ['გაუქმებულია', 'Cancelled', 'Отменено'],
} as const;
export function imageCopy(locale: string) {
 const i = locale === 'en' ? 1 : locale === 'ru' ? 2 : 0;
 return { t: (key: keyof typeof words) => words[key][i],
   operation: (key: string) => operations[key as keyof typeof operations]?.[i] ?? key,
   role: (key: string) => roles[key as keyof typeof roles]?.[i] ?? key,
   stage: (key: string) => stages[key as keyof typeof stages]?.[i] ?? stages.queued[i] };
}
export function imageErrorCopy(code: string, locale: string) {
 const c = imageCopy(locale);
 return c.t(code === 'unauthenticated' ? 'auth' : code === 'quote_expired' ? 'expired'
   : code === 'insufficient_credits' ? 'insufficient' : code === 'queue_full' ? 'queueFull' : code === 'prompt_safety' ? 'safety'
   : code === 'quote_used' ? 'quoteUsed' : code === 'cancelled' ? 'cancelledJob' : code === 'not_found' ? 'notFound'
   : code === 'unsupported_capability' ? 'unsupported' : code === 'lifecycle_blocked' ? 'retired'
   : code === 'not_configured' ? 'config' : code === 'provider_timeout' || code === 'provider_outcome_unknown' ? 'unknown' : 'failure');
}
