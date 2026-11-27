/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Which remote hosts `/_next/image` may fetch and optimize (next.config.js `images.remotePatterns`).
 *
 * Every allowed host is an open door: anyone can ask `/_next/image?url=<allowed host>/…` and the platform fetches,
 * resizes and caches that image on OUR optimization quota. The list used to admit `**.supabase.co` (every Supabase
 * project on the internet, not only ours) and `example.com` (a leftover placeholder). On 2026-11-19 production
 * answered an example.com image request by fetching upstream (404 from example.com) while a foreign host was refused
 * with 400 INVALID_IMAGE_OPTIMIZE_REQUEST, which proved both were live allowances.
 *
 * Now: only OUR Supabase project (the host of NEXT_PUBLIC_SUPABASE_URL, read at build time), R2 and placehold.co.
 * When the URL is unset or not a plain https *.supabase.co address (a bare local build), it falls back to the old
 * `**.supabase.co` so nothing that renders today stops rendering.
 */

function supabaseImageHost(raw) {
  const v = (raw || '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    return /^[a-z0-9-]+\.supabase\.co$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

function imageRemotePatterns(env = process.env) {
  const own = supabaseImageHost(env.NEXT_PUBLIC_SUPABASE_URL);
  return [
    { protocol: 'https', hostname: own || '**.supabase.co' },
    { protocol: 'https', hostname: 'placehold.co' },
    { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
  ];
}

module.exports = { imageRemotePatterns, supabaseImageHost };
