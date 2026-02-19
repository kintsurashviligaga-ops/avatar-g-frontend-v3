import {
  Sparkles,
  User,
  Music2,
  Film,
  ImageIcon,
  Mic,
  Bot,
  Store,
  Megaphone,
  ScrollText,
  Camera,
  Clapperboard,
  ShoppingBag,
  Briefcase,
  Gamepad2,
  Brain,
  type LucideIcon,
} from 'lucide-react';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

export type AppService = {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  credits: number;
  route: string;
  enabled: boolean;
};

const SERVICE_META: Record<string, { icon: LucideIcon; credits: number }> = {
  'online-shop': { icon: Store, credits: 7 },
  'avatar-builder': { icon: User, credits: 8 },
  'music-studio': { icon: Music2, credits: 10 },
  'video-studio': { icon: Film, credits: 12 },
  'media-production': { icon: Clapperboard, credits: 14 },
  'visual-intelligence': { icon: Brain, credits: 9 },
  'image-creator': { icon: ImageIcon, credits: 6 },
  'agent-g': { icon: Bot, credits: 9 },
  'social-media': { icon: Megaphone, credits: 5 },
  'prompt-builder': { icon: ScrollText, credits: 4 },
  'text-intelligence': { icon: ScrollText, credits: 4 },
  'photo-studio': { icon: Camera, credits: 6 },
  marketplace: { icon: ShoppingBag, credits: 7 },
  'business-agent': { icon: Briefcase, credits: 8 },
  'game-creator': { icon: Gamepad2, credits: 10 },
  'voice-lab': { icon: Mic, credits: 8 },
};

export const APP_SERVICES: AppService[] = SERVICE_REGISTRY.map((service) => ({
  slug: service.id,
  name: service.name,
  description: service.description,
  icon: SERVICE_META[service.id]?.icon ?? Sparkles,
  credits: SERVICE_META[service.id]?.credits ?? 5,
  route: service.route,
  enabled: service.enabled,
}));

export const APP_SERVICES_BY_SLUG = new Map(APP_SERVICES.map((service) => [service.slug, service]));

export function getServiceBySlug(slug: string) {
  return APP_SERVICES_BY_SLUG.get(slug);
}