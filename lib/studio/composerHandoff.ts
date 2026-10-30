/**
 * lib/studio/composerHandoff.ts — a language switch keeps the composer as it was: the service that is on, its quick
 * settings and the words not sent yet.
 *
 * ⚠️ WHY. A language switch is a navigation to the same page under another locale, which mounts the studio afresh
 * (lib/chat/keepOpenChat). The chat was handed to the next mount, the composer was not: its settings are component state,
 * so a 16:9 · 8 s video came back as the 9:16 · 24 s default, and with an empty chat the service itself fell back to Chat
 * (GG's scenario 8, 2026-10-25: „after switching KA/EN/RU the chat and the params come back"). The switcher's announcement
 * now also leaves the composer here, in sessionStorage (this tab only), and the next mount reads it ONCE within a minute.
 * Nothing is sent and nothing is priced here: the restored values go back into the same pickers, which price them again.
 */
import { isToolId, type ToolId } from '@/lib/studio/tools';

const KEY = 'myavatar:composer-handoff';
/** A language switch remounts within a second or two; anything older is a stale tab, not a switch. */
export const COMPOSER_HANDOFF_MAX_AGE_MS = 60_000;
const MAX_DRAFT = 4000;

export interface ComposerHandoff {
  tool: ToolId;
  draft: string;
  video?: { mode: 'musicvideo' | 'documentary'; seconds: number; orientation: 'landscape' | 'vertical' | 'square' | 'portrait'; tier: 'lite' | 'fast' | 'standard' };
  image?: { aspect: string; count: 1 | 2 | 4; style: string };
  music?: { instrumental: boolean; styles: string[]; duration: 0 | 15 | 30 | 60 | 90 };
  avatar?: { gender: 'auto' | 'female' | 'male'; format: '9:16' | '16:9' | '1:1' };
  product?: { aspect: '9:16' | '1:1' | '16:9'; duration: number; preset: 'splash' | 'epic' | 'luxury' | 'nature' };
}

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Keep the composer for the next mount (the language switch's announcement). */
export function stashComposerHandoff(h: ComposerHandoff, now: number = Date.now()): void {
  try { store()?.setItem(KEY, JSON.stringify({ ...h, draft: h.draft.slice(0, MAX_DRAFT), at: now })); } catch { /* full or blocked: nothing kept */ }
}

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[]): T | undefined =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : undefined;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const shortStr = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined);

/**
 * The kept composer, ONCE: reading removes it. Null when there is none, it is malformed or older than a minute. A group
 * whose values are not all known is dropped whole, so a half-read group never mixes with the defaults.
 */
export function takeComposerHandoff(now: number = Date.now()): ComposerHandoff | null {
  const s = store();
  if (!s) return null;
  let raw: string | null = null;
  try { raw = s.getItem(KEY); s.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  let p: Record<string, unknown>;
  try { p = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!isObj(p)) return null;
  const at = typeof p.at === 'number' ? p.at : NaN;
  if (!isToolId(p.tool) || !(now - at >= 0 && now - at <= COMPOSER_HANDOFF_MAX_AGE_MS)) return null;
  const out: ComposerHandoff = { tool: p.tool, draft: typeof p.draft === 'string' ? p.draft.slice(0, MAX_DRAFT) : '' };

  if (isObj(p.video)) {
    const mode = oneOf(p.video.mode, ['musicvideo', 'documentary'] as const);
    const seconds = typeof p.video.seconds === 'number' && Number.isFinite(p.video.seconds) && p.video.seconds > 0 && p.video.seconds <= 600 ? p.video.seconds : undefined;
    const orientation = oneOf(p.video.orientation, ['landscape', 'vertical', 'square', 'portrait'] as const);
    const tier = oneOf(p.video.tier, ['lite', 'fast', 'standard'] as const);
    if (mode && seconds && orientation && tier) out.video = { mode, seconds, orientation, tier };
  }
  if (isObj(p.image)) {
    const aspect = shortStr(p.image.aspect);
    const count = oneOf(p.image.count, [1, 2, 4] as const);
    const style = shortStr(p.image.style);
    if (aspect && count && style) out.image = { aspect, count, style };
  }
  if (isObj(p.music)) {
    const styles = Array.isArray(p.music.styles) && p.music.styles.length <= 8 ? p.music.styles.map(shortStr) : [];
    const duration = oneOf(p.music.duration, [0, 15, 30, 60, 90] as const);
    if (typeof p.music.instrumental === 'boolean' && styles.length > 0 && styles.every(Boolean) && duration !== undefined) {
      out.music = { instrumental: p.music.instrumental, styles: styles as string[], duration };
    }
  }
  if (isObj(p.avatar)) {
    const gender = oneOf(p.avatar.gender, ['auto', 'female', 'male'] as const);
    const format = oneOf(p.avatar.format, ['9:16', '16:9', '1:1'] as const);
    if (gender && format) out.avatar = { gender, format };
  }
  if (isObj(p.product)) {
    const aspect = oneOf(p.product.aspect, ['9:16', '1:1', '16:9'] as const);
    const duration = typeof p.product.duration === 'number' && p.product.duration > 0 && p.product.duration <= 120 ? p.product.duration : undefined;
    const preset = oneOf(p.product.preset, ['splash', 'epic', 'luxury', 'nature'] as const);
    if (aspect && duration && preset) out.product = { aspect, duration, preset };
  }
  return out;
}
