/**
 * Fresh links for the media in a reopened chat (Phase 7.6 item 7, GG 2026-11-13: "signed media links expire after 7
 * days"). A clip, picture or song in a saved chat keeps the signed link it was delivered with; after WEEK_SEC it answers
 * 400 and the bubble shows a dead player.
 *
 * ⚠️ THE CHAT ROWS ARE NOT TRUSTED. `chat_messages` is written by the browser (lib/chat-history, RLS owner-only), so any
 * URL in a row is one the user could have typed. The plan's first draft re-signed whatever the row named
 * (renewLibraryLink); that would let one account write another account's object path into its own chat and get it signed.
 * So every URL goes through lib/security/callerMedia — the same rule every media route uses: the caller's own upload
 * prefix, one of the caller's own Library rows (generation_jobs) naming that exact object, or a token storage honours now.
 * Anything else is left as it is. The request therefore names the URLs itself; reading them from the rows server-side
 * would add a query and no trust.
 *
 * Only signed links on OUR storage are looked at. External links, public-bucket links and anything malformed are skipped.
 */
import 'server-only';
import { describeSupabaseObjectUrl, ownStorageHosts } from '@/lib/orchestrator/storage-adapter';
import { resolveCallerMedia, type CallerMedia } from '@/lib/security/callerMedia';

/** The same 7 days a delivered clip is signed for (lib/veo/deliver WEEK_SEC). */
export const CHAT_MEDIA_TTL_SEC = 604_800;
/** One reopened chat rarely holds more; a longer list is cut, not refused. */
export const CHAT_MEDIA_MAX_URLS = 40;

export function chatMediaRenewOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.CHAT_MEDIA_RENEW ?? '').trim());
}

export interface RenewDeps {
  env?: NodeJS.ProcessEnv;
  resolve?: (url: string, userId: string, ttlSec: number) => Promise<CallerMedia>;
}

/** Old link → fresh link, for each of `urls` the caller may read; links that cannot (or need not) be renewed are absent. */
export async function renewChatMedia(urls: readonly unknown[], userId: string, deps: RenewDeps = {}): Promise<Record<string, string>> {
  const env = deps.env ?? process.env;
  const resolve = deps.resolve ?? ((u: string, uid: string, ttl: number) => resolveCallerMedia(u, uid, ttl, { env }));
  const hosts = ownStorageHosts(env);
  const unique = [...new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0 && u.length <= 4000))].slice(0, CHAT_MEDIA_MAX_URLS);
  const out: Record<string, string> = {};
  await Promise.all(unique.map(async (url) => {
    const ref = describeSupabaseObjectUrl(url, env);
    if (!ref || ref.access !== 'sign' || !hosts.has(ref.host)) return;
    const r = await resolve(url, userId, CHAT_MEDIA_TTL_SEC).catch(() => null);
    if (r && r.ok && r.own && r.url !== url) out[url] = r.url;
  }));
  return out;
}
