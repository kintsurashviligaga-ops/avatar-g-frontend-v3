/**
 * lib/voice/livePlanner.ts — Live Voice → Agent G's planner (Phase 8.10, area 6). PURE.
 *
 * WHAT MAIN DOES: a call has `prepare_generation` (one studio, one prompt, price spoken, nothing spent) and
 * `start_generation` (only on the user's OWN spoken yes, checked against the transcript, then a 3 s countdown), and
 * `ask_agent_g` for web tasks. Barge-in already works: the call's local VAD cuts the avatar's audio when the user speaks
 * (useGeminiLiveSession / VoiceConversation). What a call could NOT do: take a compound spoken order („ჯერ სურათი
 * გააკეთე, მერე მისგან ვიდეო და ბოლოს მუსიკა") as one plan, say that plan back in Georgian before anything runs, and
 * refuse a step whose service is not open (3D, App Builder) instead of guessing a picture.
 *
 * `plan_agent_task` (only with LIVE_AGENT_PLANNER=1 on the voice route): the call hands the user's exact words here; the
 * answer is the ordered steps and ONE spoken line (`speak`) the model reads back before anything happens. It starts
 * nothing and prices nothing: each paid step still goes prepare_generation → price said → the user's own yes →
 * start_generation, exactly as today. Reading uses Router v2 (lib/agent/router/subAgents), the same as the typed chat.
 */
import { routeV2, splitAsk, nounsIn, ownerOf, isOpen, clarifyText, closedText, SUB_AGENTS, type FlagReader, type SubAgentId } from '../agent/router/subAgents';
import { langOf } from '../agent/intent';
import type { Lang } from '../agent/contracts';
import type { LiveStudioTool } from './liveTools';
import type { LiveDeclaration } from './geminiLive';

export const PLAN_AGENT_TASK = 'plan_agent_task' as const;
export const LIVE_PLAN_REQUEST_MAX_CHARS = 2000;

/** The Live function declaration (Gemini Live `functionDeclarations` shape). */
export const PLAN_AGENT_TASK_DECLARATION: Readonly<LiveDeclaration> = Object.freeze<LiveDeclaration>({
  name: PLAN_AGENT_TASK,
  description:
    'Plan a spoken order BEFORE doing it. Call it with the user\'s exact words whenever they ask for two or more things in '
    + 'one go ("first an image, then a video from it"), or for something you are not sure which studio makes. It returns '
    + 'the steps in order and a line to say aloud. It starts nothing and charges nothing.',
  parameters: {
    type: 'OBJECT',
    properties: {
      request: { type: 'STRING', description: `The user's own words, unchanged (at most ${LIVE_PLAN_REQUEST_MAX_CHARS} characters).` },
    },
    required: ['request'],
  },
});

/** Appended to the call's instructions when the planner is declared. */
export const LIVE_PLANNER_RULE = [
  'PLANNING: when the user asks for two or more things in one go, or you are unsure which studio fits, call plan_agent_task',
  'with their exact words first. Say its `speak` line aloud, in full, and wait. Only after the user agrees, do step 1 with',
  'prepare_generation (or ask_agent_g when the step says so); say its price and wait for their own yes before',
  'start_generation. Then the next step, the same way: every paid step needs its own price and its own yes. Never skip a',
  'step marked not_available and never make something else in its place.',
].join(' ');

export type PlanHow = 'prepare_generation' | 'ask_agent_g' | 'not_available';

export interface LivePlanStep {
  n: number;
  service: string;
  /** The studio prepare_generation takes, when the step is a studio render. */
  studio?: LiveStudioTool;
  /** The words of this step, for prepare_generation's prompt / ask_agent_g's task. */
  words: string;
  how: PlanHow;
}

export type LivePlanAnswer =
  | { ok: true; steps: LivePlanStep[]; speak: string; next: string }
  | { ok: false; error: 'needs_detail' | 'not_available' | 'invalid_args'; speak: string; message: string };

/** Which call function reaches each sub-agent. 3D, App Builder and Smart Editor have no voice path (chat only). */
const STUDIO: Partial<Record<SubAgentId, LiveStudioTool>> = {
  video: 'video', 'directors-workflow': 'video', image: 'image', 'art-director': 'image',
  music: 'music', 'music-producer': 'music', avatar: 'avatar', presentation: 'presentation',
};

function howOf(agent: SubAgentId, open: FlagReader): { how: PlanHow; studio?: LiveStudioTool } {
  if (!isOpen(agent, open)) return { how: 'not_available' };
  if (agent === 'web-search') return { how: 'ask_agent_g' };
  const studio = STUDIO[agent];
  return studio ? { how: 'prepare_generation', studio } : { how: 'not_available' };
}

const L = (lang: Lang, ka: string, en: string, ru: string): string => (lang === 'en' ? en : lang === 'ru' ? ru : ka);

/** A step's words without the joining words around it („ჯერ …", "… და", "then …"), for its prompt. */
export function cleanWords(t: string): string {
  return t
    .replace(/^\s*(?:ჯერ|პირველ\s+რიგში|მერე|შემდეგ|ბოლოს|first|then|and\s+then|finally|сначала|потом|затем|в\s+конце)[\s,]+/iu, '')
    .replace(/[\s,]+(?:და|and|и|ხოლო)\s*$/iu, '')
    .trim();
}

/** One spoken line: no lists, no Markdown, no numbers to read out — the call speaks it as it is. */
export function spokenPlan(steps: readonly LivePlanStep[], lang: Lang): string {
  // "Image" → "image" mid-sentence; "3D Studio" and Georgian (no case) stay as they are.
  const name = (s: LivePlanStep) => s.service.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase());
  const order = steps.map((s, i) => {
    const lead = i === 0
      ? L(lang, 'ჯერ', 'first', 'сначала')
      : i === steps.length - 1 && steps.length > 2 ? L(lang, 'ბოლოს', 'and last', 'и в конце') : L(lang, 'შემდეგ', 'then', 'потом');
    const off = s.how === 'not_available' ? L(lang, ' (ეს ზარში ჯერ არ შემიძლია)', ' (which I can\'t do in a call yet)', ' (это в звонке я пока не могу)') : '';
    return `${lead} ${name(s)}${off}`;
  }).join(', ');
  const anyOff = steps.some((s) => s.how === 'not_available');
  const head = L(lang, `გეგმა ასეთია: ${order}.`, `Here is the plan: ${order}.`, `План такой: ${order}.`);
  const tail = anyOff
    ? L(lang,
      'იმ ნაბიჯს, რომელსაც ვერ ვაკეთებ, გამოვტოვებ და მის ნაცვლად სხვას არაფერს გავაკეთებ. დანარჩენით დავიწყო? თითოეულს ჯერ ფასს გეტყვი.',
      'I\'ll skip the step I can\'t do and won\'t make anything else in its place. Shall I start the rest? I\'ll tell you each price first.',
      'Шаг, который я не могу, пропущу и ничего другого вместо него не сделаю. Начать остальное? Цену каждого шага скажу заранее.')
    : L(lang,
      'ჯერ არაფერი დაწყებულა. თითოეულ ნაბიჯს ჯერ ფასს გეტყვი და დავიწყებ მხოლოდ შენი „კი"-ს შემდეგ. დავიწყო პირველით?',
      'Nothing has started yet. I\'ll tell you the price of each step and start it only after your yes. Shall I begin with the first?',
      'Пока ничего не запущено. Цену каждого шага скажу заранее и начну только после вашего «да». Начать с первого?');
  return `${head} ${tail}`;
}

/**
 * The answer to one plan_agent_task call. Never throws; never starts or prices anything.
 * `open` says which sub-agent flags are open for this user (default: all closed, like Router v2).
 */
export function planSpokenTask(args: unknown, open: FlagReader = () => false, locale?: string): LivePlanAnswer {
  const raw = args && typeof args === 'object' ? (args as { request?: unknown }).request : undefined;
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'invalid_args', speak: '', message: 'request must be the user\'s own words.' };
  }
  const request = raw.replace(/[\u0000-\u0008\u000B-\u001F‪-‮⁦-⁩]/g, '').trim().slice(0, LIVE_PLAN_REQUEST_MAX_CHARS);
  const r = routeV2({ text: request, open, locale });
  const lang: Lang = langOf(request, locale);

  if (r.kind === 'clarify') {
    return { ok: false, error: 'needs_detail', speak: clarifyText(r.options, lang), message: 'Ask the user this, then call plan_agent_task again with their answer.' };
  }
  if (r.kind === 'closed') {
    return { ok: false, error: 'not_available', speak: closedText(r.agent, lang), message: 'Say this. Do not prepare anything else in its place.' };
  }

  let parts: Array<{ agent: SubAgentId; words: string }> = [];
  if (r.kind === 'chain') parts = r.steps.map((s) => ({ agent: s.agent, words: s.text }));
  else if (r.kind === 'route') parts = [{ agent: r.agent, words: request }];
  else {
    // `keep`: the chat lanes read it already. One named service is still one step; nothing named = ask.
    const named = splitAsk(request).map((p) => ({ p, id: nounsIn(p)[0] })).filter((x): x is { p: string; id: SubAgentId } => !!x.id);
    parts = named.length ? named.map((x) => ({ agent: ownerOf(x.id, open), words: x.p })) : [];
    if (!parts.length) {
      return { ok: false, error: 'needs_detail', speak: clarifyText(['video', 'image', 'music', 'avatar', 'presentation'], lang), message: 'Nothing to plan: ask what to make.' };
    }
  }

  const steps: LivePlanStep[] = parts.map((p, i) => ({ n: i + 1, service: SUB_AGENTS[p.agent].name[lang], words: cleanWords(p.words) || p.words, ...howOf(p.agent, open) }));
  const first = steps.find((s) => s.how !== 'not_available');
  const next = first
    ? `After the user agrees, step ${first.n}: ${first.how === 'ask_agent_g' ? `ask_agent_g with task "${first.words}"` : `prepare_generation with tool "${first.studio}" and the prompt from "${first.words}"`}; say its price and wait for their own yes.`
    : 'No step can run in a call: say so and offer the chat.';
  return { ok: true, steps, speak: spokenPlan(steps, lang), next };
}
