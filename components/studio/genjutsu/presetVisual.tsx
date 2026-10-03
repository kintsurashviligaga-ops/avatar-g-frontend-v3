'use client';

/**
 * The look of a preset: its still (public/vfx/<id>.jpg with its blur placeholder — site imagery v2), the tile's gradient
 * under it (dark base → the effect's accent: the placeholder while the still loads, and the whole tile for a preset with
 * none, the convention of lib/studio/templates) and the lucide icon its data names — shown only where there is no still,
 * so a tile always says what it is and never shows a broken image.
 */
import {
  Bot, Box, Building2, ChevronsUpDown, Cpu, CloudFog, CloudRain, Crown, Droplets, Flame, Gem, Moon, MonitorX, Mountain,
  MountainSnow, Music2, Orbit, Rocket, Shapes, Smile, Snowflake, Sun, Swords, Waves, Zap, type LucideIcon,
} from 'lucide-react';
import type { GenjutsuPreset, PresetIcon } from '@/lib/genjutsu/presets';
import { siteArt, type SiteArtImage } from '@/lib/brand/siteArt';

export const PRESET_ICONS: Record<PresetIcon, LucideIcon> = {
  Swords, Music2, CloudRain, Rocket, Bot, Mountain, Gem, Crown, Building2, Sun, Waves, MountainSnow,
  Smile, Shapes, Moon, Cpu, Droplets, Box, Flame, Snowflake, CloudFog, Zap, MonitorX, Orbit,
};

/** The icon a preset names; a key this map does not know (a data typo) still renders something, never nothing. */
export const iconFor = (p: Pick<GenjutsuPreset, 'icon'>): LucideIcon => PRESET_ICONS[p.icon] ?? ChevronsUpDown;

/** `#RRGGBB` → `rgba(r, g, b, a)` (an 8-digit hex is valid CSS but jsdom drops the whole declaration over it). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 'transparent';
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

/** The tile's background: a soft accent glow from the top right over the dark base fading to black. */
export function tileBackground(palette: readonly [string, string]): string {
  return `radial-gradient(120% 90% at 85% 10%, ${withAlpha(palette[1], 0.42)} 0%, transparent 58%), linear-gradient(160deg, ${palette[0]} 0%, #000 100%)`;
}

/** The preset's still and its blur placeholder, or null — the tile is then its palette and icon alone. */
export function presetThumb(p: Pick<GenjutsuPreset, 'thumb'>): SiteArtImage | null {
  return p.thumb ? siteArt(p.thumb) : null;
}
