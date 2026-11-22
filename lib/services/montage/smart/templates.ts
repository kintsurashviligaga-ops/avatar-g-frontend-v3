/**
 * lib/services/montage/smart/templates.ts — the six starting looks GG approved (D5, 2026-11-15). PURE data + one
 * function. A template sets the FORMAT, the caption style and position, the default transition, the pace and which
 * smart tools are on; it never changes the user's clips. Safe zones are the parts of a 9:16 frame the TikTok/Reels/
 * Shorts buttons and captions cover, as shares of the frame, so captions and titles are lifted clear of them.
 */
import type { MontageAspect, MontageTransition } from '../montagePlan';
import type { CaptionPos, CaptionStyleId } from './captions';

export type TemplateId = 'tiktok' | 'youtube' | 'shorts' | 'square' | 'explainer' | 'music-promo';
export const TEMPLATE_IDS: readonly TemplateId[] = ['tiktok', 'youtube', 'shorts', 'square', 'explainer', 'music-promo'];

export interface SafeZone { top: number; bottom: number; left: number; right: number }

export interface SmartTemplate {
  id: TemplateId;
  name: { ka: string; en: string; ru: string };
  aspect: MontageAspect;
  captionStyle: CaptionStyleId;
  captionPos: CaptionPos;
  transition: MontageTransition | 'glitch';
  /** The longest shot the "smart edit" leaves on screen before it suggests a cut, seconds. */
  maxShotSec: number;
  autoCaptions: boolean;
  removeSilence: boolean;
  beatSync: boolean;
  safe: SafeZone;
}

const NONE: SafeZone = { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 };
/** TikTok / Reels: the caption + username block at the bottom, the like/share column on the right. */
const VERTICAL: SafeZone = { top: 0.1, bottom: 0.2, left: 0.06, right: 0.16 };

export const TEMPLATES: Record<TemplateId, SmartTemplate> = {
  tiktok: { id: 'tiktok', name: { ka: 'TikTok / Reels', en: 'TikTok / Reels', ru: 'TikTok / Reels' }, aspect: '9:16', captionStyle: 'bold-word', captionPos: 'middle', transition: 'cut', maxShotSec: 3, autoCaptions: true, removeSilence: true, beatSync: false, safe: VERTICAL },
  youtube: { id: 'youtube', name: { ka: 'YouTube 16:9', en: 'YouTube 16:9', ru: 'YouTube 16:9' }, aspect: '16:9', captionStyle: 'standard', captionPos: 'bottom', transition: 'crossfade', maxShotSec: 8, autoCaptions: true, removeSilence: false, beatSync: false, safe: NONE },
  shorts: { id: 'shorts', name: { ka: 'YouTube Shorts', en: 'YouTube Shorts', ru: 'YouTube Shorts' }, aspect: '9:16', captionStyle: 'karaoke', captionPos: 'middle', transition: 'cut', maxShotSec: 3, autoCaptions: true, removeSilence: true, beatSync: false, safe: { ...VERTICAL, right: 0.14 } },
  square: { id: 'square', name: { ka: 'Instagram კვადრატი 1:1', en: 'Instagram square 1:1', ru: 'Instagram квадрат 1:1' }, aspect: '1:1', captionStyle: 'boxed', captionPos: 'bottom', transition: 'slide', maxShotSec: 4, autoCaptions: true, removeSilence: false, beatSync: false, safe: NONE },
  explainer: { id: 'explainer', name: { ka: 'ახსნა (მოლაპარაკე)', en: 'Talking-head explainer', ru: 'Объяснение (говорящий)' }, aspect: '9:16', captionStyle: 'boxed', captionPos: 'bottom', transition: 'cut', maxShotSec: 10, autoCaptions: true, removeSilence: true, beatSync: false, safe: VERTICAL },
  'music-promo': { id: 'music-promo', name: { ka: 'მუსიკის პრომო', en: 'Music promo', ru: 'Музыкальное промо' }, aspect: '9:16', captionStyle: 'minimal', captionPos: 'bottom', transition: 'glitch', maxShotSec: 2, autoCaptions: false, removeSilence: false, beatSync: true, safe: VERTICAL },
};

export const isTemplateId = (v: unknown): v is TemplateId => typeof v === 'string' && (TEMPLATE_IDS as readonly string[]).includes(v);

/**
 * Where a caption's CENTRE line sits, as a share of the frame height from the top, for a position inside a template's
 * safe zone: bottom = just above the bottom safe edge, top = just below the top one.
 */
export function captionCenterY(pos: CaptionPos, safe: SafeZone, cardShare: number): number {
  const half = Math.max(0, cardShare) / 2;
  if (pos === 'top') return Math.round((safe.top + half) * 1000) / 1000;
  if (pos === 'middle') return 0.5;
  return Math.round((1 - safe.bottom - half) * 1000) / 1000;
}
