/**
 * lib/notifications/preferences.ts — WHERE each kind of news reaches the user (Settings → Connections → Notifications).
 *
 * Pure: no I/O. The store (prefsStore.ts) reads and writes the row; the dispatcher (dispatch.ts) asks `channelsFor`.
 *
 * The owner's rules (Omnichannel PART H, 2026-10-10):
 *   • five kinds of news: a task finished, an approval is needed, an error needs attention, a scheduled report, a reminder;
 *   • five places: the site (the bell + this browser's push), WhatsApp, Telegram, SMS, a phone call;
 *   • the default is moderate and never intrusive: the site always, WhatsApp only for "finished" and "approval needed",
 *     no SMS, no calls;
 *   • a call is never for minor news: only a finished task, a scheduled report or a reminder may ring, and only when the
 *     person turned it on;
 *   • the site is always on. It is the record the other channels point back to, so it cannot be switched off.
 *
 * A channel listed here is a WISH, not a promise: the dispatcher still sends only where the channel exists and is linked
 * (and today SMS and calls do not exist — they are filtered out by `available`).
 */

export const NOTIFY_EVENTS = ['task_completed', 'approval_required', 'needs_attention', 'scheduled_report', 'reminder'] as const;
export type NotifyEventKind = (typeof NOTIFY_EVENTS)[number];

export const NOTIFY_CHANNELS = ['site', 'whatsapp', 'telegram', 'sms', 'call'] as const;
export type NotifyPlace = (typeof NOTIFY_CHANNELS)[number];

/** The kinds of news a phone call may carry. Everything else never rings. */
export const CALLABLE_EVENTS: readonly NotifyEventKind[] = ['task_completed', 'scheduled_report', 'reminder'];

export interface CallWindow {
  /** Local time, HH:MM, 24 h. Calls only between `from` and `to` (from < to; no overnight windows). */
  from: string;
  to: string;
}

/**
 * Agent G voice calls on WhatsApp (Omnichannel C, owner 2026-10-10 16:20Z: call permissions, quiet hours, spending
 * limits). Off until the person turns them on. The minute limits are the person's own, inside the platform's ceilings
 * (CALL_LIMITS); a call that would pass either limit ends politely, and a call is never placed outside `callWindow`.
 */
export interface AgentCallPrefs {
  /** May the person call Agent G on WhatsApp (and may Agent G call back, when WhatsApp's own permission allows it)? */
  enabled: boolean;
  /** At most this many minutes in one call. */
  perCallMinutes: number;
  /** At most this many call minutes a day (the person's zone). */
  dailyMinutes: number;
}

export const CALL_LIMITS = Object.freeze({ perCallMinutesMax: 30, dailyMinutesMax: 120, perCallMinutesDefault: 15, dailyMinutesDefault: 30 });

export interface NotifyPrefs {
  v: 1;
  events: Record<NotifyEventKind, NotifyPlace[]>;
  /** When an Agent G call may ring (PART C4 quiet hours). Read only when calls exist. */
  callWindow: CallWindow;
  /** IANA zone the call window is read in. */
  timezone: string;
  agentCalls: AgentCallPrefs;
}

export const DEFAULT_TIMEZONE = 'Asia/Tbilisi';

export const DEFAULT_PREFS: NotifyPrefs = Object.freeze({
  v: 1,
  events: {
    task_completed: ['site', 'whatsapp'],
    approval_required: ['site', 'whatsapp'],
    needs_attention: ['site'],
    scheduled_report: ['site'],
    reminder: ['site'],
  },
  callWindow: { from: '10:00', to: '20:00' },
  timezone: DEFAULT_TIMEZONE,
  agentCalls: { enabled: false, perCallMinutes: CALL_LIMITS.perCallMinutesDefault, dailyMinutes: CALL_LIMITS.dailyMinutesDefault },
}) as NotifyPrefs;

const wholeIn = (x: unknown, min: number, max: number, dflt: number): number =>
  (typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max ? x : dflt);

function cleanCalls(raw: unknown): AgentCallPrefs {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const perCallMinutes = wholeIn(c.perCallMinutes, 1, CALL_LIMITS.perCallMinutesMax, CALL_LIMITS.perCallMinutesDefault);
  const dailyMinutes = wholeIn(c.dailyMinutes, 1, CALL_LIMITS.dailyMinutesMax, CALL_LIMITS.dailyMinutesDefault);
  return { enabled: c.enabled === true, perCallMinutes: Math.min(perCallMinutes, dailyMinutes), dailyMinutes };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The one place a channel list is cleaned: known places only, no duplicates, the site always first, calls only where allowed. */
function cleanPlaces(event: NotifyEventKind, raw: unknown): NotifyPlace[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: NotifyPlace[] = ['site'];
  for (const p of list) {
    if (typeof p !== 'string' || !(NOTIFY_CHANNELS as readonly string[]).includes(p)) continue;
    const place = p as NotifyPlace;
    if (out.includes(place)) continue;
    if (place === 'call' && !CALLABLE_EVENTS.includes(event)) continue;
    out.push(place);
  }
  return out;
}

/**
 * Whatever came from the database or a browser → a valid NotifyPrefs. Unknown keys are dropped, a missing event takes
 * its default, a broken call window or zone takes the default. Never throws.
 */
export function normalizePrefs(raw: unknown): NotifyPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const ev = src.events && typeof src.events === 'object' ? (src.events as Record<string, unknown>) : {};
  const events = {} as NotifyPrefs['events'];
  for (const e of NOTIFY_EVENTS) events[e] = cleanPlaces(e, e in ev ? ev[e] : DEFAULT_PREFS.events[e]);

  const cw = src.callWindow && typeof src.callWindow === 'object' ? (src.callWindow as Record<string, unknown>) : {};
  const from = typeof cw.from === 'string' ? cw.from : '';
  const to = typeof cw.to === 'string' ? cw.to : '';
  const callWindow = minutes(from) < minutes(to) ? { from, to } : { ...DEFAULT_PREFS.callWindow };

  return {
    v: 1, events, callWindow, timezone: validZone(src.timezone) ? src.timezone : DEFAULT_TIMEZONE, agentCalls: cleanCalls(src.agentCalls),
  };
}

/**
 * Where this news goes now: the person's wish ∩ what exists and is linked for them. `site` is always in `available`
 * (the bell exists for everyone signed in).
 */
export function channelsFor(prefs: NotifyPrefs, event: NotifyEventKind, available: ReadonlySet<NotifyPlace>): NotifyPlace[] {
  return prefs.events[event].filter((p) => p === 'site' || available.has(p));
}

/**
 * The bell's kinds of event → the kind of news the preferences speak about. A finished generation (or a completed
 * payment) is "a task finished"; low credits needs attention. An event may name its kind itself (NotifyEvent.event).
 */
export function eventForKind(kind: string): NotifyEventKind {
  return kind === 'credits_low' ? 'needs_attention' : 'task_completed';
}

/** Is `at` inside the call window, read in the person's zone? A broken zone or window never allows a call. */
export function insideCallWindow(prefs: NotifyPrefs, at: Date): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: prefs.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    const now = h * 60 + m;
    const from = minutes(prefs.callWindow.from);
    const to = minutes(prefs.callWindow.to);
    return Number.isFinite(now) && from < to && now >= from && now < to;
  } catch {
    return false;
  }
}
