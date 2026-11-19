/**
 * lib/chat/documentIntent.ts — „შემიქმენი 5-გვერდიანი ქართული PDF ანგარიში" is a request for a FILE, not for words in the chat
 * (Master Task v2.0, Phase 1, DOC-01). Pure: no DOM, no network.
 *
 * ⚠️ WHAT WAS WRONG. Nothing in the chat could make a file: the chat model has no file tool, so a PDF request got a
 * reply saying it cannot make PDFs, or a page of text with no file. The composer now hands such a request to
 * /api/documents/create, which writes the PDF.
 *
 * ⚠️ WHY IT IS NARROW. A PDF the user ATTACHED is read by the chat („რა წერია ამ PDF-ში?", "summarize this pdf"), so
 * naming a PDF is not enough: the sentence needs a verb that MAKES something (create / write / prepare / „შემიქმენი" /
 * „сделай"), and a question is never a request. A deck („PDF პრეზენტაცია") is the Presentation studio's, not this.
 * The caller also leaves a turn with files attached to the chat: those are material to read, which this route cannot see.
 */
import { isServiceQuestion } from './studioIntent';

const L = '\\p{L}';
const B0 = `(?<![${L}\\p{N}])`;
const B1 = `(?![${L}\\p{N}])`;

/** PDF named in any script, with its Georgian/Russian case endings („PDF-ად", „PDF-ში", „pdf-ом"). */
const PDF_NOUN = new RegExp(`${B0}(?:pdf|პდფ|пдф)(?:[-‑]?${L}*)?${B1}`, 'iu');

/** Verbs that make something. Georgian is matched by stem (every conjugation and „for me" marker), like studioIntent. */
const KA_MAKE = [
  'შემიქმენ', 'შექმენ', 'შევქმნ', 'გამიკეთ', 'გააკეთ', 'გავაკეთ', 'დამიწერ', 'დაწერ', 'დავწერ',
  'მომიმზად', 'მოამზად', 'დამიმზად', 'დაამზად', 'შემიდგინ', 'შეადგინ', 'დამიგენერირ', 'დააგენერირ',
  'ჩამომატვირთინ', 'გადამიყვან', 'გადაიყვან', 'გადააკეთ', 'გადამიკეთ', 'მომეც', 'მომაწოდ', 'გამოიტან', 'გამომიტან',
  'მინდა', 'მჭირდებ',
].join('|');
const MAKE_VERB = new RegExp(
  `${B0}(?:make|create|generate|write|draft|prepare|produce|build|compose|export|save|turn|convert|give\\s+me|i\\s+want|i\\s+need|`
  + `сделай|создай|напиши|подготовь|составь|сгенерируй|оформи|сохрани|экспортируй|переведи\\s+в|хочу|нужен|нужно|`
  + `(?:${KA_MAKE})${L}*)${B1}`,
  'iu',
);

/** A deck is the Presentation studio's. */
const DECK_NOUN = new RegExp(`${B0}(?:presentation|slides?|deck|powerpoint|პრეზენტაცი${L}*|სლაიდ${L}*|презентаци${L}*|слайд${L}*)${B1}`, 'iu');

/** „make THIS a PDF", „ეს PDF-ად მომეცი", «сохрани это в pdf»: the material is what the chat just said. */
const ABOUT_LAST_REPLY = new RegExp(
  `${B0}(?:this|that|it|the\\s+(?:above|answer|text|reply)|ეს|ამას|ეგ|მაგას|ზემოთ${L}*|პასუხ${L}*|ტექსტ${L}*|это|этот|эту|ответ${L}*|выше)${B1}`,
  'iu',
);

/** The words name a PDF at all (the chat prompt then says the studio makes them). */
export const mentionsPdf = (text: string): boolean => PDF_NOUN.test(text.slice(0, 2000));

export interface DocumentIntent {
  /** The PDF is made from the last reply in the chat (the caller passes that reply as the source). */
  fromLastReply: boolean;
}

/** A request to make a PDF, or null. Only the first 400 characters are examined. */
export function detectDocumentIntent(text: string | null | undefined): DocumentIntent | null {
  const t = String(text ?? '').trim().slice(0, 400);
  if (t.length < 3) return null;
  if (!PDF_NOUN.test(t)) return null;
  if (isServiceQuestion(t)) return null;
  if (DECK_NOUN.test(t)) return null;
  if (!MAKE_VERB.test(t)) return null;
  // A short sentence that points back („ეს PDF-ად მომეცი") has no subject of its own: its subject is the last reply.
  const words = t.replace(PDF_NOUN, ' ').split(/\s+/).filter(Boolean).length;
  return { fromLastReply: words <= 8 && ABOUT_LAST_REPLY.test(t) };
}
