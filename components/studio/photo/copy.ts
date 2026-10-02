/** The culling workspace's words, in the studio's three languages. The tool's name and its privacy line are not
 *  here — they are lib/studio/tools.ts's, so the sidebar and the workspace can never say different things. */
import type { CullFlag } from '@/lib/photo/cullMetrics';
import { toolLang, type ToolLang } from '@/lib/studio/tools';
import type { CullFilter } from './session';

/** The studio's own locale rule (ka unless en / ru) — the same one the tool's name and privacy line are read with. */
export type PhotoLang = ToolLang;
export const photoLang = toolLang;

export interface PhotoCopy {
  back: string; add: string; choose: string; dropTitle: string; dropHint: string; dropOverlay: string;
  filter: string; filters: Record<CullFilter, string>;
  pick: string; reject: string; unrate: string; picked: string; rejected: string; unrated: string;
  flags: Record<CullFlag, string>;
  best: string; burst: (n: number) => string; analysing: (done: number, total: number) => string; unreadable: string;
  photos: (n: number) => string; empty: string; keys: string; clear: string; clearConfirm: string;
  grade: string; auto: string; reset: string; applyToPicks: string; original: string;
  saturation: string; contrast: string; brightness: string; temperature: string; looks: string;
  exportPicks: string; exporting: (done: number, total: number) => string; saved: (n: number) => string;
  zipFailed: string; ungraded: (n: number) => string; downscaled: (n: number) => string; exportFailed: string;
  regradeNote: string; noPicks: string;
  skippedType: (n: number) => string; skippedSize: (n: number) => string; skippedLimit: (max: number) => string; duplicates: (n: number) => string;
  preview: string; noSelection: string;
  /** Screen-reader news (a live region): the whole shoot has been analysed. */
  analysisDone: (n: number) => string;
  /** A filter that matches nothing, and its way out. */
  emptyFilter: string; showAll: string;
}

export const PHOTO_COPY: Record<PhotoLang, PhotoCopy> = {
  ka: {
    back: 'ჩატში დაბრუნება', add: 'ფოტოების დამატება', choose: 'აირჩიე ფოტოები',
    dropTitle: 'ჩააგდე JPEG, PNG ან WebP ფოტოები', dropHint: 'ანალიზი შენს მოწყობილობაზე ხდება — არაფერი იტვირთება', dropOverlay: 'ჩააგდე დასამატებლად',
    filter: 'ფილტრი', filters: { all: 'ყველა', picks: 'რჩეული', rejects: 'უარყოფილი', unrated: 'შეუფასებელი', flagged: 'შესამოწმებელი' },
    pick: 'რჩეული', reject: 'უარყოფა', unrate: 'შეფასების მოხსნა', picked: 'რჩეული', rejected: 'უარყოფილი', unrated: 'შეუფასებელი',
    flags: { blurry: 'ბუნდოვანი', 'burst-softer': 'სერიაში ნაკლებად მკვეთრი', highlights: 'გადამწვარი ნათელი', underexposed: 'ბნელი' },
    best: 'სერიაში ყველაზე მკვეთრი', burst: (n) => `სერია · ${n}`, analysing: (d, t) => `ანალიზი… ${d}/${t}`, unreadable: 'ფოტო ვერ წავიკითხე',
    photos: (n) => `${n} ფოტო`, empty: 'აქ ჯერ არაფერია', keys: 'P რჩეული · X უარყოფა · U მოხსნა · ← → გადაადგილება',
    clear: 'გასუფთავება', clearConfirm: 'წავშალო ყველა ფოტო ამ სესიიდან? შენი ფაილები ადგილზე რჩება.',
    grade: 'ფერის კორექცია', auto: 'ავტო', reset: 'საწყისი', applyToPicks: 'ყველა რჩეულზე', original: 'ორიგინალი',
    saturation: 'გაჯერება', contrast: 'კონტრასტი', brightness: 'სიკაშკაშე', temperature: 'ტემპერატურა', looks: 'სტილები',
    exportPicks: 'რჩეულის ექსპორტი', exporting: (d, t) => `ექსპორტი… ${d}/${t}`, saved: (n) => `შენახულია ${n} ფოტო`,
    zipFailed: 'ZIP ვერ შეიქმნა — ფოტოები სათითაოდ შეინახა', ungraded: (n) => `${n} ფოტო კორექციის გარეშე შეინახა`,
    downscaled: (n) => `${n} ფოტო შემცირდა ბრაუზერის ლიმიტამდე`, exportFailed: 'ექსპორტი ვერ მოხერხდა',
    regradeNote: 'კორექციის მქონე ასლები ხელახლა შეინახება, EXIF-ის გარეშე', noPicks: 'ჯერ მონიშნე რჩეული (P)',
    skippedType: (n) => `${n} ფაილი გამოტოვდა — მხოლოდ JPEG, PNG და WebP`, skippedSize: (n) => `${n} ფაილი ძალიან დიდია`,
    skippedLimit: (m) => `ერთ სესიაში მაქსიმუმ ${m} ფოტოა`, duplicates: (n) => `${n} უკვე დამატებულია`,
    preview: 'გადახედვა', noSelection: 'აირჩიე ფოტო',
    analysisDone: (n) => `ანალიზი დასრულდა — ${n} ფოტო`,
    emptyFilter: 'ამ ფილტრში ფოტო არ არის', showAll: 'ყველას ჩვენება',
  },
  en: {
    back: 'Back to chat', add: 'Add photos', choose: 'Choose photos',
    dropTitle: 'Drop JPEG, PNG or WebP photos', dropHint: 'Analysed on your device — nothing is uploaded', dropOverlay: 'Drop to add',
    filter: 'Filter', filters: { all: 'All', picks: 'Picks', rejects: 'Rejects', unrated: 'Unrated', flagged: 'To check' },
    pick: 'Pick', reject: 'Reject', unrate: 'Unrate', picked: 'Picked', rejected: 'Rejected', unrated: 'Unrated',
    flags: { blurry: 'Blurry', 'burst-softer': 'Softer than its burst', highlights: 'Blown highlights', underexposed: 'Underexposed' },
    best: 'Sharpest in burst', burst: (n) => `Burst · ${n}`, analysing: (d, t) => `Analysing… ${d}/${t}`, unreadable: 'Couldn’t read this photo',
    photos: (n) => `${n} ${n === 1 ? 'photo' : 'photos'}`, empty: 'Nothing here yet', keys: 'P pick · X reject · U unrate · ← → move',
    clear: 'Clear', clearConfirm: 'Remove every photo from this session? Your files stay where they are.',
    grade: 'Grade', auto: 'Auto', reset: 'Reset', applyToPicks: 'Apply to all picks', original: 'Original',
    saturation: 'Saturation', contrast: 'Contrast', brightness: 'Brightness', temperature: 'Temperature', looks: 'Looks',
    exportPicks: 'Export picks', exporting: (d, t) => `Exporting… ${d}/${t}`, saved: (n) => `Saved ${n} ${n === 1 ? 'photo' : 'photos'}`,
    zipFailed: 'The ZIP couldn’t be built — the photos were saved one by one', ungraded: (n) => `${n} saved without the grade`,
    downscaled: (n) => `${n} scaled down to the browser’s limit`, exportFailed: 'The export failed',
    regradeNote: 'Graded copies are re-encoded without EXIF', noPicks: 'Mark some picks first (P)',
    skippedType: (n) => `${n} skipped — JPEG, PNG and WebP only`, skippedSize: (n) => `${n} too large`,
    skippedLimit: (m) => `A session holds up to ${m} photos`, duplicates: (n) => `${n} already added`,
    preview: 'Preview', noSelection: 'Choose a photo',
    analysisDone: (n) => `Analysis done — ${n} ${n === 1 ? 'photo' : 'photos'}`,
    emptyFilter: 'No photos in this filter', showAll: 'Show all',
  },
  ru: {
    back: 'Назад в чат', add: 'Добавить фото', choose: 'Выбрать фото',
    dropTitle: 'Перетащите фото JPEG, PNG или WebP', dropHint: 'Анализ на вашем устройстве — ничего не загружается', dropOverlay: 'Отпустите, чтобы добавить',
    filter: 'Фильтр', filters: { all: 'Все', picks: 'Отобранные', rejects: 'Отклонённые', unrated: 'Без оценки', flagged: 'Проверить' },
    pick: 'Отобрать', reject: 'Отклонить', unrate: 'Снять оценку', picked: 'Отобрано', rejected: 'Отклонено', unrated: 'Без оценки',
    flags: { blurry: 'Размыто', 'burst-softer': 'Мягче лучшего в серии', highlights: 'Пересветы', underexposed: 'Недоэкспонировано' },
    best: 'Самый резкий в серии', burst: (n) => `Серия · ${n}`, analysing: (d, t) => `Анализ… ${d}/${t}`, unreadable: 'Не удалось прочитать фото',
    photos: (n) => `${n} фото`, empty: 'Здесь пока пусто', keys: 'P отобрать · X отклонить · U снять · ← → перейти',
    clear: 'Очистить', clearConfirm: 'Убрать все фото из этой сессии? Ваши файлы останутся на месте.',
    grade: 'Цветокоррекция', auto: 'Авто', reset: 'Сброс', applyToPicks: 'Ко всем отобранным', original: 'Оригинал',
    saturation: 'Насыщенность', contrast: 'Контраст', brightness: 'Яркость', temperature: 'Температура', looks: 'Стили',
    exportPicks: 'Экспорт отобранных', exporting: (d, t) => `Экспорт… ${d}/${t}`, saved: (n) => `Сохранено фото: ${n}`,
    zipFailed: 'ZIP не собрался — фото сохранены по одному', ungraded: (n) => `Без коррекции сохранено: ${n}`,
    downscaled: (n) => `Уменьшено до лимита браузера: ${n}`, exportFailed: 'Экспорт не удался',
    regradeNote: 'Копии с коррекцией перекодируются без EXIF', noPicks: 'Сначала отметьте фото (P)',
    skippedType: (n) => `Пропущено: ${n} — только JPEG, PNG и WebP`, skippedSize: (n) => `Слишком большие: ${n}`,
    skippedLimit: (m) => `В одной сессии до ${m} фото`, duplicates: (n) => `Уже добавлены: ${n}`,
    preview: 'Просмотр', noSelection: 'Выберите фото',
    analysisDone: (n) => `Анализ завершён — ${n} фото`,
    emptyFilter: 'В этом фильтре нет фото', showAll: 'Показать все',
  },
};
