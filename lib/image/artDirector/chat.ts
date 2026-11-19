/**
 * lib/image/artDirector/chat.ts — the chat's side of the Art Director (Phase 8.4 PR C). Pure, client-safe.
 *
 * A line typed in the Image tool becomes ONE Art Director request:
 *   · a line that asks to change the last Art Director picture in this chat („ქურთუკი წითელი გახადე", "remove the tree",
 *     "upscale to 4K", "make it wider", "another version") → an edit / upscale / extend / vary of THAT picture;
 *   · anything else → a new grid (1/2/4, the chat's own count), at the chat's ratio and size.
 * Only Art Director pictures are edited this way: they live in the caller's own `art-director/<uid>/` folder, which the
 * server reads back after checking the owner. A picture made by the older chat image path is not editable here.
 *
 * The client switch NEXT_PUBLIC_IMAGE_ART_DIRECTOR only decides whether the chat TRIES this route; the server's own
 * IMAGE_ART_DIRECTOR still decides who may use it, and a refusal (feature_off) sends the chat back to the old path.
 */
import { detectEditIntent, type EditIntent } from './intent';
import { ART_RATIOS, nearestRatio, type ArtCount, type ArtRatio, type ArtSize } from './spec';
import type { ArtOperation } from './prompt';
import type { Lang } from './labels';

/** Does the chat try the Art Director route? Same words as the server flag; anything else is off. */
export function artChatClientOn(value: string | undefined = process.env.NEXT_PUBLIC_IMAGE_ART_DIRECTOR): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone';
}

/** The last Art Director picture in the thread: its owner-checked storage path and its pixel size. */
export interface ArtChatBase { path: string; width?: number; height?: number }

export interface ArtChatSettings { aspectRatio: string; count: number; avoid?: string }

/** The request body the chat posts (ArtRequestSchema's input). */
export interface ArtChatRequest {
  v: 1;
  operation: ArtOperation;
  prompt: string;
  references: [];
  basePath?: string;
  maskPath?: string;
  keepRest: boolean;
  aspectRatio: ArtRatio;
  size: ArtSize;
  count: ArtCount;
  styleId: null;
  avoid: string[];
  locale: Lang;
}

export type ArtChatPlan =
  | { kind: 'run'; request: ArtChatRequest; intent: EditIntent['kind'] | 'generate' }
  /** The size this line asked for is not sold in the current price book (today: 1K only). */
  | { kind: 'not_sold'; size: ArtSize };

/** A size named in the line („… in 4K"); the chat's own default is 1K (✦8 on v8), and Upscale (Re-render) goes higher. */
export function sizeInText(text: string): ArtSize | null {
  return /\b4k\b|4\s*კ\b/i.test(text) ? '4K' : /\b2k\b|2\s*კ\b/i.test(text) ? '2K' : null;
}

const asRatio = (r: string): ArtRatio | null => ((ART_RATIOS as readonly string[]).includes(r) ? (r as ArtRatio) : null);
const asCount = (n: number): ArtCount => (n >= 4 ? 4 : n >= 2 ? 2 : 1);

/** A ratio written in the line („… 21:9"), when it is one of the 14. */
export function ratioInText(text: string): ArtRatio | null {
  for (const m of text.matchAll(/\b(\d{1,2})\s*[:x×]\s*(\d{1,2})\b/g)) {
    const r = asRatio(`${m[1]}:${m[2]}`);
    if (r) return r;
  }
  return null;
}

const UPSCALE_WORD = /(\bupscale\b|\bhigher res|\bre-?render|გააუმჯობესე|გაადიდე|გარჩევადობ|увелич|улучши качество|апскейл)/i;

/** Extend with no ratio named: one step wider (a square goes 16:9, a landscape goes 21:9, a portrait goes 1:1). */
function widerRatio(base: ArtChatBase): ArtRatio {
  if (!base.width || !base.height) return '16:9';
  const r = nearestRatio(base.width, base.height);
  if (base.width < base.height) return '1:1';
  return r === '1:1' || r === '5:4' || r === '4:3' ? '16:9' : '21:9';
}

export function planArtChat(x: {
  text: string;
  base: ArtChatBase | null;
  settings: ArtChatSettings;
  locale: Lang;
  /** The sizes the current book sells (price.ts sizesFor). */
  sizes: readonly ArtSize[];
}): ArtChatPlan {
  const text = x.text.trim();
  const avoid = x.settings.avoid?.trim() ? [x.settings.avoid.trim().slice(0, 200)] : [];
  const common = { v: 1 as const, references: [] as [], styleId: null, avoid, locale: x.locale, keepRest: true };
  let intent = x.base ? detectEditIntent(text, true) : null;
  // "a castle at dusk in 4K" names a size, not an upscale: only an upscale word (or a bare "4K") re-renders the base.
  if (intent?.kind === 'upscale' && !UPSCALE_WORD.test(text) && text.replace(/\b[24]k\b/gi, '').trim().length > 12) intent = null;
  /** The named size when it is sold, else 1K (always sold). */
  const pick = (named: ArtSize | null): ArtSize => (named && x.sizes.includes(named) ? named : '1K');

  if (x.base && intent) {
    const basePath = x.base.path;
    if (intent.kind === 'upscale') {
      const size: ArtSize = sizeInText(text) === '4K' ? '4K' : '2K';
      if (!x.sizes.includes(size)) return { kind: 'not_sold', size };
      return { kind: 'run', intent: 'upscale', request: { ...common, operation: 'upscale', prompt: '', basePath, aspectRatio: '1:1', size, count: 1 } };
    }
    const size = pick(sizeInText(text));
    if (intent.kind === 'extend') {
      const aspectRatio = ratioInText(text) ?? widerRatio(x.base);
      return { kind: 'run', intent: 'extend', request: { ...common, operation: 'extend', prompt: text, basePath, aspectRatio, size, count: 1 } };
    }
    if (intent.kind === 'vary') {
      return { kind: 'run', intent: 'vary', request: { ...common, operation: 'vary', prompt: text, basePath, aspectRatio: '1:1', size, count: asCount(x.settings.count) } };
    }
    // remove / background / edit: a conversational edit of the whole picture (the brush is the precise tool).
    return { kind: 'run', intent: intent.kind, request: { ...common, operation: 'edit', prompt: text, basePath, aspectRatio: '1:1', size, count: 1 } };
  }

  const size = pick(sizeInText(text));
  const aspectRatio = ratioInText(text) ?? asRatio(x.settings.aspectRatio) ?? '1:1';
  return { kind: 'run', intent: 'generate', request: { ...common, operation: 'generate', prompt: text, aspectRatio, size, count: asCount(x.settings.count) } };
}

/** A chat bubble's Art Director state: what was asked, and each tile as the route answered it. Never persisted. */
export interface ArtChatTile { index: number; status: 'working' | 'done' | 'failed'; id?: string; url?: string; path?: string; width?: number; height?: number; charged?: number; refunded?: number }
export interface ArtChatState { request: ArtChatRequest; tiles: ArtChatTile[]; error?: string }

/** The newest delivered Art Director tile in a list of bubbles (newest last), or null. */
export function lastArtBase(states: ReadonlyArray<ArtChatState | undefined>): ArtChatBase | null {
  for (let i = states.length - 1; i >= 0; i -= 1) {
    const s = states[i];
    if (!s) continue;
    const done = s.tiles.filter((t) => t.status === 'done' && t.path);
    // One picture: that one. Several: the first of the grid (the user can tap another tile's Edit for a different one).
    const t = done[0];
    if (t?.path) return { path: t.path, ...(t.width ? { width: t.width } : {}), ...(t.height ? { height: t.height } : {}) };
  }
  return null;
}
