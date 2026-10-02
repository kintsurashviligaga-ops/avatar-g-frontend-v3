/**
 * lib/notifications/types.ts — the contract between "something finished" and every way a user can be told.
 *
 * One event, many channels: the in-app bell (lib/notifications/store.ts), Web Push to a phone or desktop with the tab
 * closed (channels/push.ts) and the user's linked WhatsApp (channels/whatsapp.ts, Agent G). A channel NEVER throws into
 * a generation flow: it answers `{ sent: false, reason }` and the caller moves on.
 */

export type NotifyKind =
  | 'video' | 'music' | 'image' | 'avatar' | 'film' | 'vfx' | 'research' | 'credits_low' | 'payment' | 'generic';

export interface NotifyEvent {
  userId: string;
  kind: NotifyKind;
  /** Short headline, already in the user's language. */
  title: string;
  /** One or two lines. No secrets, no provider names, no prompts — it lands on a lock screen. */
  body: string;
  /** In-app deep link, PATH ONLY (e.g. `/ka/dashboard?tool=video`), never an absolute URL to another host. */
  url?: string;
  /** Same key = same event (a webhook delivered twice, a poll that sees "done" twice): only the first one notifies. */
  dedupeKey?: string;
  locale?: 'ka' | 'en' | 'ru';
}

export type ChannelFailure =
  | 'not_configured'  // the deployment lacks the keys/tables for this channel
  | 'not_linked'      // the user has not connected this channel
  | 'opted_out'       // the user turned it off
  | 'rate_limited'
  | 'window_closed'   // WhatsApp: outside the 24 h customer-service window and no approved template to fall back on
  | 'failed';

export interface ChannelResult {
  sent: boolean;
  reason?: ChannelFailure;
}

export type NotifyChannel = (ev: NotifyEvent) => Promise<ChannelResult>;
