/**
 * WhatsApp channel (Agent G) — "your video is ready" on the user's linked WhatsApp.
 *
 * WhatsApp's rule decides the shape: a free-form message only inside the 24 h customer-service window (opened by the
 * user's own last message — handleInbound stamps `last_inbound_at`); outside it, only an approved TEMPLATE. With
 * WHATSAPP_ALERT_TEMPLATE set (a Utility template whose body has {{1}} = title and {{2}} = details, approved in Meta's
 * WhatsApp Manager; WHATSAPP_ALERT_TEMPLATE_LANG = its language code, default `ka`) the alert goes as that template;
 * without one it answers `window_closed` and the bell and push still carry it.
 *
 * Never throws: every failure is a `{ sent: false, reason }` and the generation flow moves on.
 */
import 'server-only';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendWhatsAppTemplate, sendWhatsAppText, whatsappConfig } from '@/lib/agent-g/channels/whatsapp-client';
import { findLinkByUser } from '@/lib/agent-g/channels/whatsapp-link';
import type { ChannelResult, NotifyEvent } from '../types';

const WINDOW_MS = 24 * 3_600_000;
/** Meta's "re-engagement message" error: the 24 h window closed between our check and the send. */
const OUTSIDE_WINDOW = 131047;

/** An in-app path → the absolute link WhatsApp shows. Anything that is not a plain same-site path is dropped. */
export function alertLink(path: string | undefined, origin: string): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\s\\]/.test(path)) return null;
  return `${origin.replace(/\/+$/, '')}${path}`;
}

export async function sendWhatsAppAlert(ev: NotifyEvent, env: NodeJS.ProcessEnv = process.env): Promise<ChannelResult> {
  try {
    const cfg = whatsappConfig(env);
    if (!cfg) return { sent: false, reason: 'not_configured' };

    const lookup = await findLinkByUser(createServiceRoleClient(), ev.userId);
    if (lookup.state === 'unavailable') return { sent: false, reason: 'not_configured' };
    if (lookup.state === 'unlinked') return { sent: false, reason: 'not_linked' };
    const { link } = lookup;
    if (link.meta.alerts === false) return { sent: false, reason: 'opted_out' };

    if (await checkRateLimitByKey(ev.userId, { maxRequests: 30, windowMs: 3_600_000, keyPrefix: 'wa:alert' })) {
      return { sent: false, reason: 'rate_limited' };
    }

    const origin = env.PUBLIC_APP_URL || env.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge';
    const url = alertLink(ev.url, origin);
    const lastInbound = Date.parse(link.meta.last_inbound_at ?? '');
    const inWindow = Number.isFinite(lastInbound) && Date.now() - lastInbound < WINDOW_MS - 5 * 60_000;

    if (inWindow) {
      const text = [`*${ev.title}*`, ev.body, url].filter(Boolean).join('\n');
      const res = await sendWhatsAppText(link.waId, text, cfg);
      if (res.ok) return { sent: true };
      if (res.errorCode !== OUTSIDE_WINDOW) return { sent: false, reason: 'failed' };
    }

    const template = (env.WHATSAPP_ALERT_TEMPLATE ?? '').trim();
    if (!template) return { sent: false, reason: 'window_closed' };
    const language = (env.WHATSAPP_ALERT_TEMPLATE_LANG ?? '').trim() || 'ka';
    const details = [ev.body, url].filter(Boolean).join(' ') || '-';
    const res = await sendWhatsAppTemplate(link.waId, { name: template, language }, [ev.title, details], cfg);
    return res.ok ? { sent: true } : { sent: false, reason: 'failed' };
  } catch {
    return { sent: false, reason: 'failed' };
  }
}
