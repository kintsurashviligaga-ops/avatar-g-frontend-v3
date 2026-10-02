/**
 * lib/research/request.ts — request-body validation for the research routes. Pure: every function takes `unknown` and answers
 * a value or the list of reasons, never throws, never trusts a field's type.
 *
 * Bounded EVERYWHERE: a prompt is at most RESEARCH_PROMPT_MAX_CHARS characters (refused, not silently cut — what the user
 * confirmed is what runs), a run attaches at most RESEARCH_ATTACH_MAX documents, an idempotency key is a short token.
 */
import { RESEARCH_ATTACH_MAX, RESEARCH_PROMPT_MAX_CHARS } from './context';
import type { ResearchLocale } from './types';

export const ASK_MAX_CHARS = 1_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

export const asLocale = (v: unknown): ResearchLocale => (v === 'en' || v === 'ru' ? v : 'ka');

export interface StartBody {
  prompt: string;
  locale: ResearchLocale;
  fileIds: string[];
  confirmedCredits: number | null;
  requestId: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reasons: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseStartBody(raw: unknown, headerRequestId?: string | null): Parsed<StartBody> {
  if (!isObj(raw)) return { ok: false, reasons: ['body must be a JSON object'] };
  const reasons: string[] = [];

  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (prompt.length < 3) reasons.push('prompt is required (at least 3 characters)');
  else if (prompt.length > RESEARCH_PROMPT_MAX_CHARS) reasons.push(`prompt is longer than ${RESEARCH_PROMPT_MAX_CHARS} characters`);

  let fileIds: string[] = [];
  if (raw.fileIds !== undefined && raw.fileIds !== null) {
    if (!Array.isArray(raw.fileIds) || raw.fileIds.some((x) => typeof x !== 'string' || !UUID_RE.test(x))) reasons.push('fileIds must be a list of document ids');
    else {
      fileIds = [...new Set(raw.fileIds as string[])];
      if (fileIds.length > RESEARCH_ATTACH_MAX) reasons.push(`at most ${RESEARCH_ATTACH_MAX} documents can be attached`);
    }
  }

  let confirmedCredits: number | null = null;
  if (raw.confirmedCredits !== undefined && raw.confirmedCredits !== null) {
    if (typeof raw.confirmedCredits !== 'number' || !Number.isInteger(raw.confirmedCredits) || raw.confirmedCredits < 0 || raw.confirmedCredits > 1_000_000) {
      reasons.push('confirmedCredits must be a whole number');
    } else confirmedCredits = raw.confirmedCredits;
  }

  const idRaw = typeof raw.requestId === 'string' ? raw.requestId.trim() : typeof headerRequestId === 'string' ? headerRequestId.trim() : '';
  let requestId: string | null = null;
  if (idRaw) {
    if (!REQUEST_ID_RE.test(idRaw)) reasons.push('requestId must be 8–100 letters, digits, "-" or "_"');
    else requestId = idRaw;
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, value: { prompt, locale: asLocale(raw.locale), fileIds, confirmedCredits, requestId } };
}

export type AskMode = 'ask' | 'summarize' | 'takeaways';

export interface AskBody {
  mode: AskMode;
  question: string;
  locale: ResearchLocale;
}

export function parseAskBody(raw: unknown): Parsed<AskBody> {
  if (!isObj(raw)) return { ok: false, reasons: ['body must be a JSON object'] };
  const mode: AskMode = raw.mode === 'summarize' || raw.mode === 'takeaways' ? raw.mode : 'ask';
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (mode === 'ask' && question.length < 2) return { ok: false, reasons: ['question is required'] };
  if (question.length > ASK_MAX_CHARS) return { ok: false, reasons: [`question is longer than ${ASK_MAX_CHARS} characters`] };
  return { ok: true, value: { mode, question, locale: asLocale(raw.locale) } };
}

export const isJobId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
