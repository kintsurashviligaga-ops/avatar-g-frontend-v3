/**
 * components/studio/hub/api.ts — the hub's client for /api/plugins and /api/agent-g/channels.
 *
 * Every function RESOLVES (a network failure, a timeout or a 5xx comes back as a value, never a throw): the hub degrades to a
 * line of text, never to a crashed sidebar. Only what the hub draws is kept from a response — in particular the channels
 * route's `note` strings (operator diagnostics that name environment variables) and the linked channels' external ids (a
 * phone number, a chat id) are dropped here and never reach the DOM.
 */
import { normalizeDisabledTools } from '@/lib/plugins/catalog';
import type { ToolId } from '@/lib/studio/tools';

interface Raw {
  status: number; // 0 = network error / timeout
  body: Record<string, unknown> | null;
}

async function call(path: string, init: { method?: string; json?: unknown; timeoutMs?: number } = {}): Promise<Raw> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 12_000);
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
  }
}

// ─── plugins ────────────────────────────────────────────────────────────────────────────────────────────────

export type PluginsRead =
  | { ok: true; available: false }
  | { ok: true; available: true; disabledTools: ToolId[] }
  | { ok: false; unauthorized: boolean };

export async function fetchPlugins(): Promise<PluginsRead> {
  const r = await call('/api/plugins');
  if (r.status === 401) return { ok: false, unauthorized: true };
  if (r.status !== 200 || !r.body) return { ok: false, unauthorized: false };
  if (r.body.available !== true) return { ok: true, available: false };
  return { ok: true, available: true, disabledTools: normalizeDisabledTools(r.body.disabledTools) };
}

export type PluginsSave =
  | { ok: true; disabledTools: ToolId[] }
  | { ok: false; unavailable: boolean; unauthorized: boolean };

/** Replace the user's whole list (the server answers with what it stored). */
export async function savePlugins(disabledTools: readonly ToolId[]): Promise<PluginsSave> {
  const r = await call('/api/plugins', { method: 'PUT', json: { disabledTools } });
  if (r.status === 200 && r.body?.available === true) return { ok: true, disabledTools: normalizeDisabledTools(r.body.disabledTools) };
  return { ok: false, unavailable: r.body?.available === false, unauthorized: r.status === 401 };
}

// ─── Agent G channels ───────────────────────────────────────────────────────────────────────────────────────

/** `ready` per messaging channel on THIS deployment (the server's runtime_status) — nothing else from that route. */
export interface ChannelRuntime {
  telegramReady: boolean;
  whatsappReady: boolean;
}

export async function fetchChannels(): Promise<({ ok: true } & ChannelRuntime) | { ok: false }> {
  const r = await call('/api/agent-g/channels', { timeoutMs: 8_000 });
  // apiSuccess wraps the payload: { status: 'success', data: { guest, channels, runtime_status } }.
  const data = r.body?.data as Record<string, unknown> | undefined;
  if (r.status !== 200 || !data || !Array.isArray(data.runtime_status)) return { ok: false };
  const ready = (type: string) => (data.runtime_status as unknown[]).some(
    (s) => !!s && typeof s === 'object' && (s as { type?: unknown }).type === type && (s as { ready?: unknown }).ready === true,
  );
  return { ok: true, telegramReady: ready('telegram'), whatsappReady: ready('whatsapp') };
}
