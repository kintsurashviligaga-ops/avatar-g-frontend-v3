/**
 * Every user-visible string of the Image tool's Create screen, in ka / en / ru. One record per language with the SAME
 * keys (components/studio/create/imageCreate.test.tsx pins that, and that no Georgian or Russian line is the English one):
 * Georgian runs 1.5–2× longer than English, so no line here is sized for the short language — rows wrap instead.
 */
import { imageLang } from '@/lib/studio/imageCreate';

export interface ImageCreateCopy {
  // — header / frame
  title: string;
  changeTool: string;
  close: string;
  // — reference picture
  uploadTitle: string;
  uploadLimit: (max: number) => string;
  uploadFilled: string;
  uploadReplace: string;
  uploadRemove: string;
  uploadExtra: string;
  foreignFiles: string;
  foreignFilesAction: string;
  // — prompt
  promptLabel: string;
  promptPlaceholder: string;
  needPrompt: string;
  enhance: string;
  micStart: string;
  micStop: string;
  micWait: string;
  // — model
  model: string;
  modelTitle: string;
  // — disclosures
  templates: string;
  templatesPick: string;
  advanced: string;
  advancedNone: string;
  style: string;
  negative: string;
  negativePlaceholder: string;
  // — option chips and their pickers
  aspect: string;
  quality: string;
  /** Under a size the picked model does not render (Nano Banana Pro has no 1K). */
  qualityNotOnModel: (model: string) => string;
  count: string;
  countTitle: string;
  countOption: (n: number) => string;
  perImage: (credits: number) => string;
  pickerClose: string;
  // — the button
  generate: string;
  // — desktop result pane
  result: string;
  resultEmpty: string;
  resultEmptyHint: string;
  earlier: string;
  earlierOpen: string;
  modelsPrices: string;
  colModel: string;
  colPrice: string;
  creditsPerImage: (credits: number) => string;
  priceNote: string;
  conversation: string;
  actDownload: string;
  actShare: string;
  actUpscale: string;
  actReroll: string;
  actEdit: string;
  actToVideo: string;
  actOpen: string;
  actCancel: string;
  actRetry: string;
  topUp: string;
  workingOn: string;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export const IMAGE_CREATE_COPY: Record<'ka' | 'en' | 'ru', ImageCreateCopy> = {
  ka: {
    title: 'სურათი',
    changeTool: 'ხელსაწყოს შეცვლა',
    close: 'დახურვა',
    uploadTitle: 'აირჩიე სურათი ასატვირთად',
    uploadLimit: (max) => `(მაქს. ${max})`,
    uploadFilled: 'გამოიყენება საწყის სურათად — ტექსტში აღწერე, რა შეიცვალოს.',
    uploadReplace: 'შეცვლა',
    uploadRemove: 'სურათის წაშლა',
    uploadExtra: 'გამოიყენება მხოლოდ პირველი სურათი.',
    foreignFiles: 'მიმაგრებულია სხვა ფაილებიც — აქ მხოლოდ სურათებია.',
    foreignFilesAction: 'წაშლა',
    promptLabel: 'პრომპტი',
    promptPlaceholder: 'აღწერე შენი იდეა, სცენა ან კონცეფცია',
    needPrompt: 'ჯერ აღწერე, რისი შექმნა გინდა.',
    enhance: 'პრომპტის გაუმჯობესება',
    micStart: 'კარნახი',
    micStop: 'კარნახის შეჩერება',
    micWait: 'ტრანსკრიფცია…',
    model: 'მოდელი',
    modelTitle: 'მოდელი',
    templates: 'შაბლონები',
    templatesPick: 'აირჩიე საწყისი',
    advanced: 'დამატებით',
    advancedNone: 'სტილი, ნეგატიური პრომპტი, სცენარი',
    style: 'სტილი',
    negative: 'ნეგატიური პრომპტი',
    negativePlaceholder: 'რა ავიცილოთ სურათში…',
    aspect: 'პროპორცია',
    quality: 'ხარისხი',
    qualityNotOnModel: (m) => `${m} ამ ზომას არ აკეთებს`,
    count: 'რაოდენობა',
    countTitle: 'რამდენი სურათი',
    countOption: (n) => `${n} სურათი`,
    perImage: (c) => `${c} კრედიტი სურათზე`,
    pickerClose: 'დახურვა',
    generate: 'შექმნა',
    result: 'შედეგი',
    resultEmpty: 'აქ გამოჩნდება შენი სურათი',
    resultEmptyHint: 'აღწერე მარჯვნივ და დააჭირე „შექმნა“-ს.',
    earlier: 'წინა შედეგები',
    earlierOpen: 'გახსნა',
    modelsPrices: 'მოდელები და ფასები',
    colModel: 'მოდელი',
    colPrice: 'ფასი',
    creditsPerImage: (c) => `${c} კრედიტი / სურათი`,
    priceNote: 'ფასი ყველა ზომაზე ერთია. ×2 და ×4 თითო სურათზე ითვლება.',
    conversation: 'საუბარი',
    actDownload: 'ჩამოტვირთვა',
    actShare: 'გაზიარება',
    actUpscale: 'ხარისხის გაზრდა',
    actReroll: 'თავიდან შექმნა',
    actEdit: 'სურათის რედაქტირება',
    actToVideo: 'ვიდეოში გადატანა',
    actOpen: 'გახსნა',
    actCancel: 'გაუქმება',
    actRetry: 'თავიდან ცდა',
    topUp: 'ბალანსის შევსება',
    workingOn: 'მზადდება',
  },
  en: {
    title: 'Image',
    changeTool: 'Change tool',
    close: 'Close',
    uploadTitle: 'Choose an image to upload',
    uploadLimit: (max) => `(max ${max})`,
    uploadFilled: 'Used as the starting picture — your prompt says what to change.',
    uploadReplace: 'Replace',
    uploadRemove: 'Remove image',
    uploadExtra: 'Only the first image is used.',
    foreignFiles: 'Other files are attached — only images work here.',
    foreignFilesAction: 'Remove them',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Describe your concept, scene, or idea',
    needPrompt: 'Describe what you want to create first.',
    enhance: 'Improve the prompt',
    micStart: 'Dictate',
    micStop: 'Stop dictation',
    micWait: 'Transcribing…',
    model: 'Model',
    modelTitle: 'Model',
    templates: 'Templates',
    templatesPick: 'Pick a starting point',
    advanced: 'Advanced',
    advancedNone: 'Style, negative prompt, script',
    style: 'Style',
    negative: 'Negative prompt',
    negativePlaceholder: 'What to avoid in the image…',
    aspect: 'Aspect ratio',
    quality: 'Quality',
    qualityNotOnModel: (m) => `${m} does not render this size`,
    count: 'Count',
    countTitle: 'How many images',
    countOption: (n) => (n === 1 ? '1 image' : `${n} images`),
    perImage: (c) => `${c} ${c === 1 ? 'credit' : 'credits'} per image`,
    pickerClose: 'Close',
    generate: 'Generate',
    result: 'Result',
    resultEmpty: 'Your image will appear here',
    resultEmptyHint: 'Describe it on the right and press Generate.',
    earlier: 'Earlier results',
    earlierOpen: 'Open',
    modelsPrices: 'Models & prices',
    colModel: 'Model',
    colPrice: 'Price',
    creditsPerImage: (c) => `${c} ${c === 1 ? 'credit' : 'credits'} / image`,
    priceNote: 'The price is the same at every size. ×2 and ×4 are billed per image.',
    conversation: 'Conversation',
    actDownload: 'Download',
    actShare: 'Share',
    actUpscale: 'Upscale',
    actReroll: 'Generate again',
    actEdit: 'Edit this image',
    actToVideo: 'Send to video',
    actOpen: 'Open',
    actCancel: 'Cancel',
    actRetry: 'Try again',
    topUp: 'Top up balance',
    workingOn: 'Rendering',
  },
  ru: {
    title: 'Изображение',
    changeTool: 'Сменить инструмент',
    close: 'Закрыть',
    uploadTitle: 'Выберите изображение для загрузки',
    uploadLimit: (max) => `(макс. ${max})`,
    uploadFilled: 'Служит исходной картинкой — в тексте опишите, что изменить.',
    uploadReplace: 'Заменить',
    uploadRemove: 'Убрать изображение',
    uploadExtra: 'Используется только первое изображение.',
    foreignFiles: 'Прикреплены другие файлы — здесь работают только изображения.',
    foreignFilesAction: 'Убрать',
    promptLabel: 'Промпт',
    promptPlaceholder: 'Опишите вашу идею, сцену или концепцию',
    needPrompt: 'Сначала опишите, что создать.',
    enhance: 'Улучшить промпт',
    micStart: 'Диктовка',
    micStop: 'Остановить диктовку',
    micWait: 'Расшифровка…',
    model: 'Модель',
    modelTitle: 'Модель',
    templates: 'Шаблоны',
    templatesPick: 'Выберите основу',
    advanced: 'Дополнительно',
    advancedNone: 'Стиль, негативный промпт, сценарий',
    style: 'Стиль',
    negative: 'Негативный промпт',
    negativePlaceholder: 'Что исключить из изображения…',
    aspect: 'Соотношение',
    quality: 'Качество',
    qualityNotOnModel: (m) => `${m} не делает этот размер`,
    count: 'Количество',
    countTitle: 'Сколько изображений',
    countOption: (n) => `${n} ${plural(n, 'изображение', 'изображения', 'изображений')}`,
    perImage: (c) => `${c} ${plural(c, 'кредит', 'кредита', 'кредитов')} за изображение`,
    pickerClose: 'Закрыть',
    generate: 'Создать',
    result: 'Результат',
    resultEmpty: 'Здесь появится ваше изображение',
    resultEmptyHint: 'Опишите справа и нажмите «Создать».',
    earlier: 'Предыдущие результаты',
    earlierOpen: 'Открыть',
    modelsPrices: 'Модели и цены',
    colModel: 'Модель',
    colPrice: 'Цена',
    creditsPerImage: (c) => `${c} ${plural(c, 'кредит', 'кредита', 'кредитов')} / изобр.`,
    priceNote: 'Цена одинакова для любого размера. ×2 и ×4 считаются за каждое изображение.',
    conversation: 'Беседа',
    actDownload: 'Скачать',
    actShare: 'Поделиться',
    actUpscale: 'Увеличить',
    actReroll: 'Создать заново',
    actEdit: 'Править это изображение',
    actToVideo: 'В видео',
    actOpen: 'Открыть',
    actCancel: 'Отмена',
    actRetry: 'Повторить',
    topUp: 'Пополнить баланс',
    workingOn: 'Готовится',
  },
};

export const imageCreateCopy = (locale: string | null | undefined): ImageCreateCopy => IMAGE_CREATE_COPY[imageLang(locale)];
