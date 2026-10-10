/**
 * lib/agent/media/analyzeExec.ts — Agent G reads one whole file with Gemini and says what is in it (PART 3, G1).
 * Every effect is injected (./analyzeLive wires the real ones), so the whole path is tested offline.
 *
 *   source   one of the caller's own files (an upload path, a Library item, a result of ours: ./editExec's rule, through
 *            lib/security/callerMedia, a file of another host is refused), or a public YouTube video, for analysis only.
 *   probe    the file's real length (ffprobe): too long is refused before any model call, and every time the model gives
 *            back is checked against it (./analyzeSpec parseAnalysis).
 *   model    one Gemini call through the existing transport (lib/ai/google/transport: GEMINI_TRANSPORT picks Vertex or the
 *            API key, never both, never another provider). The file goes BY REFERENCE (fileData.fileUri): the bytes are
 *            never read into this function. When the transport refuses the reference, the answer says so
 *            (`reference_refused`): there is no silent fallback to inline bytes or to another endpoint.
 *   budget   the platform's chat budget gate before the call, the call's real token usage booked after it.
 *
 * Nothing here charges the user, starts a job or writes their data; the audit row carries the kind, the length, the
 * model and the tokens, never the file's link.
 */
import {
  ANALYZE_FOCUS, ANALYSIS_RESPONSE_SCHEMA, LOW_RES_AFTER_SEC, MAX_ANALYZE_SEC, MAX_QUESTION_CHARS,
  analyzePrompt, analyzeTypeOf, parseAnalysis, youtubeVideoUrl,
  type AnalyzeFocus, type AnalyzeKind, type MediaAnalysis,
} from './analyzeSpec';
import type { BannerProbe } from '@/lib/video/probeBanner';
import type { AuditEvent } from './montageExec';

export type AnalyzeErrorCode =
  | 'bad_input' | 'unsupported_type' | 'media_not_yours' | 'unreadable' | 'too_long' | 'not_youtube'
  | 'not_configured' | 'budget' | 'reference_refused' | 'rate_limited' | 'model_failed' | 'bad_answer';

export type AnalyzeSource = { kind: 'file'; ref: string } | { kind: 'youtube'; url: string };

export interface AnalyzeInput {
  userId: string;
  source: AnalyzeSource;
  focus?: AnalyzeFocus;
  question?: string | null;
  lang?: string;
}

export type AnalyzeResult =
  | {
    ok: true;
    analysis: MediaAnalysis;
    source: { kind: 'file' | 'youtube'; type: AnalyzeKind; durationSec: number | null };
    model: string;
    usage: { inputTokens: number | null; outputTokens: number | null };
  }
  | { ok: false; error: AnalyzeErrorCode; message: string };

export interface AnalyzeDeps {
  /** The caller's own file as a short-lived link, or why not (lib/security/callerMedia). */
  resolveFile(ref: string, userId: string): Promise<{ ok: true; url: string } | { ok: false; reason: 'not_yours' | 'unreadable' }>;
  probe(url: string): Promise<BannerProbe | null>;
  /** The model id to call (catalog-checked), or null when none is configured. */
  model(): string | null;
  /** One generateContent call on the selected transport (lib/ai/google/transport googleModelFetch). */
  generate(model: string, body: unknown, signal: AbortSignal): Promise<Response>;
  /** The platform's AI budget gate (lib/services/billing), on the call's estimated input tokens. */
  budgetAllows(inputTokens: number, model: string): Promise<boolean>;
  book(usage: { model: string; userId: string; inputTokens?: number; outputTokens?: number }): Promise<void>;
  /** One audit row (./montageLive audit): what was read and what it cost, never the file's link. */
  audit(ev: AuditEvent): Promise<void> | void;
  timeoutMs?: number;
}

const fail = (error: AnalyzeErrorCode, message: string): AnalyzeResult => ({ ok: false, error, message });

const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** What the transport's refusal means. A 400 that names the file reference is the transport not taking the link. */
function refusalOf(status: number, body: string): AnalyzeErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'not_configured';
  if (status === 400 && /file_?uri|fileData|file_data|uri|url|unsupported.*(?:file|mime)|cannot fetch|could not fetch|not.*accessible/i.test(body)) {
    return 'reference_refused';
  }
  return 'model_failed';
}

export async function analyzeMedia(deps: AnalyzeDeps, input: AnalyzeInput): Promise<AnalyzeResult> {
  const focus: AnalyzeFocus = ANALYZE_FOCUS.includes(input.focus as AnalyzeFocus) ? input.focus! : 'overview';
  const lang = input.lang === 'en' || input.lang === 'ru' ? input.lang : 'ka';
  const question = typeof input.question === 'string' ? input.question.trim().slice(0, MAX_QUESTION_CHARS) : '';
  if (focus === 'question' && !question) return fail('bad_input', 'A question is needed.');
  const src = input.source;

  // 1) The file, as a link Gemini can read, its type and its real length.
  let fileUri: string;
  let mime: string;
  let type: AnalyzeKind;
  let durationSec: number | null = null;
  if (src?.kind === 'youtube') {
    const url = youtubeVideoUrl(src.url);
    if (!url) return fail('not_youtube', 'Only a public YouTube video link can be analysed this way.');
    fileUri = url;
    // The form Vertex's own YouTube example uses; the Gemini API takes it too (its mime type is optional there).
    mime = 'video/mp4';
    type = 'video';
  } else if (src?.kind === 'file' && typeof src.ref === 'string' && src.ref.trim()) {
    const t = analyzeTypeOf(src.ref);
    if (!t) return fail('unsupported_type', 'This kind of file cannot be analysed: a video, a sound file, a PDF or a picture can.');
    const r = await deps.resolveFile(src.ref, input.userId);
    if (!r.ok) return r.reason === 'not_yours' ? fail('media_not_yours', 'That file is not yours.') : fail('unreadable', 'The file cannot be read.');
    if (t.kind === 'video' || t.kind === 'audio') {
      const probe = await deps.probe(r.url);
      if (!probe || !(probe.durationSec > 0)) return fail('unreadable', 'The file cannot be read.');
      if (t.kind === 'video' && !probe.hasVideo && !probe.hasAudio) return fail('unreadable', 'The file has no picture or sound.');
      if (probe.durationSec > MAX_ANALYZE_SEC) {
        return fail('too_long', `The file is ${fmt(probe.durationSec)} long; up to ${fmt(MAX_ANALYZE_SEC)} can be analysed.`);
      }
      durationSec = probe.durationSec;
    }
    fileUri = r.url;
    mime = t.mime;
    type = t.kind;
  } else {
    return fail('bad_input', 'Name one file or one YouTube link.');
  }

  // 2) The model, through the one transport, inside the budget.
  const model = deps.model();
  if (!model) return fail('not_configured', 'File analysis is not configured on this server.');
  const prompt = analyzePrompt({ kind: type, focus, lang, question });
  // The estimate the budget gate sees: the instruction plus the file at the rate it will be read (a YouTube video of
  // unknown length counts as the longest one taken; a page or a picture as a few thousand tokens).
  const lowRes = type === 'video' && (durationSec === null || durationSec > LOW_RES_AFTER_SEC);
  const fileTokens = type === 'video' || type === 'audio'
    ? Math.round((durationSec ?? MAX_ANALYZE_SEC) * (type === 'audio' ? 32 : lowRes ? 100 : 300))
    : 4_000;
  if (!(await deps.budgetAllows(Math.ceil(prompt.length / 4) + fileTokens, model))) {
    return fail('budget', 'File analysis is paused: the platform\'s AI budget for now is used up.');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ fileData: { mimeType: mime, fileUri } }, { text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 16_384,
      ...(lowRes ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
    },
  };
  let res: Response;
  try {
    res = await deps.generate(model, body, AbortSignal.timeout(deps.timeoutMs ?? 110_000));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    // NotConfiguredError (lib/contracts/geminiTransport) names missing variables, never values.
    if (/not configured|NotConfigured/i.test(msg) || (e as { name?: string })?.name === 'NotConfiguredError') {
      return fail('not_configured', 'File analysis is not configured on this server.');
    }
    return fail('model_failed', 'The analysis did not answer in time.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const code = refusalOf(res.status, text);
    void deps.audit({ userId: input.userId, op: 'media_analyze', phase: 'analyze', outcome: 'refused', ...(durationSec !== null ? { durationSec } : {}), detail: `${type} ${src.kind}; ${model}; HTTP ${res.status} ${code}` });
    return fail(code, code === 'reference_refused'
      ? 'The model could not open the file by its link on this server\'s Gemini endpoint.'
      : code === 'rate_limited' ? 'Too many analyses right now. Try again in a minute.' : 'The analysis failed.');
  }
  const json = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  } | null;
  const inputTokens = json?.usageMetadata?.promptTokenCount ?? null;
  const outputTokens = json?.usageMetadata ? (json.usageMetadata.candidatesTokenCount ?? 0) + (json.usageMetadata.thoughtsTokenCount ?? 0) : null;
  void deps.book({ model, userId: input.userId, ...(inputTokens !== null ? { inputTokens } : {}), ...(outputTokens !== null ? { outputTokens } : {}) }).catch(() => undefined);

  const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const analysis = parseAnalysis(text, { kind: type, durationSec });
  void deps.audit({
    userId: input.userId, op: 'media_analyze', phase: 'analyze', outcome: analysis ? 'ok' : 'failed',
    ...(durationSec !== null ? { durationSec } : {}),
    detail: `${type} ${src.kind}; ${focus}; ${model}; tokens ${inputTokens ?? '?'} in, ${outputTokens ?? '?'} out; ${analysis ? `${analysis.dropped} dropped` : 'unreadable answer'}`,
  });
  if (!analysis) return fail('bad_answer', 'The analysis came back unreadable.');
  return { ok: true, analysis, source: { kind: src.kind, type, durationSec }, model, usage: { inputTokens, outputTokens } };
}
