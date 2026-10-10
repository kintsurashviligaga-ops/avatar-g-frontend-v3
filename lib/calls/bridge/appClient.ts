/**
 * lib/calls/bridge/appClient.ts — the bridge's five requests back to the app (app/api/calls/bridge/[op]), each
 * carrying the call's ticket. The bridge never decides who the user is, what a tool may do or what a call costs: it
 * asks. The ticket is never logged.
 */
import type { LiveSetupMessage } from '@/lib/voice/geminiLive';
import type { CallMetrics } from '@/lib/calls/whatsapp/lifecycle';

export type EndReason = 'hangup' | 'max_duration' | 'media_failed' | 'live_failed';

export type AppResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

export interface AppClient {
  answer(sdp: string): Promise<AppResult<{ maxSeconds: number }>>;
  session(resumptionHandle: string | null): Promise<AppResult<{ token: string; setupMessage: LiveSetupMessage; expiresAt: string }>>;
  heard(text: string, at: number): Promise<AppResult<Record<string, never>>>;
  tool(name: string, args: unknown): Promise<AppResult<{ response: Record<string, unknown> }>>;
  event(ev: { type: 'active' } | { type: 'metrics'; metrics: CallMetrics } | { type: 'end'; reason: EndReason; metrics?: CallMetrics }): Promise<AppResult<Record<string, never>>>;
}

/** A refusal that means the call is over for the app: stop the call, post nothing more. */
export const isCallOver = (r: AppResult<unknown>): boolean => !r.ok && (r.error === 'call_over' || r.status === 401);

const TIMEOUTS: Record<string, number> = { answer: 8000, session: 12_000, heard: 4000, tool: 25_000, event: 6000 };

export function createAppClient(opts: { origin: string; ticket: string; fetch?: typeof fetch }): AppClient {
  const f = opts.fetch ?? fetch;
  const base = opts.origin.replace(/\/+$/, '');
  async function call<T>(op: string, body: unknown): Promise<AppResult<T>> {
    try {
      const res = await f(`${base}/api/calls/bridge/${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.ticket}` },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(TIMEOUTS[op] ?? 8000),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) return { ok: false, status: res.status, error: typeof json.error === 'string' ? json.error : `http_${res.status}` };
      return { ok: true, ...(json as T) };
    } catch (e) {
      return { ok: false, status: 0, error: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network' };
    }
  }
  return {
    answer: (sdp) => call('answer', { sdp }),
    session: (resumptionHandle) => call('session', resumptionHandle ? { resumptionHandle } : {}),
    heard: (text, at) => call('heard', { text, at }),
    tool: (name, args) => call('tool', { name, args }),
    event: (ev) => call('event', ev),
  };
}
