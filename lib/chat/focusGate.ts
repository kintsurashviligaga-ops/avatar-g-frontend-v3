/**
 * lib/chat/focusGate.ts — AGENT G AT THE DOOR OF EVERY FOCUS MODE. Pure, client-safe, no network.
 *
 * ⚠️ THE BUG THIS ENDS. In a focus mode (Image · Video · Music · Avatar) the composer treated EVERY message as the prompt of that
 * tool: "აქ ხარ?" ("are you here?") typed into Image mode started a paid image render — credits spent, a garbage picture,
 * and Agent G nowhere to be seen. Only plain chat had a guard (isGenerativeCommand). Now every send in a focus mode passes
 * through classifyFocusInput() first, and the answer is one of four:
 *
 *   chat     the user is TALKING (greeting, "are you there?", how are you, thanks, who are you, any question).
 *            Agent G answers in words — NOTHING is generated, NOTHING is charged.
 *   clarify  it looks like a prompt but is too thin to render well ("cat"). Agent G asks 2–3 short questions and offers
 *            "create it as it is" — the user is never stuck.
 *   confirm  a real prompt. Agent G shows what it understood and the price, and generates only when the user says yes.
 *   go       proceed to the tool: the user pressed the panel's own Generate button (the price is on it), or the tool already
 *            has its own approval step (a video's storyboard).
 *
 * BIAS, ON PURPOSE: when in doubt it talks instead of spending. A wrongly-chatty reply costs the user one more message;
 * a wrongly-fired render costs real money and a picture they did not want.
 *
 * ⚠️ NO `\b`. It is ASCII-only: against Georgian or Cyrillic it never matches (the same trap that once killed every Russian
 * command in lib/chat/intentDetector). Everything here tokenises with Unicode property escapes instead.
 */
import { isGenerativeCommand } from '@/lib/chat/intentDetector';

/** The tools Agent G stands in front of. `avatar` is the studio's 'lipsync' mode: there the words are the SCRIPT the
 *  presenter speaks, so "აქ ხარ?" would have been rendered as a paid talking-head video saying "are you here?". */
export type GateMode = 'image' | 'video' | 'music' | 'avatar';
export type GateReason = 'empty' | 'greeting' | 'presence' | 'smalltalk' | 'thanks' | 'meta' | 'question';
export type GateVerdict =
  | { kind: 'chat'; reason: GateReason }
  | { kind: 'clarify' }
  | { kind: 'confirm' }
  | { kind: 'go' };

export interface GateInput {
  text: string;
  mode: GateMode;
  /** A reference image / audio / script rides along: the text is an instruction about it, so thin text is fine. */
  hasAttachments?: boolean;
  /** The user pressed the panel's own Generate button (its price is on it) — that IS the confirmation. */
  explicit?: boolean;
}

// ─── Text helpers ───────────────────────────────────────────────────────────────

const squash = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

/** Lower-cased text with leading/trailing punctuation and emoji trimmed. */
const core = (s: string): string => squash(s).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Words: letters/digits (any script) with inner apostrophes kept ("what's"). */
const words = (s: string): string[] => core(s).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

const phraseTokens = (p: string): string[] => p.split(' ');

/** Tokens left after `phrase` when the message STARTS with it (on token boundaries), else null. */
function afterPhrase(tokens: string[], phrase: string): string[] | null {
  const pt = phraseTokens(phrase);
  if (tokens.length < pt.length) return null;
  for (let i = 0; i < pt.length; i++) if (tokens[i] !== pt[i]) return null;
  return tokens.slice(pt.length);
}

/** The longest listed phrase the message starts with → the rest, or null. */
function startsWithAny(tokens: string[], phrases: readonly string[]): string[] | null {
  let best: string[] | null = null;
  for (const p of phrases) {
    const rest = afterPhrase(tokens, p);
    if (rest && (best === null || rest.length < best.length)) best = rest;
  }
  return best;
}

// ─── What people say TO Agent G (ka · en · ru) ─────────────────────────────────

const GREETINGS = [
  'hi', 'hello', 'hey', 'hiya', 'heya', 'yo', 'sup', 'hola', 'howdy', 'greetings', 'good morning', 'good afternoon',
  'good evening', 'good night', 'hello there', 'hi there', 'hey there',
  'გამარჯობა', 'გამარჯობათ', 'გაუმარჯოს', 'გაგიმარჯოს', 'სალამი', 'სალამ', 'ჰეი', 'ჰელო', 'ჰაი', 'მოგესალმები',
  'მოგესალმებით', 'დილა მშვიდობისა', 'საღამო მშვიდობისა', 'ღამე მშვიდობისა',
  'привет', 'приветик', 'здравствуй', 'здравствуйте', 'салют', 'хай', 'хэй', 'хелло', 'добрый день', 'добрый вечер',
  'доброе утро', 'доброй ночи', 'приветствую', 'здорово',
] as const;

const PRESENCE = [
  'are you there', 'are you here', 'you there', 'you here', 'anyone there', 'anyone here', 'is anyone there',
  'can you hear me', 'are you alive', 'are you online', 'are you awake', 'are you ready', 'are you listening', 'test',
  'testing', 'ping',
  'აქ ხარ', 'აქ ხართ', 'ხარ აქ', 'აქა ხარ', 'ხარ ონლაინ', 'გესმის', 'მისმენ', 'მიპასუხე', 'სადა ხარ', 'ხარ',
  'ты тут', 'ты здесь', 'ты там', 'вы тут', 'вы здесь', 'ты на связи', 'слышишь', 'ты жив', 'ты онлайн', 'есть кто',
  'ты слушаешь',
] as const;

const SMALLTALK = [
  'how are you', 'how are you doing', 'how r u', 'how is it going', "how's it going", 'hows it going', "what's up",
  'whats up', 'wassup', 'what are you doing', 'what is going on', 'how do you do', 'how was your day',
  'როგორ ხარ', 'როგორ ხართ', 'რა ხდება', 'რას აკეთებ', 'რას შვები', 'როგორა ხარ', 'რა ამბავია', 'როგორ არის საქმე',
  'как дела', 'как ты', 'как жизнь', 'что делаешь', 'что нового', 'как поживаешь', 'чем занимаешься', 'как сам',
] as const;

const THANKS_ACK = [
  'thanks', 'thank you', 'thx', 'ty', 'ok', 'okay', 'k', 'cool', 'nice', 'great', 'awesome', 'good', 'yes', 'no', 'yep',
  'yeah', 'nope', 'sure', 'fine', 'got it', 'alright', 'bye', 'goodbye', 'see you', 'cya', 'lol', 'haha', 'wow', 'hmm',
  'please', 'sorry',
  'გმადლობ', 'გმადლობთ', 'მადლობა', 'დიდი მადლობა', 'კარგი', 'კარგად', 'ოკეი', 'ოკ', 'აჰა', 'ჰო', 'კი', 'დიახ', 'არა',
  'ნახვამდის', 'კარგია', 'მესმის', 'გასაგებია', 'სულ ესაა', 'ჰაჰა', 'ვაუ', 'ბოდიში', 'გთხოვ',
  'спасибо', 'благодарю', 'ок', 'окей', 'хорошо', 'ладно', 'круто', 'да', 'нет', 'пока', 'до свидания', 'понятно', 'ясно',
  'отлично', 'супер', 'ага', 'угу', 'хаха', 'вау', 'извини', 'пожалуйста',
] as const;

const META = [
  'who are you', 'what are you', 'what can you do', 'what do you do', 'help', 'help me', 'your name', "what's your name",
  'what is your name', 'tell me about yourself', 'how does this work', 'how do i use this', 'what is this', 'what is agent g',
  'ვინ ხარ', 'რა ხარ', 'რა შეგიძლია', 'დამეხმარე', 'დახმარება', 'რა გქვია', 'როგორ მუშაობს', 'როგორ გამოვიყენო',
  'რა არის ეს', 'რა არის აგენტ ჯი',
  'кто ты', 'что ты', 'что ты умеешь', 'что ты можешь', 'помоги', 'помоги мне', 'помощь', 'как тебя зовут',
  'как это работает', 'что это',
] as const;

/** A question opens with one of these. (`what a` / `what an` open an exclamation — handled below.) */
const QUESTION_OPENERS = new Set([
  'what', 'why', 'how', 'who', 'whom', 'whose', 'where', 'when', 'which', 'is', 'are', 'am', 'was', 'were', 'do', 'does',
  'did', 'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'have', 'has', 'had', 'isn’t', "isn't",
  "aren't", "don't", "doesn't", "can't", "won't", "what's", "how's", 'whats', 'hows',
  'რა', 'რას', 'რის', 'რით', 'რაზე', 'რაში', 'რატომ', 'როგორ', 'როგორია', 'როგორი', 'სად', 'საიდან', 'სადაა', 'როდის',
  'ვინ', 'ვის', 'ვისი', 'რომელი', 'რომელ', 'რამდენი', 'რამდენად', 'შეგიძლია', 'შეძლებ', 'შეიძლება', 'გინდა', 'იცი',
  'გახსოვს', 'არის', 'ხარ', 'გაქვს', 'გიყვარს', 'ვინა', 'რაა',
  'что', 'чего', 'почему', 'зачем', 'как', 'кто', 'кого', 'где', 'куда', 'откуда', 'когда', 'какой', 'какая', 'какие',
  'какое', 'сколько', 'чей', 'можешь', 'можете', 'умеешь', 'есть', 'правда',
]);

const AFFIRM = [
  'yes', 'yep', 'yeah', 'sure', 'ok', 'okay', 'go', 'go ahead', 'do it', 'create it', 'generate it', 'make it', 'proceed',
  'looks good', 'sounds good', 'confirm', 'start',
  'კი', 'ჰო', 'დიახ', 'ოკ', 'ოკეი', 'კარგი', 'გააკეთე', 'შექმენი', 'დაიწყე', 'ასე შექმენი', 'ასე გააკეთე', 'დაადასტურე',
  'да', 'давай', 'ок', 'окей', 'хорошо', 'создавай', 'делай', 'начинай', 'поехали', 'подтверждаю',
] as const;

/** Per-tool: how much text is "enough" to render without asking first. */
const ENOUGH: Record<GateMode, { words: number; chars: number }> = {
  image: { words: 4, chars: 24 },
  video: { words: 5, chars: 30 },
  music: { words: 2, chars: 10 },
  // A script shorter than a sentence is almost never what someone wants a presenter to read out.
  avatar: { words: 3, chars: 15 },
};

// ─── The gate ───────────────────────────────────────────────────────────────────

/** Is this a short "yes — go ahead" reply (to Agent G's question)? */
export function isAffirmation(text: string): boolean {
  const toks = words(text);
  if (!toks.length || toks.length > 4) return false;
  const rest = startsWithAny(toks, AFFIRM);
  return rest !== null && rest.length <= 1;
}

/**
 * Words that only ADDRESS Agent G ("hello AGENT G", "thanks BRO") — never content. An acknowledgement, a presence check or
 * a greeting counts as talk only when nothing but these follows it: "nice sunset", "no smoking sign" and "test pattern grid"
 * are real prompts that merely START with a word that is also an acknowledgement.
 */
const ADDRESS = new Set([
  'agent', 'g', 'agentg', 'there', 'all', 'everyone', 'bro', 'man', 'dude', 'friend', 'buddy', 'dear', 'mate', 'sir', 'boss',
  'აგენტ', 'ჯი', 'მეგობარო', 'ძმაო', 'ძვირფასო', 'ბიჭო',
  'агент', 'джи', 'друг', 'дружище', 'брат', 'дорогой', 'всем', 'ребята',
]);

const restIsAddress = (rest: string[]): boolean => rest.every((t) => ADDRESS.has(t));

function conversationReason(raw: string): GateReason | null {
  const toks = words(raw);
  if (!toks.length) return 'empty';

  // A leading greeting is peeled off; what remains decides ("hi, draw a red fox" is a command, "hello agent g" is a hello,
  // "hello, how are you?" is smalltalk).
  const afterGreeting = startsWithAny(toks, GREETINGS);
  if (afterGreeting) {
    if (restIsAddress(afterGreeting)) return 'greeting';
    return conversationReason(afterGreeting.join(' '));
  }

  for (const [reason, list] of [['presence', PRESENCE], ['smalltalk', SMALLTALK], ['thanks', THANKS_ACK]] as const) {
    const rest = startsWithAny(toks, list);
    if (rest && restIsAddress(rest)) return reason;
  }
  // "who are you", "what can you do", "how does this work" are questions about Agent G itself; a few trailing words are fine.
  const meta = startsWithAny(toks, META);
  if (meta && meta.length <= 4) return 'meta';
  return null;
}

function looksLikeQuestion(raw: string): boolean {
  const trimmed = raw.trim();
  if (/[?？؟]\s*$/u.test(trimmed)) return true;
  const toks = words(raw);
  const first = toks[0];
  if (!first) return false;
  // "What a beautiful sunset over the sea" is a description, not a question.
  if ((first === 'what' || first === 'რა' || first === 'какой') && (toks[1] === 'a' || toks[1] === 'an')) return false;
  return QUESTION_OPENERS.has(first);
}

export function classifyFocusInput(input: GateInput): GateVerdict {
  const raw = input.text ?? '';
  if (!words(raw).length) return { kind: 'chat', reason: 'empty' };

  // 1) Talking to Agent G — greeting, "are you there?", how are you, thanks, who are you.
  const talk = conversationReason(raw);
  if (talk) return { kind: 'chat', reason: talk };

  // 2) A question that is not an order to make something ("can you draw a fox?" IS an order: isGenerativeCommand sees it).
  if (!isGenerativeCommand(raw) && looksLikeQuestion(raw)) return { kind: 'chat', reason: 'question' };

  // 3) It is a prompt. Is there enough of it?
  const need = ENOUGH[input.mode];
  const w = words(raw).length;
  const enough = !!input.hasAttachments || w >= need.words || core(raw).length >= need.chars;

  if (input.explicit) return { kind: 'go' };      // the panel's Generate button, price on it
  if (!enough) return { kind: 'clarify' };
  return input.mode === 'video' ? { kind: 'go' } : { kind: 'confirm' }; // a film already has its storyboard approval
}

/**
 * True when the message is TALK to Agent G — a greeting, "are you there?", how are you, thanks, who are you, any question that
 * is not an order to make something. The same verdict the focus-mode gate gives, for the other doors (WhatsApp, Telegram, the
 * channel bridge): talk is answered in words and must NEVER be planned into a task or reach a generation tool.
 */
export function isConversational(text: string): boolean {
  return classifyFocusInput({ text, mode: 'image' }).kind === 'chat';
}

/** The original thin prompt plus the user's answer to Agent G's questions. */
export function mergePrompt(base: string, answer: string): string {
  const head = base.trim().replace(/[\s.,;:!?]+$/u, '');
  const tail = answer.trim();
  return head && tail ? `${head}, ${tail}` : head || tail;
}

// ─── What Agent G says (ka · en · ru) ───────────────────────────────────────────

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

const TARGET: Record<GateMode, Record<Lang, string>> = {
  image: { ka: 'სურათი', en: 'image', ru: 'изображение' },
  video: { ka: 'ვიდეო', en: 'video', ru: 'видео' },
  music: { ka: 'მუსიკა', en: 'track', ru: 'трек' },
  avatar: { ka: 'ავატარის ვიდეო', en: 'avatar video', ru: 'видео с аватаром' },
};

const CLARIFY: Record<GateMode, Record<Lang, string>> = {
  image: {
    ka: 'ზუსტად რომ გამომივიდეს, დამიზუსტე 🎨\n• რა სტილში გინდა — ფოტორეალისტური, ილუსტრაცია, მულტფილმი?\n• სად ხდება მოქმედება და როგორი განწყობაა (სინათლე, ფერები)?\nმიპასუხე ერთ შეტყობინებაში — ან დააჭირე ღილაკს და ახლავე შევქმნი, როგორც არის.',
    en: 'To get it right, tell me a bit more 🎨\n• What style — photoreal, illustration, cartoon?\n• Where does it happen, and what is the mood (light, colours)?\nAnswer in one message — or tap the button and I will create it as it is.',
    ru: 'Чтобы получилось точно, уточни 🎨\n• В каком стиле — фотореализм, иллюстрация, мультфильм?\n• Где всё происходит и какое настроение (свет, цвета)?\nОтветь одним сообщением — или нажми кнопку, и я сделаю как есть.',
  },
  video: {
    ka: 'რომ კადრი კარგი გამოვიდეს, დამიზუსტე 🎬\n• ვინ ან რა ჩანს კადრში და რას აკეთებს?\n• როგორია კამერა და განწყობა (ახლო/შორი, ნელი/დინამიური)?\nმიპასუხე ერთ შეტყობინებაში — ან დააჭირე ღილაკს და სცენარს ახლავე დავგეგმავ, როგორც არის.',
    en: 'To make the shot work, tell me more 🎬\n• Who or what is in frame, and what are they doing?\n• How is the camera and mood (close/wide, slow/dynamic)?\nAnswer in one message — or tap the button and I will plan the scenes as it is.',
    ru: 'Чтобы кадр получился, уточни 🎬\n• Кто или что в кадре и что делает?\n• Какая камера и настроение (крупно/широко, медленно/динамично)?\nОтветь одним сообщением — или нажми кнопку, и я спланирую сцены как есть.',
  },
  music: {
    ka: 'რომ სწორი ტრეკი გამოვიდეს, დამიზუსტე 🎵\n• რა ჟანრი და განწყობა გინდა?\n• ინსტრუმენტული იყოს თუ ხმით/ტექსტით (რა ენაზე)?\nმიპასუხე ერთ შეტყობინებაში — ან დააჭირე ღილაკს და ახლავე შევქმნი, როგორც არის.',
    en: 'To get the right track, tell me more 🎵\n• Which genre and mood?\n• Instrumental, or with vocals/lyrics (in which language)?\nAnswer in one message — or tap the button and I will create it as it is.',
    ru: 'Чтобы получился нужный трек, уточни 🎵\n• Какой жанр и настроение?\n• Инструментал или с вокалом/текстом (на каком языке)?\nОтветь одним сообщением — или нажми кнопку, и я сделаю как есть.',
  },
  avatar: {
    ka: 'ავატარი ზუსტად იმას იტყვის, რასაც დაწერ 🎙️\n• დამიწერე სრული ტექსტი, რომელიც უნდა წაიკითხოს.\n• ხმა (ქალი/კაცი) და ფორმატი (9:16, 16:9) პანელში აირჩიე.\nმიპასუხე ერთ შეტყობინებაში — ან დააჭირე ღილაკს და ახლავე შევქმნი, როგორც არის.',
    en: 'The avatar will say exactly what you write 🎙️\n• Send me the full text it should read.\n• Pick the voice (female/male) and format (9:16, 16:9) in the panel.\nAnswer in one message — or tap the button and I will create it as it is.',
    ru: 'Аватар скажет ровно то, что ты напишешь 🎙️\n• Пришли полный текст, который он должен прочитать.\n• Голос (женский/мужской) и формат (9:16, 16:9) выбери в панели.\nОтветь одним сообщением — или нажми кнопку, и я сделаю как есть.',
  },
};

const CONFIRM: Record<Lang, (what: string, prompt: string) => string> = {
  ka: (what, prompt) => `მზად ვარ შევქმნა ${what}:\n«${prompt}»\nდავიწყო?`,
  en: (what, prompt) => `I am ready to create the ${what}:\n“${prompt}”\nShall I start?`,
  ru: (what, prompt) => `Готова создать ${what}:\n«${prompt}»\nНачинать?`,
};

/** The avatar's prompt is a SCRIPT, so the confirmation quotes what it will SAY. */
const CONFIRM_AVATAR: Record<Lang, (prompt: string) => string> = {
  ka: (prompt) => `მზად ვარ, ავატარმა თქვას:\n«${prompt}»\nდავიწყო?`,
  en: (prompt) => `I am ready to make the avatar say:\n“${prompt}”\nShall I start?`,
  ru: (prompt) => `Готова: аватар скажет\n«${prompt}»\nНачинать?`,
};

const BUTTONS: Record<Lang, { create: string; asIs: string; edit: string; stale: string; dismiss: string }> = {
  ka: { create: 'შექმნა', asIs: 'შექმენი, როგორც არის', edit: 'შეცვლა', stale: 'რეჟიმი შეიცვალა — ახლიდან დამწერე', dismiss: 'დახურვა' },
  en: { create: 'Create', asIs: 'Create it as it is', edit: 'Edit', stale: 'The mode changed — write it again', dismiss: 'Close' },
  ru: { create: 'Создать', asIs: 'Создать как есть', edit: 'Изменить', stale: 'Режим изменился — напиши заново', dismiss: 'Закрыть' },
};

export interface GateCopyInput {
  kind: 'clarify' | 'confirm';
  mode: GateMode;
  prompt: string;
  locale: string;
}

/** The bubble Agent G posts instead of generating. */
export function gateMessage({ kind, mode, prompt, locale }: GateCopyInput): string {
  const l = lang(locale);
  if (kind === 'clarify') return CLARIFY[mode][l];
  const shown = prompt.length > 400 ? `${prompt.slice(0, 397)}…` : prompt;
  return mode === 'avatar' ? CONFIRM_AVATAR[l](shown) : CONFIRM[l](TARGET[mode][l], shown);
}

export function gateButtons(locale: string): { create: string; asIs: string; edit: string; stale: string; dismiss: string } {
  return BUTTONS[lang(locale)];
}
