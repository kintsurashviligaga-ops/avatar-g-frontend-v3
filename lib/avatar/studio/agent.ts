/**
 * lib/avatar/studio/agent.ts — Agent G: "Make a presentation from this script: …" (ka / en / ru). Pure.
 *
 * Turns the sentence into a Studio request (the script, and the presenter / voice / format it names) and its plan, so
 * the chat shows ONE storyboard card with every scene's price before anything is charged. Nothing here calls anything.
 *
 * Asked:   a presentation / presenter video / avatar video + a script or text (or „პრეზენტაცია … ტექსტი/სცენარი",
 *          „презентация … текст/сценарий"), with the script after a colon, a new line, or in quotes.
 * Hints:   female / ქალი / женщина → Kira · male / კაცი / мужчина → Ben · casual / ყოველდღიური / повседнев → Leo ·
 *          cinematic / კინო / кино → the first Cinematic face · a voice name (Algieba, Kore …) · vertical / 9:16.
 */
import { OMNI_PRESENTERS, VOICES, presenterById } from './catalog';
import { buildStudioPlan, type StudioPlan, type StudioRequest } from './plan';
import type { StudioBook } from './price';

const ASK = [
  /\b(presentation|presenter video|avatar video|talking[- ]head video)\b/i,
  /პრეზენტაცი|წამყვან(ის|ით)?\s*ვიდეო|ავატარ(ის|ით)?\s*ვიდეო/,
  /презентаци|видео\s+с\s+ведущ|видео\s+с\s+аватар/i,
];
const SCRIPT_WORD = /\b(script|text|this)\b|სცენარ|ტექსტ|ამ\b|сценари|текст|этот|этого/i;
export const MIN_SCRIPT_CHARS = 40;

export interface StudioAsk { request: StudioRequest; hints: string[] }

/** The script: a quoted block, else what follows the first colon or new line after the ask. */
export function extractScript(text: string): string | null {
  const quoted = /[«„"“]([\s\S]{20,}?)[»“"”]\s*$/.exec(text.trim());
  if (quoted) return quoted[1]!.trim();
  const m = /[:：]\s*([\s\S]+)$/.exec(text) ?? /\n\s*([\s\S]+)$/.exec(text);
  const s = m?.[1]?.trim() ?? '';
  return s.length >= MIN_SCRIPT_CHARS ? s : null;
}

/** null when the line does not ask for a presentation. `request.script` is '' when it asks without a script yet. */
export function parseStudioAsk(text: string): StudioAsk | null {
  const t = (text ?? '').trim();
  if (!t || !ASK.some((r) => r.test(t)) || !SCRIPT_WORD.test(t)) return null;
  const script = extractScript(t) ?? '';
  const head = (script ? t.slice(0, t.length - script.length) : t).toLowerCase();
  const hints: string[] = [];
  let presenterId = 'live-kira';
  if (/\b(cinematic|film look)\b|კინო|кино/i.test(head)) { presenterId = OMNI_PRESENTERS[0]!.id; hints.push('cinematic'); }
  else if (/\bcasual\b|ყოველდღიურ|повседнев/i.test(head)) { presenterId = 'live-leo'; hints.push('casual'); }
  else if (/\b(male|man)\b|კაც|мужчин|мужск/i.test(head)) { presenterId = 'live-ben'; hints.push('male'); }
  else if (/\b(female|woman)\b|ქალ|женщин|женск/i.test(head)) { presenterId = 'live-kira'; hints.push('female'); }
  const presenter = presenterById(presenterId)!;
  const named = VOICES.find((v) => new RegExp(`\\b${v.id}\\b`, 'i').test(head));
  if (named) hints.push(`voice:${named.id}`);
  const vertical = /\b(vertical|portrait|9:16|reels?|tiktok|shorts)\b|ვერტიკალ|вертикал/i.test(head);
  const request: StudioRequest = {
    script,
    presenterId,
    voiceId: named ? named.id : presenter.engine === 'live' ? presenter.defaultVoice : null,
    tone: 'friendly',
    pace: 'natural',
    ...(vertical ? { format: '9:16' as const } : /\b(16:9|wide|landscape|youtube)\b|ჰორიზონტ|горизонт/i.test(head) ? { format: '16:9' as const } : {}),
  };
  return { request, hints };
}

export type AgentStudioPlan =
  | { ok: true; request: StudioRequest; plan: StudioPlan; hints: string[] }
  | { ok: false; reason: 'not_presentation' | 'no_script' | string; detail?: string; request?: StudioRequest };

export function planAgentPresentation(text: string, ctx: { book: StudioBook }): AgentStudioPlan {
  const ask = parseStudioAsk(text);
  if (!ask) return { ok: false, reason: 'not_presentation' };
  if (!ask.request.script) return { ok: false, reason: 'no_script', request: ask.request };
  const built = buildStudioPlan(ask.request, { book: ctx.book });
  if (!built.ok) return { ok: false, reason: built.reason, detail: built.detail, request: ask.request };
  return { ok: true, request: ask.request, plan: built.plan, hints: ask.hints };
}
