/**
 * components/studio/create/musicCreateCopy.ts — ka / en / ru copy for the Music tool's Create screen (the strings the
 * panel adds on top of components/studio/ui/musicControlsCopy and lib/studio/musicEngines).
 *
 * Pure (no React), so one test checks that every key exists, is non-empty, and reads differently in all three languages.
 * Georgian runs 1.5–2× longer than English: every row that carries one of these wraps rather than truncating.
 *
 * ⚠️ HONEST COPY. Where a control is not wired end to end it says so — "soon" (not built) or "not available right now"
 * (built, but this deployment has no provider for it) — and nothing here claims a capability the code does not have.
 */

export type CreateLang = 'ka' | 'en' | 'ru';
export const createLang = (l: string | null | undefined): CreateLang => (l === 'en' || l === 'ru' ? l : 'ka');

export interface MusicCreateCopy {
  // title row
  modeMenu: string;
  modeSimple: string;
  modeAdvanced: string;
  modeSimpleHint: string;
  modeAdvancedHint: string;
  signInToCreate: string;
  engine: string;
  engineSheetTitle: string;
  // + Audio | + Voice
  addAudio: string;
  addVoice: string;
  soon: string;
  unavailable: string;
  refCover: string;
  refVoice: string;
  refCoverNote: string;
  refVoiceNote: string;
  refRemove: string;
  refSwitch: string;
  refTrained: string;
  voiceTitle: string;
  voiceRecord: string;
  voiceStop: string;
  voiceUpload: string;
  voiceNeed15: string;
  voiceTrained: string;
  voiceTrainedHint: string;
  voiceHint: string;
  audioPicked: string;
  // lyrics card
  lyrics: string;
  lyricsPlaceholder: string;
  lyricsPlaceholderInstrumental: string;
  lyricsCoverNote: string;
  lyricsWand: string;
  lyricsLibrary: string;
  instrumental: string;
  camera: string;
  cameraSoon: string;
  expand: string;
  expandLyrics: string;
  expandStyles: string;
  done: string;
  collapse: string;
  // styles card
  styles: string;
  stylesPlaceholder: string;
  stylesWand: string;
  stylesLibrary: string;
  stylesFull: string;
  // wand outcomes
  wandWorking: string;
  wandAuth: string;
  wandRate: string;
  wandBusy: string;
  wandFail: string;
  wandNeedWords: string;
  signIn: string;
  // library sheet
  libLyricsTitle: string;
  libStylesTitle: string;
  libSave: string;
  libEmpty: string;
  libUse: string;
  libDelete: string;
  libSaved: string;
  libNothingToSave: string;
  // more options
  moreOptions: string;
  vocalGender: string;
  vocalInfo: string;
  vocalOff: string;
  weirdnessInfo: string;
  styleInfluenceInfo: string;
  info: string;
  native: string;
  length: string;
  lengthFull: string;
  tempo: string;
  templates: string;
  // create bar
  create: string;
  creating: string;
  tileLength: string;
  tileTempo: string;
  lyricsKept: (n: number) => string;
  // result
  result: string;
  lastTrack: string;
  resultEmpty: string;
  resultEmptyHint: string;
  enginesAndPrices: string;
  enginesPicker: string;
  creditsShort: string;
  secondsShort: string;
  // simple mode
  simplePlaceholder: string;
  simpleCard: string;
}

export const MUSIC_CREATE_COPY: Readonly<Record<CreateLang, MusicCreateCopy>> = {
  ka: {
    modeMenu: 'რეჟიმი',
    modeSimple: 'მარტივი',
    modeAdvanced: 'გაფართოებული',
    modeSimpleHint: 'აღწერე სიმღერა — დანარჩენს ჩვენ მივხედავთ',
    modeAdvancedHint: 'ლირიკა, სტილები, ხმა და დეტალური პარამეტრები',
    signInToCreate: 'შედი შესაქმნელად',
    engine: 'ძრავა',
    engineSheetTitle: 'მუსიკის ძრავა',
    addAudio: '+ აუდიო',
    addVoice: '+ ხმა',
    soon: 'მალე',
    unavailable: 'ამჟამად მიუწვდომელია',
    refCover: 'მელოდიის რეფერენსი',
    refVoice: 'შენი ხმის ნიმუში',
    refCoverNote: 'MusicGen ამ მელოდიას ინსტრუმენტულად გადააკეთებს — 30 წმ, ფიქსირებული ფასი. ლირიკა არ გამოიყენება.',
    refVoiceNote: 'სიმღერა შენი ხმით შესრულდება — საჭიროა ~15 წმ სუფთა ხმა; იმღერება ლირიკის პირველი ~360 სიმბოლო.',
    refRemove: 'ფაილის მოცილება',
    refSwitch: 'როგორ გამოვიყენო ეს ფაილი',
    refTrained: 'შენი გაწვრთნილი ხმა ჩართულია',
    voiceTitle: 'იმღერე შენი ხმით',
    voiceRecord: 'ნიმუშის ჩაწერა',
    voiceStop: 'გაჩერება',
    voiceUpload: 'ნიმუშის ატვირთვა',
    voiceNeed15: '≥15 წმ',
    voiceTrained: 'გამოვიყენო ჩემი გაწვრთნილი ხმა',
    voiceTrainedHint: 'ზუსტი: შენ მიერ გაწვრთნილი ხმის მოდელი',
    voiceHint: 'ჩაიწერე ან ატვირთე ≥15 წმ სუფთა ხმა — სიმღერა შენი ვოკალით შეიქმნება.',
    audioPicked: 'აუდიო დაემატა',
    lyrics: 'ლირიკა',
    lyricsPlaceholder: 'ჩაწერე ლირიკა — ან დატოვე ცარიელი და AI დაწერს',
    lyricsPlaceholderInstrumental: 'ინსტრუმენტული — ვოკალის გარეშე',
    lyricsCoverNote: 'ქავერის რეჟიმში იქმნება ინსტრუმენტული ტრეკი — ლირიკა არ გამოიყენება.',
    lyricsWand: 'ლირიკის დაწერა ჩემი სტილიდან',
    lyricsLibrary: 'შენახული ლირიკა',
    instrumental: 'ინსტრუმენტული',
    camera: 'შთაგონება ფოტოდან',
    cameraSoon: 'ფოტოდან შთაგონება — მალე',
    expand: 'გაშლა',
    expandLyrics: 'ლირიკა',
    expandStyles: 'სტილები',
    done: 'მზადაა',
    collapse: 'ჩაკეცვა',
    styles: 'სტილები',
    stylesPlaceholder: 'აღწერე, როგორ უნდა ჟღერდეს შენი სიმღერა',
    stylesWand: 'აღწერის გაუმჯობესება',
    stylesLibrary: 'შენახული სტილები',
    stylesFull: 'მაქსიმუმ 3 სტილი — ერთი მოხსენი',
    wandWorking: 'იწერება…',
    wandAuth: 'შედი ანგარიშში, რომ AI-ის დახმარება გამოიყენო.',
    wandRate: 'ძალიან ბევრი მოთხოვნა — სცადე ერთ წუთში.',
    wandBusy: 'ახლა დაკავებულია — სცადე მოგვიანებით.',
    wandFail: 'ვერ მოხერხდა — სცადე თავიდან.',
    wandNeedWords: 'ჯერ ჩაწერე რამდენიმე სიტყვა.',
    signIn: 'შესვლა',
    libLyricsTitle: 'შენახული ლირიკა',
    libStylesTitle: 'შენახული სტილები',
    libSave: 'მიმდინარეს შენახვა',
    libEmpty: 'ჯერ არაფერი გაქვს შენახული. ჩაწერე ტექსტი და დააჭირე „შენახვა“.',
    libUse: 'გამოყენება',
    libDelete: 'წაშლა',
    libSaved: 'შენახულია',
    libNothingToSave: 'შესანახი ტექსტი ცარიელია',
    moreOptions: 'დამატებითი პარამეტრები',
    vocalGender: 'ვოკალის სქესი',
    vocalInfo: 'ვინ მღერის. „ავტო“ ძრავას ანდობს არჩევანს; დუეტში მამაკაცისა და ქალის ხმაა.',
    vocalOff: 'ინსტრუმენტულზე არ გამოიყენება',
    weirdnessInfo: 'რამდენად უჩვეულო იყოს ტრეკი: დაბალი — ნაცნობი, მაღალი — ექსპერიმენტული.',
    styleInfluenceInfo: 'რამდენად მკაცრად მიჰყვეს ტრეკი არჩეულ სტილებს: დაბალი — თავისუფალი შთაგონება, მაღალი — მკაცრად.',
    info: 'ინფორმაცია',
    native: 'სლაიდერები ამ ძრავაზე რეალურ პარამეტრებად გადადის.',
    length: 'ხანგრძლივობა',
    lengthFull: 'სრული სიმღერა',
    tempo: 'ტემპი',
    templates: 'შაბლონები',
    create: 'შექმნა',
    creating: 'იქმნება…',
    tileLength: 'ხანგრძლივობა',
    tileTempo: 'ტემპი',
    lyricsKept: (n) => `შენი ლირიკა (${n} სიმბოლო) შესრულდება — შესაცვლელად გახსენი „გაფართოებული“.`,
    result: 'შედეგი',
    lastTrack: 'ბოლო ტრეკი',
    resultEmpty: 'შენი ტრეკი აქ გამოჩნდება',
    resultEmptyHint: 'შეავსე ფორმა მარჯვნივ და დააჭირე „შექმნა“.',
    enginesAndPrices: 'ძრავები და ფასები',
    enginesPicker: 'აირჩიე, რომელი ძრავა სცადოს პირველად',
    creditsShort: 'კრედ.',
    secondsShort: 'წმ',
    simplePlaceholder: 'მაგ.: მშვიდი ლო-ფაი ბითი სასწავლად, წვიმის ხმით',
    simpleCard: 'აღწერე სიმღერა',
  },
  en: {
    modeMenu: 'Mode',
    modeSimple: 'Simple',
    modeAdvanced: 'Advanced',
    modeSimpleHint: 'Describe your song — we do the rest',
    modeAdvancedHint: 'Lyrics, styles, voice and fine controls',
    signInToCreate: 'Sign in to create',
    engine: 'Engine',
    engineSheetTitle: 'Music engine',
    addAudio: '+ Audio',
    addVoice: '+ Voice',
    soon: 'Soon',
    unavailable: 'Not available right now',
    refCover: 'Melody reference',
    refVoice: 'Your voice sample',
    refCoverNote: 'MusicGen re-imagines this melody as an instrumental — 30 s, flat price. Lyrics are not used.',
    refVoiceNote: 'The song is sung in your voice — needs ~15 s of clear voice; the first ~360 characters of lyrics are sung.',
    refRemove: 'Remove the file',
    refSwitch: 'How to use this file',
    refTrained: 'Your trained voice is on',
    voiceTitle: 'Sing in your voice',
    voiceRecord: 'Record a sample',
    voiceStop: 'Stop',
    voiceUpload: 'Upload a sample',
    voiceNeed15: '≥15 s',
    voiceTrained: 'Use my trained voice',
    voiceTrainedHint: 'Faithful: the voice model you trained',
    voiceHint: 'Record or upload ≥15 s of clear voice — the song is sung in your vocal.',
    audioPicked: 'Audio added',
    lyrics: 'Lyrics',
    lyricsPlaceholder: 'Write lyrics — or leave empty and the AI writes them',
    lyricsPlaceholderInstrumental: 'Instrumental — no vocals',
    lyricsCoverNote: 'A cover makes an instrumental — lyrics are not used.',
    lyricsWand: 'Write lyrics from my style',
    lyricsLibrary: 'Saved lyrics',
    instrumental: 'Instrumental',
    camera: 'Inspire from a picture',
    cameraSoon: 'Inspire from a picture — soon',
    expand: 'Expand',
    expandLyrics: 'Lyrics',
    expandStyles: 'Styles',
    done: 'Done',
    collapse: 'Collapse',
    styles: 'Styles',
    stylesPlaceholder: 'Describe what you want your song to sound like',
    stylesWand: 'Improve my description',
    stylesLibrary: 'Saved styles',
    stylesFull: 'Up to 3 styles — remove one first',
    wandWorking: 'Writing…',
    wandAuth: 'Sign in to use the AI helper.',
    wandRate: 'Too many requests — try again in a minute.',
    wandBusy: 'Busy right now — try again shortly.',
    wandFail: 'That did not work — please try again.',
    wandNeedWords: 'Type a few words first.',
    signIn: 'Sign in',
    libLyricsTitle: 'Saved lyrics',
    libStylesTitle: 'Saved styles',
    libSave: 'Save current',
    libEmpty: 'Nothing saved yet. Write some text and tap “Save current”.',
    libUse: 'Use',
    libDelete: 'Delete',
    libSaved: 'Saved',
    libNothingToSave: 'There is no text to save',
    moreOptions: 'More Options',
    vocalGender: 'Vocal gender',
    vocalInfo: 'Who sings. Auto lets the engine decide; Duet uses a male and a female voice.',
    vocalOff: 'Not used for instrumentals',
    weirdnessInfo: 'How unusual the track should be: low is familiar, high is experimental.',
    styleInfluenceInfo: 'How closely the track follows your styles: low is loose inspiration, high is strict.',
    info: 'Info',
    native: 'On this engine the sliders are real engine parameters.',
    length: 'Length',
    lengthFull: 'Full song',
    tempo: 'Tempo',
    templates: 'Templates',
    create: 'Create',
    creating: 'Creating…',
    tileLength: 'Length',
    tileTempo: 'Tempo',
    lyricsKept: (n) => `Your lyrics (${n} characters) will be sung — open Advanced to change them.`,
    result: 'Result',
    lastTrack: 'Last track',
    resultEmpty: 'Your track will appear here',
    resultEmptyHint: 'Fill in the form on the right and press Create.',
    enginesAndPrices: 'Engines & prices',
    enginesPicker: 'Pick which engine tries first',
    creditsShort: 'cr',
    secondsShort: 's',
    simplePlaceholder: 'e.g. a calm lo-fi beat for studying, with rain sounds',
    simpleCard: 'Describe your song',
  },
  ru: {
    modeMenu: 'Режим',
    modeSimple: 'Простой',
    modeAdvanced: 'Расширенный',
    modeSimpleHint: 'Опишите песню — остальное сделаем мы',
    modeAdvancedHint: 'Текст, стили, голос и точная настройка',
    signInToCreate: 'Войдите, чтобы создавать',
    engine: 'Движок',
    engineSheetTitle: 'Музыкальный движок',
    addAudio: '+ Аудио',
    addVoice: '+ Голос',
    soon: 'Скоро',
    unavailable: 'Сейчас недоступно',
    refCover: 'Референс мелодии',
    refVoice: 'Образец вашего голоса',
    refCoverNote: 'MusicGen переосмыслит эту мелодию как инструментал — 30 с, фиксированная цена. Текст не используется.',
    refVoiceNote: 'Песня будет спета вашим голосом — нужно ~15 с чистого голоса; поётся первые ~360 символов текста.',
    refRemove: 'Убрать файл',
    refSwitch: 'Как использовать файл',
    refTrained: 'Ваш обученный голос включён',
    voiceTitle: 'Спеть вашим голосом',
    voiceRecord: 'Записать образец',
    voiceStop: 'Стоп',
    voiceUpload: 'Загрузить образец',
    voiceNeed15: '≥15 с',
    voiceTrained: 'Использовать мой обученный голос',
    voiceTrainedHint: 'Точно: модель голоса, которую вы обучили',
    voiceHint: 'Запишите или загрузите ≥15 с чистого голоса — песня будет спета вашим вокалом.',
    audioPicked: 'Аудио добавлено',
    lyrics: 'Текст',
    lyricsPlaceholder: 'Напишите текст — или оставьте пустым, и ИИ напишет его',
    lyricsPlaceholderInstrumental: 'Инструментал — без вокала',
    lyricsCoverNote: 'Кавер — это инструментал: текст не используется.',
    lyricsWand: 'Написать текст по моему стилю',
    lyricsLibrary: 'Сохранённые тексты',
    instrumental: 'Инструментал',
    camera: 'Вдохновиться картинкой',
    cameraSoon: 'Вдохновение по фото — скоро',
    expand: 'Развернуть',
    expandLyrics: 'Текст',
    expandStyles: 'Стили',
    done: 'Готово',
    collapse: 'Свернуть',
    styles: 'Стили',
    stylesPlaceholder: 'Опишите, как должна звучать ваша песня',
    stylesWand: 'Улучшить описание',
    stylesLibrary: 'Сохранённые стили',
    stylesFull: 'До 3 стилей — сначала уберите один',
    wandWorking: 'Пишу…',
    wandAuth: 'Войдите, чтобы пользоваться помощником ИИ.',
    wandRate: 'Слишком много запросов — попробуйте через минуту.',
    wandBusy: 'Сейчас занято — попробуйте чуть позже.',
    wandFail: 'Не получилось — попробуйте снова.',
    wandNeedWords: 'Сначала напишите пару слов.',
    signIn: 'Войти',
    libLyricsTitle: 'Сохранённые тексты',
    libStylesTitle: 'Сохранённые стили',
    libSave: 'Сохранить текущее',
    libEmpty: 'Пока ничего не сохранено. Напишите текст и нажмите «Сохранить текущее».',
    libUse: 'Использовать',
    libDelete: 'Удалить',
    libSaved: 'Сохранено',
    libNothingToSave: 'Нет текста для сохранения',
    moreOptions: 'Дополнительно',
    vocalGender: 'Пол вокала',
    vocalInfo: 'Кто поёт. «Авто» оставляет выбор движку; в дуэте — мужской и женский голоса.',
    vocalOff: 'Для инструментала не используется',
    weirdnessInfo: 'Насколько необычным будет трек: низкое — привычно, высокое — экспериментально.',
    styleInfluenceInfo: 'Насколько строго трек следует стилям: низкое — свободное вдохновение, высокое — строго.',
    info: 'Подробнее',
    native: 'На этом движке ползунки — реальные параметры движка.',
    length: 'Длина',
    lengthFull: 'Полная песня',
    tempo: 'Темп',
    templates: 'Шаблоны',
    create: 'Создать',
    creating: 'Создаю…',
    tileLength: 'Длина',
    tileTempo: 'Темп',
    lyricsKept: (n) => `Ваш текст (${n} симв.) будет спет — чтобы изменить его, откройте «Расширенный».`,
    result: 'Результат',
    lastTrack: 'Последний трек',
    resultEmpty: 'Здесь появится ваш трек',
    resultEmptyHint: 'Заполните форму справа и нажмите «Создать».',
    enginesAndPrices: 'Движки и цены',
    enginesPicker: 'Выберите, какой движок пробует первым',
    creditsShort: 'кр.',
    secondsShort: 'с',
    simplePlaceholder: 'напр. спокойный лоу-фай бит для учёбы, со звуком дождя',
    simpleCard: 'Опишите песню',
  },
};

export const musicCreateCopy = (locale: string): MusicCreateCopy => MUSIC_CREATE_COPY[createLang(locale)];
