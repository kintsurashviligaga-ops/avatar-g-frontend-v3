/**
 * lib/billing/v5/shadow.ts — shadow pricing (v5.1 Phase 5, M-5; PREPARED, NOT WIRED). Pure apart from injected ports.
 *
 * GG 2026-11-13 13:06Z: "Run it in shadow mode and log the differences" for 7 days once the database is back.
 *
 * `shadowPrice` runs NEXT TO today's code price. Whatever happens inside it, the caller charges exactly the code price
 * it already computed: this function returns nothing the caller may charge, it never throws, and it gives up after a
 * short timeout so a slow price-book read can't slow a generation down. It only writes one log record:
 *   { capability, model, codeCredits, bookCredits, bookMaxCredits, diff, diffPct, versionIds, error }
 *
 * AGENT_PRICE_BOOK:
 *   off    → does nothing at all (no read, no log). The default, and what any unknown value means.
 *   shadow → reads the book, prices the same estimate, logs the difference. The user still pays the code price.
 *   on     → also does nothing here: in `on` the book IS the price and the caller uses quote() directly.
 */
import { ECON, type Econ } from '@/lib/credits/unitEconomics';
import { priceBookMode, type PriceVersion } from './priceVersions';
import { quote, type Estimate } from './quote';

export interface ShadowRecord {
  at: string;
  capability: string;
  model: string;
  codeCredits: number;
  bookCredits: number | null;
  bookMaxCredits: number | null;
  /** book − code, in credits (positive: the book would charge more). */
  diff: number | null;
  /** diff / code, e.g. 0.12 = the book is 12 % dearer. null when code is 0 or the book failed. */
  diffPct: number | null;
  versionIds: string[];
  error: string | null;
}

export interface ShadowPorts {
  /** Approved price rows (cached by the caller; drafts are filtered out by quote() anyway). */
  loadBook: () => Promise<readonly PriceVersion[]>;
  /** Where the record goes (a log line or a shadow table). Its failure is swallowed too. */
  log: (r: ShadowRecord) => void | Promise<void>;
  now?: () => Date;
  timeoutMs?: number;
}

export const SHADOW_TIMEOUT_MS = 800;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

/** Pure: the record for one comparison. */
export function shadowRecord(est: Estimate, codeCredits: number, book: readonly PriceVersion[] | null, atIso: string, loadError: string | null = null, econ: Econ = ECON): ShadowRecord {
  const base = { at: atIso, capability: est.capability, model: est.model, codeCredits };
  if (!book) return { ...base, bookCredits: null, bookMaxCredits: null, diff: null, diffPct: null, versionIds: [], error: loadError ?? 'no book' };
  const q = quote(book, est, atIso, econ);
  if (!q.ok) return { ...base, bookCredits: null, bookMaxCredits: null, diff: null, diffPct: null, versionIds: [], error: q.error };
  const diff = q.credits - codeCredits;
  return {
    ...base,
    bookCredits: q.credits,
    bookMaxCredits: q.maxCredits,
    diff,
    diffPct: codeCredits > 0 ? Math.round((diff / codeCredits) * 1e4) / 1e4 : null,
    versionIds: q.versionIds,
    error: null,
  };
}

/**
 * Compare the book with today's price for one call. Returns void: the caller keeps charging `codeCredits`.
 * Awaiting it is optional; it resolves within about 2 × `timeoutMs` (book read + log write) and never rejects.
 */
export async function shadowPrice(mode: string | undefined, est: Estimate, codeCredits: number, ports: ShadowPorts): Promise<void> {
  if (priceBookMode(mode) !== 'shadow') return;
  const atIso = (ports.now?.() ?? new Date()).toISOString();
  let rec: ShadowRecord;
  try {
    const book = await withTimeout(ports.loadBook(), ports.timeoutMs ?? SHADOW_TIMEOUT_MS);
    rec = shadowRecord(est, codeCredits, book, atIso);
  } catch (e) {
    rec = shadowRecord(est, codeCredits, null, atIso, e instanceof Error ? e.message.slice(0, 120) : 'load failed');
  }
  try {
    await withTimeout(Promise.resolve(ports.log(rec)), ports.timeoutMs ?? SHADOW_TIMEOUT_MS);
  } catch {
    /* a lost shadow line never affects a user */
  }
}

/** Seven days of records → a per-capability summary for GG (mean and worst difference, failures). */
export function shadowSummary(records: readonly ShadowRecord[]) {
  const by = new Map<string, ShadowRecord[]>();
  for (const r of records) {
    const k = `${r.capability}|${r.model}`;
    const list = by.get(k);
    if (list) list.push(r);
    else by.set(k, [r]);
  }
  return [...by.entries()]
    .map(([key, rs]) => {
      const priced = rs.filter((r) => r.diffPct !== null);
      const pcts = priced.map((r) => r.diffPct as number);
      return {
        key,
        calls: rs.length,
        failed: rs.filter((r) => r.error !== null).length,
        meanDiffPct: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 1e4) / 1e4 : null,
        worstDiffPct: pcts.length ? pcts.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null,
        errors: [...new Set(rs.map((r) => r.error).filter((e): e is string => e !== null))],
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
