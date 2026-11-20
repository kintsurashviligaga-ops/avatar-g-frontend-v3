/**
 * lib/agent/router/commands.ts — the conversational commands Agent G was missing (Phase 8.10). PURE, ka · en · ru.
 *
 * Audit of main 684c0ff (lib/agent/intent CONTROL): „stop / cancel" (incl. „გააუქმე"), „status" and „continue" exist.
 * Missing:
 *   · „რამდენი კრედიტი მაქვს?" / "show me my credits" was read as a QUESTION and went to the chat model, which has no
 *     balance in its context: it could only guess a number.
 *   · „გააუქმე ბოლო მოქმედება" / "undo" / «верни как было» went to the chat model as plain talk: nothing was undone and
 *     nothing said what CAN be undone.
 *
 * Here: `commandOf` reads those two, and the replies use only what the screen knows (the header chip's balance, the
 * plan cards waiting for Start). Undo never deletes a delivered result and never stops paid work on its own: it drops a
 * waiting plan (free), points a running job to „შეწყვიტე", and says where versions are kept. Read only, charges nothing.
 *
 * FLAG. NEXT_PUBLIC_AGENT_G_COMMANDS=1 (lib/agent/chatTurn ChatSnapshot.commandsOn). Off = main.
 */
import { langOf } from '../intent';
import type { Lang } from '../contracts';

export type Command = 'credits' | 'undo';

const MAX_WORDS = 9;
const words = (t: string): string[] => t.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);

const CREDITS = /კრედიტ|ბალანს|(?<![\p{L}])(?:credits?|balance|wallet)(?![\p{L}])|кредит|баланс/iu;
/** A price question („how much is a video?", „რა ღირს") is about a service, not the wallet. */
const PRICE = /ღირ|ფას|ფასი|cost|price|how\s+much\s+(?:is|does|for)|стоит|стоимост|цен/iu;
/** Buying credits is the Billing page's (never touched here). */
const BUY = /შევიძინ|ვიყიდ|შევავს|top\s*up|buy|purchase|купить|пополн/iu;

const UNDO = new RegExp([
  '(?<![\\p{L}])(?:undo|revert|roll\\s*back)(?![\\p{L}])',
  'undo\\s+(?:that|it|my\\s+last(?:\\s+action|\\s+step)?)',
  'go\\s+back\\s+to\\s+(?:the\\s+)?(?:previous|last)\\s+(?:version|one)',
  'დააბრუნე\\s+(?:როგორც\\s+იყო|წინა|უკან)', 'უკან\\s+დააბრუნე', 'გააუქმე\\s+ბოლო', 'ბოლო\\s+(?:მოქმედება|ნაბიჯი|ცვლილება)\\s+გააუქმე',
  'წინა\\s+ვერსია\\s+დააბრუნე', 'წინა\\s+ვერსიაზე\\s+დაბრუნ',
  'отмени\\s+последн', 'верни\\s+(?:как\\s+было|назад|предыдущ)', 'откати',
].join('|'), 'iu');

/** One short message → the command it is, or null. */
export function commandOf(text: string): Command | null {
  const t = String(text ?? '').trim();
  const n = words(t).length;
  if (!n || n > MAX_WORDS) return null;
  if (UNDO.test(t)) return 'undo';
  if (CREDITS.test(t) && !PRICE.test(t) && !BUY.test(t)) return 'credits';
  return null;
}

const L = (lang: Lang, ka: string, en: string, ru: string): string => (lang === 'en' ? en : lang === 'ru' ? ru : ka);

/** The balance as the header chip shows it, or an honest "I can't see it" — never a guessed number. */
export function creditsReply(balance: number | null | undefined, lang: Lang): string {
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    return L(lang,
      'ბალანსს ახლა ვერ ვხედავ. ზედა კუთხეში კრედიტების ღილაკზე ან „ბალანსის“ გვერდზე ზუსტ რიცხვს ნახავ.',
      'I can\'t see your balance right now. The credits chip at the top, or the Billing page, shows the exact number.',
      'Сейчас не вижу баланс. Точное число — на значке кредитов вверху или на странице «Баланс».');
  }
  const n = Math.max(0, Math.floor(balance));
  const low = n < 10
    ? L(lang, ' ცოტა დარჩა: ფასიან სამუშაოს შეიძლება არ ეყოს.', ' That is low: a paid job may not fit.', ' Это мало: на платную задачу может не хватить.')
    : '';
  return L(lang,
    `შენი ბალანსი: ✦${n} კრედიტი.${low} არაფერი ჩამოიჭრება, სანამ ფასს არ დაეთანხმები.`,
    `Your balance: ✦${n} credits.${low} Nothing is charged until you agree to a price.`,
    `Ваш баланс: ✦${n} кредитов.${low} Ничего не спишется, пока вы не согласитесь с ценой.`);
}

export interface UndoView {
  /** Plan cards on screen waiting for Start (dropping one is free and loses nothing). */
  waitingPlans: number;
  /** Work running now (cards or tray jobs). */
  running: number;
  /** The thread has a delivered result. */
  hasResult: boolean;
}

export type UndoAction = 'drop-plans' | 'explain';

/** What undo does: drop waiting plans when there are any; otherwise only say what can be undone. */
export function undoAction(v: UndoView): UndoAction {
  return v.waitingPlans > 0 ? 'drop-plans' : 'explain';
}

export function undoReply(v: UndoView, lang: Lang): string {
  if (v.waitingPlans > 0) {
    return L(lang,
      'გავაუქმე ბოლო გეგმა, რომელიც „დაწყებას“ ელოდა. არაფერი დაწყებულა და არაფერი ჩამოჭრილა.',
      'I cancelled the last plan that was waiting for Start. Nothing had started and nothing was charged.',
      'Отменил последний план, который ждал «Старта». Ничего не запускалось и ничего не списано.');
  }
  const parts: string[] = [];
  if (v.running > 0) {
    parts.push(L(lang,
      'სამუშაო ახლა მიმდინარეობს: თუ გინდა შეწყვიტო, თქვი „შეწყვიტე“ და გამოუყენებელი კრედიტები დაგიბრუნდება.',
      'Work is running now: to stop it, say „stop“ and unused credits come back.',
      'Сейчас идёт работа: чтобы остановить, скажите «стоп», и неиспользованные кредиты вернутся.'));
  }
  if (v.hasResult) {
    parts.push(L(lang,
      'მზა შედეგს არ ვშლი: ის ბიბლიოთეკაში რჩება. თუ სხვანაირი გინდა, მითხარი რა შევცვალო და ახალ ვერსიას გავაკეთებ ფასის ჩვენებით.',
      'I don\'t delete a finished result: it stays in your Library. If you want it different, tell me what to change and I\'ll make a new version, price first.',
      'Готовый результат я не удаляю: он остаётся в Библиотеке. Если нужно иначе, скажите, что изменить, и я сделаю новую версию, сначала с ценой.'));
  }
  parts.push(L(lang,
    'სამუშაო სივრცის ფაილების ყოველი ცვლილება ინახება და წინა ვერსია იქიდან აღდგება (ბიბლიოთეკა → სამუშაო სივრცე).',
    'Every change to your workspace files keeps the version before it, and you can restore it there (Library → Workspace).',
    'Каждое изменение файлов рабочего пространства сохраняет прошлую версию, её можно восстановить (Библиотека → Рабочее пространство).'));
  if (!v.running && !v.hasResult) {
    parts.unshift(L(lang, 'ამ საუბარში გასაუქმებელი არაფერია.', 'There is nothing to undo in this chat.', 'В этом чате нечего отменять.'));
  }
  return parts.join(' ');
}

export const commandLang = (text: string, locale?: string): Lang => langOf(text, locale);
