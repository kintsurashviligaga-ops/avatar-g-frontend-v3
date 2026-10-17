/**
 * lib/chat/chatConsent.ts — "YES, START IT" IN THE CHAT. Pure, client-safe, no network.
 *
 * ⚠️ PRODUCTION 2026-10-16 (GG's iPhone, 22:19 Tbilisi). Agent G had offered a 9:16 portrait from GG's photo; GG answered
 * „კი შექმენი სურათი 9:16 ფორმატის" ("yes, make the picture in 9:16"), and the chat replied that it cannot generate in the
 * chat and told GG to open the Image tool, attach the photo again, pick 9:16 and paste a prompt. Three faults:
 *   1. A leading „კი" hid the order: the order check wants the generate verb first, so the message went to the model.
 *   2. A yes only counted when it was ONE word (or one word more), so "yes + the order again" was never a yes.
 *   3. The model was told it can start nothing, so it sent people to a tool.
 * GG's rule (18:21Z): when Agent G has clarified and the user agrees, generation starts, for every service. This module
 * decides what counts as that agreement, and what it carries (the format the user named in it).
 *
 * BIAS, ON PURPOSE: agreement is a yes or a bare "make it", plus at most the format. Any other word — a change („but the
 * background white"), a new subject — is NOT agreement: it goes back to Agent G, which revises its offer. Starting a
 * paid job on a sentence that changed the job would charge for the wrong thing.
 *
 * ⚠️ NO `\b` (ASCII-only: it never matches next to Georgian or Cyrillic). Tokens come from Unicode property escapes.
 */
import { IMG_ASPECTS, type ImgAspect } from '@/lib/studio/imageCreate';
import { isAffirmation } from './focusGate';

const words = (s: string): string[] =>
  s.normalize('NFKC').toLowerCase().replace(/[​-‍﻿]/g, '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

/** Plain assent (ka · en · ru). */
const ASSENT = new Set([
  'კი', 'ჰო', 'დიახ', 'ხო', 'ოკ', 'ოკეი', 'კარგი', 'კარგია', 'კარგად', 'აუცილებლად', 'რა თქმა უნდა', 'მომწონს', 'შესანიშნავია', 'სუპერ', 'ზუსტად',
  'yes', 'yep', 'yeah', 'yup', 'sure', 'ok', 'okay', 'k', 'fine', 'great', 'perfect', 'absolutely', 'of course', 'please',
  'да', 'ага', 'ок', 'окей', 'хорошо', 'конечно', 'отлично', 'давай', 'давайте', 'идёт', 'идет',
]);

/** "Start / make it" (the order itself). Stems: Georgian conjugates (შექმენი / შემიქმენი / შექმენით). */
const START = /^(?:შე(?:მი)?ქმენ\p{L}*|შევქმნ\p{L}*|გა(?:მი)?აკეთ\p{L}*|გავაკეთ\p{L}*|გააკეთ\p{L}*|დაიწყ\p{L}*|დავიწყ\p{L}*|და(?:მი)?ხატ\p{L}*|და(?:მი)?აგენერირ\p{L}*|დაგენერირ\p{L}*|გაუშვ\p{L}*|გავუშვ\p{L}*|წავიდეთ|დაადასტურ\p{L}*|ვადასტურებ|გააგრძელ\p{L}*|ააწყ\p{L}*|შეადგინ\p{L}*|make|create|generate|render|start|go|ahead|do|proceed|run|confirm|launch|сделай\p{L}*|создай\p{L}*|сгенерируй\p{L}*|нарисуй|начинай|начни|запускай|запусти|поехали|подтверждаю|делай|генерируй)$/u;

/** Words that name only what was already offered: the medium, its format, "it / now / please". */
const FILLER = /^(?:სურათ\p{L}*|ფოტო\p{L}*|გამოსახულებ\p{L}*|ნახატ\p{L}*|ვიდეო\p{L}*|ფილმ\p{L}*|კლიპ\p{L}*|მუსიკ\p{L}*|სიმღერ\p{L}*|ტრეკ\p{L}*|ფორმატ\p{L}*|ზომ\p{L}*|ვერტიკალ\p{L}*|ჰორიზონტალ\p{L}*|კვადრატ\p{L}*|ახლა|ახლავე|მინდა|გთხოვ|გთხოვთ|თუ|შეიძლება|ეს|ესე|ასე|ამ|იგი|ის|ეგ|ეგრე|მაშინ|უკვე|ერთი|ერთ|და|ჩემთვის|მე|მომეცი|ვნახოთ|it|this|that|one|now|then|the|a|an|in|as|with|for|me|picture|pictures|image|images|photo|photos|video|videos|film|clip|song|music|track|format|ratio|aspect|vertical|horizontal|square|landscape|portrait|mode|version|right|away|just|go|ahead|let's|lets|его|её|ее|это|её|сейчас|пожалуйста|в|на|мне|картинк\p{L}*|изображени\p{L}*|фото\p{L}*|видео|фильм\p{L}*|клип\p{L}*|песн\p{L}*|музык\p{L}*|трек\p{L}*|формат\p{L}*|вертикальн\p{L}*|горизонтальн\p{L}*|квадрат\p{L}*)$/u;

/**
 * A ratio the user wrote („9:16", „16x9", „1/1"), or the word for one. Only ratios the image route takes. `ratioOnly` reads
 * digits alone: a PROMPT's „vertical cliff" or „YouTube thumbnail style" names no frame, the user's short yes does.
 */
export function aspectFromText(text: string, opts?: { ratioOnly?: boolean }): ImgAspect | null {
  const s = text.normalize('NFKC').toLowerCase();
  for (const m of s.matchAll(/(?<!\d)(\d{1,2})\s*[:x×/]\s*(\d{1,2})(?!\d)/gu)) {
    const a = `${m[1]}:${m[2]}`;
    if ((IMG_ASPECTS as readonly string[]).includes(a)) return a as ImgAspect;
  }
  if (opts?.ratioOnly) return null;
  if (/ვერტიკალ|vertical|вертикальн|stories|სთორი|reels|რილს|tiktok|ტიკტოკ/u.test(s)) return '9:16';
  if (/ჰორიზონტალ|horizontal|landscape|горизонтальн|widescreen|youtube|იუთუბ/u.test(s)) return '16:9';
  if (/კვადრატ|square|квадрат/u.test(s)) return '1:1';
  return null;
}

/** The medium a short reply names, if any: „კი, ვიდეო გააკეთე" after a picture offer is not a yes to the picture. */
export function namedMedium(text: string): 'image' | 'video' | 'music' | null {
  const s = text.normalize('NFKC').toLowerCase();
  if (/ვიდეო|ფილმ|კლიპ|video|film|clip|видео|фильм|клип|ролик/u.test(s)) return 'video';
  if (/მუსიკ|სიმღერ|ტრეკ|music|song|track|музык|песн|трек/u.test(s)) return 'music';
  if (/სურათ|ფოტო|გამოსახულებ|ნახატ|image|picture|photo|картинк|изображени|фото/u.test(s)) return 'image';
  return null;
}

/** The film orientation a ratio means. */
export function orientationForAspect(a: ImgAspect): 'vertical' | 'landscape' | 'square' | 'portrait' {
  if (a === '9:16') return 'vertical';
  if (a === '1:1') return 'square';
  if (a === '4:5' || a === '3:4' || a === '2:3') return 'portrait';
  return 'landscape';
}

/**
 * Is this message the user AGREEING to what Agent G just proposed — "yes", "ok", "make it", „კი შექმენი სურათი 9:16
 * ფორმატის"? True only when every word is assent, the order verb, the medium, its format or a filler; at least one word
 * must be assent or the order. Anything that adds or changes content is not agreement.
 */
export function isConsentToStart(text: string): boolean {
  // The short yes the focus gate already knew („კარგია, დავწერე" — Production 2026-10-16) stays a yes.
  if (isAffirmation(text)) return true;
  const toks = words(text);
  if (!toks.length || toks.length > 12) return false;
  const aspect = aspectFromText(text);
  let agreed = false;
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i]!;
    const two = i + 1 < toks.length ? `${w} ${toks[i + 1]}` : '';
    const three = i + 2 < toks.length ? `${two} ${toks[i + 2]}` : '';
    if (three && ASSENT.has(three)) { agreed = true; i += 2; continue; }
    if (two && ASSENT.has(two)) { agreed = true; i += 1; continue; }
    if (ASSENT.has(w) || START.test(w)) { agreed = true; continue; }
    if (FILLER.test(w)) continue;
    // The digits of the ratio the user named („9:16" tokenises as 9 · 16).
    if (aspect && /^\d{1,2}$/u.test(w)) continue;
    return false;
  }
  return agreed;
}

/**
 * The offer leans on a photo the user gave earlier („the man in the reference image", „ამ ფოტოზე"): then the thread's
 * latest attached photo rides as the reference. An offer that names no photo uses none — a cat on a beach must not
 * inherit a portrait attached ten messages ago.
 */
export function offerUsesReference(text: string): boolean {
  return /reference|референс|რეფერენს|(?:the|this|that|attached|uploaded|your|his|her|their)\s+(?:photo|image|picture|selfie|portrait)|(?:ამ|ეს|შენს|შენი|თქვენს|თქვენი|მიმაგრებულ\p{L}*|ატვირთულ\p{L}*)\s+(?:ფოტო|სურათ|სელფ)|მიმაგრებულ|ატვირთულ|(?:этого|этом|этой|вашего|вашей|твоего|твоей|прикреплённ\p{L}*|прикрепленн\p{L}*|загруженн\p{L}*)\s+(?:фото|снимк|изображени|картинк)/iu.test(text);
}

/** The credits the offer quoted („2 კრედიტი", „2 cr", „2 credits", „2 кредита"), or null when it named none. */
export function quotedCredits(text: string): number | null {
  let last: number | null = null;
  for (const m of text.matchAll(/(\d{1,5})\s*(?:კრედიტ\p{L}*|credits?|cr(?![\p{L}])|кредит\p{L}*)/giu)) last = Number(m[1]);
  return last;
}

/**
 * The photo the user attached most recently in this thread (within the last `within` messages): what „the reference
 * image" of an offer means. The bytes live only in this tab (a reloaded thread keeps the file's name, not its bytes), so
 * after a reload there is none and the offer runs without it.
 */
export function latestThreadPhoto(
  msgs: ReadonlyArray<{ role: string; medias?: ReadonlyArray<{ dataUrl: string; mimeType: string }> }>,
  within = 30,
): string | undefined {
  for (let i = msgs.length - 1, seen = 0; i >= 0 && seen < within; i--, seen++) {
    const m = msgs[i]!;
    if (m.role !== 'user' || !m.medias?.length) continue;
    const photo = [...m.medias].reverse().find((f) => f.mimeType.startsWith('image/') && !!f.dataUrl);
    if (photo) return photo.dataUrl;
  }
  return undefined;
}
