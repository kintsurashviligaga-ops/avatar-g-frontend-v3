/**
 * lib/veo/dailyCap.ts — the HARD daily ceiling on Google Veo spend, checked before every Veo submit.
 *
 * ⚠️ WHY A SECOND LIMIT. The platform envelope (lib/services/billing/BillingGuard, DAILY_COST_LIMIT) already refuses a call
 * once the day's booked spend passes its limit, but by design it is SOFT: it reads the spend through a 30 s cache (a burst of
 * films all see the same old total), it books a clip only after the submit returned (concurrent submits never see each other)
 * and it lets the call run when it cannot read the ledger. That is the right trade for chat and images; a Google Cloud budget
 * alert is only an e-mail. Veo is where one burst costs real dollars, so this ceiling is the opposite on all three counts:
 *   · it RESERVES the clip's price before the submit, atomically (one Redis script: read, compare, add), so two films racing
 *     for the last dollar cannot both pass;
 *   · a definitive refusal (no job exists, Google bills nothing) gives the reservation back; an ambiguous submit keeps it,
 *     because that job may exist and bill;
 *   · when the ceiling cannot be counted at all (Redis down AND the ledger unreadable) the submit is REFUSED.
 *
 * ⚠️ OFF UNTIL THE OWNER NAMES THE FIGURE. `VEO_DAILY_LIMIT_USD` (US dollars per UTC day, all Veo submits on this deployment:
 * paid films, free films, admin tests and the Agent G video tools alike) turns it on. Unset, empty, 0 or not a number = not
 * enforced, and only the soft envelope applies, exactly as before this file existed. No default figure lives in code: how much
 * Google spend a day the platform may take is the owner's decision, not the code's.
 *
 * The day is the UTC day (the same window BillingGuard uses). A refused submit is reported to the caller as Veo's own
 * `quota` failure (not retryable, nothing created), which every caller already handles: the film refunds the scene at
 * dispatch, the single clip refunds its debit, the director and long-form paths stop the shot.
 */
import 'server-only';
import { createUpstashRedis } from '@/lib/platform/upstash';
import { upstashRestEnv } from '@/lib/platform/upstashEnv';

/** Micro-dollars: the counter is an integer, so a day of additions never drifts the way a float sum does. */
const MICRO = 1_000_000;
/** The key outlives its day by one more, so a reservation made at 23:59 UTC can still be given back after midnight. */
const KEY_TTL_SEC = 2 * 86_400;

export type VeoCapRefusal = 'veo_daily_limit' | 'veo_cap_unreadable';

export type VeoCapDecision =
  | { ok: true; enforced: false }
  | { ok: true; enforced: true; dayKey: string; micro: number; source: 'redis' | 'ledger'; spentUsd: number; limitUsd: number }
  | { ok: false; enforced: true; reason: VeoCapRefusal; spentUsd: number | null; limitUsd: number; usd: number };

/** The ceiling in USD per UTC day, or null when it is not configured (see the header). Never throws. */
export function veoDailyLimitUsd(env: Record<string, string | undefined> = process.env): number | null {
  const raw = (env.VEO_DAILY_LIMIT_USD ?? '').trim();
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function veoCapEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return veoDailyLimitUsd(env) !== null;
}

/** "2026-10-15" for the UTC day `now` falls in. */
export function veoDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toMicro(usd: number): number {
  return Number.isFinite(usd) && usd > 0 ? Math.ceil(usd * MICRO - 1e-6) : 0;
}

const round2 = (usd: number): number => Math.round(usd * 100) / 100;

// ── Stores (injectable for tests) ────────────────────────────────────────────────────────────────────────────────

/** The atomic counter. Every method returns null (never throws) when the store cannot be reached. */
export interface VeoSpendStore {
  /** Whether the day already has a counter. */
  exists(dayKey: string): Promise<boolean | null>;
  /** Seed the day with what the ledger already booked, only if the day has no counter yet. */
  seed(dayKey: string, micro: number): Promise<boolean | null>;
  /** Add `micro` unless the total would pass `capMicro`. Returns the verdict and the total after (or as it stands). */
  reserve(dayKey: string, micro: number, capMicro: number): Promise<{ ok: boolean; totalMicro: number } | null>;
  /** Take `micro` back (never below zero). */
  release(dayKey: string, micro: number): Promise<number | null>;
  read(dayKey: string): Promise<number | null>;
}

/** What today's booked Veo spend is according to the trace ledger, in USD; null when it cannot be read. */
export type VeoLedgerReader = (dayKey: string) => Promise<number | null>;

const RESERVE_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local add = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
if cur + add > cap then return {0, cur} end
local total = redis.call('INCRBY', KEYS[1], add)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return {1, total}
`;

const RELEASE_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local sub = tonumber(ARGV[1])
local nxt = cur - sub
if nxt < 0 then nxt = 0 end
redis.call('SET', KEYS[1], nxt, 'EX', tonumber(ARGV[2]))
return nxt
`;

const keyFor = (dayKey: string): string => `veo:spend:micro:${dayKey}`;

let redisClient: ReturnType<typeof createUpstashRedis> | null | undefined;
function redis(): ReturnType<typeof createUpstashRedis> | null {
  if (redisClient !== undefined) return redisClient;
  const env = upstashRestEnv();
  redisClient = env ? createUpstashRedis(env.url, env.token) : null;
  return redisClient;
}

const redisStore: VeoSpendStore = {
  async exists(dayKey) {
    const r = redis();
    if (!r) return null;
    try {
      return (await r.exists(keyFor(dayKey))) > 0;
    } catch {
      return null;
    }
  },
  async seed(dayKey, micro) {
    const r = redis();
    if (!r) return null;
    try {
      return (await r.set(keyFor(dayKey), Math.max(0, Math.trunc(micro)), { nx: true, ex: KEY_TTL_SEC })) === 'OK';
    } catch {
      return null;
    }
  },
  async reserve(dayKey, micro, capMicro) {
    const r = redis();
    if (!r) return null;
    try {
      const out = (await r.eval(RESERVE_SCRIPT, [keyFor(dayKey)], [String(micro), String(capMicro), String(KEY_TTL_SEC)])) as unknown;
      if (!Array.isArray(out) || out.length < 2) return null;
      const total = Number(out[1]);
      return Number.isFinite(total) ? { ok: Number(out[0]) === 1, totalMicro: total } : null;
    } catch {
      return null;
    }
  },
  async release(dayKey, micro) {
    const r = redis();
    if (!r) return null;
    try {
      const out = Number(await r.eval(RELEASE_SCRIPT, [keyFor(dayKey)], [String(micro), String(KEY_TTL_SEC)]));
      return Number.isFinite(out) ? out : null;
    } catch {
      return null;
    }
  },
  async read(dayKey) {
    const r = redis();
    if (!r) return null;
    try {
      const v = await r.get<number | string | null>(keyFor(dayKey));
      if (v === null || v === undefined) return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  },
};

/**
 * Today's Veo spend as BillingGuard booked it (agent_evolution_traces rows with metadata.billingGuard and service "video",
 * which under the Google-only policy are Veo clips). Loaded lazily so that nothing here touches Supabase while the
 * ceiling is off.
 */
const ledgerReader: VeoLedgerReader = async (dayKey) => {
  try {
    const [{ createServiceRoleClient }, { GEL_PER_USD }] = await Promise.all([import('@/lib/supabase/server'), import('@/lib/billing/fx')]);
    const { data, error } = await createServiceRoleClient()
      .from('agent_evolution_traces')
      .select('cost_wholesale_gel')
      .gte('created_at', `${dayKey}T00:00:00.000Z`)
      .eq('metadata->>billingGuard', 'true')
      .eq('metadata->>service', 'video')
      .limit(20_000);
    if (error || !Array.isArray(data)) return null;
    let gel = 0;
    for (const row of data as { cost_wholesale_gel: number | null }[]) {
      const v = Number(row.cost_wholesale_gel ?? 0);
      if (Number.isFinite(v) && v > 0) gel += v;
    }
    return gel / GEL_PER_USD;
  } catch {
    return null;
  }
};

let deps: { store: VeoSpendStore; ledger: VeoLedgerReader; now: () => Date } = { store: redisStore, ledger: ledgerReader, now: () => new Date() };

/** Test seam. Pass nothing to restore the real Redis store and ledger. */
export function setVeoCapDepsForTests(next?: Partial<typeof deps>): void {
  deps = next ? { ...deps, ...next } : { store: redisStore, ledger: ledgerReader, now: () => new Date() };
}

// ── The two calls the engine makes ─────────────────────────────────────────────────────────────────────────────────

/**
 * Reserve `usd` of today's Veo ceiling before a submit. Never throws.
 *   · ceiling off → { ok: true, enforced: false } and nothing is touched;
 *   · Redis reachable → the atomic script decides (the day's counter is first seeded from the ledger, so a deployment that
 *     starts mid-day counts what was already spent);
 *   · Redis unreachable → the ledger decides, without a reservation (a bounded race for the length of the outage);
 *   · neither → refused (`veo_cap_unreadable`): a ceiling nobody can count is not a ceiling.
 */
export async function reserveVeoSpend(usd: number, env: Record<string, string | undefined> = process.env): Promise<VeoCapDecision> {
  const limitUsd = veoDailyLimitUsd(env);
  if (limitUsd === null) return { ok: true, enforced: false };
  const dayKey = veoDayKey(deps.now());
  const micro = toMicro(usd);
  const capMicro = toMicro(limitUsd);
  try {
    // A deployment that starts mid-day (or a day's first film) folds in what the ledger already booked, once: the seed only
    // writes when the day has no counter yet, so two first requests racing here cannot both add the ledger's figure.
    let seeded = false;
    if ((await deps.store.exists(dayKey)) === false) {
      const booked = await deps.ledger(dayKey);
      seeded = (await deps.store.seed(dayKey, toMicro(booked ?? 0))) === true && (booked ?? 0) > 0;
    }
    const reserved = await deps.store.reserve(dayKey, micro, capMicro);
    if (reserved) {
      const spentUsd = round2(reserved.totalMicro / MICRO);
      if (!reserved.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[veo-cap] REFUSED $${round2(usd)} — today ${dayKey} $${spentUsd} of $${limitUsd} already reserved`);
        return { ok: false, enforced: true, reason: 'veo_daily_limit', spentUsd, limitUsd, usd };
      }
      // eslint-disable-next-line no-console
      console.warn(`[veo-cap] reserved $${round2(usd)} — today ${dayKey} $${spentUsd} of $${limitUsd}${seeded ? ' (day seeded from the ledger)' : ''}`);
      return { ok: true, enforced: true, dayKey, micro, source: 'redis', spentUsd, limitUsd };
    }

    const booked = await deps.ledger(dayKey);
    if (booked === null) {
      // eslint-disable-next-line no-console
      console.error(`[veo-cap] REFUSED $${round2(usd)} — neither Redis nor the trace ledger can be read, so today's Veo spend is unknown`);
      return { ok: false, enforced: true, reason: 'veo_cap_unreadable', spentUsd: null, limitUsd, usd };
    }
    if (booked + usd > limitUsd + 1e-9) {
      // eslint-disable-next-line no-console
      console.warn(`[veo-cap] REFUSED $${round2(usd)} (ledger, Redis down) — today ${dayKey} $${round2(booked)} of $${limitUsd} booked`);
      return { ok: false, enforced: true, reason: 'veo_daily_limit', spentUsd: round2(booked), limitUsd, usd };
    }
    // eslint-disable-next-line no-console
    console.error(`[veo-cap] Redis unreachable — allowed $${round2(usd)} on the ledger alone (today $${round2(booked)} of $${limitUsd})`);
    return { ok: true, enforced: true, dayKey, micro: 0, source: 'ledger', spentUsd: round2(booked + usd), limitUsd };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[veo-cap] REFUSED — the ceiling check threw:', err instanceof Error ? err.message : err);
    return { ok: false, enforced: true, reason: 'veo_cap_unreadable', spentUsd: null, limitUsd, usd };
  }
}

/** Give a reservation back after a submit Google provably refused (no job, nothing billed). Never throws. */
export async function releaseVeoSpend(decision: VeoCapDecision): Promise<void> {
  if (!decision.ok || !decision.enforced || decision.source !== 'redis' || decision.micro <= 0) return;
  try {
    await deps.store.release(decision.dayKey, decision.micro);
  } catch {
    /* a reservation that stays is money counted that was not spent: the safe direction */
  }
}

/** For the admin read-out: the ceiling and what has been reserved today. Never throws. */
export async function veoCapStatus(env: Record<string, string | undefined> = process.env): Promise<{
  enforced: boolean; limitUsd: number | null; dayKey: string; reservedUsd: number | null; ledgerUsd: number | null;
}> {
  const limitUsd = veoDailyLimitUsd(env);
  const dayKey = veoDayKey(deps.now());
  const [reserved, ledger] = await Promise.all([
    deps.store.read(dayKey).catch(() => null),
    deps.ledger(dayKey).catch(() => null),
  ]);
  return {
    enforced: limitUsd !== null,
    limitUsd,
    dayKey,
    reservedUsd: reserved === null ? null : round2(reserved / MICRO),
    ledgerUsd: ledger === null ? null : round2(ledger),
  };
}

/** The `detail` a refused submit carries (never a secret; the figures are the platform's own). */
export function veoCapRefusalDetail(d: Extract<VeoCapDecision, { ok: false }>): string {
  return d.reason === 'veo_daily_limit'
    ? `veo_daily_limit: today's Veo ceiling of $${d.limitUsd} is reached ($${d.spentUsd ?? '?'} reserved; this clip $${round2(d.usd)}) — nothing was submitted`
    : `veo_cap_unreadable: today's Veo spend cannot be counted, so the $${d.limitUsd} ceiling cannot be checked — nothing was submitted`;
}
