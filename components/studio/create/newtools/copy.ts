/**
 * ka / en / ru copy for the Interior designer and the Photographer — their panels (components/studio/create/*CreatePanel),
 * their result pane and the secondary actions. One module so a string is written once and a test can walk every
 * language. Georgian runs 1.5–2× longer than English: every line below sits in a row that wraps.
 *
 * ⚠️ HONEST COPY. Nothing here promises more than the pipeline does: „3D plan" is the room's LAYOUT as a 3D model (walls,
 * windows, doors, tinted by the style — not the photoreal redesign), „Walkthrough" opens the Video studio with the picture
 * and one 8 s clip (that studio runs and charges it), and a photo is kept „as photographed" only where the prompt says so.
 */

export type Lang = 'ka' | 'en' | 'ru';
export const shootLang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

export interface PanelCopy {
  /** The upload card's title and the limit shown beside it. */
  uploadTitle: string;
  uploadLimit: string;
  /** One quiet line under the upload card. */
  uploadNote: string;
  prompt: string;
  /** The template carousel's label and what it says before a card is picked. */
  carousel: string;
  carouselNone: string;
  /** The line under Generate while nothing is chosen. */
  needSomething: string;
}

export interface ShootCopy {
  generate: string;
  loading: string;
  close: string;
  switchTool: string;
  addPhoto: string;
  takePhoto: string;
  removePhoto: string;
  photoN: (n: number) => string;
  badFile: string;
  tooMany: string;
  modelLabel: string;
  modelValue: string;
  aspect: string;
  quality: string;
  count: string;
  auto: string;
  roomType: string;
  lens: string;
  light: string;
  angle: string;
  dof: string;
  /** „Preset" — the camera chip that leaves the preset's own look. */
  fromPreset: string;
  /** „2 photos × 3 = 6 images" under the chips, so the price is never a surprise. */
  tilesLine: (photos: number, count: number, tiles: number) => string;
  interior: PanelCopy;
  photoshoot: PanelCopy;
  // ─── The result pane ───────────────────────────────────────────────────────────────────────────────────────────
  results: string;
  clear: string;
  settings: string;
  another: string;
  anotherTip: string;
  plan3d: string;
  plan3dTip: string;
  plan3dNeedsPhoto: string;
  plan3dCaption: string;
  plan3dBusy: string;
  plan3dFailed: string;
  walkthrough: string;
  walkthroughTip: string;
  walkthroughPrompt: string;
  stopped: string;
  failed: string;
  photoUnreadable: string;
  signIn: string;
  runCaption: (label: string, tiles: number) => string;
  fromPhotos: (n: number) => string;
  emptyTitle: { interior: string; photoshoot: string };
  emptyBody: { interior: string; photoshoot: string };
  steps: { interior: [string, string, string]; photoshoot: [string, string, string] };
  modelsTitle: string;
  modelCol: string;
  priceCol: string;
  perImage: string;
  models: {
    interior: { name: string; note: string }[];
    photoshoot: { name: string; note: string }[];
  };
  qualityNote: string;
  walkthroughNote: string;
}

const photoN = {
  ka: (n: number) => `ფოტო ${n}`,
  en: (n: number) => `Photo ${n}`,
  ru: (n: number) => `Фото ${n}`,
};

export const SHOOT_COPY: Record<Lang, ShootCopy> = {
  ka: {
    generate: 'შექმნა',
    loading: 'იქმნება…',
    close: 'დახურვა',
    switchTool: 'ხელსაწყოს არჩევა',
    addPhoto: 'ფოტოს დამატება',
    takePhoto: 'კამერა',
    removePhoto: 'ფოტოს წაშლა',
    photoN: photoN.ka,
    badFile: 'გამოიყენე JPG, PNG ან WebP ფოტო, მაქსიმუმ 12 მბ.',
    tooMany: 'მაქსიმუმ 3 ფოტო.',
    modelLabel: 'მოდელი',
    modelValue: 'ავტო',
    aspect: 'პროპორცია',
    quality: 'ხარისხი',
    count: 'რაოდენობა',
    auto: 'ავტო',
    roomType: 'ოთახის ტიპი',
    lens: 'ობიექტივი',
    light: 'განათება',
    angle: 'რაკურსი',
    dof: 'ველის სიღრმე',
    fromPreset: 'პრესეტის',
    tilesLine: (p, c, t) => (p > 1 ? `${p} ფოტო × ${c} = ${t} სურათი` : `${t} სურათი`),
    interior: {
      uploadTitle: 'აირჩიე ოთახის ფოტოები',
      uploadLimit: '(მაქს. 3)',
      uploadNote: 'ფოტო არ გაქვს? გამოტოვე — დიზაინერი ოთახს ტიპისა და სტილის მიხედვით წარმოიდგენს. ფანჯრები და პროპორციები ფოტოდან რჩება.',
      prompt: 'აღწერე სასურველი ოთახი — ფერები, ავეჯი, განწყობა (არასავალდებულო)',
      carousel: 'სტილი',
      carouselNone: 'აირჩიე სტილი — ოთახი სწორედ ამ სტილში გადაიხედება.',
      needSomething: 'დაამატე ფოტო, აირჩიე სტილი ან აღწერე ოთახი.',
    },
    photoshoot: {
      uploadTitle: 'დაამატე შენი პროდუქტის ან ადამიანის ფოტო',
      uploadLimit: '(არჩევითი, მაქს. 3)',
      uploadNote: 'თითოეული ფოტო ცალკე გადაიღება და თავის იერს ინარჩუნებს. ფოტო არ გაქვს? აღწერე კადრი ქვემოთ.',
      prompt: 'აღწერე კადრი — სცენა, განწყობა, რეკვიზიტი (არასავალდებულო)',
      carousel: 'ფოტოსესიის პრესეტი',
      carouselNone: 'აირჩიე პრესეტი — ან დატოვე და გამოიყენე კამერის პარამეტრები.',
      needSomething: 'დაამატე ფოტო, აირჩიე პრესეტი ან აღწერე კადრი.',
    },
    results: 'შედეგები',
    clear: 'გასუფთავება',
    settings: 'პარამეტრები',
    another: 'კიდევ ერთი',
    anotherTip: 'ახალი ვარიანტი იმავე პარამეტრებით',
    plan3d: '3D გეგმა',
    plan3dTip: 'ოთახის განლაგება 3D მოდელად (კედლები, ფანჯრები, კარები) — სურათის ორიგინალი ფოტოდან',
    plan3dNeedsPhoto: '3D გეგმისთვის ოთახის ფოტო სჭირდება',
    plan3dCaption: '3D გეგმა — ოთახის განლაგება, სტილის ფერებით. შეგიძლია ატრიალო.',
    plan3dBusy: '3D გეგმა მზადდება…',
    plan3dFailed: '3D გეგმა ვერ შეიქმნა. სცადე თავიდან.',
    walkthrough: 'ვიდეო-ტური',
    walkthroughTip: 'ხსნის ვიდეო სტუდიას ამ სურათით და 8 წამით; იქ დააჭირე შექმნას',
    walkthroughPrompt: 'ნელი კინემატოგრაფიული გავლა ამ ოთახში, რბილი კამერის მოძრაობა, ბუნებრივი შუქი',
    stopped: 'შეჩერდა',
    failed: 'სურათი ვერ შეიქმნა. სცადე თავიდან.',
    photoUnreadable: 'ფოტო ვერ წავიკითხე. სცადე სხვა JPG ან PNG.',
    signIn: 'შესასვლელად დააჭირე — ჯერ ავტორიზაციაა საჭირო',
    runCaption: (label, tiles) => `${label} · ${tiles} სურათი`,
    fromPhotos: (n) => (n === 1 ? '1 ფოტოდან' : `${n} ფოტოდან`),
    emptyTitle: { interior: 'ინტერიერის დიზაინერი', photoshoot: 'ფოტოგრაფი' },
    emptyBody: {
      interior: 'ატვირთე ოთახის ფოტო, აირჩიე სტილი — დიზაინერი ავეჯს, ფერებს და შუქს შეცვლის, ოთახი კი ისეთივე დარჩება.',
      photoshoot: 'ატვირთე პროდუქტის ან პორტრეტის ფოტო, აირჩიე პრესეტი და კამერა — მიიღებ სტუდიურ ფოტოსესიას.',
    },
    steps: {
      interior: ['დაამატე ოთახის ფოტო', 'აირჩიე ოთახი და სტილი', 'დააჭირე შექმნას'],
      photoshoot: ['დაამატე ფოტო (არჩევითი)', 'აირჩიე პრესეტი და კამერა', 'დააჭირე შექმნას'],
    },
    modelsTitle: 'მოდელები და ფასები',
    modelCol: 'მოდელი',
    priceCol: 'ფასი',
    perImage: 'სურათზე',
    models: {
      interior: [
        { name: 'ოთახის რედიზაინი', note: 'სურათი ფოტოდან · 1K · 2K · 4K — ფასი ერთია' },
        { name: '3D გეგმა', note: 'ოთახის განლაგება 3D-ში, ფოტოდან' },
        { name: 'ვიდეო-ტური · 8 წმ', note: 'ვიდეო სტუდიაში, სურათიდან' },
      ],
      photoshoot: [
        { name: 'ფოტოსესია', note: 'სურათი კადრზე · 1K · 2K · 4K — ფასი ერთია' },
      ],
    },
    qualityNote: 'ხარისხი (1K/2K/4K) დეტალს ცვლის და არა ფასს.',
    walkthroughNote: 'ფასი ვიდეო სტუდიაშია — იქ დაფიქსირდება.',
  },
  en: {
    generate: 'Generate',
    loading: 'Creating…',
    close: 'Close',
    switchTool: 'Choose a tool',
    addPhoto: 'Add photo',
    takePhoto: 'Camera',
    removePhoto: 'Remove photo',
    photoN: photoN.en,
    badFile: 'Use JPG, PNG or WebP photos up to 12 MB.',
    tooMany: 'Up to 3 photos.',
    modelLabel: 'Model',
    modelValue: 'Auto',
    aspect: 'Aspect ratio',
    quality: 'Quality',
    count: 'Images',
    auto: 'Auto',
    roomType: 'Room type',
    lens: 'Lens',
    light: 'Lighting',
    angle: 'Angle',
    dof: 'Depth of field',
    fromPreset: 'Preset',
    tilesLine: (p, c, t) => (p > 1 ? `${p} photos × ${c} = ${t} images` : `${t} ${t === 1 ? 'image' : 'images'}`),
    interior: {
      uploadTitle: 'Choose room photos to upload',
      uploadLimit: '(up to 3)',
      uploadNote: 'No photo? Skip it — the designer imagines the room from its type and style. With a photo, the windows and proportions stay as photographed.',
      prompt: 'Describe the room you want — colours, furniture, mood (optional)',
      carousel: 'Style',
      carouselNone: 'Pick a style — your room is redesigned in it.',
      needSomething: 'Add a photo, pick a style or describe the room.',
    },
    photoshoot: {
      uploadTitle: 'Add your product or person photos',
      uploadLimit: '(optional, up to 3)',
      uploadNote: 'Each photo is shot separately and keeps its look. No photo? Describe the shot below.',
      prompt: 'Describe the shot — scene, mood, props (optional)',
      carousel: 'Shoot preset',
      carouselNone: 'Pick a preset — or leave it and use the camera controls.',
      needSomething: 'Add a photo, pick a preset or describe the shot.',
    },
    results: 'Results',
    clear: 'Clear',
    settings: 'Settings',
    another: 'Another',
    anotherTip: 'A new take with the same settings',
    plan3d: '3D plan',
    plan3dTip: 'The room’s layout as a 3D model (walls, windows, doors), from your original photo',
    plan3dNeedsPhoto: 'A 3D plan needs a photo of the room',
    plan3dCaption: '3D plan — the room’s layout, tinted in this style. Drag to rotate.',
    plan3dBusy: 'Building the 3D plan…',
    plan3dFailed: 'The 3D plan could not be built. Try again.',
    walkthrough: 'Walkthrough video',
    walkthroughTip: 'Opens the Video studio with this picture and 8 s — press Generate there',
    walkthroughPrompt: 'A slow cinematic walkthrough of this room, a gentle camera move, natural light',
    stopped: 'Stopped',
    failed: 'The image could not be made. Try again.',
    photoUnreadable: 'We could not read your photo. Try another JPG or PNG.',
    signIn: 'Sign in to generate',
    runCaption: (label, tiles) => `${label} · ${tiles} ${tiles === 1 ? 'image' : 'images'}`,
    fromPhotos: (n) => (n === 1 ? 'from 1 photo' : `from ${n} photos`),
    emptyTitle: { interior: 'Interior designer', photoshoot: 'Photographer' },
    emptyBody: {
      interior: 'Upload a photo of a room and pick a style — the designer changes the furniture, colours and light, and the room stays the room.',
      photoshoot: 'Upload a product or portrait photo, pick a preset and a camera — and get a studio photoshoot.',
    },
    steps: {
      interior: ['Add a room photo', 'Pick the room and a style', 'Press Generate'],
      photoshoot: ['Add a photo (optional)', 'Pick a preset and a camera', 'Press Generate'],
    },
    modelsTitle: 'Models & prices',
    modelCol: 'Model',
    priceCol: 'Price',
    perImage: 'per image',
    models: {
      interior: [
        { name: 'Room redesign', note: 'An image from your photo · 1K · 2K · 4K — one price' },
        { name: '3D plan', note: 'The room’s layout in 3D, from your photo' },
        { name: 'Walkthrough · 8 s', note: 'In the Video studio, from the picture' },
      ],
      photoshoot: [
        { name: 'Photoshoot', note: 'An image per shot · 1K · 2K · 4K — one price' },
      ],
    },
    qualityNote: 'Quality (1K / 2K / 4K) changes the detail, not the price.',
    walkthroughNote: 'Priced and charged in the Video studio.',
  },
  ru: {
    generate: 'Создать',
    loading: 'Создаётся…',
    close: 'Закрыть',
    switchTool: 'Выбрать инструмент',
    addPhoto: 'Добавить фото',
    takePhoto: 'Камера',
    removePhoto: 'Удалить фото',
    photoN: photoN.ru,
    badFile: 'Нужны фото JPG, PNG или WebP до 12 МБ.',
    tooMany: 'Не больше 3 фото.',
    modelLabel: 'Модель',
    modelValue: 'Авто',
    aspect: 'Соотношение',
    quality: 'Качество',
    count: 'Количество',
    auto: 'Авто',
    roomType: 'Тип комнаты',
    lens: 'Объектив',
    light: 'Свет',
    angle: 'Ракурс',
    dof: 'Глубина резкости',
    fromPreset: 'Из пресета',
    tilesLine: (p, c, t) => {
      const w = t % 10 === 1 && t % 100 !== 11 ? 'изображение' : t % 10 >= 2 && t % 10 <= 4 && (t % 100 < 12 || t % 100 > 14) ? 'изображения' : 'изображений';
      return p > 1 ? `${p} фото × ${c} = ${t} ${w}` : `${t} ${w}`;
    },
    interior: {
      uploadTitle: 'Выберите фото комнаты',
      uploadLimit: '(до 3)',
      uploadNote: 'Нет фото? Пропустите — дизайнер представит комнату по типу и стилю. С фото окна и пропорции остаются как на снимке.',
      prompt: 'Опишите комнату — цвета, мебель, настроение (необязательно)',
      carousel: 'Стиль',
      carouselNone: 'Выберите стиль — комната будет оформлена в нём.',
      needSomething: 'Добавьте фото, выберите стиль или опишите комнату.',
    },
    photoshoot: {
      uploadTitle: 'Добавьте фото товара или человека',
      uploadLimit: '(необязательно, до 3)',
      uploadNote: 'Каждое фото снимается отдельно и сохраняет свой облик. Нет фото? Опишите кадр ниже.',
      prompt: 'Опишите кадр — сцена, настроение, реквизит (необязательно)',
      carousel: 'Пресет съёмки',
      carouselNone: 'Выберите пресет — или оставьте и используйте настройки камеры.',
      needSomething: 'Добавьте фото, выберите пресет или опишите кадр.',
    },
    results: 'Результаты',
    clear: 'Очистить',
    settings: 'Настройки',
    another: 'Ещё один',
    anotherTip: 'Новый вариант с теми же настройками',
    plan3d: '3D-план',
    plan3dTip: 'Планировка комнаты как 3D-модель (стены, окна, двери) по вашему исходному фото',
    plan3dNeedsPhoto: 'Для 3D-плана нужно фото комнаты',
    plan3dCaption: '3D-план — планировка комнаты в цветах стиля. Можно вращать.',
    plan3dBusy: 'Строится 3D-план…',
    plan3dFailed: 'Не удалось построить 3D-план. Попробуйте снова.',
    walkthrough: 'Видео-обход',
    walkthroughTip: 'Откроет видео-студию с этой картинкой и 8 с — там нажмите «Создать»',
    walkthroughPrompt: 'Медленный кинематографичный обход этой комнаты, плавное движение камеры, естественный свет',
    stopped: 'Остановлено',
    failed: 'Не удалось создать изображение. Попробуйте снова.',
    photoUnreadable: 'Не удалось прочитать фото. Попробуйте другой JPG или PNG.',
    signIn: 'Войдите, чтобы создавать',
    runCaption: (label, tiles) => `${label} · ${tiles}`,
    fromPhotos: (n) => (n === 1 ? 'из 1 фото' : `из ${n} фото`),
    emptyTitle: { interior: 'Дизайнер интерьеров', photoshoot: 'Фотограф' },
    emptyBody: {
      interior: 'Загрузите фото комнаты и выберите стиль — дизайнер сменит мебель, цвета и свет, а сама комната останется прежней.',
      photoshoot: 'Загрузите фото товара или портрет, выберите пресет и камеру — получите студийную фотосессию.',
    },
    steps: {
      interior: ['Добавьте фото комнаты', 'Выберите комнату и стиль', 'Нажмите «Создать»'],
      photoshoot: ['Добавьте фото (необязательно)', 'Выберите пресет и камеру', 'Нажмите «Создать»'],
    },
    modelsTitle: 'Модели и цены',
    modelCol: 'Модель',
    priceCol: 'Цена',
    perImage: 'за изображение',
    models: {
      interior: [
        { name: 'Редизайн комнаты', note: 'Изображение по вашему фото · 1K · 2K · 4K — одна цена' },
        { name: '3D-план', note: 'Планировка комнаты в 3D по фото' },
        { name: 'Видео-обход · 8 с', note: 'В видео-студии, по картинке' },
      ],
      photoshoot: [
        { name: 'Фотосессия', note: 'Изображение за кадр · 1K · 2K · 4K — одна цена' },
      ],
    },
    qualityNote: 'Качество (1K / 2K / 4K) меняет детализацию, а не цену.',
    walkthroughNote: 'Цена и списание — в видео-студии.',
  },
};
