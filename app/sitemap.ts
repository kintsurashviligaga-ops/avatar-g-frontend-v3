import { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env/public";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || "https://myavatar.ge";
  const now = new Date();
  
  // Core pages
  const corePages = [
    { url: baseUrl, priority: 1, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/pricing`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${baseUrl}/dashboard`, priority: 0.8, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/dashboard/billing`, priority: 0.7, changeFrequency: 'weekly' as const },
  ];
  
  // All 14 core AI services (locales: ka, en, ru)
  const services = [
    'avatar', 'video', 'image', 'music', 'voice',
    'game', 'interior', 'prompt-builder', 'terminal',
    'content-writer', 'podcast', 'character', 'event', 'tourism',
  ];
  const locales = ['ka', 'en', 'ru'];
  
  const servicePages = locales.flatMap(locale =>
    services.map(service => ({
      url: `${baseUrl}/${locale}/services/${service}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: locale === 'ka' ? 0.9 : 0.8,
    }))
  );
  
  // Additional pages
  const additionalPages = [
    { url: `${baseUrl}/chat`, priority: 0.7, changeFrequency: 'daily' as const },
    { url: `${baseUrl}/agent`, priority: 0.7, changeFrequency: 'weekly' as const },
  ];

  // Legal/support — emit per locale so App Store can resolve a localized URL
  const legalSlugs = ['terms', 'privacy', 'support'];
  const legalPages = locales.flatMap(locale =>
    legalSlugs.map(slug => ({
      url: `${baseUrl}/${locale}/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    }))
  );
  
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
    ...legalPages,
  ];
}
