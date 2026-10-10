/**
 * lib/calls/whatsapp/delivery.ts — a finished task's file, into the person's WhatsApp chat.
 *
 *   small enough  → the file itself: our storage signs a link valid for 15 minutes, Meta fetches it once at send time
 *                   and serves it from its own cache. Nothing is made public or permanent (owner, 13:10Z).
 *   too big, not ours, unsigned → one line with a link into MyAvatar.ge that opens only after sign-in (the Library).
 *   outside the 24 h window (Meta 131047) → nothing can be sent; the caller is told it is in the Library.
 *
 * Never throws and never fails the task: the file is always in the Library.
 */
import type { SendResult, WhatsAppMediaKind } from '@/lib/agent-g/channels/whatsapp-client';
import type { TaskView } from '@/lib/tasks/taskView';
import type { CallLang } from './copy';

/** Meta's Cloud API limits per media type (bytes). */
export const WA_MEDIA_MAX_BYTES: Readonly<Record<WhatsAppMediaKind, number>> = Object.freeze({
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  image: 5 * 1024 * 1024,
  document: 100 * 1024 * 1024,
});
export const DELIVERY_LINK_TTL_SEC = 15 * 60;
const OUTSIDE_WINDOW = 131047;

export interface DeliveryDeps {
  /** Our own storage object signed for this user, or null (not ours, not theirs, or signing failed). */
  signOwn(url: string, userId: string, ttlSec: number): Promise<string | null>;
  sendMedia(to: string, media: { kind: WhatsAppMediaKind; link: string; caption?: string; filename?: string }): Promise<SendResult>;
  sendText(to: string, text: string): Promise<SendResult>;
  origin: string;
}

export type Delivery = { sent: boolean; mode: 'media' | 'link' | 'none'; reason?: 'not_finished' | 'outside_window' | 'send_failed' };

const KIND: Record<string, WhatsAppMediaKind> = { audio: 'audio', video: 'video', image: 'image', file: 'document' };

const LINE: Record<CallLang, (what: string, link: string) => string> = {
  ka: (w, l) => `${w} მზადაა. ნახე და ჩამოტვირთე შენს ბიბლიოთეკაში (შესვლის შემდეგ): ${l}`,
  en: (w, l) => `${w} is ready. Open and download it in your Library (after signing in): ${l}`,
  ru: (w, l) => `${w} готово. Откройте и скачайте в своей библиотеке (после входа): ${l}`,
};

export function libraryLink(origin: string, lang: CallLang): string {
  return `${origin.replace(/\/+$/, '')}/${lang}/library`;
}

export async function deliverResult(
  deps: DeliveryDeps,
  input: { to: string; userId: string; task: TaskView; lang: CallLang },
): Promise<Delivery> {
  const { task, to, userId, lang } = input;
  const result = task.result;
  if (!result) return { sent: false, mode: 'none', reason: 'not_finished' };
  const what = task.label ?? result.name ?? task.service;
  const kind = KIND[result.media] ?? 'document';
  const fits = typeof result.bytes !== 'number' || result.bytes <= WA_MEDIA_MAX_BYTES[kind];
  try {
    if (fits) {
      const link = await deps.signOwn(result.url, userId, DELIVERY_LINK_TTL_SEC);
      if (link) {
        const r = await deps.sendMedia(to, { kind, link, caption: what, filename: result.name });
        if (r.ok) return { sent: true, mode: 'media' };
        if (r.errorCode === OUTSIDE_WINDOW) return { sent: false, mode: 'none', reason: 'outside_window' };
      }
    }
    const t = await deps.sendText(to, LINE[lang](what, libraryLink(deps.origin, lang)));
    if (t.ok) return { sent: true, mode: 'link' };
    return { sent: false, mode: 'none', reason: t.errorCode === OUTSIDE_WINDOW ? 'outside_window' : 'send_failed' };
  } catch {
    return { sent: false, mode: 'none', reason: 'send_failed' };
  }
}
