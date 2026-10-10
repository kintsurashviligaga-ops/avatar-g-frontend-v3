/**
 * components/studio/genjutsu/copy.ts — every user-visible string of the VFX panel, in ka / en / ru. Georgian runs 1.5–2×
 * longer than English: the panel lets rows wrap, so these are written to be read, not to fit a pill.
 *
 * Honest copy only: nothing here claims a capability that is not wired end to end. A locked op says "soon" and says
 * plainly why, and the photo-selection line says exactly how many photos the engine receives.
 */
import type { IssueCode } from '@/lib/genjutsu/contract';
import { toLang, type GenjutsuOp, type Lang, type ReferenceRole } from '@/lib/genjutsu/types';

type L<T> = Record<Lang, T>;

export interface Copy {
  heroEyebrow: string;
  heroEmptyTitle: string;
  heroEmptyHint: string;
  change: string;
  effects: string;
  pickEffect: string;
  all: string;
  mode: Record<GenjutsuOp, string>;
  modeHint: Record<GenjutsuOp, string>;
  locked: string;
  lockedWhy: Record<'motion' | 'swap', string>;
  checking: string;
  videoTitle: string;
  videoHint: string;
  videoUploading: string;
  videoRemove: string;
  videoSeconds: (n: string) => string;
  refsTitle: string;
  refsHint: string;
  refsCount: (n: number, max: number) => string;
  refsClear: string;
  role: Record<ReferenceRole, string>;
  roleLabel: string;
  earlier: string;
  later: string;
  remove: string;
  inUse: string;
  notUsed: string;
  using: (used: number, total: number, cap: number, engine: string) => string;
  usingNone: (cap: number, engine: string) => string;
  ruleTitle: string;
  rule: string;
  needCharacter: string;
  refsSkipped: (n: number) => string;
  refsFull: (n: number, max: number) => string;
  promptLabel: string;
  promptPlaceholder: string;
  soundOn: string;
  soundOff: string;
  format: string;
  quality: string;
  length: string;
  lengthFixed: string;
  lengthFromVideo: string;
  tier: { fast: string; standard: string; pro: string };
  generate: string;
  generating: string;
  labelPickEffect: string;
  labelAddVideo: string;
  labelAddCharacter: string;
  labelGettingPrice: string;
  priceAfterInputs: string;
  priceChanged: (n: number) => string;
  engines: string;
  enginesOpen: string;
  enginesSoon: string;
  liveQuote: string;
  creditsWord: (n: number) => string;
  jobWorking: string;
  jobDone: string;
  another: string;
  stillWorking: string;
  fileSkipped: { type: (name: string) => string; size: (name: string) => string; small: (name: string) => string; unreadable: (name: string) => string };
  video: { type: string; size: string; unreadable: string; short: (n: string) => string; long: (n: string) => string };
  failed: string;
  uploadFailed: string;
  /** Plain explanation of a server-side validation code. */
  issue: Partial<Record<IssueCode | 'not_owner' | 'reference_unavailable' | 'video_missing' | 'video_unreadable', string>>;
}

const KA: Copy = {
  heroEyebrow: 'VFX ეფექტი',
  heroEmptyTitle: 'აირჩიე ეფექტი',
  heroEmptyHint: 'ერთი შეხება — ტექსტის წერა არ გჭირდება',
  change: 'შეცვლა',
  effects: 'ეფექტები',
  pickEffect: 'ეფექტის არჩევა',
  all: 'ყველა',
  mode: { scene: 'სცენა', motion: 'მოძრაობა', swap: 'ჩანაცვლება' },
  modeHint: {
    scene: 'ახალი 8-წამიანი VFX სცენა შენი ფოტოებიდან და არჩეული ეფექტიდან.',
    motion: 'ვიდეოს მოძრაობა გადადის შენს პერსონაჟზე — ახალ VFX სცენაში.',
    swap: 'შეცვალე ობიექტი, ლოკაცია ან სტილი — დანარჩენი ვიდეო უცვლელი რჩება.',
  },
  locked: 'მალე — ეს რეჟიმი ჯერ არ არის გახსნილი.',
  lockedWhy: {
    motion: 'მოძრაობის გადასატანად ვიდეო-ძრავს ვაერთებთ. გახსნისას აქ გამოჩნდება; ახლა ღილაკი გამორთულია და თანხა არ იჭრება.',
    swap: 'ჩანაცვლების ძრავი ჯერ არ არის დაკავშირებული. გახსნისას აქ გამოჩნდება; ახლა ღილაკი გამორთულია და თანხა არ იჭრება.',
  },
  checking: 'მოწმდება…',
  videoTitle: 'დაამატე წყარო ვიდეო',
  videoHint: '3–30 წამი · MP4 ან MOV · მაქს. 50 MB',
  videoUploading: 'ვიდეო იტვირთება…',
  videoRemove: 'ვიდეოს მოცილება',
  videoSeconds: (n) => `${n} წმ`,
  refsTitle: 'დაამატე რეფერენს-ფოტოები',
  refsHint: 'პერსონაჟი, პროდუქტი, ტანსაცმელი · მაქს. 40',
  refsCount: (n, max) => `${n} / ${max}`,
  refsClear: 'ყველას წაშლა',
  role: { character: 'პერსონაჟი', product: 'პროდუქტი', wardrobe: 'ტანსაცმელი' },
  roleLabel: 'ფოტოს როლი',
  earlier: 'წინ გადატანა',
  later: 'უკან გადატანა',
  remove: 'ფოტოს წაშლა',
  inUse: 'გამოიყენება',
  notUsed: 'არ გამოიყენება',
  using: (used, total, cap, engine) => `გამოიყენება ${used} / ${total} — ${engine} იღებს მაქსიმუმ ${cap} ფოტოს`,
  usingNone: (cap, engine) => `${engine} იღებს მაქსიმუმ ${cap} ფოტოს`,
  ruleTitle: 'როგორ ირჩევა ფოტოები?',
  rule: 'ჯერ თითო საუკეთესო ფოტო თითოეული როლიდან (პერსონაჟი → პროდუქტი → ტანსაცმელი), შემდეგ — შენი თანმიმდევრობით. საუკეთესო ფოტო დააყენე პირველად.',
  needCharacter: 'მოძრაობისთვის საჭიროა პერსონაჟის ფოტო — მიანიჭე ფოტოს როლი „პერსონაჟი“.',
  refsSkipped: (n) => `${n} ფოტო გამოტოვდა`,
  refsFull: (n, max) => `ლიმიტია ${max} ფოტო — ${n} გამოტოვდა`,
  promptLabel: 'დეტალი (სურვილისამებრ)',
  promptPlaceholder: 'სურვილისამებრ — ეფექტი უკვე ეუბნება მოდელს, რა გააკეთოს',
  soundOn: 'ხმა: ორიგინალი',
  soundOff: 'ხმა: გამორთ.',
  format: 'ფორმატი',
  quality: 'ხარისხი',
  length: 'ხანგრძლივობა',
  lengthFixed: 'ფიქსირებული',
  lengthFromVideo: 'ვიდეოს სიგრძე',
  tier: { fast: 'სწრაფი', standard: 'მაღალი ხარისხი', pro: 'პრო' },
  generate: 'გენერაცია',
  generating: 'მზადდება…',
  labelPickEffect: 'აირჩიე ეფექტი',
  labelAddVideo: 'დაამატე ვიდეო',
  labelAddCharacter: 'დაამატე პერსონაჟის ფოტო',
  labelGettingPrice: 'ფასი ითვლება…',
  priceAfterInputs: 'ფასი გამოჩნდება, როცა ვიდეოსა და პერსონაჟს დაამატებ.',
  priceChanged: (n) => `ფასი შეიცვალა — ახლა ${n} კრედიტია. დააჭირე ხელახლა.`,
  engines: 'ძრავები და ფასები',
  enginesOpen: 'ღიაა',
  enginesSoon: 'მალე',
  liveQuote: 'ფასი ცოცხლად, ატვირთვის შემდეგ',
  creditsWord: (n) => `${n} კრედიტი`,
  jobWorking: 'VFX სცენა მზადდება — ჩვეულებრივ რამდენიმე წუთი სჭირდება.',
  jobDone: 'მზადაა — ფაილი ბიბლიოთეკაშიც შეინახა.',
  another: 'ახალი VFX',
  stillWorking: 'ჯერ კიდევ მუშაობს. შედეგი ბიბლიოთეკაში გამოჩნდება.',
  fileSkipped: {
    type: (n) => `${n}: მხოლოდ JPG, PNG ან WebP`,
    size: (n) => `${n}: ფაილი ძალიან დიდია`,
    small: (n) => `${n}: ძალიან პატარაა (მინ. 300 px)`,
    unreadable: (n) => `${n}: ვერ წაიკითხა`,
  },
  video: {
    type: 'მხოლოდ MP4 ან MOV ფორმატი.',
    size: 'ფაილი ძალიან დიდია — მაქსიმუმ 50 MB.',
    unreadable: 'ვიდეოს წაკითხვა ვერ მოხერხდა. სცადე სხვა MP4 ან MOV.',
    short: (n) => `ვიდეო ${n} წმ-ია — საჭიროა 3-დან 30 წმ-მდე.`,
    long: (n) => `ვიდეო ${n} წმ-ია — საჭიროა 3-დან 30 წმ-მდე.`,
  },
  failed: 'გენერაცია ვერ მოხერხდა.',
  uploadFailed: 'ფაილი ვერ აიტვირთა. სცადე ხელახლა.',
  issue: {
    video_duration: 'ვიდეოს სიგრძე 3-დან 30 წამამდე უნდა იყოს.',
    video_size: 'ვიდეო ძალიან დიდია — მაქსიმუმ 50 MB.',
    video_unreadable: 'ვიდეოს სიგრძე ვერ წავიკითხეთ. გამოიყენე სტანდარტული MP4 ან MOV.',
    video_missing: 'ვიდეო ვერ ვიპოვეთ. ატვირთე ხელახლა.',
    not_owner: 'ფაილი შენს ატვირთვებს არ ეკუთვნის.',
    reference_unavailable: 'ფოტო მიუწვდომელია. ატვირთე ხელახლა.',
    character_required: 'საჭიროა პერსონაჟის ფოტო.',
    reference_required: 'დაამატე მინიმუმ ერთი ფოტო.',
    too_many_references: 'ფოტოების ლიმიტია 40.',
    preset_or_prompt: 'აირჩიე ეფექტი.',
  },
};

const EN: Copy = {
  heroEyebrow: 'VFX effect',
  heroEmptyTitle: 'Pick an effect',
  heroEmptyHint: 'One tap — no prompt to write',
  change: 'Change',
  effects: 'Effects',
  pickEffect: 'Choose an effect',
  all: 'All',
  mode: { scene: 'Scene', motion: 'Motion', swap: 'Swap' },
  modeHint: {
    scene: 'A new 8-second VFX scene from your photos and the effect you pick.',
    motion: 'The motion of your video moves your character into a new VFX scene.',
    swap: 'Swap an object, place or style — the rest of the video stays.',
  },
  locked: 'Soon — this mode is not open yet.',
  lockedWhy: {
    motion: 'Motion transfer needs a video engine we are still connecting. It will unlock here; until then the button is off and nothing is charged.',
    swap: 'The swap engine is not connected yet. It will unlock here; until then the button is off and nothing is charged.',
  },
  checking: 'Checking…',
  videoTitle: 'Add a source video',
  videoHint: '3–30 s · MP4 or MOV · up to 50 MB',
  videoUploading: 'Uploading the video…',
  videoRemove: 'Remove the video',
  videoSeconds: (n) => `${n} s`,
  refsTitle: 'Add reference photos',
  refsHint: 'Character, product, wardrobe · up to 40',
  refsCount: (n, max) => `${n} / ${max}`,
  refsClear: 'Remove all',
  role: { character: 'Character', product: 'Product', wardrobe: 'Wardrobe' },
  roleLabel: 'Photo role',
  earlier: 'Move earlier',
  later: 'Move later',
  remove: 'Remove photo',
  inUse: 'In use',
  notUsed: 'Not used',
  using: (used, total, cap, engine) => `Using ${used} of ${total} — ${engine} takes up to ${cap}`,
  usingNone: (cap, engine) => `${engine} takes up to ${cap} photos`,
  ruleTitle: 'How are photos chosen?',
  rule: 'One best photo per role first (character → product → wardrobe), then your own order. Put your best photo first.',
  needCharacter: 'Motion needs a character photo — set a photo’s role to “Character”.',
  refsSkipped: (n) => `${n} photo${n === 1 ? '' : 's'} skipped`,
  refsFull: (n, max) => `Limit is ${max} photos — ${n} skipped`,
  promptLabel: 'Detail (optional)',
  promptPlaceholder: 'Optional — the effect already tells the model what to do',
  soundOn: 'Sound: original',
  soundOff: 'Sound: off',
  format: 'Format',
  quality: 'Quality',
  length: 'Length',
  lengthFixed: 'fixed',
  lengthFromVideo: 'your video',
  tier: { fast: 'Fast', standard: 'High quality', pro: 'Pro' },
  generate: 'Generate',
  generating: 'Working…',
  labelPickEffect: 'Pick an effect',
  labelAddVideo: 'Add a video',
  labelAddCharacter: 'Add a character photo',
  labelGettingPrice: 'Getting the price…',
  priceAfterInputs: 'The price appears once your video and character are added.',
  priceChanged: (n) => `The price changed — it is now ${n} credits. Tap again.`,
  engines: 'Engines & prices',
  enginesOpen: 'Open',
  enginesSoon: 'Soon',
  liveQuote: 'Live price after upload',
  creditsWord: (n) => `${n} ${n === 1 ? 'credit' : 'credits'}`,
  jobWorking: 'Your VFX scene is rendering — it usually takes a few minutes.',
  jobDone: 'Done — it is also saved in your Library.',
  another: 'Make another',
  stillWorking: 'Still working. The result will appear in your Library.',
  fileSkipped: {
    type: (n) => `${n}: only JPG, PNG or WebP`,
    size: (n) => `${n}: the file is too large`,
    small: (n) => `${n}: too small (min 300 px)`,
    unreadable: (n) => `${n}: could not be read`,
  },
  video: {
    type: 'Only MP4 or MOV.',
    size: 'That file is too large — 50 MB at most.',
    unreadable: 'The video could not be read. Try another MP4 or MOV.',
    short: (n) => `That video is ${n} s — use 3 to 30 s.`,
    long: (n) => `That video is ${n} s — use 3 to 30 s.`,
  },
  failed: 'The generation did not work.',
  uploadFailed: 'The file could not be uploaded. Try again.',
  issue: {
    video_duration: 'The video must be 3 to 30 seconds long.',
    video_size: 'The video is too large — 50 MB at most.',
    video_unreadable: 'We could not read the video’s length. Use a standard MP4 or MOV.',
    video_missing: 'We could not find the video. Upload it again.',
    not_owner: 'That file is not one of your uploads.',
    reference_unavailable: 'A photo is unavailable. Upload it again.',
    character_required: 'A character photo is required.',
    reference_required: 'Add at least one photo.',
    too_many_references: 'The photo limit is 40.',
    preset_or_prompt: 'Pick an effect.',
  },
};

const RU: Copy = {
  heroEyebrow: 'VFX-эффект',
  heroEmptyTitle: 'Выберите эффект',
  heroEmptyHint: 'Одно касание — писать промпт не нужно',
  change: 'Сменить',
  effects: 'Эффекты',
  pickEffect: 'Выбор эффекта',
  all: 'Все',
  mode: { scene: 'Сцена', motion: 'Движение', swap: 'Замена' },
  modeHint: {
    scene: 'Новая 8-секундная VFX-сцена из ваших фото и выбранного эффекта.',
    motion: 'Движение из вашего видео переносится на персонажа — в новую VFX-сцену.',
    swap: 'Замените объект, место или стиль — остальное видео остаётся прежним.',
  },
  locked: 'Скоро — этот режим ещё не открыт.',
  lockedWhy: {
    motion: 'Для переноса движения нужен видеодвижок, который мы ещё подключаем. Он откроется здесь; пока кнопка выключена и ничего не списывается.',
    swap: 'Движок замены ещё не подключён. Он откроется здесь; пока кнопка выключена и ничего не списывается.',
  },
  checking: 'Проверяем…',
  videoTitle: 'Добавьте исходное видео',
  videoHint: '3–30 с · MP4 или MOV · до 50 МБ',
  videoUploading: 'Видео загружается…',
  videoRemove: 'Убрать видео',
  videoSeconds: (n) => `${n} с`,
  refsTitle: 'Добавьте референс-фото',
  refsHint: 'Персонаж, продукт, одежда · до 40',
  refsCount: (n, max) => `${n} / ${max}`,
  refsClear: 'Удалить все',
  role: { character: 'Персонаж', product: 'Продукт', wardrobe: 'Одежда' },
  roleLabel: 'Роль фото',
  earlier: 'Сдвинуть раньше',
  later: 'Сдвинуть позже',
  remove: 'Удалить фото',
  inUse: 'Используется',
  notUsed: 'Не используется',
  using: (used, total, cap, engine) => `Используется ${used} из ${total} — ${engine} принимает до ${cap}`,
  usingNone: (cap, engine) => `${engine} принимает до ${cap} фото`,
  ruleTitle: 'Как выбираются фото?',
  rule: 'Сначала по одному лучшему фото каждой роли (персонаж → продукт → одежда), затем — в вашем порядке. Лучшее фото ставьте первым.',
  needCharacter: 'Для движения нужно фото персонажа — задайте фото роль «Персонаж».',
  refsSkipped: (n) => `Пропущено фото: ${n}`,
  refsFull: (n, max) => `Лимит — ${max} фото, пропущено: ${n}`,
  promptLabel: 'Деталь (необязательно)',
  promptPlaceholder: 'Необязательно — эффект уже подсказывает модели, что делать',
  soundOn: 'Звук: оригинал',
  soundOff: 'Звук: выкл.',
  format: 'Формат',
  quality: 'Качество',
  length: 'Длительность',
  lengthFixed: 'фиксированная',
  lengthFromVideo: 'как у видео',
  tier: { fast: 'Быстро', standard: 'Высокое качество', pro: 'Про' },
  generate: 'Создать',
  generating: 'Готовится…',
  labelPickEffect: 'Выберите эффект',
  labelAddVideo: 'Добавьте видео',
  labelAddCharacter: 'Добавьте фото персонажа',
  labelGettingPrice: 'Считаем цену…',
  priceAfterInputs: 'Цена появится, когда вы добавите видео и персонажа.',
  priceChanged: (n) => `Цена изменилась — теперь ${n} кредитов. Нажмите ещё раз.`,
  engines: 'Движки и цены',
  enginesOpen: 'Открыт',
  enginesSoon: 'Скоро',
  liveQuote: 'Цена в реальном времени после загрузки',
  creditsWord: (n) => {
    const m10 = n % 10;
    const m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? 'кредит' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'кредита' : 'кредитов';
    return `${n} ${w}`;
  },
  jobWorking: 'VFX-сцена готовится — обычно это занимает несколько минут.',
  jobDone: 'Готово — файл сохранён и в вашей библиотеке.',
  another: 'Ещё одну',
  stillWorking: 'Всё ещё работает. Результат появится в библиотеке.',
  fileSkipped: {
    type: (n) => `${n}: только JPG, PNG или WebP`,
    size: (n) => `${n}: файл слишком большой`,
    small: (n) => `${n}: слишком мелкое (мин. 300 px)`,
    unreadable: (n) => `${n}: не удалось прочитать`,
  },
  video: {
    type: 'Только MP4 или MOV.',
    size: 'Файл слишком большой — не более 50 МБ.',
    unreadable: 'Не удалось прочитать видео. Попробуйте другой MP4 или MOV.',
    short: (n) => `Видео длится ${n} с — нужно от 3 до 30 с.`,
    long: (n) => `Видео длится ${n} с — нужно от 3 до 30 с.`,
  },
  failed: 'Не удалось создать.',
  uploadFailed: 'Файл не загрузился. Попробуйте ещё раз.',
  issue: {
    video_duration: 'Видео должно длиться от 3 до 30 секунд.',
    video_size: 'Видео слишком большое — не более 50 МБ.',
    video_unreadable: 'Не удалось определить длину видео. Используйте стандартный MP4 или MOV.',
    video_missing: 'Видео не найдено. Загрузите его снова.',
    not_owner: 'Этот файл не из ваших загрузок.',
    reference_unavailable: 'Фото недоступно. Загрузите его снова.',
    character_required: 'Нужно фото персонажа.',
    reference_required: 'Добавьте хотя бы одно фото.',
    too_many_references: 'Лимит — 40 фото.',
    preset_or_prompt: 'Выберите эффект.',
  },
};

const TABLE: L<Copy> = { ka: KA, en: EN, ru: RU };

export const copyFor = (locale: string | null | undefined): Copy => TABLE[toLang(locale)];

/** One plain sentence for a server validation issue; falls back to the generic failure line, never to a raw code. */
export function issueText(issues: readonly { code: string }[] | undefined, locale: string | null | undefined): string {
  const c = copyFor(locale);
  for (const i of issues ?? []) {
    const t = c.issue[i.code as keyof Copy['issue']];
    if (t) return t;
  }
  return c.failed;
}
