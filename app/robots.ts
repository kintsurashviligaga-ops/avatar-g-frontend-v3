import { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env/public';

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    publicEnv.NEXT_PUBLIC_APP_URL || 'https://avatar-g-frontend-v3.vercel.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
