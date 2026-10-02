/**
 * lib/research/parse.ts — a TOLERANT reader for an Interactions API `Interaction` resource, the answer of
 * `GET /v1beta/interactions/{id}` for a Deep Research run. Pure and isomorphic (fixtures in lib/research/__fixtures__).
 *
 * WHAT THE API SHOWS (reference + guide, ai.google.dev, checked 2026-10-02 — the fixtures are written from it, not
 * captured live: no paid calls were made):
 *   { id, status: 'in_progress' | 'queued' | 'requires_action' | 'completed' | 'incomplete' | 'failed' | 'cancelled'
 *                | 'budget_exceeded' (deprecated),
 *     steps: [ { type: 'thought', summary: [{type:'text', text}] },
 *              { type: 'google_search_call', arguments: { queries: [...] } },
 *              { type: 'url_context_call', arguments: { urls: [...] } },
 *              { type: 'model_output', content: [ {type:'text', text, annotations:[{type:'url_citation', url, title,
 *                                                  start_index, end_index}]}, {type:'image', data} ] }, … ],
 *     errors: [{ code, message }], usage: { total_input_tokens, total_output_tokens, … } }
 * The guide reads the report as `steps[-1].content[0].text`; the SDK helper calls it `outputText`.
 *
 * ⚠️ THE SHAPE HAS MOVED BEFORE, SO NOTHING HERE TRUSTS ONE. The older Gemini API shape was `outputs: [{type:'text',
 * text}]` (the report = the LAST text output) and Vertex wraps the same steps under `response`; a `state` string, a
 * top-level `output_text` / `outputText`, a `citations` array and `candidates[].groundingMetadata` all appear in
 * neighbouring shapes. The report is looked for in that order of trust, sources in theirs, and a field that is missing or
 * the wrong type is skipped — a malformed answer degrades to "no report yet", it never throws into the sweeper.
 *
 * ⚠️ `index` FIELDS ARE UTF-8 BYTE OFFSETS — never string indices (Georgian is 3 bytes a letter). Nothing here cuts the
 * text with them; the sources are listed under the report rather than injected into it.
 *
 * ⚠️ NO REGEX HERE USES AN UNBOUNDED QUANTIFIER ON MODEL TEXT (a 400 KB report goes through the markdown-link scan).
 */
import type { ResearchProgress, ResearchSource } from './types';

export type InteractionStatus =
  | 'in_progress'
  | 'queued'
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'cancelled'
  | 'requires_action'
  | 'unknown';

export interface ParsedInteraction {
  id: string | null;
  status: InteractionStatus;
  /** The status string as the provider wrote it (diagnostics only). */
  rawStatus: string;
  /** The report, Markdown. '' when there is none. */
  report: string;
  sources: ResearchSource[];
  progress: ResearchProgress;
  usage: Record<string, number>;
  /** Short internal diagnostic ("code: message"); never shown to a user. */
  error: string | null;
  /** Generated images the answer carried (we do not store or render them). */
  imagesDropped: number;
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
/** 'model_output' · 'modelOutput' · 'MODEL-OUTPUT' → 'modeloutput'. */
const kind = (v: unknown): string => str(v).toLowerCase().replace(/[^a-z]/g, '');

export const MAX_SOURCES = 120;
const MAX_TITLE = 200;
const MAX_URL = 2_000;

export function normalizeStatus(raw: unknown): InteractionStatus {
  const s = str(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (s) {
    case 'in_progress':
    case 'running':
    case 'processing':
    case 'active':
      return 'in_progress';
    case 'queued':
    case 'pending':
      return 'queued';
    case 'completed':
    case 'complete':
    case 'succeeded':
    case 'success':
    case 'done':
      return 'completed';
    case 'incomplete':
    case 'budget_exceeded':
      return 'incomplete';
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'requires_action':
      return 'requires_action';
    default:
      return 'unknown';
  }
}

/** An http(s) URL, trimmed and bounded; anything else (javascript:, data:, relative) is not a source. */
export function cleanUrl(v: unknown): string | null {
  const s = str(v).trim();
  if (!s || s.length > MAX_URL || !/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString() ? s : null;
  } catch {
    return null;
  }
}

const cleanTitle = (v: unknown): string | undefined => {
  const t = str(v).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return t || undefined;
};

function pushSource(into: ResearchSource[], seen: Set<string>, url: unknown, title: unknown): void {
  const u = cleanUrl(url);
  if (!u) return;
  const key = u.split('#')[0]!;
  if (seen.has(key) || into.length >= MAX_SOURCES) return;
  seen.add(key);
  const t = cleanTitle(title);
  into.push(t ? { url: u, title: t } : { url: u });
}

/** Sources from a text part's `annotations` (url_citation · file_citation · place_citation · anything with a link). */
function annotationSources(annotations: unknown, into: ResearchSource[], seen: Set<string>): void {
  for (const a of arr(annotations)) {
    if (!isRec(a)) continue;
    const k = kind(a.type);
    if (k === 'filecitation') pushSource(into, seen, a.document_uri ?? a.documentUri ?? a.uri ?? a.url, a.file_name ?? a.fileName ?? a.title);
    else if (k === 'placecitation') pushSource(into, seen, a.url ?? a.uri, a.name ?? a.title);
    else pushSource(into, seen, a.url ?? a.uri ?? a.link, a.title ?? a.name);
  }
}

/** Markdown links `[title](https://…)` — the last-resort source list (bounded quantifiers, bounded scan). */
export function markdownLinkSources(report: string, into: ResearchSource[] = [], seen: Set<string> = new Set()): ResearchSource[] {
  const re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/g;
  let m: RegExpExecArray | null;
  let guard = 0;
  const text = report.length > 600_000 ? report.slice(0, 600_000) : report;
  while ((m = re.exec(text)) !== null && guard++ < 2_000) pushSource(into, seen, m[2], m[1]);
  return into;
}

/** Plain text of a progress snippet: markdown emphasis stripped, whitespace collapsed, bounded. */
function snippet(text: string, max = 240): string {
  const s = text.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function textParts(content: unknown): { texts: string[]; annotations: unknown[]; images: number } {
  const texts: string[] = [];
  const annotations: unknown[] = [];
  let images = 0;
  for (const part of arr(content)) {
    if (typeof part === 'string') {
      if (part.trim()) texts.push(part);
      continue;
    }
    if (!isRec(part)) continue;
    const k = kind(part.type);
    if (k === 'image') {
      images += 1;
      continue;
    }
    if (k === 'text' || (!k && typeof part.text === 'string')) {
      const t = str(part.text);
      if (t.trim()) {
        texts.push(t);
        annotations.push(...arr(part.annotations));
      }
    }
  }
  return { texts, annotations, images };
}

interface ReportFound {
  report: string;
  annotations: unknown[];
  images: number;
}

function reportFromSteps(steps: unknown[]): ReportFound | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!isRec(step) || kind(step.type) !== 'modeloutput') continue;
    const { texts, annotations, images } = textParts(step.content);
    if (texts.length > 0) return { report: texts.join('\n\n').trim(), annotations, images };
  }
  return null;
}

function reportFromOutputs(outputs: unknown[]): ReportFound | null {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const o = outputs[i];
    if (typeof o === 'string' && o.trim()) return { report: o.trim(), annotations: [], images: 0 };
    if (!isRec(o)) continue;
    const k = kind(o.type);
    if ((k === 'text' || !k) && str(o.text).trim()) return { report: str(o.text).trim(), annotations: arr(o.annotations), images: 0 };
    // an output that is itself a step: { type: 'model_output', content: [...] }
    if (k === 'modeloutput') {
      const { texts, annotations, images } = textParts(o.content);
      if (texts.length > 0) return { report: texts.join('\n\n').trim(), annotations, images };
    }
  }
  return null;
}

function reportFromCandidates(candidates: unknown[]): { found: ReportFound; grounding: unknown } | null {
  const c = candidates.find(isRec) as Rec | undefined;
  if (!c) return null;
  const content = isRec(c.content) ? c.content : {};
  const { texts, images } = textParts(content.parts);
  if (texts.length === 0) return null;
  return { found: { report: texts.join('').trim(), annotations: [], images }, grounding: c.groundingMetadata };
}

function groundingSources(grounding: unknown, into: ResearchSource[], seen: Set<string>): void {
  if (!isRec(grounding)) return;
  for (const chunk of arr(grounding.groundingChunks ?? grounding.grounding_chunks)) {
    if (!isRec(chunk)) continue;
    const web = isRec(chunk.web) ? chunk.web : chunk;
    pushSource(into, seen, web.uri ?? web.url, web.title);
  }
}

/** What the agent is doing: the newest thought summary and the search calls so far (thought → google_search_call steps). */
function collectProgress(steps: unknown[]): ResearchProgress {
  let summary: string | undefined;
  let searches = 0;
  let lastQuery: string | undefined;
  for (const step of steps) {
    if (!isRec(step)) continue;
    const k = kind(step.type);
    if (k === 'thought') {
      const parts = arr(step.summary);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        const t = typeof p === 'string' ? p : isRec(p) ? str(p.text) : '';
        if (t.trim()) {
          summary = snippet(t);
          break;
        }
      }
    } else if (k === 'googlesearchcall') {
      const queries = arr(isRec(step.arguments) ? step.arguments.queries : undefined).map(str).filter((q) => q.trim());
      searches += queries.length || 1;
      const q = queries[queries.length - 1];
      if (q) lastQuery = snippet(q, 120);
    }
  }
  return {
    ...(summary ? { summary } : {}),
    ...(searches > 0 ? { searches } : {}),
    ...(steps.length > 0 ? { steps: steps.length } : {}),
    ...(lastQuery ? { lastQuery } : {}),
  };
}

function collectUsage(usage: unknown): Record<string, number> {
  if (!isRec(usage)) return {};
  const out: Record<string, number> = {};
  const set = (key: string, v: unknown) => {
    const n = num(v);
    if (n !== undefined) out[key] = n;
  };
  set('inputTokens', usage.total_input_tokens ?? usage.totalInputTokens ?? usage.promptTokenCount);
  set('outputTokens', usage.total_output_tokens ?? usage.totalOutputTokens ?? usage.candidatesTokenCount);
  set('thoughtTokens', usage.total_thought_tokens ?? usage.totalThoughtTokens ?? usage.thoughtsTokenCount);
  set('toolUseTokens', usage.total_tool_use_tokens ?? usage.totalToolUseTokens);
  set('cachedTokens', usage.total_cached_tokens ?? usage.totalCachedTokens ?? usage.cachedContentTokenCount);
  set('totalTokens', usage.total_tokens ?? usage.totalTokens ?? usage.totalTokenCount);
  const groundings = arr(usage.grounding_tool_count ?? usage.groundingToolCount);
  const searches = groundings.reduce<number>((s, g) => (isRec(g) && kind(g.type) === 'googlesearch' ? s + (num(g.count) ?? 0) : s), 0);
  if (searches > 0) out.searches = searches;
  return out;
}

function collectError(body: Rec): string | null {
  const bits: string[] = [];
  const one = (e: unknown) => {
    if (typeof e === 'string' && e.trim()) bits.push(e.trim());
    else if (isRec(e)) {
      const code = str(e.code ?? e.status);
      const message = str(e.message);
      if (code || message) bits.push(code && message ? `${code}: ${message}` : code || message);
    }
  };
  one(body.error);
  for (const e of arr(body.errors)) one(e);
  if (bits.length === 0) return null;
  return bits.join('; ').replace(/\s+/g, ' ').slice(0, 300);
}

/** Parse one Interaction resource (or an operation wrapping one). Total: never throws. */
export function parseInteraction(raw: unknown): ParsedInteraction {
  const top = isRec(raw) ? raw : {};
  // Vertex-style operation: { name, done, response: { …interaction… } } — read the inner resource when the outer has none.
  const inner = isRec(top.response) && !('steps' in top) && !('outputs' in top) && !('status' in top) ? (top.response as Rec) : top;
  const body = inner;

  let rawStatus = str(body.status) || str(body.state) || str(top.status) || str(top.state);
  if (!rawStatus && top.done === true) rawStatus = top.error ? 'failed' : 'completed';
  const status = normalizeStatus(rawStatus);

  const steps = arr(body.steps);
  let found: ReportFound | null = reportFromSteps(steps);
  let grounding: unknown;
  if (!found) found = reportFromOutputs(arr(body.outputs));
  if (!found) {
    const flat = str(body.output_text) || str(body.outputText);
    if (flat.trim()) found = { report: flat.trim(), annotations: [], images: 0 };
  }
  if (!found) {
    const cand = reportFromCandidates(arr(body.candidates));
    if (cand) {
      found = cand.found;
      grounding = cand.grounding;
    }
  }

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();
  if (found) annotationSources(found.annotations, sources, seen);
  if (sources.length === 0) {
    // Citations that sit on other parts of the answer (an earlier text part, an earlier model_output step).
    for (const step of steps) {
      if (isRec(step) && kind(step.type) === 'modeloutput') annotationSources(textParts(step.content).annotations, sources, seen);
    }
  }
  for (const c of arr(body.citations)) {
    if (isRec(c)) pushSource(sources, seen, c.url ?? c.uri, c.title);
  }
  groundingSources(grounding ?? body.groundingMetadata, sources, seen);
  if (sources.length === 0 && found) markdownLinkSources(found.report, sources, seen);

  return {
    id: str(body.id) || str(top.id) || null,
    status,
    rawStatus,
    report: found?.report ?? '',
    sources,
    progress: collectProgress(steps),
    usage: collectUsage(body.usage),
    error: collectError(body),
    imagesDropped: found?.images ?? 0,
  };
}

/** The interaction id out of a CREATE answer (`{ id }`, or a name like `interactions/abc`). Null when unusable. */
export function parseInteractionId(raw: unknown): string | null {
  if (!isRec(raw)) return null;
  const id = (str(raw.id) || str(raw.name).replace(/^interactions\//, '')).trim();
  return /^[A-Za-z0-9_-]{4,512}$/.test(id) ? id : null;
}

/**
 * A title for the report: its first `#`/`##` heading, else its first line, else the question — plain text, ≤ 140 chars.
 */
export function deriveTitle(report: string, prompt: string): string {
  const clean = (s: string) => s.replace(/[*_`#>[\]]+/g, '').replace(/\([^)]{0,200}\)/g, '').replace(/\s+/g, ' ').trim();
  const head = /^\s{0,3}#{1,2}\s+(.{1,300})$/m.exec(report.slice(0, 5_000));
  const fromHead = head ? clean(head[1]!) : '';
  const firstLine = clean(report.split('\n').find((l) => l.trim().length > 0) ?? '');
  const t = fromHead || firstLine || clean(prompt);
  return t.length > 140 ? `${t.slice(0, 139).trimEnd()}…` : t;
}
