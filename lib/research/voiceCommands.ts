/**
 * lib/research/voiceCommands.ts — a DETERMINISTIC, Unicode-safe matcher from what a person says (or types) about a finished
 * report to what the app does with it: summarize · key takeaways · read it aloud · pause / resume / stop · or, when nothing
 * matches, a free question about the report. Georgian, English and Russian, in any mix — the matcher does not need to know
 * which language was spoken. Pure, isomorphic, no network: tested against inflections (lib/research/voiceCommands.test.ts).
 *
 * ⚠️ NO `\b`, NO LOOKBEHIND. ASCII `\b` never matches around Georgian or Cyrillic letters (they are not `\w`), which is how
 * "write a long answer" once drew an image — see the memory note on Georgian word boundaries. The text is NFKC-normalised,
 * lower-cased (Georgian Mtavruli included), split into tokens with `/[^\p{L}\p{N}]+/u`, and matched by token PREFIX (a stem) or
 * token EQUALITY. Prefix matching is what makes Georgian work: the verb "to summarize" is შეაჯამე / შეაჯამეთ / შეაჯამო /
 * შემიჯამე / შეგვიჯამე / შეჯამება — one stem, many surface forms. (Lookbehind would throw a SyntaxError at import on iOS
 * Safari before 16.4 and take the whole chunk with it; a token scan cannot.)
 *
 * PRECISION RULES (a wrong match costs a spoken page of text or a stopped reader):
 *  · content commands (summarize / takeaways / read) match on STEMS, since their meaning survives every inflection;
 *  · CONTROL commands (stop / pause / resume) match only whole TOKENS ("გაჩერდი", "stop", "стоп") and only when the utterance is
 *    nothing but control words — "გაჩერდება თუ არა ბაზარი?" ("will the market stop?") is a question about the report;
 *  · "takeaways" needs an adjective of importance (მთავარი / ძირითადი, main, key, главное …) AND a noun or verb of extraction in
 *    the same utterance — "what is the main RISK?" is a question, "what are the main POINTS?" is the command;
 *  · when several content commands appear, takeaways beats summarize beats read; reading words alongside another command
 *    ("read me the key points", "წამიკითხე მთავარი არსი") set `aloud` instead of replacing it.
 */
export type ReportIntent = 'summarize' | 'takeaways' | 'read' | 'pause' | 'resume' | 'stop' | 'ask' | 'none';

export interface ReportCommand {
  intent: ReportIntent;
  /** The answer should also be spoken ("read me the key points", "ხმამაღლა შეაჯამე", "вслух"). Always true for `read`. */
  aloud: boolean;
  /** The utterance, trimmed — the question itself for `ask`. */
  text: string;
  /** The rules that fired (for tests and diagnostics). */
  matched: string[];
}

/** Lower-cased word tokens: letters and digits of any script; apostrophes dropped ("what's" → "whats"). */
export function reportTokens(utterance: string): string[] {
  return utterance
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`´ʼ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** A stem ends with `*` (token prefix); anything else is an exact token. */
type Pat = string;
const hit = (tok: string, pat: Pat): boolean => (pat.endsWith('*') ? tok.startsWith(pat.slice(0, -1)) : tok === pat);
const anyTok = (tokens: string[], pats: readonly Pat[]): string | null => {
  for (const t of tokens) for (const p of pats) if (hit(t, p)) return t;
  return null;
};
/** Do the patterns appear in order, each within `gap` tokens of the previous? */
const seq = (tokens: string[], parts: readonly Pat[], gap = 2): boolean => {
  for (let i = 0; i < tokens.length; i++) {
    if (!hit(tokens[i]!, parts[0]!)) continue;
    let at = i;
    let ok = true;
    for (let k = 1; k < parts.length && ok; k++) {
      let found = -1;
      for (let j = at + 1; j <= Math.min(tokens.length - 1, at + 1 + gap); j++) {
        if (hit(tokens[j]!, parts[k]!)) { found = j; break; }
      }
      if (found < 0) ok = false;
      else at = found;
    }
    if (ok) return true;
  }
  return false;
};

// ─── the vocabulary ───────────────────────────────────────────────────────────

const SUMMARIZE: readonly Pat[] = [
  // ka — შეაჯამე/შეაჯამეთ/შეაჯამო…, შეჯამება, შემიჯამე ("for me"), შეგვიჯამე ("for us"), დააჯამე, რეზიუმე, მოკლედ / მოკლე ("briefly" / "short")
  'შეაჯამ*', 'შეჯამ*', 'შემიჯამ*', 'შეგვიჯამ*', 'შეუჯამ*', 'დააჯამ*', 'დაჯამ*', 'რეზიუმ*', 'მოკლედ', 'მოკლე*',
  // en
  'summar*', 'recap*', 'condense*', 'tldr', 'briefly', 'synopsis',
  // ru — суммируй, резюмируй, кратко/краткое, перескажи, сократи, вкратце, итоги
  'суммир*', 'резюмир*', 'резюме', 'кратк*', 'вкратце', 'коротко', 'сжато', 'пересказ*', 'перескаж*', 'сократи*', 'сводк*', 'итог*',
];

/** An adjective of importance — never enough alone. */
const MAIN_ADJ: readonly Pat[] = [
  // ka — მთავარი / ძირითადი / არსებითი / მნიშვნელოვანი
  'მთავარ*', 'ძირითად*', 'არსებით*', 'მნიშვნელოვან*',
  // en
  'main', 'key', 'core', 'top', 'central', 'essential', 'important',
  // ru
  'главн*', 'основн*', 'ключев*', 'важн*',
];

/** What the important thing IS called, or the act of pulling it out. */
const MAIN_NOUN_OR_VERB: readonly Pat[] = [
  // ka nouns: არსი ("essence" — exact forms: არსებობს means "exists"), აზრი, პუნქტი, დასკვნა, თეზისი, იდეა, ფაქტი, მიგნება, შედეგი, ინფორმაცია
  'არსი', 'არსს', 'არსის', 'არსით', 'აზრ*', 'პუნქტ*', 'დასკვნ*', 'თეზის*', 'იდე*', 'ფაქტ*', 'მიგნებ*', 'შედეგ*', 'ინფორმაცი*', 'შენიშვნ*',
  // ka verbs of extraction: ამოიღე ("take out"), გამოყავი/გამოაყოფ ("single out"), ჩამომიწერე ("write down for me"), მითხარი ("tell me")
  'ამოიღ*', 'ამომიღ*', 'გამოყავ*', 'გამოაყოფ*', 'გამოყოფ*', 'ჩამოწერ*', 'ჩამომიწერ*', 'ჩამოთვალ*', 'მითხარ*', 'მაჩვენ*', 'მომეცი', 'მომცე',
  // en
  'point*', 'finding*', 'insight*', 'idea*', 'conclusion*', 'message*', 'fact*', 'highlight*', 'takeaway*', 'extract*', 'result*',
  // ru
  'мысл*', 'момент*', 'пункт*', 'вывод*', 'идеи', 'идея', 'суть', 'тезис*', 'факт*', 'результат*', 'находк*', 'выдели*',
];

/** Words that mean "the key points" on their own (no adjective needed). */
const TAKEAWAY_ALONE: readonly Pat[] = ['takeaway*', 'highlights', 'gist', 'essence', 'главное', 'основное', 'тезисы', 'суть'];

const READ: readonly Pat[] = [
  // ka — წამიკითხე ("read to me"), წაგვიკითხე ("to us"), წაიკითხე, მიკითხე, ამომიკითხე, გახმოვანე ("voice it"), ხმამაღლა, მოვისმინო ("let me listen")
  'წამიკითხ*', 'წაგვიკითხ*', 'წაიკითხ*', 'წაუკითხ*', 'წაკითხ*', 'მიკითხ*', 'ამომიკითხ*', 'ამოიკითხ*', 'გახმოვან*', 'ხმამაღლა', 'მოვისმინ*', 'მომასმინ*', 'მომასმენ*', 'მოვუსმინ*',
  // en
  'aloud', 'narrate*',
  // ru
  'прочита*', 'прочт*', 'зачита*', 'озвуч*', 'читай*', 'почитай*', 'вслух', 'проговор*',
];

// Control words — EXACT tokens only, and only as a whole (short) utterance.
const STOP: readonly Pat[] = [
  'გაჩერდი', 'გაჩერდით', 'გააჩერე', 'გააჩერეთ', 'შეჩერდი', 'შეჩერდით', 'შეაჩერე', 'შეაჩერეთ', 'შეწყვიტე', 'შეწყვიტეთ', 'საკმარისია', 'კმარა', 'მორჩი', 'მორჩით', 'ჩუმად', 'გაჩუმდი', 'გაჩუმდით', 'გათიშე', 'გათიშეთ', 'სტოპ',
  'stop', 'quiet', 'enough', 'silence', 'halt', 'shush',
  'стоп', 'остановись', 'остановитесь', 'остановить', 'хватит', 'достаточно', 'замолчи', 'замолчите', 'тихо', 'прекрати', 'прекратите',
];
const PAUSE: readonly Pat[] = ['პაუზა', 'პაუზაზე', 'დააპაუზე', 'დააპაუზეთ', 'დაელოდე', 'მოიცადე', 'pause', 'paused', 'wait', 'пауза', 'паузу', 'паузе', 'подожди', 'подождите'];
const RESUME: readonly Pat[] = [
  'გააგრძელე', 'გააგრძელეთ', 'განაგრძე', 'განაგრძეთ', 'გაგრძელება', 'გავაგრძელოთ', 'კვლავ',
  'resume', 'continue', 'proceed',
  'продолжи', 'продолжай', 'продолжайте', 'продолжить', 'возобнови', 'возобновить', 'дальше',
];

/** Polite or connective words that may stand beside a control word without making it a sentence ("stop reading", "გთხოვ გაჩერდი"). */
const FILLER = new Set([
  'please', 'now', 'it', 'the', 'reading', 'read', 'ok', 'okay',
  'გთხოვ', 'გთხოვთ', 'ახლა', 'ეხლა', 'ეგ', 'ესე', 'ხმამაღლა', 'წაკითხვა',
  'пожалуйста', 'уже', 'чтение',
]);

/** An English utterance that opens with one of these is a question, whatever verbs follow. */
const INTERROGATIVE = new Set(['what', 'which', 'why', 'how', 'when', 'who', 'whom', 'whose', 'where', 'is', 'are', 'does', 'do', 'did']);

const MAX_CONTROL_WORDS = 3;

export function matchReportCommand(utterance: string): ReportCommand {
  const text = (utterance ?? '').trim();
  const tokens = reportTokens(text);
  if (tokens.length === 0) return { intent: 'none', aloud: false, text, matched: [] };

  // 1. Control: an utterance made only of a control word and filler. ("stop and summarize" has two content words — not control.)
  if (tokens.length <= MAX_CONTROL_WORDS && tokens.every((t) => STOP.includes(t) || PAUSE.includes(t) || RESUME.includes(t) || FILLER.has(t))) {
    const stop = anyTok(tokens, STOP);
    if (stop) return { intent: 'stop', aloud: false, text, matched: [`stop:${stop}`] };
    const pause = anyTok(tokens, PAUSE);
    if (pause) return { intent: 'pause', aloud: false, text, matched: [`pause:${pause}`] };
    const resume = anyTok(tokens, RESUME);
    if (resume) return { intent: 'resume', aloud: false, text, matched: [`resume:${resume}`] };
  }

  // Reading words beside another command mean "and say it" — in Georgian/Russian a stem, in English the verb "read"/"aloud".
  // (English "read"/"play" are common verbs: "which sources should I read first?" is a question, not "read it to me".)
  const readsStem = anyTok(tokens, READ);
  const readsEnglish =
    (tokens.includes('read') && !INTERROGATIVE.has(tokens[0]!)) || seq(tokens, ['play', 'it*'], 1) || seq(tokens, ['play', 'report*'], 2) || seq(tokens, ['play', 'summary'], 2);
  const wantsAloud = !!readsStem || readsEnglish;

  // 2. takeaways
  const adj = anyTok(tokens, MAIN_ADJ);
  const noun = anyTok(tokens, MAIN_NOUN_OR_VERB);
  const last = tokens[tokens.length - 1]!;
  // "რა არის მთავარი" / "что главное" — a SHORT question that ends on the adjective itself ("what is the main risk" ends on "risk").
  const shortMain = tokens.length <= 4 && !!adj && hit(last, adj) && (seq(tokens, ['რა', 'არის'], 1) || seq(tokens, ['what', 'is'], 1) || seq(tokens, ['what', 'are'], 1) || seq(tokens, ['что', 'главное'], 1));
  const takeaways =
    (!!adj && !!noun) ||
    !!anyTok(tokens, TAKEAWAY_ALONE) ||
    shortMain ||
    seq(tokens, ['take', 'away*'], 1) ||
    seq(tokens, ['bottom', 'line'], 1) ||
    seq(tokens, ['most', 'important'], 1);
  if (takeaways) return { intent: 'takeaways', aloud: wantsAloud, text, matched: ['takeaways', ...(wantsAloud ? ['aloud'] : [])] };

  // 3. summarize ("sum it up", "sum up", "tl;dr" are phrases)
  const summarizes =
    !!anyTok(tokens, SUMMARIZE) ||
    seq(tokens, ['sum', 'up'], 2) ||
    seq(tokens, ['tl', 'dr'], 1) ||
    seq(tokens, ['подведи', 'итог*'], 1) ||
    seq(tokens, ['give', 'me', 'brief'], 2);
  if (summarizes) return { intent: 'summarize', aloud: wantsAloud, text, matched: ['summarize', ...(wantsAloud ? ['aloud'] : [])] };

  // 4. read the report to me
  if (wantsAloud) return { intent: 'read', aloud: true, text, matched: ['read'] };
  if (seq(tokens, ['let', 'me', 'listen'], 2)) return { intent: 'read', aloud: true, text, matched: ['read'] };

  // 5. a question about the report
  return { intent: 'ask', aloud: false, text, matched: [] };
}

/** What the UI suggests saying, per language — shown as hints next to the mic. */
export const COMMAND_HINTS: Record<'ka' | 'en' | 'ru', { summarize: string; takeaways: string; read: string }> = {
  ka: { summarize: 'შეაჯამე', takeaways: 'ამოიღე მთავარი არსი', read: 'წამიკითხე' },
  en: { summarize: 'Summarize', takeaways: 'Key takeaways', read: 'Read it to me' },
  ru: { summarize: 'Суммируй', takeaways: 'Выдели главное', read: 'Прочитай' },
};
