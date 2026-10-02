/**
 * lib/notifications/dispatch.ts — ONE call when something finished: the in-app bell, Web Push and the user's linked
 * WhatsApp, each with its own honest result (lib/notifications/types.ts).
 *
 * The bell is written first and awaited — it is a single insert and it is what the app itself shows. Push and
 * WhatsApp are network calls to other services (up to seconds each), so on Vercel they finish AFTER the caller's
 * response (waitUntil — lib/platform/afterResponse.ts) instead of holding up a generation flow; off Vercel they are
 * awaited. Nothing here throws into the caller.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createNotification, type NotificationType } from '@/lib/notifications/store';
import { sendPushAlert } from '@/lib/notifications/channels/push';
import { sendWhatsAppAlert } from '@/lib/notifications/channels/whatsapp';
import { hashIdempotencyKey, markIdempotentDuplicate } from '@/lib/platform/idempotency';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import type { NotifyEvent, NotifyKind } from './types';

const BELL_TYPE: Partial<Record<NotifyKind, NotificationType>> = {
  video: 'video', film: 'video', avatar: 'video', vfx: 'video',
  music: 'music', image: 'image', research: 'research', credits_low: 'credits_low', payment: 'payment',
};

export interface NotifyOptions {
  /** Skip the bell when the caller has already filed it (or the event has no bell type). */
  bell?: boolean;
}

/** Fan one event out. Resolves when the bell is filed; the outside channels may still be sending (see header). */
export async function notifyUser(ev: NotifyEvent, opts: NotifyOptions = {}): Promise<void> {
  try {
    if (!ev.userId) return;
    if (ev.dedupeKey) {
      const first = await markIdempotentDuplicate(hashIdempotencyKey(`notify:${ev.userId}:${ev.dedupeKey}`), 7 * 24 * 3600);
      if (!first) return;
    }

    const bellType = BELL_TYPE[ev.kind];
    if (opts.bell !== false && bellType) {
      const message = ev.body ? `${ev.title} ${ev.body}` : ev.title;
      await createNotification(createServiceRoleClient(), ev.userId, bellType, message);
    }

    const outside = async () => {
      const [push, whatsapp] = await Promise.allSettled([sendPushAlert(ev), sendWhatsAppAlert(ev)]);
      console.info('[notify]', {
        kind: ev.kind,
        push: push.status === 'fulfilled' ? (push.value.sent ? 'sent' : push.value.reason) : 'failed',
        whatsapp: whatsapp.status === 'fulfilled' ? (whatsapp.value.sent ? 'sent' : whatsapp.value.reason) : 'failed',
      });
    };
    if (!runAfterResponse(outside, 'notify')) await outside();
  } catch {
    /* a notification must never break the flow that finished */
  }
}
