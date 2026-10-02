/**
 * components/studio/montage/copy.ts — every word the montage editor shows, in ka / en / ru.
 *
 * Words, not emoji (docs/DESIGN.md §6). Russian uses «вы». Georgian leads; the other two translate it.
 */
import type { MontageAspect, MontageGrade, MontageTransition } from '@/lib/services/montage/montagePlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC } from '@/lib/services/montage/montagePlan';

export type Lang = 'ka' | 'en' | 'ru';
export const langOf = (l: string): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

type Tri = Record<Lang, string>;
const T = (ka: string, en: string, ru: string): Tri => ({ ka, en, ru });

const C = {
  title: T('მონტაჟი', 'Montage', 'Монтаж'),
  close: T('დახურვა', 'Close', 'Закрыть'),
  export: T('ექსპორტი', 'Export', 'Экспорт'),
  format: T('ფორმატი', 'Format', 'Формат'),

  // The start screen
  newProject: T('ახალი პროექტი', 'New project', 'Новый проект'),
  startSub: T('აირჩიე სად გამოაქვეყნებ, დაამატე ვიდეო ან ფოტო — დანარჩენს თაიმლაინზე გააკეთებ.', 'Pick where it will be posted, add videos or photos — the rest happens on the timeline.', 'Выберите, где опубликуете, добавьте видео или фото — остальное на таймлайне.'),
  addMedia: T('ვიდეოს ან ფოტოს დამატება', 'Add videos or photos', 'Добавить видео или фото'),
  fromDevice: T('მოწყობილობიდან', 'From this device', 'С устройства'),
  myCreations: T('ჩემი ნამუშევრები', 'My creations', 'Мои работы'),
  myCreationsEmpty: T('აქ გამოჩნდება შენი შექმნილი ვიდეოები და ფოტოები.', 'Videos and photos you make here will show up here.', 'Здесь появятся созданные вами видео и фото.'),
  signInLibrary: T('შედი სისტემაში, რომ ნამუშევრები გამოჩნდეს.', 'Sign in to see your creations.', 'Войдите, чтобы увидеть свои работы.'),
  addN: T('დამატება', 'Add', 'Добавить'),
  added: T('დაემატა', 'Added', 'Добавлено'),
  video: T('ვიდეო', 'Video', 'Видео'),
  photo: T('ფოტო', 'Photo', 'Фото'),

  // Transport
  play: T('დაკვრა', 'Play', 'Воспроизвести'),
  pause: T('პაუზა', 'Pause', 'Пауза'),
  undo: T('გაუქმება', 'Undo', 'Отменить'),
  redo: T('დაბრუნება', 'Redo', 'Повторить'),
  zoomIn: T('გადიდება', 'Zoom in', 'Приблизить'),
  zoomOut: T('დაპატარავება', 'Zoom out', 'Отдалить'),

  // Timeline
  timeline: T('თაიმლაინი', 'Timeline', 'Таймлайн'),
  addClip: T('კლიპის დამატება', 'Add a clip', 'Добавить клип'),
  addAudio: T('მუსიკის დამატება', 'Add music', 'Добавить музыку'),
  addText: T('ტექსტის დამატება', 'Add text', 'Добавить текст'),
  originalOn: T('კლიპების ხმა ჩართულია', 'Clip sound is on', 'Звук клипов включён'),
  originalOff: T('კლიპების ხმა გამორთულია', 'Clip sound is off', 'Звук клипов выключен'),
  clipSound: T('კლიპების ხმა', 'Clip sound', 'Звук клипов'),
  transitionInto: T('გადასვლა', 'Transition', 'Переход'),
  clipN: T('კლიპი', 'Clip', 'Клип'),
  trimStart: T('დასაწყისის ჩამოჭრა', 'Trim the start', 'Обрезать начало'),
  trimEnd: T('ბოლოს ჩამოჭრა', 'Trim the end', 'Обрезать конец'),
  uploading: T('იტვირთება…', 'Uploading…', 'Загрузка…'),
  failed: T('ვერ აიტვირთა', 'Upload failed', 'Не загрузилось'),

  // Root tools
  // Selects the clip under the playhead and shows its tools. „რედაქტირება" did not fit a toolbar slot.
  edit: T('კლიპი', 'Edit', 'Клип'),
  audio: T('მუსიკა', 'Music', 'Музыка'),
  text: T('ტექსტი', 'Text', 'Текст'),
  filters: T('ფილტრები', 'Filters', 'Фильтры'),
  adjust: T('ფერი', 'Adjust', 'Цвет'),

  // Clip tools
  back: T('უკან', 'Back', 'Назад'),
  split: T('გაჭრა', 'Split', 'Разрезать'),
  mute: T('დადუმება', 'Mute', 'Без звука'),
  unmute: T('ხმა', 'Sound', 'Звук'),
  duration: T('ხანგრძლ.', 'Duration', 'Длительн.'),
  duplicate: T('ასლი', 'Duplicate', 'Копия'),
  moveLeft: T('მარცხნივ', 'Move left', 'Влево'),
  moveRight: T('მარჯვნივ', 'Move right', 'Вправо'),
  del: T('წაშლა', 'Delete', 'Удалить'),
  done: T('მზადაა', 'Done', 'Готово'),

  // Panels
  musicTitle: T('მუსიკა', 'Music', 'Музыка'),
  uploadMusic: T('ფაილის ატვირთვა', 'Upload a track', 'Загрузить трек'),
  myMusic: T('ჩემი მუსიკა', 'My music', 'Моя музыка'),
  myMusicEmpty: T('აქ გამოჩნდება მუსიკის სერვისში შექმნილი ტრეკები.', 'Tracks you make with Music show up here.', 'Здесь появятся треки, созданные в «Музыке».'),
  removeMusic: T('მუსიკის მოხსნა', 'Remove music', 'Убрать музыку'),
  keepClipSound: T('კლიპების ორიგინალი ხმა', 'Keep the clips’ own sound', 'Оставить звук клипов'),
  keepClipSoundHint: T('ჩართულია: მუსიკა ხმის ქვეშ ჟღერს. გამორთულია: მხოლოდ მუსიკა.', 'On: the music plays under the clips’ sound. Off: music only.', 'Вкл: музыка звучит под звуком клипов. Выкл: только музыка.'),
  musicShorter: T('ტრეკი მონტაჟზე მოკლეა — ბოლოს ჩუმად დასრულდება.', 'The track is shorter than the edit — the end will be silent.', 'Трек короче монтажа — в конце будет тишина.'),
  textTitle: T('ტექსტი კადრზე', 'Text on the clip', 'Текст на клипе'),
  textPh: T('დაწერე ტექსტი…', 'Type your text…', 'Введите текст…'),
  posBottom: T('სუბტიტრი', 'Subtitle', 'Субтитр'),
  posCenter: T('სათაური', 'Title', 'Заголовок'),
  removeText: T('ტექსტის წაშლა', 'Remove text', 'Удалить текст'),
  textNeedsClip: T('ჯერ დაამატე კლიპი — ტექსტი კლიპზე იწერება.', 'Add a clip first — text goes on a clip.', 'Сначала добавьте клип — текст пишется на клипе.'),
  adjustTitle: T('ფერის რეგულირება', 'Adjust colour', 'Настройка цвета'),
  brightness: T('სიკაშკაშე', 'Brightness', 'Яркость'),
  contrast: T('კონტრასტი', 'Contrast', 'Контраст'),
  saturation: T('გაჯერება', 'Saturation', 'Насыщенность'),
  temperature: T('სითბო', 'Warmth', 'Теплота'),
  reset: T('გადატვირთვა', 'Reset', 'Сбросить'),
  appliesToAll: T('მოქმედებს მთელ ვიდეოზე.', 'Applies to the whole video.', 'Действует на всё видео.'),
  formatTitle: T('ფორმატი', 'Format', 'Формат'),
  formatHint: T('კადრი ავსებს ჩარჩოს — კიდეები შეიძლება მოიჭრას.', 'Clips fill the frame — edges may be cropped.', 'Кадр заполняет рамку — края могут обрезаться.'),
  transitionTitle: T('გადასვლა', 'Transition', 'Переход'),
  applyAll: T('ყველა კლიპზე', 'Apply to all', 'Ко всем'),
  durationTitle: T('ფოტოს ხანგრძლივობა', 'Photo duration', 'Длительность фото'),
  sec: T('წმ', 's', 'с'),

  // Export
  exporting: T('მონტაჟი მზადდება…', 'Rendering your edit…', 'Собираем монтаж…'),
  exportKeep: T('შეგიძლია ეს ფანჯარა დატოვო — შედეგი ჩატშიც გამოჩნდება.', 'You can leave this screen — the result also lands in the chat.', 'Можно уйти с экрана — результат появится и в чате.'),
  ready: T('ვიდეო მზადაა', 'Your video is ready', 'Видео готово'),
  download: T('ჩამოტვირთვა', 'Download', 'Скачать'),
  share: T('გაზიარება', 'Share', 'Поделиться'),
  keepEditing: T('რედაქტირების გაგრძელება', 'Keep editing', 'Продолжить монтаж'),
  toChat: T('ჩატში დაბრუნება', 'Back to the chat', 'Вернуться в чат'),
  linkCopied: T('ბმული დაკოპირდა', 'Link copied', 'Ссылка скопирована'),
  exportFailed: T('ექსპორტი ვერ შესრულდა', 'The export failed', 'Экспорт не удался'),
  retry: T('ხელახლა ცდა', 'Try again', 'Повторить'),
  musicMissing: T('მუსიკა ვერ დაემატა — ვიდეო მის გარეშეა.', 'The music could not be added — the video has none.', 'Музыку добавить не удалось — видео без неё.'),
  free: T('უფასო', 'Free', 'Бесплатно'),

  // Toasts and blockers
  tooMany: T(`მაქსიმუმ ${MAX_SHOTS} კლიპი`, `Up to ${MAX_SHOTS} clips`, `Не больше ${MAX_SHOTS} клипов`),
  firstMinute: T(`ვიდეო ${MAX_SHOT_SEC} წამზე გრძელია — დაემატა პირველი ${MAX_SHOT_SEC} წამი. სხვა ნაწილისთვის ჩამოჭერი.`, `Longer than ${MAX_SHOT_SEC} s — its first ${MAX_SHOT_SEC} s were added. Trim to pick another part.`, `Длиннее ${MAX_SHOT_SEC} с — добавлены первые ${MAX_SHOT_SEC} с. Обрежьте, чтобы выбрать другую часть.`),
  cantSplit: T('აქ ვერ გაიჭრება — ნაწილი ძალიან მოკლე იქნება.', 'Can’t split here — a part would be too short.', 'Здесь не разрезать — часть будет слишком короткой.'),
  notMedia: T('მხოლოდ ვიდეო ან ფოტო', 'Videos or photos only', 'Только видео или фото'),
  notAudio: T('მხოლოდ აუდიო ფაილი', 'Audio files only', 'Только аудиофайлы'),
  needClip: T('ჯერ დაამატე კლიპი', 'Add a clip first', 'Сначала добавьте клип'),
  signInToUpload: T('ატვირთვისთვის შედი სისტემაში, შემდეგ მონიშნე კლიპი და „ხელახლა ცდა“.', 'Sign in to upload, then select the clip and tap Try again.', 'Войдите, чтобы загрузить, затем выберите клип и «Повторить».'),
  waitUploads: T('ფაილები იტვირთება', 'Files are uploading', 'Файлы загружаются'),
  failedFiles: T('ფაილი ვერ აიტვირთა — წაშალე და თავიდან დაამატე', 'file failed to upload — delete it and add it again', 'файл не загрузился — удалите и добавьте снова'),
  musicUploading: T('მუსიკა იტვირთება', 'The music is uploading', 'Музыка загружается'),
  musicFailed: T('მუსიკა ვერ აიტვირთა — მოხსენი ან სხვა აირჩიე', 'The music failed to upload — remove it or pick another', 'Музыка не загрузилась — уберите или выберите другую'),
  tooLongTotal: T(`მონტაჟი ${MAX_TOTAL_SEC} წამზე გრძელია — შეამოკლე`, `The edit is over ${MAX_TOTAL_SEC} s — shorten it`, `Монтаж длиннее ${MAX_TOTAL_SEC} с — сократите`),
  readyToExport: T('მზადაა ექსპორტისთვის', 'Ready to export', 'Готово к экспорту'),
  leaveAsk: T('პროექტი არ შეინახება. დავხურო?', 'This project is not saved. Close it?', 'Проект не сохранится. Закрыть?'),
  leaveYes: T('დახურვა', 'Close', 'Закрыть'),
  stay: T('დარჩენა', 'Stay', 'Остаться'),
  tools: T('ხელსაწყოები', 'Tools', 'Инструменты'),
  clipTools: T('კლიპის ხელსაწყოები', 'Clip tools', 'Инструменты клипа'),
  media: T('მედია', 'Media', 'Медиа'),
} as const;

export type CopyKey = keyof typeof C;
export type Copy = Record<CopyKey, string>;

export function montageCopy(locale: string): Copy {
  const l = langOf(locale);
  const out = {} as Record<CopyKey, string>;
  for (const k of Object.keys(C) as CopyKey[]) out[k] = C[k][l];
  return out;
}

/** Export progress, by the pipeline's own stage names (lib/services/montage/montagePipeline MontageStep). */
export const STAGE_LABEL: Record<string, Tri> = {
  resolve: T('ფაილების მომზადება', 'Preparing files', 'Подготовка файлов'),
  bridge: T('ფოტოების გაცოცხლება', 'Bringing photos to life', 'Оживляем фото'),
  normalize: T('ფორმატში მორგება', 'Fitting the format', 'Подгоняем формат'),
  stitch: T('კლიპების შეერთება', 'Joining the clips', 'Склеиваем клипы'),
  music: T('მუსიკის დადება', 'Laying the music', 'Накладываем музыку'),
};

export const ASPECTS: readonly { id: MontageAspect; where: Tri }[] = [
  { id: '9:16', where: T('Reels · TikTok · Shorts', 'Reels · TikTok · Shorts', 'Reels · TikTok · Shorts') },
  { id: '16:9', where: T('YouTube · ეკრანი', 'YouTube · widescreen', 'YouTube · экран') },
  { id: '1:1', where: T('Instagram პოსტი', 'Instagram post', 'Пост Instagram') },
];

export const TRANSITIONS: readonly { id: MontageTransition; label: Tri }[] = [
  { id: 'cut', label: T('არცერთი', 'None', 'Нет') },
  { id: 'crossfade', label: T('გადადნობა', 'Dissolve', 'Растворение') },
  { id: 'fade', label: T('შავში', 'Fade to black', 'Через чёрный') },
];

/**
 * One-tap looks. Each is a preset of the SAME four grade values the Adjust sliders drive — so a look costs
 * no new server work and stays fully adjustable afterwards (pick a look, then fine-tune it in Adjust).
 */
export const FILTERS: readonly { id: string; label: Tri; grade: MontageGrade }[] = [
  { id: 'original', label: T('ორიგინალი', 'Original', 'Оригинал'), grade: { saturation: 100, contrast: 100, brightness: 100, temperature: 0 } },
  { id: 'vivid', label: T('ცოცხალი', 'Vivid', 'Яркий'), grade: { saturation: 145, contrast: 115, brightness: 104, temperature: 6 } },
  { id: 'warm', label: T('თბილი', 'Warm', 'Тёплый'), grade: { saturation: 115, contrast: 105, brightness: 104, temperature: 50 } },
  { id: 'cool', label: T('გრილი', 'Cool', 'Холодный'), grade: { saturation: 105, contrast: 108, brightness: 100, temperature: -50 } },
  { id: 'cinema', label: T('კინო', 'Cinema', 'Кино'), grade: { saturation: 88, contrast: 130, brightness: 95, temperature: -12 } },
  { id: 'fade', label: T('რბილი', 'Soft', 'Мягкий'), grade: { saturation: 80, contrast: 85, brightness: 108, temperature: 8 } },
  { id: 'mono', label: T('შავ-თეთრი', 'Mono', 'Ч/б'), grade: { saturation: 0, contrast: 118, brightness: 102, temperature: 0 } },
  { id: 'noir', label: T('ნუარი', 'Noir', 'Нуар'), grade: { saturation: 0, contrast: 150, brightness: 90, temperature: 0 } },
];

export function aspectRatio(a: MontageAspect): number {
  return a === '9:16' ? 9 / 16 : a === '1:1' ? 1 : 16 / 9;
}

/**
 * The preview's CSS for a grade. It approximates ffmpeg's `eq` + `colortemperature` closely enough to judge a
 * look by eye; the export applies the real filters (lib/video/surgicalOps buildGradeFilters).
 */
export function gradeCss(g: MontageGrade): string | undefined {
  if (g.saturation === 100 && g.contrast === 100 && g.brightness === 100 && g.temperature === 0) return undefined;
  const warm = g.temperature / 100;
  const sepia = warm > 0 ? warm * 0.35 : 0;
  const hue = warm < 0 ? warm * 18 : 0;
  return `saturate(${g.saturation}%) contrast(${g.contrast}%) brightness(${g.brightness}%) sepia(${sepia.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
}
