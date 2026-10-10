/**
 * /api/notifications/preferences — Settings → Connections → Notifications: where each kind of news reaches the person.
 *
 *   GET  { prefs, saved, available } — `available` says which places can carry news for THIS person right now (WhatsApp
 *        only when their own number is linked; Telegram, SMS and calls not yet). The panel offers only those.
 *   PUT  { prefs } → normalized (lib/notifications/preferences.ts: the site always on, calls only for finished tasks,
 *        reports and reminders, a valid call window) and stored on the account (lib/notifications/prefsStore.ts).
 *
 * Signed-in only. A browser can ask for anything; the server stores only what the rules allow.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getWhatsappChannelStatus } from '@/lib/agent-g/channels/whatsapp';
import { findLinkByUser } from '@/lib/agent-g/channels/whatsapp-link';
import { prefsFromUser, writePrefs } from '@/lib/notifications/prefsStore';
import type { NotifyPlace } from '@/lib/notifications/preferences';

export const dynamic = 'force-dynamic';

async function availablePlaces(userId: string): Promise<Record<Exclude<NotifyPlace, 'site'>, boolean>> {
  let whatsapp = false;
  if (getWhatsappChannelStatus().ready) {
    const lookup = await findLinkByUser(createServiceRoleClient(), userId);
    whatsapp = lookup.state === 'linked';
  }
  return { whatsapp, telegram: false, sms: false, call: false };
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');
  const { prefs, saved } = prefsFromUser(user);
  return apiSuccess({ prefs, saved, available: await availablePlaces(user.id) });
}

// The shape is checked loosely here and strictly by normalizePrefs (unknown keys dropped, rules enforced).
const putSchema = z.object({ prefs: z.record(z.unknown()) }).strict();

export async function PUT(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');
  const raw = await request.text().catch(() => '');
  if (raw.length > 4096) return apiError(new Error('Too large'), 413, 'Request too large');
  let json: unknown = null;
  try { json = JSON.parse(raw); } catch { /* checked below */ }
  const body = putSchema.safeParse(json);
  if (!body.success) return apiError(body.error, 400, 'Invalid request');

  const limited = await checkRateLimitByKey(user.id, { maxRequests: 30, windowMs: 10 * 60_000, keyPrefix: 'notify:prefs' });
  if (limited) return limited;

  const stored = await writePrefs(user.id, body.data.prefs);
  if (!stored) return apiError(new Error('Save failed'), 503, 'Could not save right now');
  return apiSuccess({ prefs: stored, saved: true });
}
