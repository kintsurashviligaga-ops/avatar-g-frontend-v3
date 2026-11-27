/**
 * lib/observability/featureLog.ts — one structured log line for every failed answer of a new feature's route
 * (Phase 8.14 pre-flight, Day-1 observability).
 *
 * The new features (3D, Smart Editor, Art Director, Music Producer, Avatar Studio, Director's Workflow, browser agent)
 * answer a failure with a JSON error code and log nothing, so a user's failed press left no trace in the Vercel logs.
 * `withFeatureLog(feature, handler)` wraps a route handler and, when the answer is 4xx/5xx (401 and the flag-off 404
 * excluded), writes ONE line:
 *
 *   [feature-error] {"feature":"studio3d","route":"/api/studio3d","method":"POST","status":429,"code":"user_busy",
 *                    "userId":"…","taskId":"…","ms":412}
 *
 * Search the Vercel logs for `[feature-error]` plus a userId or taskId. A thrown error is logged the same way (code
 * `thrown`, through reportError so Sentry gets it too) and then re-thrown, so the route behaves exactly as before.
 *
 * userId comes from the request's Supabase session cookie or Bearer token, DECODED BUT NOT VERIFIED: it labels the log
 * line and is never used for any decision. No body, prompt, token or cookie is ever written.
 */
import { reportError } from '@/lib/observability/report-error';

type Handler<R extends Request, C, T extends Response> = (req: R, ctx: C) => Promise<T> | T;

const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.(\d+))?$/;
const ID = /^[A-Za-z0-9_-]{6,80}$/;

function b64urlJson(part: string): unknown {
  try {
    const s = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function subOfJwt(jwt: string | undefined | null): string | undefined {
  const payload = jwt?.split('.')[1];
  if (!payload) return undefined;
  const sub = (b64urlJson(payload) as { sub?: unknown } | null)?.sub;
  return typeof sub === 'string' && ID.test(sub) ? sub : undefined;
}

/** The (unverified) Supabase user id of a request, for log context only. */
export function claimedUserId(req: Request): string | undefined {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return subOfJwt(bearer);
  const cookie = req.headers.get('cookie');
  if (!cookie) return undefined;
  const chunks: { i: number; v: string }[] = [];
  for (const pair of cookie.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const m = AUTH_COOKIE.exec(pair.slice(0, eq).trim());
    if (!m) continue;
    let v = pair.slice(eq + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      return undefined;
    }
    chunks.push({ i: m[1] ? Number(m[1]) : -1, v });
  }
  if (!chunks.length) return undefined;
  let raw = chunks.sort((a, b) => a.i - b.i).map((c) => c.v).join('');
  if (raw.startsWith('base64-')) {
    try {
      raw = Buffer.from(raw.slice(7), 'base64').toString('utf8');
    } catch {
      return undefined;
    }
  }
  try {
    const parsed = JSON.parse(raw) as { access_token?: unknown } | unknown[];
    const token = Array.isArray(parsed) ? parsed[0] : (parsed as { access_token?: unknown }).access_token;
    return typeof token === 'string' ? subOfJwt(token) : undefined;
  } catch {
    return undefined;
  }
}

/** A task / job id from the route's params, then from the answer body. */
function taskIdOf(params: unknown, body: Record<string, unknown> | null): string | undefined {
  const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
  for (const v of [p.id, p.runId, p.taskId, body?.id, body?.jobId, body?.taskId, body?.runId]) {
    if (typeof v === 'string' && ID.test(v)) return v;
  }
  return undefined;
}

function codeOf(body: Record<string, unknown> | null): string | undefined {
  if (!body) return undefined;
  const e = body.error ?? body.code;
  if (typeof e === 'string') return e.slice(0, 60);
  if (e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string') return String((e as { code: string }).code).slice(0, 60);
  return undefined;
}

export interface FeatureLogLine {
  feature: string;
  route: string;
  method: string;
  status: number;
  code?: string;
  userId?: string;
  taskId?: string;
  ms: number;
}

/** Statuses that are not failures worth a line: signed out, and the flag-off 404 every new route answers. */
const QUIET = new Set([401, 404]);

export function logFeatureFailure(line: FeatureLogLine): void {
  try {
    console.warn('[feature-error]', JSON.stringify(line));
  } catch {
    /* logging never breaks a route */
  }
}

export function withFeatureLog<R extends Request, C = unknown, T extends Response = Response>(
  feature: string,
  handler: Handler<R, C, T>,
): (req: R, ctx?: C) => Promise<T> {
  return async (req: R, ctx?: C) => {
    const t0 = Date.now();
    const route = (() => {
      try {
        return new URL(req.url).pathname;
      } catch {
        return '?';
      }
    })();
    const params = (ctx as { params?: unknown } | undefined)?.params;
    let res: T;
    try {
      res = await handler(req, ctx as C);
    } catch (e) {
      const userId = claimedUserId(req);
      logFeatureFailure({ feature, route, method: req.method, status: 500, code: 'thrown', userId, taskId: taskIdOf(params, null), ms: Date.now() - t0 });
      reportError(e, { feature, route, userId });
      throw e;
    }
    if (res.status >= 400 && !QUIET.has(res.status)) {
      let body: Record<string, unknown> | null = null;
      if ((res.headers.get('content-type') ?? '').includes('json')) {
        try {
          body = (await res.clone().json()) as Record<string, unknown>;
        } catch {
          body = null;
        }
      }
      logFeatureFailure({
        feature,
        route,
        method: req.method,
        status: res.status,
        code: codeOf(body),
        userId: claimedUserId(req),
        taskId: taskIdOf(params, body),
        ms: Date.now() - t0,
      });
    }
    return res;
  };
}
