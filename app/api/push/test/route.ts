/**
 * POST /api/push/test — "send me a test notification" from the opt-in card. Body: `{ locale? }`.
 *
 *   200 { sent, reason?, delivered, attempted }   sent:false + reason 'not_linked' = no device of yours is registered
 *   401 no session · 403 cross-site · 429 the per-account limit · 503 not configured (no VAPID keys / no table)
 *
 * ⚠️ ONLY THE CALLER'S OWN DEVICES. The user id comes from the verified session, never from the body, so this cannot be
 * pointed at anyone else's phone; the per-account limit keeps it from being a way to buzz one's own devices endlessly.
 */
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { deliverPush } from '@/lib/notifications/channels/push';
import { getVapidConfig } from '@/lib/notifications/push/config';
import { isCrossSiteCookieWrite, noStore } from '@/lib/notifications/push/http';
import { pushTestMessage } from '@/lib/notifications/push/messages';
import { PUSH_TEST_USER } from '@/lib/notifications/push/rateLimits';
import { testBodySchema } from '@/lib/notifications/push/subscription';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// The channel's own deadline is 12 s (lib/notifications/channels/push.ts); vercel.json grants app/api/** 15 s.
export const maxDuration = 15;

const NOT_CONFIGURED = 'Push notifications are not available on this site yet';

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  if (isCrossSiteCookieWrite(req)) return apiError('cross-site push test', 403);

  let userId: string | null = null;
  try {
    userId = (await getAuthenticatedUser(req))?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return apiError('no session', 401, 'Sign in to turn on notifications');

  const perUser = await checkRateLimitByKey(userId, PUSH_TEST_USER);
  if (perUser) return perUser;
  if (!getVapidConfig()) return apiError('VAPID keys missing', 503, NOT_CONFIGURED);

  const parsed = testBodySchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return apiError(parsed.error, 400, 'Invalid request');
  const locale = parsed.data.locale ?? 'ka';
  const { title, body } = pushTestMessage(locale);

  const r = await deliverPush({
    userId,
    kind: 'generic',
    title,
    body,
    url: `/${locale}/dashboard`,
    // One tag for every test: pressing the button three times replaces the notification instead of stacking three.
    dedupeKey: 'myavatar-push-test',
    locale,
  });
  if (r.reason === 'not_configured') return apiError('push table missing', 503, NOT_CONFIGURED);
  return noStore(apiSuccess({
    sent: r.sent,
    ...(r.reason ? { reason: r.reason } : {}),
    delivered: r.delivered,
    attempted: r.attempted,
  }));
}
