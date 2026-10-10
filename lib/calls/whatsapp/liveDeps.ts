/**
 * lib/calls/whatsapp/liveDeps.ts — the real wiring behind callService.ts and phoneTools.ts. Everything that touches
 * Supabase, Redis, Meta, the bridge or Google is here, so the logic modules stay testable with fakes.
 *
 * OFF BY DEFAULT. Nothing here runs unless WHATSAPP_CALLING_ENABLED is on, and even then no call starts while the
 * per-minute price is not approved (APPROVED_CALL_CREDITS_PER_MINUTE is null: the proposal lives in
 * lib/credits/unitEconomics PROPOSED and becomes this number only on the owner's approval). No charger is wired yet, so
 * a call can never take credits before that approval either.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { findLinkByNumber, findLinkByUser } from '@/lib/agent-g/channels/whatsapp-link';
import { sendWhatsAppMedia, sendWhatsAppText, whatsappConfig } from '@/lib/agent-g/channels/whatsapp-client';
import { readPrefs } from '@/lib/notifications/prefsStore';
import { creditsBalanceOf } from '@/lib/orchestrator/ledger';
import { listTasks, cancelTask } from '@/lib/tasks/taskService';
import { liveTaskDeps } from '@/lib/tasks/taskLive';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { isTruthyFlag } from '@/lib/env/flag';
import { reportError } from '@/lib/observability/report-error';
import type { CallServiceDeps } from './callService';
import { DEFAULT_CALL_POLICY, type CallPolicy } from './gates';
import { minutesToday as kvMinutesToday, readHeard, redisKv } from './callStore';
import { callAction, readCallPermission } from './metaCalls';
import { signBridgeRequest, bridgeSecret } from './ticket';
import { deliverResult } from './delivery';
import { agentScope, type PhoneToolDeps } from './phoneTools';
import type { CallLang } from './copy';

/** The approved per-minute price in credits. null until the owner approves the proposal (no call starts before). */
export const APPROVED_CALL_CREDITS_PER_MINUTE: number | null = null;

export function callingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env.WHATSAPP_CALLING_ENABLED);
}

export function liveCallPolicy(env: NodeJS.ProcessEnv = process.env): CallPolicy {
  return { ...DEFAULT_CALL_POLICY, enabled: callingEnabled(env), creditsPerMinute: APPROVED_CALL_CREDITS_PER_MINUTE };
}

/** CALL_BRIDGE_URL: the media bridge's https base, or null (then every call is refused as bridge_unavailable). */
export function bridgeBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = (env.CALL_BRIDGE_URL ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(v) ? v : null;
}

let health: { ok: boolean; at: number } | null = null;

async function bridgeReady(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const base = bridgeBase(env);
  if (!base) return false;
  if (health && Date.now() - health.at < 30_000) return health.ok;
  try {
    const r = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
    health = { ok: r.ok, at: Date.now() };
  } catch {
    health = { ok: false, at: Date.now() };
  }
  return health.ok;
}

async function bridgeOffer(input: { ticket: string; callId: string; sdpOffer: string }, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const base = bridgeBase(env);
  const secret = bridgeSecret(env);
  if (!base || !secret) return false;
  const body = JSON.stringify(input);
  try {
    const r = await fetch(`${base}/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-call-signature': signBridgeRequest(body, secret, Date.now()) },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const CALL_AUDIT_EVENT = 'audit.whatsapp.call';

async function auditCall(entry: { userId: string | null; callId: string; phase: string; outcome: 'ok' | 'refused' | 'failed'; detail?: string }): Promise<void> {
  try {
    const { userId, ...props } = entry;
    const { error } = await createServiceRoleClient().from('analytics_events').insert({ user_id: userId, event_name: CALL_AUDIT_EVENT, props });
    if (error) throw new Error(error.message);
  } catch (e) {
    reportError(e, { fn: 'whatsappCall.audit', phase: entry.phase, outcome: entry.outcome });
  }
}

export function liveCallDeps(origin: string, env: NodeJS.ProcessEnv = process.env): CallServiceDeps {
  return {
    kv: redisKv,
    now: () => Date.now(),
    policy: liveCallPolicy(env),
    secret: bridgeSecret(env),
    origin,
    async findLink(waId) {
      const r = await findLinkByNumber(createServiceRoleClient(), waId);
      if (r.state !== 'linked') return r;
      return { state: 'linked', userId: r.link.userId, ...(r.link.meta.locale ? { locale: r.link.meta.locale } : {}) };
    },
    async readCallPrefs(userId) {
      const { prefs } = await readPrefs(userId);
      return { calls: prefs.agentCalls, timezone: prefs.timezone };
    },
    balance: (userId) => creditsBalanceOf(userId),
    minutesToday: (userId, day) => kvMinutesToday(redisKv, userId, day),
    bridge: { ready: () => bridgeReady(env), offer: (x) => bridgeOffer(x, env) },
    meta: (x) => callAction(x),
    async tell(waId, text) {
      await sendWhatsAppText(waId, text).catch(() => undefined);
    },
    audit: auditCall,
    // charge: not wired until the per-minute price is approved (APPROVED_CALL_CREDITS_PER_MINUTE).
  };
}

/** The linked number of a user (to send into their chat), or null. */
async function linkedNumber(userId: string): Promise<{ waId: string; lang: CallLang } | null> {
  const r = await findLinkByUser(createServiceRoleClient(), userId);
  return r.state === 'linked' ? { waId: r.link.waId, lang: r.link.meta.locale ?? 'ka' } : null;
}

export function livePhoneToolDeps(origin: string, env: NodeJS.ProcessEnv = process.env): PhoneToolDeps {
  const tasks = liveTaskDeps();
  return {
    now: () => Date.now(),
    scope: agentScope(env),
    // The creative tools are declared only in the 'creative' scope, and their live wiring waits for Meta's written
    // answer on Terms §4.7 (docs/handoffs/omnichannel/WHATSAPP_CALLING_READINESS.md): until then they answer
    // not_available even if the scope were switched on.
    mediaOpen: async () => false,
    balance: (userId) => creditsBalanceOf(userId),
    listTasks: (userId) => listTasks(tasks, { userId, active: false, limit: 5 }),
    async cancelTask(userId, taskId) {
      const r = await cancelTask(tasks, { userId, id: taskId });
      if (r.ok) return 'cancelled';
      return r.error === 'not_found' ? 'not_found' : 'not_cancellable';
    },
    heard: (callId) => readHeard(redisKv, callId),
    plans: { list: async () => [], add: async () => { throw new Error('creative scope not wired'); } },
    planMp3: async () => ({ ok: false, error: 'not_available' }),
    startFree: async () => ({ ok: false, error: 'not_available' }),
    sendConfirm: async () => false,
    async deliver(userId, task) {
      const to = await linkedNumber(userId);
      if (!to) return { sent: false, mode: 'none', reason: 'not_linked' };
      return deliverResult({
        origin,
        async signOwn(url, uid, ttl) {
          const r = await resolveCallerMedia(url, uid, ttl);
          return r.ok && r.own ? r.url : null;
        },
        sendMedia: (n, m) => sendWhatsAppMedia(n, m),
        sendText: (n, t) => sendWhatsAppText(n, t),
      }, { to: to.waId, userId, task, lang: to.lang });
    },
    async scheduleCallback(userId) {
      const to = await linkedNumber(userId);
      if (!to) return 'unavailable';
      // The result goes to the chat by the notification preferences (task_completed → WhatsApp) either way. A call
      // back needs WhatsApp's own permission AND the outbound bridge, which is not built yet (readiness doc).
      const permission = await readCallPermission(to.waId, whatsappConfig());
      return permission === 'granted' ? 'unavailable' : 'needs_permission';
    },
  };
}
