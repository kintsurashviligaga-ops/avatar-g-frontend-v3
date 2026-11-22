/** lib/studio3d/labels.ts — the 3D Studio's words in Georgian (first), English and Russian. Client-safe. */
import type { Studio3dStep } from './pipeline';

export type Lang = 'ka' | 'en' | 'ru';
export const lang = (l: string | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

export const STEP_LABEL: Record<Studio3dStep, Record<Lang, string>> = {
  check: { ka: 'მოთხოვნის შემოწმება', en: 'Checking the request', ru: 'Проверка запроса' },
  reference: { ka: 'საწყისი სურათის შექმნა', en: 'Drawing the reference picture', ru: 'Создание эскиза' },
  awaiting_approval: { ka: 'დაადასტურე სურათი', en: 'Approve the picture', ru: 'Подтвердите изображение' },
  queued: { ka: 'რიგშია', en: 'In the queue', ru: 'В очереди' },
  starting: { ka: 'GPU ირთვება', en: 'Starting the GPU', ru: 'Запуск GPU' },
  shape: { ka: 'ფორმის აგება', en: 'Building the shape', ru: 'Построение формы' },
  texture: { ka: 'ტექსტურის დახატვა', en: 'Painting the texture', ru: 'Нанесение текстуры' },
  export: { ka: 'ფაილების მომზადება', en: 'Preparing the files', ru: 'Подготовка файлов' },
  done: { ka: 'მზადაა', en: 'Ready', ru: 'Готово' },
  failed: { ka: 'ვერ შეიქმნა — კრედიტი დაბრუნდა', en: 'Failed — credits refunded', ru: 'Не удалось — кредиты возвращены' },
};

export const UI: Record<string, Record<Lang, string>> = {
  title: { ka: '3D სტუდია', en: '3D Studio', ru: '3D-студия' },
  fromText: { ka: 'ტექსტიდან', en: 'From text', ru: 'Из текста' },
  fromImage: { ka: 'სურათიდან', en: 'From a picture', ru: 'Из изображения' },
  retexture: { ka: 'ხელახლა შეღებვა', en: 'Retexture', ru: 'Перекрасить' },
  high: { ka: 'მაღალი დეტალი', en: 'High detail', ru: 'Высокая детализация' },
  wireframe: { ka: 'ბადე', en: 'Wireframe', ru: 'Сетка' },
  fullscreen: { ka: 'სრული ეკრანი', en: 'Full screen', ru: 'Во весь экран' },
  exitFullscreen: { ka: 'გასვლა', en: 'Exit', ru: 'Выйти' },
  autoRotate: { ka: 'ტრიალი', en: 'Spin', ru: 'Вращение' },
  reset: { ka: 'თავიდან', en: 'Reset view', ru: 'Сбросить вид' },
  light: { ka: 'განათება', en: 'Light', ru: 'Свет' },
  download: { ka: 'გადმოწერა', en: 'Download', ru: 'Скачать' },
  stlHeight: { ka: 'სიმაღლე (მმ)', en: 'Height (mm)', ru: 'Высота (мм)' },
  useInVideo: { ka: 'ვიდეოში გამოყენება', en: 'Use in Video', ru: 'Использовать в видео' },
  addToScene: { ka: 'სცენაზე დამატება', en: 'Add to scene', ru: 'Добавить на сцену' },
  approve: { ka: 'კი, ავაგოთ 3D', en: 'Yes, build the 3D model', ru: 'Да, строим 3D' },
  redraw: { ka: 'სხვა სურათი', en: 'Another picture', ru: 'Другое изображение' },
  tapToRotate: { ka: 'შეეხე და ატრიალე', en: 'Tap to rotate', ru: 'Коснитесь, чтобы вращать' },
  faces: { ka: 'წახნაგი', en: 'faces', ru: 'граней' },
  free: { ka: 'უფასო', en: 'free', ru: 'бесплатно' },
  busy: { ka: 'ერთი მოდელი უკვე იქმნება — დაელოდე მის დასრულებას', en: 'One model is already being built — wait for it to finish', ru: 'Одна модель уже создаётся — дождитесь её' },
  dailyCap: { ka: 'დღევანდელი ლიმიტი ამოიწურა, ხვალ სცადე', en: 'Today’s limit is reached, try tomorrow', ru: 'Дневной лимит исчерпан, попробуйте завтра' },
  blocked: { ka: 'ამ მოთხოვნით 3D მოდელს ვერ შევქმნით', en: 'We can’t make a 3D model of this', ru: 'Мы не можем создать такую 3D-модель' },
  selfie: { ka: 'ეს ფოტოზე მე ვარ', en: 'This photo is of me', ru: 'На этом фото я' },
  confirmSelf: { ka: 'ფოტოზე ადამიანია. თუ ეს შენ ხარ, მონიშნე „ეს ფოტოზე მე ვარ“ და სცადე თავიდან', en: 'There is a person in this photo. If it’s you, tick “This photo is of me” and try again', ru: 'На фото человек. Если это вы, отметьте «На этом фото я» и попробуйте снова' },
  blockedPerson: { ka: 'სხვა რეალური ადამიანის ფოტოდან 3D მოდელს ვერ შევქმნით, მხოლოდ შენი სელფიდან', en: 'We can’t make a 3D model from a photo of another real person, only from your own selfie', ru: 'Мы не делаем 3D-модель по фото другого человека, только по вашему селфи' },
  blockedMinor: { ka: 'ბავშვების ფოტოებიდან 3D მოდელს არ ვქმნით', en: 'We don’t make 3D models from photos of children', ru: 'Мы не делаем 3D-модели по фото детей' },
};

export const t = (key: keyof typeof UI, l: string | undefined) => UI[key]?.[lang(l)] ?? String(key);
export const stepLabel = (s: Studio3dStep, l: string | undefined) => STEP_LABEL[s][lang(l)];
