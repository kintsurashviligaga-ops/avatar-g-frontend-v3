/**
 * lib/music/studio/client.ts — the browser's calls to /api/music/studio. No React, no secrets. Every call answers
 * { ok: true, … } or { ok: false, code, message } (the server's localized sentence), never throws for a refusal.
 */
import type { MusicRequest, MusicPlan } from './contracts';

export interface MusicQuote {
  ok: true; jobId: string; credits: number; expiresAt: number; plan: MusicPlan; token: string;
  summary: { model: string; transport: string; durationSec: number; exactDuration: false; directions: string[] };
  providerInput: string;
}
export interface MusicJobView {
  ok: true; jobId: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; stage: string;
  attempt: number; error: string | null; settlementPending: boolean; cancellable: boolean; replay?: boolean;
  result: null | { url: string; durationSec: number; mime: string; modelId: string; credits: number; qc?: Record<string, unknown> };
}
export interface MusicEditResult { ok: true; jobId: string; url: string; durationSec: number; format: string; label: string; credits: 0 }
export type Refusal = { ok: false; code: string; message?: string };

async function call<T>(url: string, init?: RequestInit): Promise<T | Refusal> {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok !== false) return j as T;
    return { ok: false, code: typeof j.code === 'string' ? j.code : `http_${res.status}`, ...(typeof j.message === 'string' ? { message: j.message } : {}) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export const musicCapabilitiesCall = () => call<{ ok: true; enabled: boolean; configured: boolean; models: Array<{ id: string; label: string; durationsSec: number[]; vocals: { offered: boolean } }> }>('/api/music/studio/capabilities');
export const quoteCall = (request: MusicRequest) => call<MusicQuote>('/api/music/studio/quote', { method: 'POST', body: JSON.stringify(request) });
export const startCall = (q: Pick<MusicQuote, 'plan' | 'token'>) => call<MusicJobView>('/api/music/studio/jobs', { method: 'POST', body: JSON.stringify({ plan: q.plan, token: q.token, confirmed: true }) });
export const statusCall = (jobId: string) => call<MusicJobView>(`/api/music/studio/jobs/${encodeURIComponent(jobId)}`);
export const cancelCall = (jobId: string) => call<MusicJobView>(`/api/music/studio/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', body: '{}' });
export const editCall = (body: Record<string, unknown>) => call<MusicEditResult>('/api/music/studio/edit', { method: 'POST', body: JSON.stringify(body) });
export const commandCall = (text: string) => call<{ ok: true; command: unknown }>('/api/music/studio/commands', { method: 'POST', body: JSON.stringify({ text }) });

export const isFinal = (v: Pick<MusicJobView, 'status'>) => v.status === 'completed' || v.status === 'failed' || v.status === 'cancelled';

/** Poll delay: quick at first, then every 5 s (Lyria renders in tens of seconds; no progress is invented meanwhile). */
export const pollDelayMs = (n: number) => (n < 3 ? 2000 : n < 10 ? 3000 : 5000);
