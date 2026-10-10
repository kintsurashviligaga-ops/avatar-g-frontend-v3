/**
 * lib/agent/media/sweepAlerts.ts — what the per-minute Agent G sweep (/api/agent/media/sweep) must tell a person about
 * (Agent G PART 5, gap O1). The sweep already fixes what it can on its own: it fails a job whose worker died twice, pays
 * a refund that did not land, and works a job no worker has. These are the cases it cannot finish by itself:
 *
 *   • agent_g_refund_debt (error): a refund it tried and could not pay — a user is owed credits right now;
 *   • agent_g_gave_up (warn): jobs failed because their worker stopped twice (a crash loop, or the host killing renders);
 *   • agent_g_queue_backlog (warn): more jobs waiting than the sweep's one job a minute can drain.
 *
 * Each becomes one `ops_marker` log line (lib/observability/reliability opsMarker) with a stable name, the same shape
 * the render drainer and the research sweep already alert on. Routing them to a person (a log alert rule, or Sentry
 * once its DSN is set) is the owner's step. Job ids only: no user id, no prompt, no file.
 *
 * PURE.
 */
export interface QueueSweep {
  gaveUp: string[];
  waiting: string[];
  stillOwed?: string[];
}
export interface SweepAlert {
  level: 'warn' | 'error';
  marker: 'agent_g_refund_debt' | 'agent_g_gave_up' | 'agent_g_queue_backlog';
  data: Record<string, unknown>;
}

/** Waiting jobs, summed over the queues, at which the backlog is worth a person's look (one is worked per minute). */
export const BACKLOG_ALERT = 3;
/** Ids listed per alert (the counts are always whole). */
const MAX_IDS = 10;

export function sweepAlerts(queues: Readonly<Record<string, QueueSweep>>): SweepAlert[] {
  const alerts: SweepAlert[] = [];
  const each = (pick: (q: QueueSweep) => string[] | undefined) =>
    Object.entries(queues).map(([name, q]) => [name, pick(q) ?? []] as const).filter(([, ids]) => ids.length > 0);
  const counted = (rows: ReadonlyArray<readonly [string, string[]]>) => ({
    total: rows.reduce((n, [, ids]) => n + ids.length, 0),
    byQueue: Object.fromEntries(rows.map(([name, ids]) => [name, ids.length])),
    ids: rows.flatMap(([, ids]) => ids).slice(0, MAX_IDS),
  });

  const owed = each((q) => q.stillOwed);
  if (owed.length) alerts.push({ level: 'error', marker: 'agent_g_refund_debt', data: counted(owed) });
  const gaveUp = each((q) => q.gaveUp);
  if (gaveUp.length) alerts.push({ level: 'warn', marker: 'agent_g_gave_up', data: counted(gaveUp) });
  const waiting = each((q) => q.waiting);
  const backlog = counted(waiting);
  if (backlog.total >= BACKLOG_ALERT) alerts.push({ level: 'warn', marker: 'agent_g_queue_backlog', data: backlog });
  return alerts;
}
