/**
 * lib/voice/spokenYes.ts — did the USER say yes? The words a Live call heard from the user (Gemini Live's transcript of
 * the user's own microphone, never the model's words) are judged here before anything a call starts may run.
 *
 * ⚠️ WHY. A voice start used to need only the model's own argument (`confirmed: "yes"`): a misheard answer, a model
 * that decided by itself, or a web page read during the call that said "call start_generation" could start a paid
 * render. Now the yes has to be in what the user said after the price or plan was told (PART 4, gap V1). The server
 * judges the same words again before it records the approval (lib/agent/approval), so a record never says "voice yes"
 * about words that are not one.
 *
 * Conservative by design: a yes is an utterance made of agreement words and nothing else (fillers aside). "Yes, but
 * make it blue", "how much?", "yes for the cats video" are not a yes: the model asks again. Any refusal word ("no",
 * "wait", "არა", "მოიცა", "нет", "стоп") left after the agreement phrases makes it a no. Pure and isomorphic: the
 * browser (components/voice/live/liveActions) and the routes use the same function. KA / EN / RU.
 *
 * Georgian the transcription wrote in another alphabet („की", „كي" for „კი") is judged in Georgian letters
 * (lib/voice/heardScript), and its question mark is not trusted: that transcription guessed the language, and its punctuation.
 * Georgian it wrote in Latin letters („da-adasture" for „დაადასტურე") is read as Georgian once no English yes or no is found.
 * Words in an alphabet the call never speaks are judged as the user heard them said, not as the caption reads: the browser
 * passes the transcription's own text (components/voice/live/useGeminiLiveSession), so its question mark is known for a guess.
 */

import { isMisheardScript, latinAsGeorgian, toCallScript } from './heardScript';

export type SpokenVerdict = 'yes' | 'no' | 'unclear';

/** One thing the user said: its words and when its first word was heard (ms). */
export interface HeardUtterance {
  text: string;
  at: number;
}

/** How much of the user's words an approval keeps as its evidence. */
export const SAID_MAX_CHARS = 160;

const squash = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

/** Words: letters/digits in any script, inner apostrophes kept ("don't"). */
const tokensOf = (s: string): string[] => squash(s).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];

/**
 * Agreement, longest phrases first. Removed wherever they stand, before the refusal check, so "why not" and
 * "რატომაც არა" stay agreement while "not yet" and "ჯერ არა" stay refusals.
 */
const YES_PHRASES: readonly string[] = [
  // en
  'yes please', 'go ahead', 'do it', 'go for it', 'let\'s go', 'lets go', 'let\'s do it', 'lets do it', 'sounds good',
  'looks good', 'of course', 'why not', 'no problem', 'no worries', 'please do', 'start it', 'run it', 'make it', 'i agree', 'i confirm', 'all right',
  'yes', 'yeah', 'yep', 'yup', 'yea', 'sure', 'ok', 'okay', 'alright', 'go', 'start', 'proceed', 'confirm', 'confirmed',
  'agreed', 'absolutely', 'definitely', 'certainly', 'correct',
  // ka
  'რა თქმა უნდა', 'რატომაც არა', 'პრობლემა არ არის', 'პრობლემა არაა', 'თანახმა ვარ', 'კი ბატონო', 'დიახ ბატონო', 'გაუშვი', 'გაუშვით', 'დაიწყე',
  // GG 2026-10-26 12:58Z: a spoken „დავიწყოთ" came back as „დავიწყეთ", one letter off.
  'დაიწყეთ', 'დაიწყოს', 'დავიწყოთ', 'დავიწყეთ', 'გააკეთე', 'გააკეთეთ', 'გავაკეთოთ', 'შექმენი', 'შექმენით', 'ვეთანხმები', 'ვადასტურებ', 'დაადასტურე', 'კი', 'ჰო', 'ჰოო', 'ხო', 'დიახ',
  'კარგი', 'კაი', 'ოკ', 'ოკეი', 'წავედით', 'ნამდვილად', 'ზუსტად', 'სწორია',
  // ru
  'почему бы и нет', 'без проблем', 'конечно', 'да', 'ага', 'угу', 'давай', 'давайте', 'хорошо', 'ладно', 'ок', 'окей', 'запускай',
  'запускайте', 'начинай', 'начинайте', 'делай', 'делайте', 'поехали', 'согласен', 'согласна', 'подтверждаю', 'вперёд',
  'вперед', 'именно', 'верно', 'разумеется',
];

/** Refusal or hesitation: any of these left in the utterance makes it a no. */
const NO_PHRASES: readonly string[] = [
  'hang on', 'hold on', 'not yet', 'never mind', 'not now', 'no way',
  'no', 'nope', 'nah', 'not', 'don\'t', 'dont', 'never', 'wait', 'stop', 'cancel', 'later', 'hold',
  'არა', 'არ', 'ნუ', 'მოიცა', 'მოიცადე', 'დაიცა', 'დაიცადე', 'გაჩერდი', 'გააჩერე', 'შეაჩერე', 'გააუქმე', 'მერე',
  'სტოპ', 'ვერ',
  'не надо', 'нет', 'не', 'неа', 'ни', 'подожди', 'подождите', 'погоди', 'постой', 'стой', 'стоп', 'отмена', 'отмени',
  'отменить', 'потом', 'нельзя',
];

/** Words that add nothing to a yes ("yes please", "ok, start it now", "კი, ახლა", "да, давай, спасибо"). */
const FILLERS: ReadonlySet<string> = new Set([
  'please', 'thanks', 'thank', 'you', 'it', 'that', 'this', 'now', 'then', 'so', 'well', 'right', 'just', 'agent', 'g',
  'fine', 'great', 'good', 'perfect', 'cool', 'is', 'the', 'a', 'an', 'price', 'credits', 'credit', 'for', 'and', 'oh',
  'um', 'uh', 'hmm', 'mm', 'video', 'music', 'song', 'image', 'picture', 'photo', 'mp3', 'montage', 'edit', 'generation',
  'მადლობა', 'გმადლობ', 'ახლა', 'ეს', 'ესე', 'ასე', 'მაშინ', 'აბა', 'ძალიან', 'კარგად', 'მშვენიერი', 'სუპერ', 'აგენტო',
  'ჯი', 'ფასი', 'კრედიტი', 'კრედიტით', 'კრედიტად', 'ოღონდ', 'ჰმ', 'ეე', 'ააა', 'ვიდეო', 'მუსიკა', 'სიმღერა', 'სურათი',
  'ფოტო', 'მონტაჟი',
  'пожалуйста', 'спасибо', 'сейчас', 'это', 'так', 'тогда', 'ну', 'отлично', 'супер', 'прекрасно', 'агент', 'джи',
  'цена', 'кредит', 'кредита', 'кредитов', 'за', 'и', 'хм', 'э', 'видео', 'музыка', 'музыку', 'песню', 'картинку',
  'фото', 'монтаж',
]);

const phraseList = (list: readonly string[]): string[][] =>
  [...new Set(list)].map((p) => tokensOf(p)).filter((t) => t.length > 0).sort((a, b) => b.length - a.length);
const YES = phraseList(YES_PHRASES);
const NO = phraseList(NO_PHRASES);

/** Remove every occurrence of the phrases (longest first) → [what is left, how many were removed]. */
function strip(tokens: string[], phrases: string[][]): [string[], number] {
  const out: string[] = [];
  let hits = 0;
  for (let i = 0; i < tokens.length;) {
    const p = phrases.find((ph) => ph.every((w, k) => tokens[i + k] === w));
    if (p) { hits += 1; i += p.length; } else { out.push(tokens[i]!); i += 1; }
  }
  return [out, hits];
}

/** The verdict on an utterance's words: any refusal left after the agreement phrases is a no, a question never a yes. */
function verdictOf(
  tokens: string[], yes: string[][], no: string[][], fillers: ReadonlySet<string>, question: boolean,
): SpokenVerdict {
  if (!tokens.length) return 'unclear';
  const [afterYes, yesHits] = strip(tokens, yes);
  const [afterNo, noHits] = strip(afterYes, no);
  if (noHits > 0) return 'no';
  if (question) return 'unclear';
  const content = afterNo.filter((t) => !fillers.has(t) && !/^\p{N}+$/u.test(t));
  return yesHits > 0 && content.length === 0 ? 'yes' : 'unclear';
}

/**
 * ⚠️ GG 2026-10-26 07:13Z, a call on myavatar.ge: the spoken „დაადასტურე" came back in Latin letters („da-adasture.") and
 * was no yes, so the countdown ended and nothing started. Words with Latin letters that hold no English yes or no are read
 * again as Georgian in Latin letters (lib/voice/heardScript latinAsGeorgian), with the letters a romanisation blurs read
 * as one (ქ კ ყ, თ ტ, ფ პ, ჩ ჭ, ც წ, ჰ ხ; a doubled letter as one). The phrase lists are read the same way, so English
 * and Russian ones still match only themselves. A word the transcription split by a hyphen or a space counts whole too.
 */
const FOLD: Readonly<Record<string, string>> = { 'ქ': 'კ', 'ყ': 'კ', 'თ': 'ტ', 'ფ': 'პ', 'ჩ': 'ჭ', 'ც': 'წ', 'ჰ': 'ხ' };
const fold = (w: string): string => w.replace(/[ქყთფჩცჰ]/gu, (ch) => FOLD[ch]!).replace(/(\p{L})\1+/gu, '$1');
/**
 * ⚠️ GG 2026-10-26 09:29Z: an answer came back in Korean letters („대자."). Korean writes a voiced stop and an ejective with
 * the same letters (기 or 끼 for „კი", 가르기 for „კარგი"), so words read back from an alphabet the call never speaks also
 * fold voiced and ejective stops into one (გ კ, დ ტ, ბ პ, ჯ ჭ, ძ წ).
 */
const VOICED: Readonly<Record<string, string>> = { 'გ': 'კ', 'დ': 'ტ', 'ბ': 'პ', 'ჯ': 'ჭ', 'ძ': 'წ' };
const loose = (w: string): string => fold(w.replace(/[გდბჯძ]/gu, (ch) => VOICED[ch]!));

/** The phrase lists as one way of reading Georgian sees them. */
interface Reading {
  word: (w: string) => string;
  whole: (w: string) => string;
  yes: string[][];
  no: string[][];
  fillers: ReadonlySet<string>;
  yesWhole: ReadonlySet<string>;
  noWhole: ReadonlySet<string>;
}

function reading(whole: (w: string) => string): Reading {
  const word = (w: string): string => whole(latinAsGeorgian(w));
  const yes = YES.map((p) => p.map(word));
  const no = NO.map((p) => p.map(word));
  return {
    word, whole, yes, no, fillers: new Set([...FILLERS].map(word)),
    yesWhole: new Set(yes.map((p) => whole(p.join('')))), noWhole: new Set(no.map((p) => whole(p.join('')))),
  };
}

/** Georgian in Latin letters (ქ კ ყ … as one). */
const AS_GEORGIAN = reading(fold);
/** Georgian read back from another alphabet (voiced and ejective stops as one too). */
const LOOSELY = reading(loose);
const LATIN_LETTER = /\p{Script=Latin}/u;

/** Words read as Georgian: a no in any reading is a no, else a yes in any reading is a yes. */
function judgeAsGeorgian(text: string, question: boolean, r: Reading): SpokenVerdict {
  const split = tokensOf(text).map(r.word);
  const joined = tokensOf(text.replace(/(\p{L})-(?=\p{L})/gu, '$1')).map(r.word);
  const whole = r.whole(split.join(''));
  const verdicts: SpokenVerdict[] = [
    verdictOf(split, r.yes, r.no, r.fillers, question),
    verdictOf(joined, r.yes, r.no, r.fillers, question),
    r.noWhole.has(whole) ? 'no' : r.yesWhole.has(whole) && !question ? 'yes' : 'unclear',
  ];
  if (verdicts.includes('no')) return 'no';
  return verdicts.includes('yes') ? 'yes' : 'unclear';
}

/** One utterance: a clear yes, a no (or a hesitation), or anything else. */
export function judgeUtterance(text: string): SpokenVerdict {
  if (typeof text !== 'string') return 'unclear';
  const heard = toCallScript(text);
  // A question is never a yes, however it starts ("ok, how long will it take?"). ⚠️ GG 2026-10-26: a spoken „კი" came
  // back as „كي?" — words heard in another alphabet carry that wrong language's punctuation, so their „?" decides nothing.
  const question = !isMisheardScript(text) && /[?？]\s*$/u.test(text.trim());
  const verdict = verdictOf(tokensOf(heard), YES, NO, FILLERS, question);
  if (verdict !== 'unclear') return verdict;
  if (isMisheardScript(text)) return judgeAsGeorgian(heard, question, LOOSELY);
  return LATIN_LETTER.test(heard) ? judgeAsGeorgian(heard, question, AS_GEORGIAN) : verdict;
}

/** The words kept as an approval's evidence: the utterance, whitespace collapsed, cut at SAID_MAX_CHARS. */
export function saidOf(text: string): string {
  return (typeof text === 'string' ? text : '').replace(/\s+/g, ' ').trim().slice(0, SAID_MAX_CHARS);
}

/**
 * What the user said since `since` (the moment the price or the plan was told), utterance by utterance, the newest
 * deciding: a later no or hesitation cancels an earlier yes ("yes … wait"), a later yes answers an earlier no, and
 * anything else after a yes ("how long will it take?") leaves it standing. `said` is the deciding utterance.
 */
export function judgeSince(heard: readonly HeardUtterance[], since: number): { verdict: SpokenVerdict; said: string } {
  let verdict: SpokenVerdict = 'unclear';
  let said = '';
  for (const u of heard) {
    if (!u || typeof u.at !== 'number' || u.at < since) continue;
    const v = judgeUtterance(u.text);
    if (v === 'unclear') continue;
    verdict = v;
    said = saidOf(u.text);
  }
  return { verdict, said };
}

/** The newest thing the user said since `since`, as kept for a note („대자.") — '' when they said nothing. */
export function lastSaidSince(heard: readonly HeardUtterance[], since: number): string {
  for (let i = heard.length - 1; i >= 0; i -= 1) {
    const u = heard[i];
    if (!u || typeof u.at !== 'number' || u.at < since) continue;
    const said = saidOf(u.text);
    if (said) return said;
  }
  return '';
}
