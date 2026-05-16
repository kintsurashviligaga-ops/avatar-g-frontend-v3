import { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env/public';

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    publicEnv.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
