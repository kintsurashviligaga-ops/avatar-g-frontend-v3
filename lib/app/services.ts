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
  'avatar': { icon: User, credits: 8 },
  'agent-g': { icon: Bot, credits: 9 },
  'workflow': { icon: Bot, credits: 3 },
  'video': { icon: Film, credits: 12 },
  'editing': { icon: Clapperboard, credits: 10 },
  'music': { icon: Music2, credits: 10 },
  'photo': { icon: Camera, credits: 6 },
  'image': { icon: ImageIcon, credits: 6 },
  'media': { icon: Clapperboard, credits: 14 },
  'text': { icon: ScrollText, credits: 4 },
  'prompt': { icon: ScrollText, credits: 4 },
  'visual-intel': { icon: Brain, credits: 9 },
  'shop': { icon: Store, credits: 7 },
  'software': { icon: Sparkles, credits: 8 },
  'business': { icon: Briefcase, credits: 8 },
  'tourism': { icon: Sparkles, credits: 6 },
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