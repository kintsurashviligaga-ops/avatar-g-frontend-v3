/**
 * components/studio/research/api.ts — the browser's client for /api/research*, /api/connectors* and the text extractor.
 *
 * Every function RESOLVES: a network failure, a timeout or a 5xx comes back as a value (`ok: false`, a status, and the
 * server's own sentence when it sent one), never as a throw — a research surface must degrade to "nothing here" or to a line
 * of text, never to a crashed chat. Money is never touched here: the start call carries the number the user SAW on the button
 * (`confirmedCredits`) and the server charges that number or refuses (409 price_changed).
 */
import type { ConnectorFile, ConnectorState } from '@/lib/connectors/types';
import type { ResearchJobPublic, ResearchSource } from '@/lib/research/types';

export interface ResearchCaps {
  available: boolean;
  credits: number;
  filesAvailable: boolean;
  maxActive: number;
  reason?: string;
}

export interface ConnectorLimits {
  maxFiles: number;
  maxFileChars: number;
  maxAttach: number;
  maxContextChars: number;
}

interface Raw {
  status: number; // 0 = network error / timeout
  body: Record<string, unknown> | null;
}

async function call(path: string, init: { method?: string; json?: unknown; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Raw> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
  const onAbort = () => ctrl.abort();
  init.signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: init.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, body: body && typeof body === 'object' ? body : null };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onAbort);
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const jobs = (v: unknown): ResearchJobPublic[] => (Array.isArray(v) ? (v.filter((j) => j && typeof j === 'object' && typeof (j as ResearchJobPublic).id === 'string') as ResearchJobPublic[]) : []);

// ─── capabilities ────────────────────────────────────────────────────────────────────────────────────────────

/** Is Deep Research usable on this deployment? `null` on ANY failure — the UI shows nothing rather than an error. */
export async function fetchCapabilities(): Promise<ResearchCaps | null> {
  const r = await call('/api/research/capabilities', { timeoutMs: 8_000 });
  const b = r.body;
  if (r.status !== 200 || !b) return null;
  return {
    available: b.available === true,
    credits: Math.max(0, Math.round(num(b.credits) ?? 0)),
    filesAvailable: b.filesAvailable === true,
    maxActive: Math.max(1, Math.round(num(b.maxActive) ?? 1)),
    ...(str(b.reason) ? { reason: str(b.reason) } : {}),
  };
}

// ─── jobs ────────────────────────────────────────────────────────────────────────────────────────────────────

export type ListResult =
  | { ok: true; items: ResearchJobPublic[]; available: boolean; serverNow: string | null }
  | { ok: false; unauthorized: boolean; status: number };

/** The signed-in user's newest jobs (no reports). `refresh` asks the server to poll running jobs at the provider first. */
export async function listJobs(opts: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<ListResult> {
  const r = await call(`/api/research?limit=20${opts.refresh ? '&refresh=1' : ''}`, { signal: opts.signal, timeoutMs: 25_000 });
  if (r.status === 401) return { ok: false, unauthorized: true, status: 401 };
  if (r.status !== 200 || !r.body) return { ok: false, unauthorized: false, status: r.status };
  return { ok: true, items: jobs(r.body.items), available: r.body.available !== false, serverNow: str(r.body.serverNow) ?? null };
}

export type JobResult = { ok: true; job: ResearchJobPublic } | { ok: false; status: number; notFound: boolean; unauthorized: boolean };

/** One job with its report and sources (a running one is polled at the provider by the server first). */
export async function fetchJob(id: string, opts: { signal?: AbortSignal } = {}): Promise<JobResult> {
  const r = await call(`/api/research/${encodeURIComponent(id)}`, { signal: opts.signal, timeoutMs: 25_000 });
  const job = r.body?.job as ResearchJobPublic | undefined;
  if (r.status === 200 && job && typeof job.id === 'string') return { ok: true, job };
  return { ok: false, status: r.status, notFound: r.status === 404, unauthorized: r.status === 401 };
}

export type StartResult =
  | { ok: true; job: ResearchJobPublic; replayed: boolean }
  | { ok: false; status: number; code: string; message: string | null; credits?: number; /** The outcome is unknown (network, timeout, 5xx without a code) — a retry must reuse the request id. */ ambiguous: boolean };

export async function startJob(input: { prompt: string; confirmedCredits: number; locale: string; fileIds: string[]; requestId: string }): Promise<StartResult> {
  const r = await call('/api/research/start', {
    method: 'POST',
    timeoutMs: 30_000,
    json: { prompt: input.prompt, confirmedCredits: input.confirmedCredits, locale: input.locale, fileIds: input.fileIds, requestId: input.requestId },
  });
  const job = r.body?.job as ResearchJobPublic | undefined;
  if ((r.status === 201 || r.status === 200) && job && typeof job.id === 'string') return { ok: true, job, replayed: r.body?.replayed === true };
  const code = str(r.body?.error) ?? (r.status === 0 ? 'network' : 'unavailable');
  return {
    ok: false,
    status: r.status,
    code,
    message: str(r.body?.message) ?? null,
    ...(num(r.body?.credits) !== undefined ? { credits: num(r.body?.credits) } : {}),
    ambiguous: r.status === 0 || (r.status >= 500 && !str(r.body?.error)),
  };
}

export type CancelResult = { ok: true; job: ResearchJobPublic } | { ok: false; status: number; message: string | null };

export async function cancelJob(id: string): Promise<CancelResult> {
  const r = await call(`/api/research/${encodeURIComponent(id)}/cancel`, { method: 'POST', json: {} });
  const job = r.body?.job as ResearchJobPublic | undefined;
  if (r.status === 200 && job && typeof job.id === 'string') return { ok: true, job };
  return { ok: false, status: r.status, message: str(r.body?.message) ?? null };
}

// ─── talking to a report ─────────────────────────────────────────────────────────────────────────────────────

export type AskResult = { ok: true; answer: string; truncated: boolean } | { ok: false; status: number; message: string | null };

export async function askReport(id: string, input: { mode: 'ask' | 'summarize' | 'takeaways'; question: string; locale: string; signal?: AbortSignal }): Promise<AskResult> {
  const r = await call(`/api/research/${encodeURIComponent(id)}/ask`, {
    method: 'POST',
    timeoutMs: 30_000,
    signal: input.signal,
    json: { mode: input.mode, question: input.question, locale: input.locale },
  });
  const answer = str(r.body?.answer);
  if (r.status === 200 && answer) return { ok: true, answer, truncated: r.body?.truncated === true };
  return { ok: false, status: r.status, message: str(r.body?.message) ?? null };
}

/** A source's favicon, drawn by OUR proxy (the user's browser never asks a third party which pages a report cited). */
export const faviconSrc = (domain: string): string => `/api/research/favicon?domain=${encodeURIComponent(domain)}`;

/** The hostname of a source URL without `www.`, or '' when it is not an http(s) URL. */
export function sourceDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export const safeSources = (sources: ResearchSource[] | undefined): ResearchSource[] =>
  (sources ?? []).filter((s) => s && typeof s.url === 'string' && sourceDomain(s.url) !== '');

// ─── connectors ──────────────────────────────────────────────────────────────────────────────────────────────

export type ConnectorsResult = { ok: true; connectors: ConnectorState[]; limits: ConnectorLimits | null } | { ok: false };

export async function fetchConnectors(): Promise<ConnectorsResult> {
  const r = await call('/api/connectors', { timeoutMs: 10_000 });
  if (r.status !== 200 || !r.body || !Array.isArray(r.body.connectors)) return { ok: false };
  return { ok: true, connectors: r.body.connectors as ConnectorState[], limits: (r.body.limits as ConnectorLimits | undefined) ?? null };
}

export type FilesResult = { ok: true; files: ConnectorFile[]; limits: ConnectorLimits | null } | { ok: false; unauthorized: boolean; unavailable: boolean };

export async function fetchFiles(): Promise<FilesResult> {
  const r = await call('/api/connectors/files', { timeoutMs: 10_000 });
  if (r.status === 200 && Array.isArray(r.body?.files)) return { ok: true, files: r.body.files as ConnectorFile[], limits: (r.body.limits as ConnectorLimits | undefined) ?? null };
  return { ok: false, unauthorized: r.status === 401, unavailable: r.status === 503 };
}

export type AddFileResult = { ok: true; file: ConnectorFile } | { ok: false; code: string; message: string | null };

export async function addFile(input: { name: string; mimeType: string; bytes: number; text: string; locale: string }): Promise<AddFileResult> {
  const r = await call('/api/connectors/files', { method: 'POST', timeoutMs: 30_000, json: input });
  const file = r.body?.file as ConnectorFile | undefined;
  if (r.status === 201 && file && typeof file.id === 'string') return { ok: true, file };
  return { ok: false, code: str(r.body?.error) ?? (r.status === 0 ? 'network' : 'unavailable'), message: str(r.body?.message) ?? null };
}

export async function removeFile(id: string): Promise<boolean> {
  const r = await call(`/api/connectors/files?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  return r.status === 200;
}

/** Documents are read by the same extractor the film script attach uses; a plain-text file never leaves the browser. */
export const TEXT_FILE_RE = /\.(txt|md|markdown|csv)$/i;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });

/** The text of a picked file: txt/md/csv read locally, PDF and DOCX through /api/utils/extract-text. '' when nothing readable. */
export async function extractFileText(file: File): Promise<string> {
  try {
    if (TEXT_FILE_RE.test(file.name) || file.type.startsWith('text/')) return (await file.text()).trim();
    const dataUrl = await readAsDataUrl(file);
    const r = await call('/api/utils/extract-text', { method: 'POST', timeoutMs: 40_000, json: { dataUrl, mimeType: file.type } });
    return typeof r.body?.text === 'string' ? r.body.text.trim() : '';
  } catch {
    return '';
  }
}
