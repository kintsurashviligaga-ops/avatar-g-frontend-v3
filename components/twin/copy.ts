/**
 * components/twin/copy.ts — every string the Digital Twin capture shows, ka / en / ru. (The consent itself is legal copy
 * and lives in lib/legal/content.ts.)
 */
import type { TwinPhotoSlot } from '@/lib/twin/types';

export type TwinLocale = 'ka' | 'en' | 'ru';

export interface TwinCopy {
  title: string;
  close: string;
  continue: string;
  onPhone: string;
  scanQr: string;
  waitingPhone: string;
  back: string;
  existing: (date: string) => string;
  deleteTwin: string;
  deleteConfirm: string;
  deleteYes: string;
  deleted: string;
  cancel: string;
  slot: Record<TwinPhotoSlot | 'voice' | 'review', string>;
  instruction: Record<TwinPhotoSlot, string>;
  capture: string;
  retake: string;
  usePhoto: string;
  upload: string;
  camDenied: string;
  camUnavailable: string;
  photoBad: string;
  voiceTitle: string;
  voiceHint: string;
  record: string;
  stop: string;
  keepTalking: string;
  reRecord: string;
  voiceDone: (seconds: number) => string;
  micDenied: string;
  micUnsupported: string;
  skipVoice: string;
  next: string;
  reviewTitle: string;
  noVoice: string;
  save: string;
  saving: string;
  done: string;
  phoneDone: string;
  privacyNote: string;
  menuEntry: string;
  /** /avatar/enroll without a link. */
  linkInvalid: string;
  myTwin: string;
  myTwinHint: string;
  err: {
    generic: string;
    signIn: string;
    link: string;
    rate: string;
    unavailable: string;
    badPhoto: (slot: string) => string;
    badVoice: string;
    consent: string;
    expired: string;
  };
}

export const TWIN_COPY: Record<TwinLocale, TwinCopy> = {
  ka: {
    title: 'შენი ციფრული ტყუპი',
    close: 'დახურვა',
    continue: 'გაგრძელება',
    onPhone: 'გააგრძელე ტელეფონით',
    scanQr: 'დაასკანერე ტელეფონის კამერით',
    waitingPhone: 'ველოდები ტელეფონს…',
    back: 'უკან',
    existing: (date) => `შენ უკვე გაქვს ტყუპი (შენახულია ${date}). ახალი გადაღება მას ჩაანაცვლებს.`,
    deleteTwin: 'ტყუპის წაშლა',
    deleteConfirm: 'წაიშალოს შენი ტყუპი და ცოცხალი ავატარის ფაილები? ამის გაუქმება შეუძლებელია.',
    deleteYes: 'წაშლა',
    deleted: 'შენი ტყუპი წაიშალა.',
    cancel: 'გაუქმება',
    slot: { front: 'წინიდან', left: 'მარცხნიდან', right: 'მარჯვნიდან', voice: 'ხმა', review: 'შემოწმება' },
    instruction: {
      front: 'პირდაპირ კამერაში შეხედე და სახე ოვალში მოათავსე.',
      left: 'თავი ნელა მოაბრუნე მარცხნივ — სახე ოვალში დატოვე.',
      right: 'თავი ნელა მოაბრუნე მარჯვნივ — სახე ოვალში დატოვე.',
    },
    capture: 'გადაღება',
    retake: 'თავიდან',
    usePhoto: 'ამ ფოტოს გამოყენება',
    upload: 'ფოტოს ატვირთვა',
    camDenied: 'კამერაზე წვდომა დაბლოკილია. დაუშვი ბრაუზერის პარამეტრებში — ან ატვირთე ფოტო.',
    camUnavailable: 'კამერა ვერ მოიძებნა — ატვირთე ფოტო.',
    photoBad: 'ფოტოს წაკითხვა ვერ მოხერხდა — სცადე სხვა.',
    voiceTitle: 'ხმამაღლა წაიკითხე ეს ციფრები',
    voiceHint: 'შემდეგ ბუნებრივად განაგრძე საუბარი — შენს დღეზე, ნებისმიერ რამეზე — სანამ ზოლი არ შეივსება (მინიმუმ 12 წმ). 30 წამზე ჩაწერა თავად შეჩერდება.',
    record: 'ჩაწერის დაწყება',
    stop: 'გაჩერება',
    keepTalking: 'განაგრძე საუბარი…',
    reRecord: 'თავიდან ჩაწერა',
    voiceDone: (s) => `ხმა ჩაწერილია · ${s} წმ`,
    micDenied: 'მიკროფონზე წვდომა დაბლოკილია. დაუშვი ბრაუზერის პარამეტრებში, ან გააგრძელე ხმის ნიმუშის გარეშე.',
    micUnsupported: 'ეს ბრაუზერი ხმას ვერ იწერს — გააგრძელე ხმის ნიმუშის გარეშე.',
    skipVoice: 'გაგრძელება ხმის გარეშე',
    next: 'შემდეგი',
    reviewTitle: 'შეამოწმე შენი ტყუპი',
    noVoice: 'ხმის ნიმუშის გარეშე',
    save: 'ტყუპის შენახვა',
    saving: 'ინახება…',
    done: 'შენი ტყუპი მზადაა!',
    phoneDone: 'მზადაა! დაბრუნდი კომპიუტერთან.',
    privacyNote: 'მხოლოდ შენს ანგარიშზე — არასდროს საჯაროდ.',
    menuEntry: 'ჩემი ტყუპის შექმნა',
    linkInvalid: 'ბმული არასწორია ან ვადაგასულია. თავიდან დაიწყე „ჩემი ტყუპის შექმნა" კომპიუტერიდან.',
    myTwin: 'ჩემი ტყუპი',
    myTwinHint: 'შენი სახე, შენი ციფრული ტყუპიდან',
    err: {
      generic: 'ვერ შეინახა — სცადე თავიდან.',
      signIn: 'ტყუპის შესაქმნელად შედი ანგარიშზე.',
      link: 'ეს ბმული უკვე გამოყენებულია ან ვადაგასულია. თავიდან დაიწყე კომპიუტერიდან.',
      rate: 'ძალიან ბევრი მცდელობა — დაელოდე ერთ წუთს და სცადე თავიდან.',
      unavailable: 'ციფრული ტყუპი ახლა მიუწვდომელია.',
      badPhoto: (slot) => `ფოტოს („${slot}") გამოყენება ვერ მოხერხდა — გადაიღე თავიდან.`,
      badVoice: 'ხმის ჩანაწერის გამოყენება ვერ მოხერხდა — ჩაწერე თავიდან.',
      consent: 'თანხმობის ტექსტი შეიცვალა — გთხოვ, თავიდან წაიკითხე და დაეთანხმე.',
      expired: 'გადაღების სესია ამოიწურა — დაიწყე თავიდან.',
    },
  },
  en: {
    title: 'Your digital twin',
    close: 'Close',
    continue: 'Continue',
    onPhone: 'Continue on phone',
    scanQr: 'Scan with your phone camera',
    waitingPhone: 'Waiting for your phone…',
    back: 'Back',
    existing: (date) => `You already have a twin (saved ${date}). A new capture replaces it.`,
    deleteTwin: 'Delete my twin',
    deleteConfirm: 'Delete your twin and your Live Avatar files? This cannot be undone.',
    deleteYes: 'Delete',
    deleted: 'Your twin was deleted.',
    cancel: 'Cancel',
    slot: { front: 'Front', left: 'Left', right: 'Right', voice: 'Voice', review: 'Review' },
    instruction: {
      front: 'Look straight at the camera and fit your face inside the oval.',
      left: 'Slowly turn your head to the left — keep your face inside the oval.',
      right: 'Slowly turn your head to the right — keep your face inside the oval.',
    },
    capture: 'Capture',
    retake: 'Retake',
    usePhoto: 'Use this photo',
    upload: 'Upload a photo',
    camDenied: 'Camera access is blocked. Allow it in your browser settings — or upload a photo instead.',
    camUnavailable: 'No camera found — upload a photo instead.',
    photoBad: 'That photo could not be read — try another one.',
    voiceTitle: 'Read these digits aloud',
    voiceHint: 'Then keep talking naturally — about your day, anything — until the bar is full (at least 12 s). Recording stops by itself at 30 s.',
    record: 'Start recording',
    stop: 'Stop',
    keepTalking: 'Keep talking…',
    reRecord: 'Record again',
    voiceDone: (s) => `Voice recorded · ${s} s`,
    micDenied: 'Microphone access is blocked. Allow it in your browser settings, or continue without a voice sample.',
    micUnsupported: 'This browser cannot record audio — continue without a voice sample.',
    skipVoice: 'Continue without voice',
    next: 'Next',
    reviewTitle: 'Check your twin',
    noVoice: 'No voice sample',
    save: 'Save my twin',
    saving: 'Saving…',
    done: 'Your twin is ready!',
    phoneDone: 'Done! Return to your computer.',
    privacyNote: 'Private to your account — never public.',
    menuEntry: 'Create my twin',
    linkInvalid: 'This link is invalid or has expired. Start "Create my twin" again from your computer.',
    myTwin: 'My twin',
    myTwinHint: 'Your own face, from your digital twin',
    err: {
      generic: 'Could not save — try again.',
      signIn: 'Sign in to create your twin.',
      link: 'This link was already used or has expired. Start again from your computer.',
      rate: 'Too many attempts — wait a minute and try again.',
      unavailable: 'Digital twin is not available right now.',
      badPhoto: (slot) => `The ${slot.toLowerCase()} photo could not be used — please retake it.`,
      badVoice: 'The voice recording could not be used — record it again.',
      consent: 'The consent text has changed — please read it and agree again.',
      expired: 'This capture has expired — start again.',
    },
  },
  ru: {
    title: 'Ваш цифровой двойник',
    close: 'Закрыть',
    continue: 'Продолжить',
    onPhone: 'Продолжить на телефоне',
    scanQr: 'Отсканируйте камерой телефона',
    waitingPhone: 'Ожидание телефона…',
    back: 'Назад',
    existing: (date) => `У вас уже есть двойник (сохранён ${date}). Новая съёмка заменит его.`,
    deleteTwin: 'Удалить двойника',
    deleteConfirm: 'Удалить двойника и файлы живого аватара? Это нельзя отменить.',
    deleteYes: 'Удалить',
    deleted: 'Ваш двойник удалён.',
    cancel: 'Отмена',
    slot: { front: 'Анфас', left: 'Слева', right: 'Справа', voice: 'Голос', review: 'Проверка' },
    instruction: {
      front: 'Смотрите прямо в камеру и впишите лицо в овал.',
      left: 'Медленно поверните голову влево — лицо остаётся в овале.',
      right: 'Медленно поверните голову вправо — лицо остаётся в овале.',
    },
    capture: 'Снять',
    retake: 'Переснять',
    usePhoto: 'Использовать фото',
    upload: 'Загрузить фото',
    camDenied: 'Доступ к камере заблокирован. Разрешите его в настройках браузера — или загрузите фото.',
    camUnavailable: 'Камера не найдена — загрузите фото.',
    photoBad: 'Не удалось прочитать фото — попробуйте другое.',
    voiceTitle: 'Прочитайте эти цифры вслух',
    voiceHint: 'Затем продолжайте говорить естественно — о своём дне, о чём угодно — пока полоса не заполнится (минимум 12 с). Запись сама остановится на 30 с.',
    record: 'Начать запись',
    stop: 'Стоп',
    keepTalking: 'Продолжайте говорить…',
    reRecord: 'Записать заново',
    voiceDone: (s) => `Голос записан · ${s} с`,
    micDenied: 'Доступ к микрофону заблокирован. Разрешите его в настройках браузера или продолжите без образца голоса.',
    micUnsupported: 'Этот браузер не умеет записывать звук — продолжите без образца голоса.',
    skipVoice: 'Продолжить без голоса',
    next: 'Далее',
    reviewTitle: 'Проверьте двойника',
    noVoice: 'Без образца голоса',
    save: 'Сохранить двойника',
    saving: 'Сохранение…',
    done: 'Ваш двойник готов!',
    phoneDone: 'Готово! Вернитесь к компьютеру.',
    privacyNote: 'Только для вашего аккаунта — никогда не публично.',
    menuEntry: 'Создать двойника',
    linkInvalid: 'Ссылка недействительна или истекла. Запустите «Создать двойника» снова на компьютере.',
    myTwin: 'Мой двойник',
    myTwinHint: 'Ваше лицо из цифрового двойника',
    err: {
      generic: 'Не удалось сохранить — попробуйте снова.',
      signIn: 'Войдите, чтобы создать двойника.',
      link: 'Эта ссылка уже использована или устарела. Начните снова с компьютера.',
      rate: 'Слишком много попыток — подождите минуту и попробуйте снова.',
      unavailable: 'Цифровой двойник сейчас недоступен.',
      badPhoto: (slot) => `Фото «${slot}» не подошло — переснимите его.`,
      badVoice: 'Запись голоса не подошла — запишите её снова.',
      consent: 'Текст согласия изменился — прочитайте его и подтвердите снова.',
      expired: 'Сеанс съёмки истёк — начните заново.',
    },
  },
};

export function twinCopy(locale: string | null | undefined): TwinCopy {
  return TWIN_COPY[locale === 'en' || locale === 'ru' ? locale : 'ka'];
}
