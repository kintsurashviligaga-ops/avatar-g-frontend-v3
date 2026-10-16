/**
 * The prompt Agent G OFFERED in its own words, so a "yes" to it opens the tool instead of a second chat reply.
 *
 * ⚠️ PRODUCTION 2026-10-16 (GG's iPhone): Agent G wrote an image prompt in quotes, asked "რას იტყვი, დავიწყოთ
 * გენერაცია?", the user answered "კარგია, დავწერე" — and the chat model answered "სისტემა უკვე ამუშავებს შენს მოთხოვნას"
 * although no tool ever ran. The client's "yes" handling only knew the questions its OWN card asked (gatePendingRef), so
 * the yes went back to the model, which can start nothing and made up a running job. Now a short yes right after such an
 * offer is caught here: the studio shows the offered prompt on Agent G's priced card, and only its Create tap renders.
 */
import type { GateMode } from './focusGate';

export interface OfferedPrompt {
  mode: Exclude<GateMode, 'avatar'>;
  prompt: string;
}

// Straight, curly, Georgian low-high and guillemet quotes. The opening and closing marks may differ („…“, "…”).
const QUOTED = /["“„«]([^"“”„«»]{12,2000})["”“»]/gu;

// The reply ends by asking whether to go ahead (ka · en · ru).
const START_QUESTION = /(დავიწყოთ|დავაგენერირო|დავაგენერიროთ|შევქმნა|შევქმნათ|გენერაცი|დავხატო|start|generate|create|make it|go ahead|начн[её]м|запуска|генерир|созда)[^?]*\?\s*$/iu;

const MODE_WORDS: ReadonlyArray<[OfferedPrompt['mode'], RegExp]> = [
  ['video', /ვიდეო|ფილმ|კლიპ|\bvideo\b|\bfilm\b|\bclip\b|видео|ролик|фильм/iu],
  ['music', /მუსიკ|სიმღერ|მელოდი|\bmusic\b|\bsong\b|\btrack\b|музык|песн|трек/iu],
  ['image', /სურათ|ფოტო|გამოსახულებ|ნახატ|პოსტერ|\bimage\b|\bpicture\b|\bphoto\b|\bposter\b|изображен|картин|фото|постер/iu],
];

/**
 * The quoted prompt of an assistant reply that ends by asking to start, with the tool it is for. `fallback` is the tool
 * the user is already in (or null): it decides when the reply names no medium. Null when the reply offers nothing.
 */
export function offeredPrompt(reply: string, fallback: OfferedPrompt['mode'] | null = null): OfferedPrompt | null {
  const text = reply.trim();
  if (!START_QUESTION.test(text)) return null;
  let prompt: string | null = null;
  for (const m of text.matchAll(QUOTED)) prompt = m[1]!.trim();
  if (!prompt || prompt.split(/\s+/u).length < 3) return null;
  const context = text.replace(prompt, ' ');
  const hit = MODE_WORDS.find(([, re]) => re.test(context)) ?? MODE_WORDS.find(([, re]) => re.test(prompt!));
  const mode = hit?.[0] ?? fallback;
  return mode ? { mode, prompt } : null;
}
