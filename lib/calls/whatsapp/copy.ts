/**
 * lib/calls/whatsapp/copy.ts — what a person READS in WhatsApp when a call to Agent G cannot go ahead. The call itself
 * is declined at once (no ringing into silence, no charge); this one short message says why and what to do. Plain
 * words, the four status words of the product, no technical terms (owner, Omnichannel A3).
 */
import type { CallFailure } from './lifecycle';

export type CallLang = 'ka' | 'en' | 'ru';

type Line = (link: string) => string;

const KA: Partial<Record<CallFailure, Line>> & { generic: Line } = {
  not_linked: (l) => `Agent G-სთან ხმოვანი საუბრისთვის ჯერ დააკავშირე ეს ნომერი შენს MyAvatar.ge ანგარიშთან: ${l}`,
  calls_opted_out: (l) => `Agent G-ის ზარები გამორთულია. ჩართე პარამეტრებში → კავშირები: ${l}`,
  insufficient_balance: (l) => `ზარისთვის ბალანსი არ კმარა. შეავსე ბალანსი: ${l}`,
  daily_cap: () => 'დღევანდელი ზარის წუთები ამოიწურა. ხვალ ისევ შეძლებ, ან მომწერე აქ.',
  generic: () => 'Agent G-ის ზარები დროებით მიუწვდომელია. მომწერე აქ და გიპასუხებ.',
};
const EN: typeof KA = {
  not_linked: (l) => `To talk to Agent G by voice, first link this number to your MyAvatar.ge account: ${l}`,
  calls_opted_out: (l) => `Agent G calls are off. Turn them on in Settings → Connections: ${l}`,
  insufficient_balance: (l) => `Your balance is too low for a call. Top up here: ${l}`,
  daily_cap: () => 'You have used today\'s call minutes. You can call again tomorrow, or write to me here.',
  generic: () => 'Agent G calls are temporarily unavailable. Write to me here and I will answer.',
};
const RU: typeof KA = {
  not_linked: (l) => `Чтобы говорить с Agent G голосом, сначала привяжите этот номер к аккаунту MyAvatar.ge: ${l}`,
  calls_opted_out: (l) => `Звонки Agent G выключены. Включите их в Настройки → Подключения: ${l}`,
  insufficient_balance: (l) => `Для звонка не хватает баланса. Пополнить: ${l}`,
  daily_cap: () => 'Минуты звонков на сегодня закончились. Позвоните завтра или напишите мне здесь.',
  generic: () => 'Звонки Agent G временно недоступны. Напишите мне здесь, и я отвечу.',
};
const COPY: Record<CallLang, typeof KA> = { ka: KA, en: EN, ru: RU };

/** Where the message points: link and call settings are both on /settings#whatsapp; the balance on /pricing. */
export function refusalLink(reason: CallFailure, origin: string, lang: CallLang): string {
  const base = origin.replace(/\/+$/, '');
  return reason === 'insufficient_balance' ? `${base}/${lang}/pricing` : `${base}/${lang}/settings#whatsapp`;
}

export function refusalText(reason: CallFailure, lang: CallLang, origin: string): string {
  const c = COPY[lang] ?? KA;
  return (c[reason] ?? c.generic)(refusalLink(reason, origin, lang));
}

/** Whether a refusal is worth a message at all: the person can act on it, or must not be left wondering. */
export function refusalWorthTelling(reason: CallFailure): boolean {
  return reason !== 'calling_off'; // while the feature is off nobody can reach the call button in the first place
}
