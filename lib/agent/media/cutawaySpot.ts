/**
 * lib/agent/media/cutawaySpot.ts — which of the speaker's lines get footage, and what footage (GG 2026-11-05 14:32Z).
 *
 * One Gemini call reads the speaker's video (by reference, like ./analyzeExec) and returns his lines in order, each
 * with its start and end, what he says, whether a picture would show it (a place, a thing, an event, a number on a
 * chart — not „hello", not a joke about himself), and a short ENGLISH stock-footage search (Pexels is searched in
 * English) plus a one-line prompt for a generated shot when the stock has nothing. The times are checked against the
 * file's real length; a line outside it is dropped, not moved.
 *
 * Effects are injected: the transport, the budget gate and the booking are ./analyzeLive's.
 */
import type { AnalyzeDeps } from './analyzeExec';

export interface SpottedLine {
  startSec: number;
  endSec: number;
  text: string;
  /** A picture of what is said would help the viewer. */
  visual: boolean;
  /** 2–5 English words for a stock search („cosmic web simulation", „city traffic at night"). */
  query: string;
  /** One sentence for a generated shot (Veo) when the stock has nothing. */
  prompt: string;
}

export const CUTAWAY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          startSec: { type: 'NUMBER' },
          endSec: { type: 'NUMBER' },
          text: { type: 'STRING' },
          visual: { type: 'BOOLEAN' },
          query: { type: 'STRING' },
          prompt: { type: 'STRING' },
        },
        required: ['startSec', 'endSec', 'text', 'visual', 'query', 'prompt'],
      },
    },
  },
  required: ['lines'],
} as const;

export function cutawayPrompt(topic?: string | null): string {
  return [
    'This is a video of a person speaking to camera (a presenter, a vlogger, a news reader).',
    'An editor will cover some of the sentences with real footage of what is being talked about, in a split screen.',
    'List every spoken line in order: startSec and endSec (seconds from the start of the file, as numbers, where the words',
    'really start and end), text (the words exactly as heard, in their own language).',
    'visual: true when footage of what the line talks about would help the viewer (a place, an object, an event, a',
    'process, a person by role, data); false for greetings, sign-offs, and lines about the speaker himself.',
    'query: 2 to 5 ENGLISH words to search a stock video library for that footage: concrete and filmable',
    '(„galaxy cluster simulation", „busy airport terminal"), never abstract words, never the speaker.',
    'prompt: one English sentence describing that shot for a video generator, cinematic, no people talking, no text.',
    ...(topic ? [`The editor's request: ${topic.slice(0, 400)}`] : []),
    'Only report what is actually said. Never invent lines.',
  ].join(' ');
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The model's JSON as lines, or null when it is not that. Lines outside the file are dropped. */
export function parseCutaways(raw: unknown, durationSec: number): SpottedLine[] | null {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  }
  const lines = (v as { lines?: unknown })?.lines;
  if (!Array.isArray(lines)) return null;
  const out: SpottedLine[] = [];
  for (const l of lines.slice(0, 200)) {
    const o = l as Record<string, unknown>;
    if (!fin(o.startSec) || !fin(o.endSec)) continue;
    const startSec = Math.max(0, o.startSec), endSec = Math.min(durationSec, o.endSec);
    if (!(endSec > startSec) || o.startSec > durationSec + 0.5) continue;
    const text = clean(o.text, 400);
    if (!text) continue;
    const query = clean(o.query, 80).replace(/[^\p{L}\p{N} '-]/gu, '').trim();
    out.push({ startSec, endSec, text, visual: o.visual === true && !!query, query, prompt: clean(o.prompt, 300) });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

export type SpotResult = { ok: true; lines: SpottedLine[]; model: string } | { ok: false; error: string };

/** Read the speaker's lines from his video (`url`: a link Gemini can fetch). */
export async function spotCutaways(
  deps: Pick<AnalyzeDeps, 'model' | 'generate' | 'budgetAllows' | 'book'>,
  input: { url: string; mime: string; durationSec: number; userId: string; topic?: string | null; signal?: AbortSignal },
): Promise<SpotResult> {
  const model = deps.model();
  if (!model) return { ok: false, error: 'no analysis model is configured' };
  // ~300 tokens a second of video at default resolution, the sound included.
  if (!(await deps.budgetAllows(Math.ceil(input.durationSec * 300) + 2_000, model).catch(() => false))) {
    return { ok: false, error: 'the AI budget refused the analysis' };
  }
  const body = {
    contents: [{ role: 'user', parts: [{ fileData: { mimeType: input.mime, fileUri: input.url } }, { text: cutawayPrompt(input.topic) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: CUTAWAY_SCHEMA, temperature: 0.2 },
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 110_000);
  const onAbort = () => ctl.abort();
  input.signal?.addEventListener('abort', onAbort);
  try {
    const res = await deps.generate(model, body, ctl.signal);
    const json = (await res.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    } | null;
    const u = json?.usageMetadata;
    if (u) {
      await deps.book({ model, userId: input.userId, inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }).catch(() => {});
    }
    if (!res.ok) return { ok: false, error: `the analysis failed (${res.status})` };
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const lines = parseCutaways(text, input.durationSec);
    return lines ? { ok: true, lines, model } : { ok: false, error: 'the analysis did not return the lines' };
  } catch (e) {
    return { ok: false, error: ctl.signal.aborted ? 'the analysis timed out' : e instanceof Error ? e.message : 'analysis failed' };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}
