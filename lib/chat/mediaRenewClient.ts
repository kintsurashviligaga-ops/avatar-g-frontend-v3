/**
 * The browser side of a reopened chat's link renewal (Phase 7.6 item 7; server: app/api/chat/media/renew). Pure helpers
 * plus one fetch; the hook (useChatMediaRenew) wires them to the open conversation.
 *
 * A link is asked about only when it is a signed link of a Supabase storage object whose token runs out within a day (or
 * already has). A token that cannot be read is left alone: nothing is sent for it.
 */

/** The bubble fields that hold one media link each (OmniStudio Msg). */
export const CHAT_MEDIA_FIELDS = ['videoUrl', 'imageUrl', 'audioUrl', 'coverUrl', 'docUrl'] as const;
type MediaField = (typeof CHAT_MEDIA_FIELDS)[number];
type WithMedia = Partial<Record<MediaField, string>>;

/** Renew a link this close to its end (seconds), so a chat opened on day 6 does not die while it is read. */
export const RENEW_MARGIN_SEC = 24 * 60 * 60;

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const text = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The signed link's token expiry (unix seconds), or null when it is not a signed storage link or cannot be read. */
export function signedLinkExpiry(url: string): number | null {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url) || !url.includes('/storage/v1/object/sign/')) return null;
  let token: string | null = null;
  try { token = new URL(url).searchParams.get('token'); } catch { return null; }
  const payload = token?.split('.')[1];
  const exp = payload ? b64urlJson(payload)?.exp : undefined;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
}

export function isStaleSignedLink(url: string, nowSec: number, marginSec = RENEW_MARGIN_SEC): boolean {
  const exp = signedLinkExpiry(url);
  return exp !== null && exp - nowSec < marginSec;
}

/** Every stale media link in the bubbles, once each. */
export function staleMediaUrls(messages: readonly WithMedia[], nowSec: number): string[] {
  const out = new Set<string>();
  for (const m of messages) {
    for (const f of CHAT_MEDIA_FIELDS) {
      const u = m[f];
      if (typeof u === 'string' && isStaleSignedLink(u, nowSec)) out.add(u);
    }
  }
  return [...out];
}

/** The bubbles with each renewed link swapped in; the same array when nothing changed. */
export function applyRenewedMedia<T extends WithMedia>(messages: readonly T[], renewed: Readonly<Record<string, string>>): T[] {
  let changed = false;
  const next = messages.map((m) => {
    let copy: T | null = null;
    for (const f of CHAT_MEDIA_FIELDS) {
      const u = m[f];
      const fresh = typeof u === 'string' ? renewed[u] : undefined;
      if (fresh && fresh !== u) { copy = copy ?? { ...m }; (copy as WithMedia)[f] = fresh; }
    }
    if (copy) { changed = true; return copy; }
    return m;
  });
  return changed ? next : (messages as T[]);
}

let disabledForSession = false;
/** Tests only. */
export function resetMediaRenewClient(): void { disabledForSession = false; }

/** Ask the server for fresh links. {} on any failure; a 404 (feature off) stops further asks this session. */
export async function requestMediaRenewal(urls: readonly string[], fetchImpl: typeof fetch = fetch): Promise<Record<string, string>> {
  if (disabledForSession || urls.length === 0) return {};
  try {
    const res = await fetchImpl('/api/chat/media/renew', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }),
    });
    if (res.status === 404) { disabledForSession = true; return {}; }
    if (!res.ok) return {};
    const j = (await res.json().catch(() => ({}))) as { renewed?: unknown };
    const r = j.renewed;
    if (!r || typeof r !== 'object') return {};
    return Object.fromEntries(Object.entries(r as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && /^https:\/\//i.test(e[1])));
  } catch {
    return {};
  }
}
