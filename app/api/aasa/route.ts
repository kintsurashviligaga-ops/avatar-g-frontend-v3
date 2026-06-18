import { NextResponse } from 'next/server';

/**
 * Apple App Site Association (AASA) — enables iOS Universal Links so that
 * https://myavatar.ge/... links open the native app instead of Safari.
 *
 * Served at `/.well-known/apple-app-site-association` (and the legacy root path)
 * via rewrites in next.config.js. The locale middleware already exempts
 * `/.well-known/`, so Apple fetches this without a redirect (Apple does not
 * follow redirects when validating AASA).
 *
 * SETUP: set `APPLE_TEAM_ID` in the environment (Vercel → Project → Settings →
 * Environment Variables) to your 10-character Apple Developer Team ID, then
 * redeploy. Until then the appID uses a `TEAMID` placeholder and Universal Links
 * will not validate — harmless, the endpoint still serves valid JSON.
 *
 * The matching iOS side is `com.apple.developer.associated-domains`
 * (`applinks:myavatar.ge`) in AvatarG.entitlements + the Associated Domains
 * capability enabled on the App ID.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim() || 'TEAMID';
  const appID = `${teamId}.ge.myavatar.app`;

  return new NextResponse(
    JSON.stringify({
      applinks: {
        details: [
          {
            appIDs: [appID],
            components: [{ '/': '*', comment: 'All myavatar.ge paths open the app' }],
          },
        ],
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
