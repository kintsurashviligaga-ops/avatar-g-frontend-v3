import { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env/public';

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    publicEnv.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep server endpoints and private/authenticated surfaces out of the
      // index. The app is locale-prefixed, so `/*/segment` patterns cover
      // /ka, /en and /ru in one rule. None of these overlap the sitemap
      // (which only advertises home, pricing, dashboard, chat, agent,
      // /services/* and the legal pages) — verified against sitemap.ts.
      disallow: [
        '/api/',        // server/API routes — never indexable
        '/auth/',       // non-locale auth callback flow
        '/*/auth',      // locale auth flow pages
        '/*/admin',     // admin console
        '/*/account',   // private user account (billing, invoices, payments…)
        '/*/onboarding',// transient first-run flow
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
