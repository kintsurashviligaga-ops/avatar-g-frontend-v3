/**
 * lib/agent/media/smartEditChat.ts — Agent G's smart edit in the chat (Phase 8.7 PR C). PURE.
 *
 *   smartEditAsk       Does this chat turn ask for a smart edit of the attached clips? Only with a video attached and an
 *                      edit word beyond "on the beat" alone: a plain „cut these to the beat" stays Agent G's montage.
 *   smartEditPlanText  The chat's answer: what will happen to the edit, and what each step costs. Nothing paid starts
 *                      from the sentence (GG): captions are prepared and the price is on the button in the editor.
 */
import { parseSmartSentence } from '@/lib/services/montage/smart/sentence';
import type { SmartOp } from '@/lib/services/montage/smart/ops';
import { AI_WATCH_CREDITS_PER_MIN, CAPTION_CREDITS_PER_MIN } from '@/lib/services/montage/smart/price';
import type { AttachmentKind } from './montageChat';

type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

/** The ops the turn asks for, or null when it is not a smart edit of these attachments. */
export function smartEditAsk(text: string, kinds: readonly AttachmentKind[]): SmartOp[] | null {
  if (!kinds.includes('video')) return null;
  const { ops, matched } = parseSmartSentence(text);
  if (!matched) return null;
  const more = ops.some((o) => o.op === 'removeSilence' || o.op === 'aiTrim' || o.op === 'captions' || o.op === 'transition');
  return more ? ops : null;
}

const CAP_LANG: Record<string, Record<Lang, string>> = {
  ka: { ka: 'ქართული', en: 'Georgian', ru: 'грузинские' },
  en: { ka: 'ინგლისური', en: 'English', ru: 'английские' },
  ru: { ka: 'რუსული', en: 'Russian', ru: 'русские' },
};

function line(o: SmartOp, l: Lang, hasMusic: boolean): string | null {
  switch (o.op) {
    case 'removeSilence':
      return { ka: 'პაუზებს და „ეე/ამმ“-ს ამოვჭრი — უფასოა', en: 'Cut the pauses and the „um/uh“ — free', ru: 'Вырежу паузы и «э/мм» — бесплатно' }[l];
    case 'aiTrim':
      return { ka: `AI-ით „მოსაწყენი“ ადგილების ძებნა (✦${AI_WATCH_CREDITS_PER_MIN}/წთ) ჯერ არ არის — ამოვჭრი მხოლოდ პაუზებს`, en: `The AI watch pass for boring parts (✦${AI_WATCH_CREDITS_PER_MIN}/min) is not built yet — I cut only the pauses`, ru: `Поиск «скучного» с ИИ (✦${AI_WATCH_CREDITS_PER_MIN}/мин) ещё не готов — вырежу только паузы` }[l];
    case 'beatSync':
      return hasMusic
        ? { ka: 'კლიპებს მუსიკის რიტმზე დავსვამ — უფასოა', en: 'Lay the clips on the music’s beat — free', ru: 'Положу клипы в ритм музыки — бесплатно' }[l]
        : { ka: 'რიტმისთვის მუსიკა არ მოყოლია — დაამატე რედაქტორში და „რიტმზე ჭრა“ ერთი შეხებაა', en: 'No song came with it — add one in the editor and „Cut to the beat“ is one tap', ru: 'Музыки нет — добавьте её в редакторе, «Резать в ритм» — одно касание' }[l];
    case 'transition':
      return { ka: `გადასვლა: ${o.style} — უფასოა`, en: `Transition: ${o.style} — free`, ru: `Переход: ${o.style} — бесплатно` }[l];
    case 'template':
      return { ka: `შაბლონი: ${o.id}`, en: `Template: ${o.id}`, ru: `Шаблон: ${o.id}` }[l];
    case 'aspect':
      return { ka: `ფორმატი: ${o.aspect}`, en: `Format: ${o.aspect}`, ru: `Формат: ${o.aspect}` }[l];
    case 'captions': {
      const n = CAPTION_CREDITS_PER_MIN;
      const lang = CAP_LANG[o.lang]?.[l] ?? o.lang;
      return {
        ka: `${lang} სუბტიტრები — ✦${n} მეტყველების ყოველ დაწყებულ წუთზე. ზუსტი ფასი ღილაკზე გამოჩნდება; სანამ არ დააჭერ, არაფერი ჩამოიჭრება`,
        en: `${lang} captions — ✦${n} per started minute of speech. The exact price is on the button; nothing is charged until you tap it`,
        ru: `${lang} субтитры — ✦${n} за каждую начатую минуту речи. Точная цена на кнопке; пока не нажмёте, ничего не спишется`,
      }[l];
    }
  }
}

/** The chat's answer to a smart-edit sentence, one line per op, in the person's language. */
export function smartEditPlanText(ops: readonly SmartOp[], locale: string, hasMusic: boolean): string {
  const l = langOf(locale);
  const head = { ka: 'გავხსენი **მონტაჟი** შენი კლიპებით. ჭკვიანი მონტაჟი:', en: 'Opened **Montage** with your clips. Smart edit:', ru: 'Открыл **Монтаж** с вашими клипами. Умный монтаж:' }[l];
  const rows = ops.map((o) => line(o, l, hasMusic)).filter((x): x is string => !!x).map((x) => `• ${x}`);
  const tail = { ka: 'ყველაფერი ერთი „უკან“-ით ბრუნდება.', en: 'One Undo brings it all back.', ru: 'Одна «Отмена» вернёт всё.' }[l];
  return [head, ...rows, tail].join('\n');
}
