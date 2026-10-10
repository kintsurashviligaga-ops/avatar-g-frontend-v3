/**
 * lib/agent/media/analyzeChat.ts — „what is in my video?" in the chat, answered by Agent G's whole-file analysis
 * (/api/agent/media/analyze, lib/agent/media/analyzeExec: Gemini reads the file itself, by reference, and answers in a
 * fixed shape: summary, scenes, moments, transcript, speakers, objects, the answer to the question). Pure, no network.
 *
 *   analyzeAsk         which messages it takes: one attached video or audio file with a question about it, or one public
 *                      YouTube link with a question (analysis only: nothing is downloaded, nothing is extracted).
 *   analyzeAnswerText  the bubble's text: the answer, else the summary.
 *   analyzeCard        the card's model: the steps, then scenes as chips, the best moments, who speaks, the transcript.
 *
 * ⚠️ ONLY WHERE AGENT_G_FILE_ANALYSIS IS OPEN (the route's GET says so for this user). Everywhere else the same question
 * goes, as before, to the chat model with the clip's frames and soundtrack (lib/chat/videoDigest). An edit, the MP3 ask
 * and a two-step run are never read as a question here: their own cards take them first.
 */
import { isVideoQuestion } from '@/lib/chat/videoIntent';
import { audioExtractAsk } from './audioChat';
import { findLinks, withoutLinks } from './audioSource';
import { mineEdits } from './editWords';
import { youtubeVideoUrl, type AnalyzeFocus, type AnalyzeKind, type MediaAnalysis } from './analyzeSpec';
import { countText, type StepState, type TaskCardModel, type TaskStep } from './taskSteps';
import type { AttachmentKind } from './montageChat';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

export type AnalyzeAsk =
  | { source: 'file'; focus: AnalyzeFocus }
  | { source: 'youtube'; url: string; focus: AnalyzeFocus };

const TRANSCRIPT = /transcri|what\s+(?:is|was|did\s+\w+)\s+(?:said|say)|word\s+for\s+word|ტრანსკრიპ|რას\s+ამბობ|რა\s+ითქვა|რას\s+ლაპარაკობ|სიტყვასიტყვით|расшифр|транскрип|что\s+говор|что\s+сказ/i;
const MOMENTS = /best\s+moments?|highlights?|key\s+moments?|საუკეთესო\s+მომენტ|მთავარი\s+მომენტ|хайлайт|лучш\S*\s+момент|ключев\S*\s+момент/i;
const SCENES = /\bscenes?\b|\bshots?\b|სცენ|кадры|сцен/i;

/** What the question is mostly about: a transcript, the best moments, the scenes, else the question itself. */
export function analyzeFocusOf(text: string): AnalyzeFocus {
  if (TRANSCRIPT.test(text)) return 'transcript';
  if (MOMENTS.test(text)) return 'moments';
  if (SCENES.test(text)) return 'scenes';
  return 'question';
}

/**
 * The analysis this message asks for, or null. One attached video or audio file and a question about it (no link); or
 * no file and one YouTube video link with a question. A message that also names an edit, or asks for the MP3, is not a
 * question for the analysis.
 */
export function analyzeAsk(text: string, kinds: readonly AttachmentKind[]): AnalyzeAsk | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  if (audioExtractAsk(t, [...kinds])) return null;
  const links = findLinks(t);
  // The words alone: a link's own „?v=" is not a question, and its path is not an edit („watch" is not 16:9).
  const words = withoutLinks(t);
  if (mineEdits(words).edits.length) return null;
  if (kinds.length === 1 && (kinds[0] === 'video' || kinds[0] === 'audio') && links.length === 0) {
    return isVideoQuestion(words) ? { source: 'file', focus: analyzeFocusOf(words) } : null;
  }
  if (kinds.length === 0 && links.length === 1) {
    const url = youtubeVideoUrl(links[0]!);
    if (url && isVideoQuestion(words)) return { source: 'youtube', url, focus: analyzeFocusOf(words) };
  }
  return null;
}

/** reading (the file uploads, Gemini reads it) · done (the answer is here) · failed. */
export type AgentAnalyzePhase = 'reading' | 'done' | 'failed';

export interface AnalyzeAnswer {
  analysis: MediaAnalysis;
  type: AnalyzeKind;
  durationSec: number | null;
}

/** One analysis card in the thread. Never persisted (the answer text is). */
export interface AgentAnalyzeState {
  phase: AgentAnalyzePhase;
  source: 'file' | 'youtube';
  /** What was asked, kept so ↻ and Retry ask it again with the same file (its storage path once uploaded). */
  ask?: AnalyzeAsk;
  question?: string;
  ref?: string;
  /** The file's name, or the link's host. */
  name?: string;
  /** The file reached the user's own uploads (a YouTube link has nothing to upload). */
  uploaded?: boolean;
  answer?: AnalyzeAnswer;
  error?: string;
  t0?: number;
  t1?: number;
}

const T = {
  title: { ka: 'ფაილის ანალიზი', en: 'What is in the file', ru: 'Разбор файла' },
  upload: { ka: 'ფაილის ატვირთვა', en: 'Upload the file', ru: 'Загрузка файла' },
  link: { ka: 'ბმულის შემოწმება', en: 'Check the link', ru: 'Проверка ссылки' },
  read: { ka: 'Gemini კითხულობს მთლიან ფაილს', en: 'Gemini reads the whole file', ru: 'Gemini читает весь файл' },
  answer: { ka: 'პასუხი', en: 'The answer', ru: 'Ответ' },
  working: { ka: 'მუშაობს', en: 'Working', ru: 'В работе' },
  done: { ka: 'მზადაა', en: 'Done', ru: 'Готово' },
  failed: { ka: 'ვერ შესრულდა', en: 'Did not finish', ru: 'Не удалось' },
  onlyRead: { ka: 'მხოლოდ ანალიზი: არაფერი ჩამოიტვირთა', en: 'Analysis only: nothing was downloaded', ru: 'Только анализ: ничего не скачано' },
  free: { ka: 'უფასოა შენთვის (დღიური ლიმიტით)', en: 'Free for you (within a daily limit)', ru: 'Бесплатно для вас (в пределах дневного лимита)' },
  readingFile: { ka: '🔎 ვკითხულობ მთლიან ფაილს…', en: '🔎 Reading the whole file…', ru: '🔎 Читаю весь файл…' },
  readingLink: { ka: '🔎 ვკითხულობ ვიდეოს ბმულიდან (მხოლოდ ანალიზი)…', en: '🔎 Reading the video from the link (analysis only)…', ru: '🔎 Читаю видео по ссылке (только анализ)…' },
} as const;
const say = (k: keyof typeof T, lang: Lang) => T[k][lang];

/** The bubble's words while the card works. */
export function analyzeReadingText(source: 'file' | 'youtube', locale: string): string {
  return say(source === 'file' ? 'readingFile' : 'readingLink', pick(locale));
}

/** A failure that asking again can mend (the network, the model's answer, the upload); the rest would only fail again. */
export function analyzeRetryable(code: string | undefined): boolean {
  return code === 'network' || code === 'model_failed' || code === 'bad_answer' || code === 'upload_failed';
}

/** 75 → „1:15". */
export function atText(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The bubble's own words: the answer to the question when there is one, else the summary. */
export function analyzeAnswerText(a: MediaAnalysis): string {
  return (a.answer && a.answer.trim()) || a.summary;
}

const ERR: Record<string, Record<Lang, string>> = {
  upload_failed: { ka: 'ფაილი ვერ ავტვირთე (მაქს. 50 მბ, ვიდეო ან აუდიო).', en: 'I could not upload the file (up to 50 MB, video or audio).', ru: 'Не удалось загрузить файл (до 50 МБ, видео или аудио).' },
  unsupported_type: { ka: 'ამ ტიპის ფაილს ვერ წავიკითხავ.', en: 'I cannot read this type of file.', ru: 'Этот тип файла я не прочитаю.' },
  media_not_yours: { ka: 'ეს ფაილი შენს ანგარიშს არ ეკუთვნის.', en: 'This file is not in your account.', ru: 'Этот файл не из вашего аккаунта.' },
  unreadable: { ka: 'ფაილი ვერ წავიკითხე.', en: 'I could not read the file.', ru: 'Не удалось прочитать файл.' },
  too_long: { ka: 'ფაილი ძალიან გრძელია (მაქს. 30 წუთი).', en: 'The file is too long (up to 30 minutes).', ru: 'Файл слишком длинный (до 30 минут).' },
  not_youtube: { ka: 'ეს YouTube-ის ვიდეოს ბმული არ არის.', en: 'This is not a YouTube video link.', ru: 'Это не ссылка на видео YouTube.' },
  reference_refused: { ka: 'Gemini-მ ამ ფაილის მიღება ვერ შეძლო.', en: 'Gemini could not take this file.', ru: 'Gemini не смог принять этот файл.' },
  rate_limited: { ka: 'დღეს ბევრი ანალიზი გააკეთე; სცადე მოგვიანებით.', en: 'You have run many analyses today; try again later.', ru: 'Сегодня было много разборов; попробуйте позже.' },
  budget: { ka: 'ანალიზი დროებით შეჩერებულია. სცადე მოგვიანებით.', en: 'Analysis is paused for now. Try again later.', ru: 'Разбор временно приостановлен. Попробуйте позже.' },
  not_configured: { ka: 'ანალიზი ამ სერვერზე ჯერ არ არის ჩართული.', en: 'Analysis is not set up on this server yet.', ru: 'Разбор на этом сервере ещё не настроен.' },
  closed: { ka: 'ფაილის ანალიზი შენთვის ჯერ არ არის ჩართული.', en: 'File analysis is not open to you yet.', ru: 'Разбор файлов для вас пока не открыт.' },
  unauthenticated: { ka: 'ჯერ შედი ანგარიშზე.', en: 'Sign in first.', ru: 'Сначала войдите.' },
  network: { ka: 'ანალიზი ვერ დასრულდა. სცადე თავიდან.', en: 'The analysis did not finish. Try again.', ru: 'Разбор не завершился. Попробуйте снова.' },
};

export function analyzeErrorText(code: string | undefined, locale: string): string {
  const lang = pick(locale);
  return (ERR[code ?? 'network'] ?? ERR.network!)[lang];
}

export interface AnalyzeCardModel extends TaskCardModel {
  /** Scenes as chips: „0:00–0:12 · a street at night". */
  scenes: Array<{ at: string; text: string }>;
  moments: Array<{ at: string; text: string }>;
  speakers: string[];
  transcript: Array<{ at: string; who: string | null; text: string }>;
  objects: string[];
  /** The line under the steps: what it cost the user, and that a link was only read. */
  note: string | null;
}

export function analyzeCard(s: AgentAnalyzeState, locale: string): AnalyzeCardModel {
  const lang = pick(locale);
  const keys = ['source', 'read', 'answer'] as const;
  let at: number;
  if (s.phase === 'done') at = 3;
  else if (s.phase === 'failed') at = s.error === 'upload_failed' ? 0 : 1;
  else at = s.source === 'file' && !s.uploaded ? 0 : 1;
  const steps: TaskStep[] = keys.map((key, i) => {
    let state: StepState = i < at ? 'done' : i === at ? (s.phase === 'failed' ? 'failed' : 'active') : (s.phase === 'failed' ? 'skipped' : 'pending');
    if (s.phase === 'done') state = 'done';
    const label = key === 'source' ? say(s.source === 'file' ? 'upload' : 'link', lang) : say(key, lang);
    const step: TaskStep = { key, label, state };
    if (key === 'source' && s.name && state === 'done') step.detail = s.name;
    if (state === 'failed') { step.detail = analyzeErrorText(s.error, locale); step.warn = true; }
    if (key === 'read' && state === 'done' && s.answer) {
      const len = s.answer.durationSec ? ` · ${atText(s.answer.durationSec)}` : '';
      step.detail = `${s.answer.type}${len}`;
    }
    return step;
  });
  const done = steps.filter((x) => x.state === 'done').length;
  const a = s.answer?.analysis;
  const timed = s.answer?.type === 'video' || s.answer?.type === 'audio';
  const model: AnalyzeCardModel = {
    title: say('title', lang),
    steps,
    done,
    total: steps.length,
    countText: countText(done, steps.length, locale),
    status: s.phase === 'done' ? 'done' : s.phase === 'failed' ? 'failed' : 'working',
    statusText: say(s.phase === 'done' ? 'done' : s.phase === 'failed' ? 'failed' : 'working', lang),
    pct: null,
    clock: s.t0 ? (s.phase === 'reading' ? { from: s.t0 } : s.t1 ? { from: s.t0, to: s.t1 } : null) : null,
    scenes: a && timed ? a.scenes.map((x) => ({ at: `${atText(x.startSec)}–${atText(x.endSec)}`, text: x.description })) : [],
    moments: a && timed ? a.moments.map((x) => ({ at: atText(x.atSec), text: x.why })) : [],
    speakers: a ? a.speakers.map((x) => `${x.id}: ${x.description}`) : [],
    transcript: a && timed ? a.transcript.map((x) => ({ at: atText(x.startSec), who: x.speaker, text: x.text })) : [],
    objects: a ? a.objects : [],
    note: s.phase === 'done' ? (s.source === 'youtube' ? `${say('onlyRead', lang)} · ${say('free', lang)}` : say('free', lang)) : null,
  };
  return model;
}
