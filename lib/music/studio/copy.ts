/** lib/music/studio/copy.ts — what each Music Studio error says to the user, in Georgian, English and Russian. */
import type { MusicErrorCode } from './errors';
import type { MusicLang } from './contracts';

const T: Record<MusicErrorCode, [ka: string, en: string, ru: string]> = {
  not_enabled: ['მუსიკის სტუდია ჯერ ჩართული არ არის.', 'Music Studio is not switched on yet.', 'Музыкальная студия пока не включена.'],
  not_configured: ['Google-ის მუსიკის ძრავა არ არის დაკონფიგურირებული. თანხა არ ჩამოგეჭრა.', 'The Google music engine is not configured. You were not charged.', 'Музыкальный движок Google не настроен. Списания не было.'],
  unsupported: ['ეს შესაძლებლობა ამ მოდელზე ჯერ დადასტურებული არ არის. თანხა არ ჩამოგეჭრა.', 'This option is not verified on this model yet. You were not charged.', 'Эта возможность ещё не подтверждена для этой модели. Списания не было.'],
  validation_failed: ['მოთხოვნა არასწორია — გადაამოწმე ველები.', 'The request is not valid — check the fields.', 'Запрос некорректен — проверьте поля.'],
  confirmation_required: ['დაადასტურე ფასი, სანამ დავიწყებთ.', 'Confirm the price before we start.', 'Подтвердите цену перед запуском.'],
  quote_invalid: ['ფასი აღარ მოქმედებს — მოითხოვე ახალი.', 'This quote is no longer valid — get a new one.', 'Эта цена больше не действует — запросите новую.'],
  quote_changed: ['პარამეტრები ან ფასი შეიცვალა — მოითხოვე ახალი ფასი.', 'The settings or price changed — get a new quote.', 'Параметры или цена изменились — запросите новую цену.'],
  quote_expired: ['ფასის ვადა ამოიწურა — მოითხოვე ახალი.', 'The quote expired — get a new one.', 'Срок цены истёк — запросите новую.'],
  quote_used: ['ეს ფასი უკვე გამოყენებულია.', 'This quote was already used.', 'Эта цена уже использована.'],
  insufficient_credits: ['არასაკმარისი კრედიტი — შეავსე ბალანსი.', 'Not enough credits — please top up.', 'Недостаточно кредитов — пополните баланс.'],
  billing_unavailable: ['ბილინგი დროებით მიუწვდომელია. არაფერი დაწყებულა და თანხა არ ჩამოგეჭრა.', 'Billing is unavailable right now. Nothing started and you were not charged.', 'Биллинг сейчас недоступен. Ничего не запущено, списания не было.'],
  budget_exhausted: ['მუსიკის გენერაცია დროებით შეჩერებულია. თანხა არ ჩამოგეჭრა.', 'Music generation is paused for now. You were not charged.', 'Генерация музыки временно приостановлена. Списания не было.'],
  queue_full: ['ჯერ დაასრულე ან გააუქმე მიმდინარე ტრეკი.', 'Finish or cancel a running track first.', 'Сначала завершите или отмените текущий трек.'],
  jobs_unavailable: ['სამუშაოს ჩაწერა ვერ მოხერხდა — სცადე ხელახლა.', 'The job could not be recorded — please try again.', 'Не удалось записать задачу — попробуйте снова.'],
  not_found: ['ტრეკი ვერ მოიძებნა.', 'Track not found.', 'Трек не найден.'],
  not_running: ['ეს ტრეკი უკვე დასრულებულია.', 'This track is already finished.', 'Этот трек уже завершён.'],
  cancelled: ['გაუქმდა. კრედიტი დაგიბრუნდა.', 'Cancelled. Your credits were returned.', 'Отменено. Кредиты возвращены.'],
  provider_failed: ['მუსიკის ძრავამ ტრეკი ვერ დააბრუნა. კრედიტი დაგიბრუნდა.', 'The music engine did not return a track. Your credits were returned.', 'Музыкальный движок не вернул трек. Кредиты возвращены.'],
  provider_timeout: ['ძრავამ დროულად არ უპასუხა. კრედიტი დაგიბრუნდა.', 'The engine did not answer in time. Your credits were returned.', 'Движок не ответил вовремя. Кредиты возвращены.'],
  provider_outcome_unknown: ['წინა მცდელობის შედეგი უცნობია — ხელახლა არ გაიგზავნა. კრედიტი დაგიბრუნდა.', 'The previous attempt’s outcome is unknown — it was not sent again. Your credits were returned.', 'Итог прошлой попытки неизвестен — повторно не отправлялось. Кредиты возвращены.'],
  quality_failed: ['ტრეკმა ხარისხის შემოწმება ვერ გაიარა. კრედიტი დაგიბრუნდა.', 'The track failed the quality check. Your credits were returned.', 'Трек не прошёл проверку качества. Кредиты возвращены.'],
  storage_failed: ['ფაილის შენახვა ვერ მოხერხდა.', 'The file could not be stored.', 'Не удалось сохранить файл.'],
  edit_failed: ['რედაქტირება ვერ შესრულდა. ორიგინალი უცვლელია.', 'The edit failed. Your original is unchanged.', 'Редактирование не удалось. Оригинал не изменён.'],
  unknown_error: ['რაღაც შეფერხდა. თუ თანხა ჩამოგეჭრა, ავტომატურად დაგიბრუნდება.', 'Something went wrong. Any charge is returned automatically.', 'Что-то пошло не так. Списание вернётся автоматически.'],
};

export function musicErrorText(code: string, lang: MusicLang | string | null | undefined): string {
  const row = T[code as MusicErrorCode] ?? T.unknown_error;
  return lang === 'en' ? row[1] : lang === 'ru' ? row[2] : row[0];
}

export const MUSIC_ERROR_CODES = Object.keys(T) as MusicErrorCode[];
