/**
 * lib/agent/router/subAgents.ts — Agent G Router v2 (Phase 8.10). PURE, ka · en · ru, safe on the client, no network.
 *
 * WHY (static audit 2026-11-20, probes against classifyAgentIntent on main 684c0ff):
 *   · „გააკეთე რამე მაგარი" ("make something cool") and "make it" were read as image.generate: Agent G GUESSED a picture
 *     instead of asking what to make.
 *   · „შექმენი ვებგვერდი ჩემი კაფესთვის" ("make a website for my café") was read as image.generate: there is no App
 *     Builder lane, so the website became a picture prompt.
 *   · „შექმენი ჩემი ლოგოს 3D მოდელი და მერე ვიდეო გააკეთე" (3D, then a video of it) kept ONLY the 3D ask, and in the
 *     chat OmniStudio's isVideoCreationAsk regex sees „შექმენ … ვიდეო" first and opens a video clip: the 3D step is lost.
 *   · „ვიდეო თუ სურათი გამიკეთე კატაზე" ("a video or a picture of a cat") fell through to the chat model.
 *
 * WHAT THIS ADDS. One more reading ON TOP of classifyAgentIntent (it never replaces it):
 *   1. A compound ask (two services joined by „და მერე" / "and then" / «а потом» …) → an ordered chain, each step with
 *      its own sub-agent. Nothing runs: the chat says the plan and asks before step 1 (every charge still needs its own
 *      price card, lib/agent/contracts AgentApproval).
 *   2. A vague ask (a make-verb and nothing to make) or an either/or between two services → ONE clarifying question.
 *   3. A website / app ask → the App Builder sub-agent (draft PR #312, AGENT_APP_BUILDER, admin-only), never a picture.
 *   4. Every other act → which sub-agent owns it (Director's Workflow, Art Director, 3D Studio, Smart Editor, Music
 *      Producer…), and whether that sub-agent is OPEN for this user (its flag): a closed one is said honestly.
 *
 * FLAG. The whole module is read only when NEXT_PUBLIC_AGENT_G_ROUTER_V2=1 (lib/agent/chatTurn ChatSnapshot.routerV2).
 * Off (the default), the chat behaves exactly as on main.
 */
import { classifyAgentIntent, langOf } from '../intent';
import type { AgentIntent, AttachmentKind, CapabilityId, Lang } from '../contracts';

/** The specialists Agent G hands work to. `chat` = the chat model answers (web search is grounded there). */
export type SubAgentId =
  | 'video' | 'directors-workflow' | 'image' | 'art-director' | 'studio3d' | 'presentation' | 'music' | 'music-producer'
  | 'avatar' | 'smart-editor' | 'app-builder' | 'web-search' | 'chat';

export interface SubAgentInfo {
  /** The env flag that opens it (null = part of main, always routed). */
  flag: string | null;
  /** The draft PR that builds it, when it is not on main yet. */
  draftPr: number | null;
  name: Record<Lang, string>;
}

export const SUB_AGENTS: Readonly<Record<SubAgentId, SubAgentInfo>> = {
  video: { flag: null, draftPr: null, name: { ka: 'ვიდეო', en: 'Video', ru: 'Видео' } },
  'directors-workflow': { flag: 'DIRECTORS_WORKFLOW', draftPr: 349, name: { ka: 'რეჟისორის რეჟიმი', en: 'Director\'s Workflow', ru: 'Режиссёрский режим' } },
  image: { flag: null, draftPr: null, name: { ka: 'სურათი', en: 'Image', ru: 'Изображение' } },
  'art-director': { flag: 'NEXT_PUBLIC_IMAGE_ART_DIRECTOR', draftPr: 356, name: { ka: 'არტ-დირექტორი', en: 'Art Director', ru: 'Арт-директор' } },
  studio3d: { flag: 'NEXT_PUBLIC_STUDIO_3D_V2', draftPr: 366, name: { ka: '3D სტუდია', en: '3D Studio', ru: '3D-студия' } },
  presentation: { flag: null, draftPr: null, name: { ka: 'პრეზენტაცია', en: 'Presentation', ru: 'Презентация' } },
  music: { flag: null, draftPr: null, name: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' } },
  'music-producer': { flag: 'MUSIC_PRODUCER_V2', draftPr: 359, name: { ka: 'მუსიკის პროდიუსერი', en: 'Music Producer', ru: 'Музыкальный продюсер' } },
  avatar: { flag: null, draftPr: null, name: { ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' } },
  'smart-editor': { flag: 'NEXT_PUBLIC_MONTAGE_SMART_EDITOR', draftPr: 365, name: { ka: 'ჭკვიანი მონტაჟი', en: 'Smart Editor', ru: 'Умный монтаж' } },
  'app-builder': { flag: 'AGENT_APP_BUILDER', draftPr: 312, name: { ka: 'აპლიკაციის შემქმნელი', en: 'App Builder', ru: 'Конструктор приложений' } },
  'web-search': { flag: null, draftPr: null, name: { ka: 'ინტერნეტში ძიება', en: 'Web search', ru: 'Поиск в интернете' } },
  chat: { flag: null, draftPr: null, name: { ka: 'ჩატი', en: 'Chat', ru: 'Чат' } },
};

// ─── Words ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const B0 = '(?<![\\p{L}\\p{N}])';
const re = (s: string) => new RegExp(s, 'iu');

/** Service nouns, in the order a chain is read. `studio3d` first: „3D ვიდეო" is a 3D ask that ends in a video. */
const NOUNS: ReadonlyArray<{ id: SubAgentId; re: RegExp }> = [
  { id: 'studio3d', re: re(`${B0}(?:3\\s?d|3\\s?დ|3\\s?д)(?![\\p{N}])|სამ\\s?განზომილებ|трёхмерн|трехмерн|three[-\\s]dimensional`) },
  { id: 'app-builder', re: re(`ვებ\\s?გვერდ|ვებ\\s?საიტ|${B0}საიტ|აპლიკაცი|${B0}(?:website|web\\s?site|landing\\s?page|web\\s?app|app|application)(?![\\p{L}])|${B0}сайт|приложени|лендинг`) },
  { id: 'presentation', re: re(`პრეზენტაცი|სლაიდ|${B0}(?:presentation|slides?|slide\\s?deck|deck)(?![\\p{L}])|презентаци|слайд`) },
  { id: 'video', re: re(`ვიდეო|ფილმ|${B0}კლიპ|${B0}(?:video|film|clip|movie|reel)s?(?![\\p{L}])|видео|фильм|ролик|${B0}клип`) },
  { id: 'music', re: re(`მუსიკ|სიმღერ|${B0}(?:music|song|soundtrack|track)s?(?![\\p{L}])|музык|песн|${B0}трек`) },
  { id: 'avatar', re: re(`ავატარ|${B0}avatar|аватар|talking\\s+head`) },
  { id: 'image', re: re(`სურათ|ფოტო|ნახატ|ილუსტრაცი|დამიხატე|დახატე|${B0}(?:image|picture|photo|drawing|illustration|poster)s?(?![\\p{L}])|${B0}draw(?![\\p{L}])|картинк|изображени|${B0}фото|рисун|нарисуй|постер`) },
  // Phase 8.10 (voice planner): a search step in a chain („მოძებნე …, მერე პრეზენტაცია"). It only counts when the part
  // names no service (see nounsIn), so "find me a photo" is still an image ask.
  { id: 'web-search', re: re(`მოძებნ|მოიძიე|ინტერნეტში|გუგლში|${B0}(?:search\\s+(?:the\\s+)?(?:web|internet|online)|look\\s+up|google)(?![\\p{L}])|в\\s+интернете|${B0}найди|${B0}поищи|загугли`) },
];

const MAKE = /გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დამიგენერირ|დააგენერირ|დამიმზად|ამიწყ|ააწყ|გადააქციე|აქციე|დამიხატე|დახატე|make|create|generate|build|produce|turn\s+(?:it|this|that)\s+into|draw|сделай|создай|сгенерируй|собери|преврати|нарисуй/iu;

/** Words that join two asks in order. A bare „და" / "and" only counts when a make-verb follows it. */
const THEN = /\s*(?:,\s*)?(?:და\s+მერე|და\s+შემდეგ|ხოლო\s+შემდეგ|მერე|შემდეგ|ბოლოს|and\s+then|then|after\s+that|afterwards|и\s+потом|а\s+потом|затем|после\s+этого|потом)\s+/iu;
const AND_MAKE = new RegExp(`\\s*(?:,\\s*)?(?:და|and|и)\\s+(?=(?:\\S+\\s+){0,3}?(?:${MAKE.source}))`, 'iu');

/** Words that carry no subject: „რამე", "something", «что-нибудь», "it", „მაგარი"… */
const VAGUE = new Set([
  'რამე', 'რაიმე', 'რამეს', 'რაღაც', 'რაღაცა', 'მაგარი', 'კარგი', 'ლამაზი', 'საინტერესო', 'ეს', 'ის', 'ამას', 'მაგას', 'მე', 'მომიწყე',
  'something', 'anything', 'stuff', 'thing', 'it', 'this', 'that', 'cool', 'nice', 'good', 'awesome', 'interesting', 'me', 'for', 'a', 'an', 'the', 'some', 'please', 'pls',
  'что-нибудь', 'что-то', 'кое-что', 'нибудь', 'это', 'крутое', 'классное', 'красивое', 'интересное', 'мне', 'пожалуйста',
  'გთხოვ', 'ახლა', 'now',
]);

const EITHER = /\s+(?:თუ|ან|or|или)\s+/iu;

const words = (t: string): string[] => t.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);

/** The sub-agents a piece of text names, in the order they appear. */
export function nounsIn(text: string): SubAgentId[] {
  const hits: Array<{ id: SubAgentId; at: number }> = [];
  for (const n of NOUNS) {
    const m = n.re.exec(text);
    if (m) hits.push({ id: n.id, at: m.index });
  }
  // „3D ვიდეო" / "3D video" is ONE 3D ask (a turntable), not 3D then video, when the two are next to each other.
  const sorted = hits.sort((a, b) => a.at - b.at).map((h) => h.id);
  // A search word next to a service noun is about that service ("find me a photo" is an image ask).
  return sorted.length > 1 ? sorted.filter((id) => id !== 'web-search') : sorted;
}

/** Is the ask a make-verb with nothing to make? („გააკეთე რამე მაგარი", "make it", «сделай что-нибудь») */
export function isVagueAsk(text: string): boolean {
  if (!MAKE.test(text) || nounsIn(text).length) return false;
  const rest = words(text).filter((w) => !MAKE.test(w));
  return rest.every((w) => VAGUE.has(w));
}

// ─── The capability → sub-agent map ───────────────────────────────────────────────────────────────────────────────────

const CAP_AGENT: Partial<Record<CapabilityId, SubAgentId>> = {
  'video.generate': 'video', 'video.music-video': 'video', 'image.generate': 'image', 'design.model3d': 'studio3d',
  'design.presentation': 'presentation', 'music.generate': 'music', 'avatar.talking': 'avatar', 'video.editing': 'smart-editor',
  'research.web-search': 'web-search',
};

/** Specialists that take over a base lane when their flag is on (the base lane is used otherwise). */
const UPGRADE: Partial<Record<SubAgentId, SubAgentId>> = {
  video: 'directors-workflow', image: 'art-director', music: 'music-producer',
};

export type FlagReader = (flag: string) => boolean;

/** The sub-agent that owns this lane for this user: the specialist when its flag is open, else the base lane. */
export function ownerOf(base: SubAgentId, open: FlagReader): SubAgentId {
  const up = UPGRADE[base];
  return up && open(SUB_AGENTS[up].flag!) ? up : base;
}

/** Can this sub-agent take work for this user now? */
export const isOpen = (id: SubAgentId, open: FlagReader): boolean => {
  const f = SUB_AGENTS[id].flag;
  return f === null ? true : open(f);
};

// ─── The reading ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ChainStep { agent: SubAgentId; text: string; open: boolean }

export type RouteV2 =
  /** Nothing to add: the existing planChatTurn reading stands. */
  | { kind: 'keep'; intent: AgentIntent }
  /** Ask before guessing. `options`: the sub-agents the question offers. */
  | { kind: 'clarify'; options: SubAgentId[]; lang: Lang; intent: AgentIntent }
  /** Two or more asks in order: say the plan, start nothing. */
  | { kind: 'chain'; steps: ChainStep[]; lang: Lang; intent: AgentIntent }
  /** One ask whose sub-agent is not open yet: say so instead of making the wrong thing. */
  | { kind: 'closed'; agent: SubAgentId; lang: Lang; intent: AgentIntent }
  /** One ask, routed. */
  | { kind: 'route'; agent: SubAgentId; intent: AgentIntent };

export interface RouteInput {
  text: string;
  attachments?: readonly AttachmentKind[];
  mode?: string;
  locale?: string;
  /** Is this env flag open for this user? Default: everything closed. */
  open?: FlagReader;
}

const CLOSED: FlagReader = () => false;

/** Split a compound ask into its parts, in order. One part = not compound. */
export function splitAsk(text: string): string[] {
  const parts = text.split(THEN).flatMap((p) => p.split(AND_MAKE)).map((p) => p.trim()).filter(Boolean);
  // Only parts that name or make something count; a trailing „please" is not a step.
  return parts.filter((p) => nounsIn(p).length > 0 || MAKE.test(p));
}

/** One message → what Router v2 adds. Never spends, never starts anything. */
export function routeV2(input: RouteInput): RouteV2 {
  const text = String(input.text ?? '').trim();
  const open = input.open ?? CLOSED;
  const intent = classifyAgentIntent({ text, attachments: input.attachments ?? [], mode: input.mode, locale: input.locale });
  const lang = langOf(text, input.locale);
  // Talk, questions, feedback and stop/status/continue are read well already; a focus tool keeps its own gate.
  if (intent.kind !== 'act' && intent.kind !== 'chat') return { kind: 'keep', intent };
  if (input.mode && input.mode !== 'chat') return { kind: 'keep', intent };
  // An ask about attached files (edits, montage, MP3, analysis) is the existing lanes' — they read the files.
  if ((input.attachments ?? []).some((k) => k === 'video' || k === 'audio')) return { kind: 'keep', intent };

  // 1) Either/or between two services: ask which.
  const either = text.split(EITHER);
  if (either.length === 2) {
    const a = nounsIn(either[0]!).at(-1);
    const b = nounsIn(either[1]!)[0];
    if (a && b && a !== b) return { kind: 'clarify', options: [a, b], lang, intent };
  }

  // 2) A compound ask: two different services in order.
  const parts = splitAsk(text);
  if (parts.length >= 2) {
    const steps: ChainStep[] = [];
    for (const p of parts) {
      const id = nounsIn(p)[0];
      if (!id) continue;
      const agent = ownerOf(id, open);
      if (steps.at(-1)?.agent === agent) continue;
      steps.push({ agent, text: p, open: isOpen(agent, open) });
    }
    if (steps.length >= 2) return { kind: 'chain', steps, lang, intent };
  }

  // 3) A make-verb and nothing to make: ask, never guess a picture.
  if (isVagueAsk(text)) return { kind: 'clarify', options: ['video', 'image', 'studio3d', 'presentation', 'music'], lang, intent };

  // 4) One ask: the noun the words name first wins over a guessed image lane (a website is not a picture).
  const named = nounsIn(text)[0];
  const fromIntent = intent.kind === 'act' ? CAP_AGENT[intent.capability] : undefined;
  const base = named === 'app-builder' && MAKE.test(text) ? 'app-builder' : fromIntent ?? (MAKE.test(text) ? named : undefined);
  if (!base) return { kind: 'keep', intent };
  const agent = ownerOf(base, open);
  if (!isOpen(agent, open)) return { kind: 'closed', agent, lang, intent };
  return { kind: 'route', agent, intent };
}

// ─── What the chat says ─────────────────────────────────────────────────────────────────────────────────────────────

const L = (lang: Lang, ka: string, en: string, ru: string): string => (lang === 'en' ? en : lang === 'ru' ? ru : ka);

export function clarifyText(options: readonly SubAgentId[], lang: Lang): string {
  const names = options.map((o) => SUB_AGENTS[o].name[lang]);
  if (options.length === 2) {
    return L(lang,
      `რომელი გავაკეთო: ${names[0]} თუ ${names[1]}? ერთი სიტყვით მითხარი და დავიწყებ ფასის ჩვენებით.`,
      `Which one should I make: ${names[0]} or ${names[1]}? Tell me in one word and I'll show the price first.`,
      `Что сделать: ${names[0]} или ${names[1]}? Скажите одним словом, и я сначала покажу цену.`);
  }
  return L(lang,
    `რა გავაკეთო? მაგალითად: ${names.join(', ')}. ერთი წინადადებით აღწერე რა გინდა (რაზე, რა სტილში) და ჯერ ფასს გაჩვენებ.`,
    `What should I make? For example: ${names.join(', ')}. Describe it in one sentence (what it is about, what style) and I'll show the price first.`,
    `Что сделать? Например: ${names.join(', ')}. Опишите одним предложением (о чём, в каком стиле), и я сначала покажу цену.`);
}

export function closedText(agent: SubAgentId, lang: Lang): string {
  const n = SUB_AGENTS[agent].name[lang];
  return L(lang,
    `${n} ჯერ არ არის ჩართული, ამიტომ სხვა რამეს (მაგალითად სურათს) არ გავაკეთებ მის ნაცვლად. როცა ჩაირთვება, ამავე სიტყვებით შეგიძლია მთხოვო.`,
    `${n} is not switched on yet, so I won't make something else (like a picture) in its place. Once it is on, ask me again in the same words.`,
    `${n} ещё не включён, поэтому я не буду делать вместо него что-то другое (например, картинку). Когда его включат, попросите теми же словами.`);
}

export function chainText(steps: readonly ChainStep[], lang: Lang): string {
  const rows = steps.map((s, i) => {
    const n = SUB_AGENTS[s.agent].name[lang];
    const from = i > 0 ? L(lang, ' (წინა ნაბიჯის შედეგით)', ' (from the step before)', ' (из результата предыдущего шага)') : '';
    const off = s.open ? '' : L(lang, ' — ჯერ არ არის ჩართული', ' — not switched on yet', ' — ещё не включено');
    return `${i + 1}. ${n}${from}${off}`;
  });
  const blocked = steps.some((s) => !s.open);
  const head = L(lang, 'ეს ორ ან მეტ ნაბიჯად გავაკეთებ:', 'I\'ll do this in steps:', 'Сделаю это по шагам:');
  const tail = blocked
    ? L(lang,
      'ერთი ნაბიჯი ჯერ არ არის ჩართული, ამიტომ ჯერ არაფერს ვიწყებ. გინდა, მხოლოდ ჩართული ნაბიჯი გავაკეთო?',
      'One step is not switched on yet, so nothing starts. Do you want only the steps that are on?',
      'Один шаг ещё не включён, поэтому ничего не запускаю. Сделать только включённые шаги?')
    : L(lang,
      'ჯერ არაფერი დაწყებულა და არაფერი ჩამოჭრილა. 1-ლი ნაბიჯი ველში ჩავწერე: გაგზავნე და ჯერ მის ფასს გაჩვენებ. ყოველი ნაბიჯი იწყება მხოლოდ შენი „კი"-ს შემდეგ.',
      'Nothing has started and nothing is charged. I put step 1 in the box: send it and I\'ll show its price first. Each step starts only after your yes.',
      'Ничего не запущено и ничего не списано. Шаг 1 я вписал в поле: отправьте его, и я сначала покажу цену. Каждый шаг начнётся только после вашего «да».');
  return [head, ...rows, tail].join('\n');
}

/** The chat's words for a Router v2 reading that answers in words (null: the existing flow goes on). */
export function routeV2Reply(r: RouteV2): string | null {
  switch (r.kind) {
    case 'clarify': return clarifyText(r.options, r.lang);
    case 'chain': return chainText(r.steps, r.lang);
    case 'closed': return closedText(r.agent, r.lang);
    default: return null;
  }
}

/** Read the env flags a client build can see (NEXT_PUBLIC_*); server-only flags read as closed on the client. */
export function envFlagReader(env: Record<string, string | undefined>, isAdmin = false): FlagReader {
  return (flag) => {
    const v = (env[flag] ?? '').trim().toLowerCase();
    if (v === 'admins') return isAdmin;
    return v === '1' || v === 'true' || v === 'on' || v === 'everyone';
  };
}
