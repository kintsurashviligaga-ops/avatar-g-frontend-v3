/**
 * GET /api/push/public-key → { available: true, publicKey } | { available: false }
 *
 * The VAPID public key the browser subscribes with (PushManager.subscribe's applicationServerKey). It is public by design —
 * every push service sees it — so this needs no session. `available` is false until BOTH the key pair is configured and the
 * push_subscriptions table exists (a cached probe), and the opt-in card then says "not available yet" instead of letting
 * someone subscribe to a channel that cannot deliver.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getVapidConfig, pushTableReady } from '@/lib/notifications/push/config';
import { noStore } from '@/lib/notifications/push/http';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  const vapid = getVapidConfig();
  let ready = false;
  if (vapid) {
    try {
      ready = await pushTableReady(createServiceRoleClient());
    } catch {
      ready = false;
    }
  }
  return noStore(NextResponse.json(vapid && ready ? { available: true, publicKey: vapid.publicKey } : { available: false }));
}
