/**
 * /api/push/subscribe — register (POST) or forget (DELETE) THIS browser's push subscription for the signed-in user.
 *
 *   POST   { subscription: PushSubscription.toJSON(), locale? }  → 200 { subscribed: true }
 *   DELETE { endpoint }                                           → 200 { removed: n }
 *   401 no session · 400 invalid body (an endpoint not on a known push service included) · 403 cross-site · 429 · 503 not configured
 *
 * The table is written ONLY here, with the service-role client (20261003d: clients may read and delete their own rows,
 * never insert or update) — so every stored endpoint has passed lib/notifications/push/subscription's validation.
 */
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getVapidConfig, isMissingTableError } from '@/lib/notifications/push/config';
import { isCrossSiteCookieWrite, noStore } from '@/lib/notifications/push/http';
import { PUSH_SUBSCRIBE_USER } from '@/lib/notifications/push/rateLimits';
import {
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  subscribeBodySchema,
  unsubscribeBodySchema,
} from '@/lib/notifications/push/subscription';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_CONFIGURED = 'Push notifications are not available on this site yet';

/** The verified caller, or null — an auth outage reads as "no session", never as a user. */
async function callerId(req: NextRequest): Promise<string | null> {
  try {
    return (await getAuthenticatedUser(req))?.id ?? null;
  } catch {
    return null;
  }
}

/** The shared front door of both methods: IP burst guard, cross-site refusal, session, per-account limit. */
async function gate(req: NextRequest): Promise<{ userId: string } | { res: Response }> {
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return { res: limited };
  if (isCrossSiteCookieWrite(req)) return { res: apiError('cross-site push subscription write', 403) };
  const userId = await callerId(req);
  if (!userId) return { res: apiError('no session', 401, 'Sign in to turn on notifications') };
  const perUser = await checkRateLimitByKey(userId, PUSH_SUBSCRIBE_USER);
  if (perUser) return { res: perUser };
  return { userId };
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('res' in g) return g.res;
  if (!getVapidConfig()) return apiError('VAPID keys missing', 503, NOT_CONFIGURED);

  const parsed = subscribeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error, 400, 'Invalid push subscription');
  const { subscription, locale } = parsed.data;

  try {
    const db = createServiceRoleClient();
    // ⚠️ ON CONFLICT (endpoint) MOVES THE DEVICE TO THIS USER. One browser has one endpoint; on a shared computer the
    // person signed in NOW is the one whose notifications it should show — never the previous account's.
    // `created_at` is refreshed on every registration so the per-user cap below retires the device not seen the longest.
    const { error } = await db.from('push_subscriptions').upsert(
      {
        user_id: g.userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
        locale: locale ?? 'ka',
        created_at: new Date().toISOString(),
        failure_count: 0,
      },
      { onConflict: 'endpoint' },
    );
    if (error) {
      if (isMissingTableError(error)) return apiError(error, 503, NOT_CONFIGURED);
      return apiError(error, 500, 'Could not save the subscription');
    }

    // The cap: keep the newest MAX per user, retire the rest (a reinstalled browser leaves its old endpoint behind).
    const { data: rows } = await db
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', g.userId)
      .order('created_at', { ascending: false });
    const extra = (Array.isArray(rows) ? rows : []).slice(MAX_PUSH_SUBSCRIPTIONS_PER_USER).map((r: { id: string }) => r.id);
    if (extra.length) await db.from('push_subscriptions').delete().eq('user_id', g.userId).in('id', extra);

    return noStore(apiSuccess({ subscribed: true }));
  } catch (e) {
    return apiError(e, 500, 'Could not save the subscription');
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if ('res' in g) return g.res;

  const parsed = unsubscribeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error, 400, 'Invalid request');

  try {
    const db = createServiceRoleClient();
    // Scoped to the caller's own rows: knowing someone else's endpoint does not let you switch their device off.
    const { error, count } = await db
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .eq('user_id', g.userId)
      .eq('endpoint', parsed.data.endpoint);
    if (error) {
      // No table, nothing stored: the browser unsubscribes locally either way.
      if (isMissingTableError(error)) return noStore(apiSuccess({ removed: 0 }));
      return apiError(error, 500, 'Could not remove the subscription');
    }
    return noStore(apiSuccess({ removed: count ?? 0 }));
  } catch (e) {
    return apiError(e, 500, 'Could not remove the subscription');
  }
}
