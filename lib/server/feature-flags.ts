/**
 * feature-flags — DB-overridable runtime toggles for the per-request feature gates (v358 Master Control #3).
 *
 * Precedence: ENV WINS WHEN SET → else the feature_flags DB row → else the flag's built-in default. A flag
 * pinned in Vercel env stays authoritative (the admin panel can only override flags left UNSET in env). An
 * explicitly-set env var is read with STANDARD truthiness (0/false/off/no → off, else on) — so for the
 * canonical '1'/'0'/unset values every real deployment uses this matches the old process.env gate reads; a
 * non-canonical value like 'true' is a deliberate, documented widening (the old strict '1'/'0' checks
 * ignored it). Behaviour is unchanged until an admin toggles a flag that env leaves unset. FAIL-OPEN:
 * any DB error / missing table / empty row falls back to the default, so a dropped table or a DB outage can
 * never break a render. A ~30s in-memory cache keeps the assemble hot-path cheap (a toggle applies within
 * ~30s across warm lambdas).
 *
 * Only PER-REQUEST read sites belong here (a module-load env read would never observe a DB override).
 */
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface FlagDef {
  name: string;
  label: string;
  description: string;
  /** Value used when neither env nor a DB row sets this flag (matches the original code's default). */
  default: boolean;
}

/**
 * The gates that are read PER-REQUEST (verified async read sites) and are therefore safely DB-overridable.
 * Provider KEYS are intentionally NOT here — they gate real capability, not a toggle; the panel surfaces
 * those as read-only readiness instead.
 */
export const FLAG_DEFS: FlagDef[] = [
  { name: 'FILM_AUDIO_MIX_ENABLED', label: 'Audio-mix pipeline', description: 'Script-driven ducking + silence-beat mute windows in the film assembler (default off).', default: false },
  { name: 'FILM_LIPSYNC_ENABLED', label: 'Lip-sync pipeline', description: 'Post-render lip-sync stage over the master (passthrough until a provider is wired; default off).', default: false },
  { name: 'LIPSYNC_HEYGEN', label: 'HeyGen avatar lip-sync', description: 'Use HeyGen for avatar lip-sync; off forces the SadTalker fallback. Needs HEYGEN_API_KEY.', default: true },
];
const FLAG_NAMES = new Set(FLAG_DEFS.map((f) => f.name));

/** Tri-state interpret an env string: undefined when unset/empty; false for 0/false/off/no; else true. */
export function envBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '') return undefined;
  return !['0', 'false', 'off', 'no'].includes(v);
}

const CACHE_TTL_MS = 30_000;    // a SUCCESSFUL read is trusted for 30s
const ERROR_TTL_MS = 5_000;     // after a failed read, retry within 5s (never drop live toggles for a full 30s)
const QUERY_TIMEOUT_MS = 2_500; // bound the hot-path DB read so a stalled query can't hang a render
let cache: { at: number; map: Map<string, boolean>; ok: boolean } | null = null;

/** Race a thenable against a deadline, clearing the timer on settle (no dangling reject). Mirrors withAuthTimeout. */
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('flags_timeout')), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Service-role select of all DB overrides → Map<flag_name, enabled>. TIMEOUT-BOUNDED and FAIL-OPEN: a stall,
 * outage, or missing table degrades within QUERY_TIMEOUT_MS and NEVER hangs the render. Only a SUCCESSFUL read
 * is cached at the full TTL; on error we keep serving the LAST GOOD overrides (so a transient blip can't
 * silently drop active toggles) under a short retry TTL.
 */
async function loadDbFlags(): Promise<Map<string, boolean>> {
  const now = Date.now();
  if (cache && now - cache.at < (cache.ok ? CACHE_TTL_MS : ERROR_TTL_MS)) return cache.map;
  try {
    const svc = createServiceRoleClient(); // throws when unconfigured → caught below (fail-open)
    const res = (await withTimeout(svc.from('feature_flags').select('flag_name, enabled'), QUERY_TIMEOUT_MS)) as {
      data: { flag_name: string; enabled: boolean }[] | null;
      error: unknown;
    };
    if (res.error) throw res.error;
    const map = new Map<string, boolean>();
    for (const r of res.data ?? []) {
      if (typeof r.enabled === 'boolean') map.set(r.flag_name, r.enabled);
    }
    cache = { at: now, map, ok: true };
    return map;
  } catch {
    // Fail-open: serve the last GOOD overrides if we have them, else none; short TTL so we retry soon.
    const map = cache?.ok ? cache.map : new Map<string, boolean>();
    cache = { at: now, map, ok: false };
    return map;
  }
}

/** Force the next read to re-query the DB (call after an admin write). */
export function invalidateFlagCache(): void {
  cache = null;
}

/** Resolve one flag: env-wins-when-set → DB override → built-in default. Fail-open to `dflt`. */
export async function getFeatureFlag(name: string, dflt: boolean): Promise<boolean> {
  const e = envBool(process.env[name]);
  if (e !== undefined) return e;
  const db = await loadDbFlags();
  const v = db.get(name);
  return typeof v === 'boolean' ? v : dflt;
}

export interface ResolvedFlag extends FlagDef {
  envRaw: string | null;
  envResolved: boolean | null;
  dbEnabled: boolean | null;
  effective: boolean;
  source: 'env' | 'db' | 'default';
}

/** Resolve every registered flag with provenance (env/db/default) — for the admin panel. */
export async function resolveAllFlags(): Promise<ResolvedFlag[]> {
  const db = await loadDbFlags();
  return FLAG_DEFS.map((f) => {
    const e = envBool(process.env[f.name]);
    const dbEnabled = db.has(f.name) ? db.get(f.name)! : null;
    let effective: boolean;
    let source: 'env' | 'db' | 'default';
    if (e !== undefined) { effective = e; source = 'env'; }
    else if (dbEnabled !== null) { effective = dbEnabled; source = 'db'; }
    else { effective = f.default; source = 'default'; }
    return { ...f, envRaw: process.env[f.name] ?? null, envResolved: e ?? null, dbEnabled, effective, source };
  });
}

/** Upsert a DB override (admin). Only known flags are writable. Invalidates the cache on success. */
export async function setFeatureFlag(name: string, enabled: boolean, updatedBy: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!FLAG_NAMES.has(name)) return { ok: false, error: 'unknown_flag' };
  try {
    // createServiceRoleClient() throws when the service-role env is absent → caught below (write_failed).
    const svc = createServiceRoleClient();
    const { error } = await svc
      .from('feature_flags')
      .upsert({ flag_name: name, enabled, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'flag_name' });
    if (error) return { ok: false, error: error.message };
    invalidateFlagCache();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write_failed' };
  }
}

export function isKnownFlag(name: string): boolean {
  return FLAG_NAMES.has(name);
}
