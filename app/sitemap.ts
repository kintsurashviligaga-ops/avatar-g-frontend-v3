import { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env/public";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || "https://avatar-g-frontend-v3.vercel.app";
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
    'business-agent',
    'game-creator',
    'image-creator',
    'media-production',
    'music-studio',
    'online-shop',
    'photo-studio',
    'prompt-builder',
    'social-media',
    'text-intelligence',
    'video-studio',
    'marketplace',
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
