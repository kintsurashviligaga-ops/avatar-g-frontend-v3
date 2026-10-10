/**
 * lib/notifications/outbox.ts — when server-run work ends, the person hears it once, in the places they chose
 * (Omnichannel G, 2026-10-10). An Agent G run, a queued montage, edit or audio extraction, or a charged render that
 * finishes or fails is told on the bell (and this browser's push), WhatsApp, and later Telegram, SMS or a call, each
 * exactly as the person's preferences say (./preferences.ts). Pure: every effect is injected (./outboxLive.ts wires the
 * real ones), so every race is tested in memory.
 *
 * WHY. notifyUser (./dispatch.ts) is fire-and-forget: it marks the event told BEFORE sending (Redis, or one lambda's
 * memory without it), so a failed send is never tried again, and nothing records what reached whom. Runs and queued jobs
 * never called it at all.
 *
 * THE RECORD lives on the job's own row, `generation_jobs.params._tell` (no new table, no migration; the lease queue
 * keeps its state the same way, lib/orchestrator/jobLease.ts):
 *
 *   v       version: every write is a compare-and-set on it (and on `_exec.v` when the row has one, so the lease
 *           queue's own writes and ours can never undo each other)
 *   event   which kind of news it is (task_completed, or needs_attention for a failure)
 *   at      when the outbox first took it; a delivery still open GIVE_UP_MS later is closed as given up
 *   owner   the deliverer holding it, until `until` (epoch ms): two sweeps and a kick never send in parallel
 *   out     one mark per outlet: sending → sent | retry | skipped | gave_up | unknown
 *   done    every outlet reached a final mark
 *
 * ONCE. An outlet is marked `sending` in the same write that claims the row, before anything is sent. A deliverer that
 * dies mid-send leaves `sending`, and the next one closes it as `unknown` instead of sending again: a person may miss a
 * notice in that crash window, but is never told twice (a second WhatsApp template is also a second charge). A send
 * that ANSWERED a passing failure (`failed`, `rate_limited`) is tried again after BACKOFF_MS, at most MAX_TRIES in all;
 * a refusal that will not change by waiting (not linked, opted out, the WhatsApp window closed) is final at once.
 *
 * NEVER IN THE WAY. Nothing here runs inside the job's own write or throws into its flow: a run or job ends the same way
 * whether its notice is sent, retried or lost. Each of our writes moves the row's updated_at (its trigger), so a retry
 * can lift a finished task in a list sorted by it (the task tray) for at most GIVE_UP_MS; status, result and links stay.
 *
 * WHAT IS TOLD. Only work the server can vouch for: a row with `_exec` (the lease queue and runs), `_reserve` or `_settle`
 * (a charged render). Those keys are stripped from anything a browser writes (/api/orchestrator/jobs), so a person
 * cannot make the server message their own WhatsApp by marking rows done. A run's step jobs (`_parent`) are told by
 * their run; a stop the person asked for is not news.
 */
import type { ChannelFailure, ChannelResult, NotifyEvent, NotifyKind } from './types';
import type { NotifyEventKind, NotifyPlace, NotifyPrefs } from './preferences';

/** Where one notice can go. The site place is the bell plus this person's browser push (push follows the bell). */
export type Outlet = 'bell' | 'push' | 'whatsapp' | 'telegram' | 'sms' | 'call';
const OUTLETS_OF: Record<NotifyPlace, Outlet[]> = { site: ['bell', 'push'], whatsapp: ['whatsapp'], telegram: ['telegram'], sms: ['sms'], call: ['call'] };

export type MarkState = 'sending' | 'sent' | 'retry' | 'skipped' | 'gave_up' | 'unknown';
export interface Mark {
  s: MarkState;
  /** Sends attempted so far. */
  n: number;
  /** When this mark was written (epoch ms). */
  at: number;
  r?: ChannelFailure | 'unknown';
}

export interface TellState {
  v: number;
  event: NotifyEventKind;
  at: number;
  owner?: string;
  until?: number;
  out: Partial<Record<Outlet, Mark>>;
  done?: true;
  /** Why it closed without sending: the old path already told this job, or it stayed open past GIVE_UP_MS. */
  note?: 'already_told' | 'expired';
}

export const MAX_TRIES = 3;
/** The wait after the 1st and 2nd answered failure. */
export const BACKOFF_MS = [60_000, 5 * 60_000] as const;
/** A claim lasts this long: enough for a bell insert, a push fan-out and one Cloud API call. */
export const CLAIM_MS = 60_000;
/** A row that ended longer ago than this before the outbox first saw it is not told (it predates the outbox). */
export const FRESH_MS = 30 * 60_000;
/** A delivery still open this long after the outbox took it is closed. */
export const GIVE_UP_MS = 6 * 3_600_000;

const FINAL: readonly MarkState[] = ['sent', 'skipped', 'gave_up', 'unknown'];
const RETRYABLE: readonly ChannelFailure[] = ['failed', 'rate_limited'];

export interface OutboxRow {
  id: string;
  userId: string;
  status: string;
  serviceType: string;
  params: Record<string, unknown>;
  error: string | null;
  /** generation_jobs.updated_at, epoch ms. */
  updatedAt: number;
}

export interface OutboxStore {
  read(id: string): Promise<OutboxRow | null>;
  /**
   * Write `params` iff the row is still final, its `_tell.v` is `tellV` (null = no `_tell` yet) and its `_exec.v` is
   * `execV` (null = no `_exec`). True when it did.
   */
  cas(id: string, expect: { tellV: number | null; execV: number | null }, params: Record<string, unknown>): Promise<boolean>;
  /** Final rows that may owe a notice: ended within FRESH_MS and never taken, or taken and still open. */
  listDue(now: number, limit: number): Promise<OutboxRow[]>;
}

export type Sender = (ev: NotifyEvent) => Promise<ChannelResult>;

export interface OutboxDeps {
  store: OutboxStore;
  /** The person's notification preferences (a failed read answers the defaults). */
  prefs(userId: string): Promise<NotifyPrefs>;
  /** The outlets that exist in this deployment. One missing here is recorded as `skipped: not_configured` when wished. */
  send: Partial<Record<Outlet, Sender>>;
  /** False when the older one-shot path (dispatch.ts, the same dedupe key) already told this job. */
  firstNotice(userId: string, jobId: string): Promise<boolean>;
  now(): number;
  newId(): string;
}

// ── reading the row ──────────────────────────────────────────────────────────────────────────────────────────────────

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** The `_tell` record off a params object; null when the outbox never took this row. */
export function tellOf(params: unknown): TellState | null {
  const t = obj(obj(params)?._tell);
  if (!t || typeof t.v !== 'number' || typeof t.event !== 'string' || typeof t.at !== 'number') return null;
  const out: TellState['out'] = {};
  const rawOut = obj(t.out) ?? {};
  for (const [k, m] of Object.entries(rawOut)) {
    const mk = obj(m);
    if (!mk || typeof mk.s !== 'string' || typeof mk.n !== 'number' || typeof mk.at !== 'number') continue;
    out[k as Outlet] = { s: mk.s as MarkState, n: mk.n, at: mk.at, ...(typeof mk.r === 'string' ? { r: mk.r as Mark['r'] } : {}) };
  }
  return {
    v: t.v,
    event: t.event as NotifyEventKind,
    at: t.at,
    out,
    ...(typeof t.owner === 'string' ? { owner: t.owner } : {}),
    ...(typeof t.until === 'number' ? { until: t.until } : {}),
    ...(t.done === true ? { done: true as const } : {}),
    ...(t.note === 'already_told' || t.note === 'expired' ? { note: t.note } : {}),
  };
}

const execVersion = (params: Record<string, unknown>): number | null => {
  const v = obj(params._exec)?.v;
  return typeof v === 'number' ? v : null;
};

type Lang = 'ka' | 'en' | 'ru';

const THING: Record<string, Record<Lang, string>> = {
  film: { ka: 'ვიდეო', en: 'video', ru: 'видео' },
  avatar: { ka: 'ავატარი', en: 'avatar', ru: 'аватар' },
  image: { ka: 'სურათი', en: 'image', ru: 'изображение' },
  music: { ka: 'აუდიო', en: 'audio', ru: 'аудио' },
  voice: { ka: 'ხმა', en: 'voice', ru: 'голос' },
  interior: { ka: 'დიზაინი', en: 'design', ru: 'дизайн' },
};
const ICON: Record<string, string> = { film: '🎬', avatar: '🎬', image: '🖼', music: '🎵', voice: '🎤', interior: '🏠' };

const COPY: Record<Lang, {
  ready: (thing: string) => string; failed: (thing: string) => string; readyBody: string; failedBody: string;
  run: string; runPartial: string; runFailed: string; runPartialBody: string;
}> = {
  ka: {
    ready: (t) => `თქვენი ${t} მზადაა!`,
    failed: (t) => `თქვენი ${t} ვერ შეიქმნა`,
    readyBody: 'ის თქვენს ბიბლიოთეკაშია.',
    failedBody: 'გახსენით სტუდია და ნახეთ, რა მოხდა.',
    run: 'Agent G-მ დავალება შეასრულა',
    runPartial: 'Agent G-მ დავალების ნაწილი შეასრულა',
    runFailed: 'Agent G-მ დავალება ვერ შეასრულა',
    runPartialBody: 'მზა შედეგები ბიბლიოთეკაშია; დანარჩენი სტუდიიდან გააგრძელეთ.',
  },
  en: {
    ready: (t) => `Your ${t} is ready!`,
    failed: (t) => `Your ${t} could not be made`,
    readyBody: 'It is in your Library.',
    failedBody: 'Open the studio to see what happened.',
    run: 'Agent G finished your task',
    runPartial: 'Agent G finished part of your task',
    runFailed: 'Agent G could not finish your task',
    runPartialBody: 'The finished results are in your Library; continue the rest from the studio.',
  },
  ru: {
    ready: (t) => `Ваше ${t} готово!`,
    failed: (t) => `Не удалось создать: ${t}`,
    readyBody: 'Оно в вашей библиотеке.',
    failedBody: 'Откройте студию, чтобы узнать, что произошло.',
    run: 'Agent G выполнил задачу',
    runPartial: 'Agent G выполнил часть задачи',
    runFailed: 'Agent G не смог выполнить задачу',
    runPartialBody: 'Готовые результаты в библиотеке; остальное продолжите в студии.',
  },
};

const notifyKindOf = (service: string): NotifyKind =>
  service === 'music' || service === 'voice' ? 'music' : service === 'image' ? 'image' : service === 'avatar' ? 'avatar' : 'film';

export interface Notice {
  event: NotifyEventKind;
  ev: NotifyEvent;
}

/**
 * What this row tells its owner now, or null when it tells nothing: still live, a run's step, a stop the person asked
 * for, or a row the server cannot vouch for (see the header).
 */
export function noticeOf(row: OutboxRow): Notice | null {
  if (row.status !== 'completed' && row.status !== 'failed') return null;
  const p = row.params;
  if (p._parent !== undefined && p._parent !== null) return null;
  const exec = obj(p._exec);
  if (!exec && !obj(p._reserve) && !obj(p._settle)) return null;
  if (exec?.lastError === 'cancelled') return null;
  // A queued job that failed before any worker took it (its charge was refused) failed in front of the person, in the
  // request that asked for it. An abandoned billing hold did not: the request died, so that one is news.
  if (exec && exec.kind !== 'agent-run' && row.status === 'failed' && exec.attempt === 0 && exec.lastError !== 'billing hold abandoned') return null;
  const run = exec?.kind === 'agent-run' ? obj(p._run) : null;
  const runStatus = typeof run?.status === 'string' ? run.status : null;
  if (runStatus === 'cancelled') return null;

  const raw = typeof p.locale === 'string' ? p.locale : typeof p.lang === 'string' ? p.lang : '';
  const lang: Lang = raw === 'en' || raw === 'ru' ? raw : 'ka';
  const c = COPY[lang];
  const ok = row.status === 'completed';
  const event: NotifyEventKind = ok ? 'task_completed' : 'needs_attention';
  const url = ok ? `/${lang}/library` : `/${lang}`;
  let title: string;
  let body: string;
  if (exec?.kind === 'agent-run') {
    const partial = ok && runStatus === 'partially_completed';
    title = `${ok ? '✅' : '⚠️'} ${ok ? (partial ? c.runPartial : c.run) : c.runFailed}`;
    body = ok ? (partial ? c.runPartialBody : c.readyBody) : c.failedBody;
  } else {
    const thing = (THING[row.serviceType] ?? THING.film!)[lang];
    title = ok ? `${ICON[row.serviceType] ?? '✅'} ${c.ready(thing)}` : `⚠️ ${c.failed(thing)}`;
    body = ok ? c.readyBody : c.failedBody;
  }
  return { event, ev: { userId: row.userId, kind: notifyKindOf(row.serviceType), event, title, body, url, locale: lang } };
}

/** The outlets the person wished for this kind of news, in a stable order (bell first). */
export function outletsFor(prefs: NotifyPrefs, event: NotifyEventKind): Outlet[] {
  const seen = new Set<Outlet>();
  for (const place of prefs.events[event] ?? ['site']) for (const o of OUTLETS_OF[place] ?? []) seen.add(o);
  seen.add('bell');
  seen.add('push');
  const order: Outlet[] = ['bell', 'push', 'whatsapp', 'telegram', 'sms', 'call'];
  return order.filter((o) => seen.has(o));
}

const isFinalMark = (m: Mark | undefined): boolean => !!m && FINAL.includes(m.s);

/** Is a `retry` mark due again? */
function retryDue(m: Mark, now: number): boolean {
  return now >= m.at + BACKOFF_MS[Math.max(0, Math.min(m.n, BACKOFF_MS.length) - 1)]!;
}

/** The mark a send's answer leaves. */
export function markAfter(prev: Mark, res: ChannelResult, now: number): Mark {
  if (res.sent) return { s: 'sent', n: prev.n, at: now };
  const r = res.reason ?? 'failed';
  if (RETRYABLE.includes(r)) return prev.n >= MAX_TRIES ? { s: 'gave_up', n: prev.n, at: now, r } : { s: 'retry', n: prev.n, at: now, r };
  return { s: 'skipped', n: prev.n, at: now, r };
}

// ── delivering ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type DeliverOutcome =
  | 'missing' | 'not_eligible' | 'stale' | 'done' | 'busy' | 'raced' | 'waiting' | 'already_told' | 'expired' | 'delivered';

export interface DeliverReport {
  outcome: DeliverOutcome;
  /** The marks as last written (or read), for the sweep's report and the tests. */
  out?: TellState['out'];
}

interface Cur { row: OutboxRow; tell: TellState | null; execV: number | null }

const withTell = (c: Cur, next: TellState): Record<string, unknown> => {
  const params: Record<string, unknown> = { ...c.row.params, _tell: next };
  const exec = obj(c.row.params._exec);
  if (exec && c.execV !== null) params._exec = { ...exec, v: c.execV + 1 };
  return params;
};

async function write(deps: OutboxDeps, c: Cur, next: TellState): Promise<Cur | null> {
  const params = withTell(c, next);
  const ok = await deps.store.cas(c.row.id, { tellV: c.tell?.v ?? null, execV: c.execV }, params);
  return ok ? { row: { ...c.row, params }, tell: next, execV: c.execV === null ? null : c.execV + 1 } : null;
}

/**
 * Tell one row's owner what it owes them, as far as it can now. Safe to call any number of times from anywhere (the
 * request that ended the job, the per-minute sweep): the claim decides who sends, and a final mark never sends again.
 */
export async function deliver(deps: OutboxDeps, id: string): Promise<DeliverReport> {
  const me = `tell-${deps.newId()}`;
  for (let pass = 0; pass < 3; pass += 1) {
    const row = await deps.store.read(id);
    if (!row) return { outcome: 'missing' };
    const notice = noticeOf(row);
    if (!notice) return { outcome: 'not_eligible' };
    const tell = tellOf(row.params);
    const now = deps.now();
    const cur: Cur = { row, tell, execV: execVersion(row.params) };
    if (tell?.done) return { outcome: 'done', out: tell.out };
    if (!tell && now - row.updatedAt > FRESH_MS) return { outcome: 'stale' };
    if (tell?.owner && (tell.until ?? 0) > now && tell.owner !== me) return { outcome: 'busy', out: tell.out };

    // Past the deadline: close every open mark.
    if (tell && now - tell.at > GIVE_UP_MS) {
      const out = { ...tell.out };
      for (const [o, m] of Object.entries(out) as [Outlet, Mark][]) {
        if (!isFinalMark(m)) out[o] = { s: m.s === 'sending' ? 'unknown' : 'gave_up', n: m.n, at: now, r: m.s === 'sending' ? 'unknown' : m.r };
      }
      const closed = await write(deps, cur, { v: tell.v + 1, event: tell.event, at: tell.at, out, done: true, note: 'expired' });
      if (!closed) continue;
      return { outcome: 'expired', out };
    }

    // Decide every wished outlet: final stays, a lapsed `sending` becomes `unknown`, a waiting retry waits, the rest send.
    const prefs = await deps.prefs(row.userId);
    const out: TellState['out'] = { ...(tell?.out ?? {}) };
    const due: Outlet[] = [];
    let waiting = false;
    const wished = outletsFor(prefs, notice.event);
    for (const [o, m] of Object.entries(out) as [Outlet, Mark][]) {
      // The person turned an outlet off while its retry waited: it is not tried again.
      if (!wished.includes(o) && !isFinalMark(m)) out[o] = { s: m.s === 'sending' ? 'unknown' : 'skipped', n: m.n, at: now, r: m.s === 'sending' ? 'unknown' : 'opted_out' };
    }
    for (const o of wished) {
      const m = out[o];
      if (isFinalMark(m)) continue;
      if (m?.s === 'sending') { out[o] = { s: 'unknown', n: m.n, at: now, r: 'unknown' }; continue; }
      if (m?.s === 'retry' && !retryDue(m, now)) { waiting = true; continue; }
      if (!deps.send[o]) { out[o] = { s: 'skipped', n: m?.n ?? 0, at: now, r: 'not_configured' }; continue; }
      out[o] = { s: 'sending', n: (m?.n ?? 0) + 1, at: now };
      due.push(o);
    }
    const allFinal = (Object.values(out) as Mark[]).every(isFinalMark);
    const claim: TellState = {
      v: (tell?.v ?? 0) + 1, event: notice.event, at: tell?.at ?? now, out,
      ...(due.length > 0 ? { owner: me, until: now + CLAIM_MS } : {}),
      ...(due.length === 0 && allFinal ? { done: true as const } : {}),
    };
    if (due.length === 0 && tell && same(tell, claim)) return { outcome: waiting ? 'waiting' : 'done', out };
    const held = await write(deps, cur, claim);
    if (!held) continue; // raced: read again
    if (due.length === 0) return { outcome: claim.done ? 'done' : 'waiting', out };

    // The first time this job is taken: the older one-shot path may have told it already (same dedupe key).
    if (!tell && !(await safeFirst(deps, row))) {
      const told: TellState = { v: claim.v + 1, event: notice.event, at: claim.at, out: {}, done: true, note: 'already_told' };
      await write(deps, held, told);
      return { outcome: 'already_told', out: {} };
    }

    const results = await Promise.all(due.map(async (o) => {
      try {
        return [o, await deps.send[o]!(notice.ev)] as const;
      } catch {
        return [o, { sent: false, reason: 'failed' as const }] as const;
      }
    }));
    const after = deps.now();
    const outAfter: TellState['out'] = { ...held.tell!.out };
    for (const [o, res] of results) outAfter[o] = markAfter(outAfter[o]!, res, after);
    const finished = (Object.values(outAfter) as Mark[]).every(isFinalMark);
    const settledTell: TellState = { v: held.tell!.v + 1, event: notice.event, at: claim.at, out: outAfter, ...(finished ? { done: true as const } : {}) };
    // A lost write here means our claim lapsed and another deliverer closed our `sending` marks as unknown: nothing is
    // sent twice either way.
    await write(deps, held, settledTell);
    return { outcome: 'delivered', out: outAfter };
  }
  return { outcome: 'raced' };
}

async function safeFirst(deps: OutboxDeps, row: OutboxRow): Promise<boolean> {
  try {
    return await deps.firstNotice(row.userId, row.id);
  } catch {
    return true;
  }
}

const same = (a: TellState, b: TellState): boolean =>
  JSON.stringify({ ...a, v: 0, owner: undefined, until: undefined }) === JSON.stringify({ ...b, v: 0, owner: undefined, until: undefined });

export interface SweepReport {
  seen: number;
  outcomes: Partial<Record<DeliverOutcome, number>>;
}

/** The per-minute pass: every row that may owe a notice, newest first. */
export async function sweepDeliveries(deps: OutboxDeps, opts: { limit?: number } = {}): Promise<SweepReport> {
  const rows = await deps.store.listDue(deps.now(), opts.limit ?? 50);
  const report: SweepReport = { seen: rows.length, outcomes: {} };
  for (const row of rows) {
    const r = await deliver(deps, row.id);
    report.outcomes[r.outcome] = (report.outcomes[r.outcome] ?? 0) + 1;
  }
  return report;
}
