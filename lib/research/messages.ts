/**
 * lib/research/messages.ts — the sentences the research ROUTES put in an error body, in the caller's language. Every one says
 * what happened to the user's money (nothing was charged, or it was returned) — that is the only thing a person needs to know
 * when a paid task does not start. Provider text never appears here (lib/api/providerError.ts owns the supplier-side copy).
 */
import type { ResearchLocale } from './types';

type Copy = Record<ResearchLocale, string>;

const MESSAGES: Record<string, Copy> = {
  invalid_request: {
    ka: 'მოთხოვნა არასწორია — შეამოწმე ტექსტი და სცადე თავიდან. კრედიტი არ ჩამოგეჭრა.',
    en: 'That request is not valid — check the text and try again. You have not been charged.',
    ru: 'Некорректный запрос — проверьте текст и попробуйте снова. Средства не списаны.',
  },
  invalid_file: {
    ka: 'დართული დოკუმენტებიდან ერთ-ერთი აღარ არსებობს. განაახლე სია და სცადე თავიდან. კრედიტი არ ჩამოგეჭრა.',
    en: 'One of the attached documents is no longer there. Reload the list and try again. You have not been charged.',
    ru: 'Одного из прикреплённых документов больше нет. Обновите список и попробуйте снова. Средства не списаны.',
  },
  confirmation_required: {
    ka: 'დაადასტურე ფასი კვლევის დასაწყებად.',
    en: 'Confirm the price to start the research.',
    ru: 'Подтвердите цену, чтобы начать исследование.',
  },
  price_changed: {
    ka: 'ფასი შეიცვალა — გადაამოწმე და დაადასტურე თავიდან. კრედიტი არ ჩამოგეჭრა.',
    en: 'The price changed — review it and confirm again. You have not been charged.',
    ru: 'Цена изменилась — проверьте и подтвердите снова. Средства не списаны.',
  },
  insufficient_credits: {
    ka: 'Deep Research-ისთვის კრედიტი არ გყოფნის. შეავსე ბალანსი და სცადე თავიდან.',
    en: 'You do not have enough credits for Deep Research. Top up and try again.',
    ru: 'Не хватает кредитов для Deep Research. Пополните баланс и попробуйте снова.',
  },
  billing_unavailable: {
    ka: 'ბალანსის გადამოწმება ვერ მოხერხდა, ამიტომ არაფერი ჩამოგეჭრა. სცადე ცოტა ხანში.',
    en: 'We could not verify your balance, so nothing was charged. Please try again in a moment.',
    ru: 'Не удалось проверить баланс, поэтому ничего не списано. Попробуйте чуть позже.',
  },
  unavailable: {
    ka: 'Deep Research ჯერ არ არის ხელმისაწვდომი. კრედიტი არ ჩამოგეჭრა.',
    en: 'Deep Research is not available yet. You have not been charged.',
    ru: 'Deep Research пока недоступен. Средства не списаны.',
  },
  too_many_active: {
    ka: 'შენ უკვე გაქვს მიმდინარე კვლევა. დაელოდე დასრულებას ან გააუქმე. კრედიტი არ ჩამოგეჭრა.',
    en: 'You already have research running. Wait for it to finish or cancel it first. You have not been charged.',
    ru: 'У вас уже идёт исследование. Дождитесь завершения или отмените его. Средства не списаны.',
  },
  daily_limit: {
    ka: 'დღევანდელი Deep Research-ის ლიმიტი ამოიწურა. სცადე ხვალ. კრედიტი არ ჩამოგეჭრა.',
    en: 'You have reached today’s Deep Research limit. Try again tomorrow. You have not been charged.',
    ru: 'Дневной лимит Deep Research исчерпан. Попробуйте завтра. Средства не списаны.',
  },
  capacity_reached: {
    ka: 'Deep Research დღეს გადატვირთულია. სცადე ხვალ. კრედიტი არ ჩამოგეჭრა.',
    en: 'Deep Research is at capacity for today. Try again tomorrow. You have not been charged.',
    ru: 'Deep Research на сегодня перегружен. Попробуйте завтра. Средства не списаны.',
  },
  context_missing: {
    ka: 'დართული დოკუმენტი აღარ არსებობს. კრედიტი დაგიბრუნდა.',
    en: 'An attached document is no longer there. Your credits were returned.',
    ru: 'Прикреплённого документа больше нет. Кредиты возвращены.',
  },
  not_found: {
    ka: 'კვლევა ვერ მოიძებნა.',
    en: 'Research not found.',
    ru: 'Исследование не найдено.',
  },
  too_early: {
    ka: 'კვლევა ახლა იწყება — სცადე რამდენიმე წამში.',
    en: 'The research is just starting — try again in a few seconds.',
    ru: 'Исследование только запускается — попробуйте через несколько секунд.',
  },
  rate_limited: {
    ka: 'ძალიან ბევრი მოთხოვნაა. დაელოდე წუთს.',
    en: 'Too many requests. Give it a minute.',
    ru: 'Слишком много запросов. Подождите минуту.',
  },
};

export function researchMessage(code: string, locale?: string | null): string {
  const lang: ResearchLocale = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const entry = MESSAGES[code] ?? MESSAGES.unavailable!;
  return entry[lang];
}
