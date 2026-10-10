/**
 * lib/agent/media/audioSource.ts — which links Agent G may take audio from, before anything is fetched. Pure and
 * isomorphic: the chat uses it to read the user's message, the server to decide.
 *
 * ⚠️ NO DOWNLOADS FROM PLATFORMS, AND NO WAY AROUND THAT (owner, 2026-10-09: "არ გამოიყენოს აკრძალული შეზღუდვების
 * გვერდის ავლა"). YouTube, TikTok, Instagram, Facebook, X, Vimeo, SoundCloud, Spotify and the rest let people play their
 * media in their own player; their terms do not allow taking the file out of it, and the only tools that do it
 * (yt-dlp and kin) work by getting around exactly that. So a link to one of them, to its CDN (googlevideo.com,
 * fbcdn.net, …) or a redirect that lands on one is refused, and the user is offered the way that is always allowed:
 * upload their own file, or one they have a licence for. The rule is checked on the link, and again on every redirect
 * hop while the file downloads (lib/web/publicFetch allowUrl), so a shortener cannot carry the download onto a platform.
 *
 * What may be fetched is a DIRECT media file on a public host (a .mp4 / .mp3 / … the host serves as video or audio).
 * A streaming manifest (HLS .m3u8, DASH .mpd) is a stream, not a file, and is refused too. Whether the file's owner
 * allows its use is the server's next question (./audioExtract: a licence it can verify, else the user's own word on
 * Start).
 */

/** A platform's name, by every host it serves pages or media from (a host and all its subdomains). */
const PLATFORMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['YouTube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'googlevideo.com', 'ytimg.com']],
  ['TikTok', ['tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokv.com', 'byteoversea.com', 'muscdn.com']],
  ['Instagram', ['instagram.com', 'instagr.am', 'cdninstagram.com']],
  ['Facebook', ['facebook.com', 'fb.com', 'fb.watch', 'fbcdn.net', 'messenger.com']],
  ['X', ['x.com', 'twitter.com', 'twimg.com', 't.co']],
  ['Threads', ['threads.net', 'threads.com']],
  ['Vimeo', ['vimeo.com', 'vimeocdn.com']],
  ['SoundCloud', ['soundcloud.com', 'snd.sc', 'sndcdn.com']],
  ['Spotify', ['spotify.com', 'spoti.fi', 'scdn.co', 'spotifycdn.com']],
  ['Apple Music', ['music.apple.com', 'itunes.apple.com', 'podcasts.apple.com']],
  ['Amazon Music', ['music.amazon.com']],
  ['Deezer', ['deezer.com', 'deezer.page.link', 'dzcdn.net']],
  ['Tidal', ['tidal.com']],
  ['Yandex Music', ['music.yandex.ru', 'music.yandex.com']],
  ['Twitch', ['twitch.tv', 'ttvnw.net', 'jtvnw.net']],
  ['Kick', ['kick.com']],
  ['Dailymotion', ['dailymotion.com', 'dai.ly', 'dmcdn.net']],
  ['VK', ['vk.com', 'vk.ru', 'vkvideo.ru', 'userapi.com', 'vkuser.net']],
  ['OK.ru', ['ok.ru', 'odnoklassniki.ru', 'mycdn.me']],
  ['Rutube', ['rutube.ru']],
  ['Bilibili', ['bilibili.com', 'b23.tv', 'bilivideo.com']],
  ['Snapchat', ['snapchat.com']],
  ['Pinterest', ['pinterest.com', 'pin.it', 'pinimg.com']],
  ['Reddit', ['reddit.com', 'redd.it']],
  ['LinkedIn', ['linkedin.com', 'licdn.com']],
  ['Telegram', ['t.me', 'telegram.me', 'telegram.org']],
  ['Bandcamp', ['bandcamp.com', 'bcbits.com']],
  ['Audiomack', ['audiomack.com']],
  ['Mixcloud', ['mixcloud.com']],
  ['Netflix', ['netflix.com', 'nflxvideo.net']],
  ['Likee', ['likee.video']],
  ['Kwai', ['kwai.com']],
];

/** The platform a host belongs to, or null. */
export function platformOf(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  for (const [name, hosts] of PLATFORMS) {
    if (hosts.some((d) => h === d || h.endsWith(`.${d}`))) return name;
  }
  return null;
}

/** The platform an address belongs to, or null (an address that does not parse belongs to none). */
export function platformOfUrl(url: string): string | null {
  try { return platformOf(new URL(url).hostname); } catch { return null; }
}

/** Streaming manifests by their path; by their type the server checks after fetching (STREAM_TYPES). */
const STREAM_PATH = /\.(?:m3u8?|mpd|ism|isml|f4m)(?:$|[/?#])|\/manifest(?:\(|$)/i;
export const STREAM_TYPES = /^(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml|vnd\.ms-sstr\+xml|f4m\+xml)|audio\/(?:x-)?mpegurl)$/i;

export const MAX_LINK_CHARS = 2048;

export type SourceVerdict =
  /** A candidate: the server still checks it answers, what it serves, and how big it is. */
  | { ok: true; url: string; host: string }
  | { ok: false; reason: 'invalid_url' }
  /** A platform page or its CDN: its terms do not allow taking the file. */
  | { ok: false; reason: 'platform'; platform: string }
  /** A streaming manifest, not a file. */
  | { ok: false; reason: 'stream' };

/** May Agent G try to fetch this link? Pure: no network. */
export function classifySource(raw: string): SourceVerdict {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.length > MAX_LINK_CHARS) return { ok: false, reason: 'invalid_url' };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, reason: 'invalid_url' }; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname) {
    return { ok: false, reason: 'invalid_url' };
  }
  const platform = platformOf(u.hostname);
  if (platform) return { ok: false, reason: 'platform', platform };
  if (STREAM_PATH.test(u.pathname)) return { ok: false, reason: 'stream' };
  return { ok: true, url: u.href, host: u.hostname.toLowerCase() };
}

/** Every http(s) link in a message, trailing punctuation and closing quotes trimmed, in order, without repeats. */
export function findLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of (typeof text === 'string' ? text : '').matchAll(/https?:\/\/[^\s<>"'`«»„“”‘’]+/gi)) {
    let link = m[0];
    // A sentence's own punctuation is not part of the link; a ")" is, when the link opened one.
    while (/[.,;:!?…)\]}]$/.test(link)) {
      if (link.endsWith(')') && (link.match(/\(/g)?.length ?? 0) >= (link.match(/\)/g)?.length ?? 0)) break;
      link = link.slice(0, -1);
    }
    if (link.length > 'https://'.length && !out.includes(link)) out.push(link);
  }
  return out;
}

/** The message with its links taken out (what the user asked, without the address). */
export function withoutLinks(text: string): string {
  let t = typeof text === 'string' ? text : '';
  for (const link of findLinks(t)) t = t.split(link).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

const NAME_MAX = 100;

/**
 * The name the MP3 is given: the source file's own name (Content-Disposition, else the last part of its path), its
 * extension swapped for .mp3. Only letters, digits, spaces and a few separators survive; never empty.
 */
export function mp3NameFor(source: { url?: string; disposition?: string | null; name?: string | null }): string {
  let base = '';
  const d = source.disposition ?? '';
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(d);
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(d);
  try { base = star ? decodeURIComponent(star[1]!.trim()) : plain ? plain[1]!.trim() : ''; } catch { base = plain?.[1]?.trim() ?? ''; }
  if (!base && source.name) base = source.name;
  if (!base && source.url) {
    try {
      const last = new URL(source.url).pathname.split('/').filter(Boolean).pop() ?? '';
      base = decodeURIComponent(last);
    } catch { base = ''; }
  }
  base = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  base = base.replace(/[^\p{L}\p{N} ._()&,'+-]+/gu, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').slice(0, NAME_MAX).trim();
  return `${base || 'audio'}.mp3`;
}
