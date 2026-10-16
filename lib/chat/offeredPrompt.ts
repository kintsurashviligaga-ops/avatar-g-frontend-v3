/**
 * The prompt Agent G OFFERED in its own words, so a "yes" to it opens the tool instead of a second chat reply.
 *
 * ⚠️ PRODUCTION 2026-10-16 (GG's iPhone): Agent G wrote an image prompt in quotes, asked "რას იტყვი, დავიწყოთ
 * გენერაცია?", the user answered "კარგია, დავწერე" — and the chat model answered "სისტემა უკვე ამუშავებს შენს მოთხოვნას"
 * although no tool ever ran. The client's "yes" handling only knew the questions its OWN card asked (gatePendingRef), so
 * the yes went back to the model, which can start nothing and made up a running job. Now a yes right after such an offer
 * is caught here. GG's rule (2026-10-16 18:21Z): once Agent G has clarified and the user agrees, generation starts — so the
 * studio starts the offered prompt at once when the reply quoted the price it really costs, and shows Agent G's priced card
 * (whose next yes starts it) when the reply named no price or a wrong one.
 */
import type { GateMode } from './focusGate';
import { quotedCredits } from './chatConsent';

export interface OfferedPrompt {
  mode: Exclude<GateMode, 'avatar'>;
  prompt: string;
  /** The credits the reply quoted for it, when it named a price (lib/chat/chatConsent quotedCredits). */
  credits?: number;
}

// Straight, curly, Georgian low-high and guillemet quotes. The opening and closing marks may differ („…“, "…”).
const QUOTED = /["“„«]([^"“”„«»]{12,2000})["”“»]/gu;

// The reply ends by asking whether to go ahead (ka · en · ru). „დავიწყო?" ("shall I start?") is what the chat prompt asks for.
const START_QUESTION = /(დავიწყო|გავუშვა|გავაკეთო|გინდა|გსურს|გსურთ|want|хоти|хочеш|დავაგენერირო|დავაგენერიროთ|შევქმნა|შევქმნათ|გენერაცი|დავხატო|start|generate|create|make it|go ahead|начн[её]м|запуска|генерир|созда)[^?]*\?\s*$/iu;

const MODE_WORDS: ReadonlyArray<[OfferedPrompt['mode'], RegExp]> = [
  ['video', /ვიდეო|ფილმ|კლიპ|\bvideo\b|\bfilm\b|\bclip\b|видео|ролик|фильм/iu],
  ['music', /მუსიკ|სიმღერ|მელოდი|\bmusic\b|\bsong\b|\btrack\b|музык|песн|трек/iu],
  ['image', /სურათ|ფოტო|გამოსახულებ|ნახატ|პოსტერ|პორტრეტ|\bportrait\b|портрет|\bimage\b|\bpicture\b|\bphoto\b|\bposter\b|изображен|картин|фото|постер/iu],
];

/**
 * The quoted prompt of an assistant reply that ends by asking to start, with the tool it is for. `fallback` is the tool
 * the user is already in (or null): it decides when the reply names no medium. Null when the reply offers nothing.
 */
export function offeredPrompt(reply: string, fallback: OfferedPrompt['mode'] | null = null): OfferedPrompt | null {
  const text = reply.trim();
  let prompt: string | null = null;
  let tail = '';
  for (const m of text.matchAll(QUOTED)) { prompt = m[1]!.trim(); tail = text.slice((m.index ?? 0) + m[0].length); }
  if (!prompt || prompt.split(/\s+/u).length < 3) return null;
  // A quoted prompt with its PRICE after it is an offer too (Production 2026-10-16: the reply ended on „(ფასი: 2 კრედიტი /
  // 0.20 ₾)." with no question, and GG's „კი" to it went nowhere).
  const priced = quotedCredits(tail);
  if (!START_QUESTION.test(text) && priced === null) return null;
  const context = text.replace(prompt, ' ');
  const credits = priced ?? quotedCredits(context);
  const hit = MODE_WORDS.find(([, re]) => re.test(context)) ?? MODE_WORDS.find(([, re]) => re.test(prompt!));
  const mode = hit?.[0] ?? fallback;
  return mode ? { mode, prompt, ...(credits !== null ? { credits } : {}) } : null;
}
