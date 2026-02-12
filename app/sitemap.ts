import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://avatar-g-frontend-v3.vercel.app";
  const now = new Date();
  
  // Core pages
  const corePages = [
    { url: baseUrl, priority: 1, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/pricing`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${baseUrl}/dashboard`, priority: 0.8, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/dashboard/billing`, priority: 0.7, changeFrequency: 'weekly' as const },
  ];
  
  // All 13 services
  const services = [
    'avatar-builder',
    'video-studio',
    'music-studio',
    'voice-lab',
    'media-production',
    'business-agent',
    'game-creator',
    'image-creator',
    'social-media',
    'online-shop',
    'prompt-builder',
  ];
  
  const servicePages = services.map(service => ({
    url: `${baseUrl}/services/${service}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));
  
  // Additional pages
  const additionalPages = [
    { url: `${baseUrl}/chat`, priority: 0.7, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/agent`, priority: 0.7, changeFrequency: 'weekly' as const },
    { url: `${baseUrl}/terms`, priority: 0.4, changeFrequency: 'monthly' as const },
    { url: `${baseUrl}/privacy`, priority: 0.4, changeFrequency: 'monthly' as const },
    { url: `${baseUrl}/refund-policy`, priority: 0.4, changeFrequency: 'monthly' as const },
  ];
  
  return [
    ...corePages.map(page => ({
      url: page.url,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...servicePages,
    ...additionalPages.map(page => ({
      url: page.url,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
  ];
}
    {
      url: `${baseUrl}/services/executive-agent`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/settings`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
