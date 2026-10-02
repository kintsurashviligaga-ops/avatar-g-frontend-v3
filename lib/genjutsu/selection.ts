/**
 * lib/genjutsu/selection.ts — WHICH of the user's reference photos an engine really receives.
 *
 * ⚠️ THE DROPZONE TAKES 40 PHOTOS AND NO ENGINE TAKES 40. Google Veo 3.1 takes up to 3 asset images, Kling 3 Motion
 * Control takes 1, Higgsfield's Genjutsu a handful. The honest design is not to pretend: the user may pick up to 40
 * (to keep one library of a character, a product and a wardrobe), the engine is handed the best few by the rule below,
 * and the panel says "Using 3 of 12 — Veo takes up to 3" BEFORE the user pays. Nothing here ever returns more than
 * `cap`, and nothing downstream may claim more photos were used than `used.length`.
 *
 * THE RULE (documented, deterministic, the same function in the browser's preview and on the server):
 *   1. ROLE PASS — walk the roles in priority order (character → product → wardrobe) and take the FIRST photo of each
 *      role, in the user's own order, until `cap` photos are taken. "Best" is therefore the user's choice: whatever
 *      they put first within a role. (The character comes first because every op needs a person to keep.)
 *   2. FILL PASS — if room is left, take the remaining photos in the user's order, whatever their role.
 *   The result lists the role-pass picks first, then the fill picks. Re-ordering photos the engine does NOT use never
 *   changes what it receives; the same input always yields the same output.
 *
 * Pure and client-safe.
 */
import { REFERENCE_ROLES, type ReferenceRole } from './types';

export interface ReferenceSelection<T> {
  /** What the engine receives, in the order above. Never longer than `cap`. */
  used: T[];
  /** What it does not receive, in the user's order. */
  skipped: T[];
  /** How many the engine takes. */
  cap: number;
  /** How many the user picked. */
  total: number;
}

export function selectReferences<T extends { role: ReferenceRole }>(items: readonly T[], cap: number): ReferenceSelection<T> {
  const total = items.length;
  const room = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
  const taken = new Set<number>();
  const order: number[] = [];

  // 1. Role pass.
  for (const role of REFERENCE_ROLES) {
    if (order.length >= room) break;
    const at = items.findIndex((it, i) => !taken.has(i) && it.role === role);
    if (at >= 0) {
      taken.add(at);
      order.push(at);
    }
  }
  // 2. Fill pass, in the user's order.
  for (let i = 0; i < total && order.length < room; i++) {
    if (!taken.has(i)) {
      taken.add(i);
      order.push(i);
    }
  }

  return {
    used: order.map((i) => items[i] as T),
    skipped: items.filter((_, i) => !taken.has(i)),
    cap: room,
    total,
  };
}

/** How many photos of each role the user has picked — the panel's "2 character · 1 product" line. */
export function countByRole(items: readonly { role: ReferenceRole }[]): Record<ReferenceRole, number> {
  const out: Record<ReferenceRole, number> = { character: 0, product: 0, wardrobe: 0 };
  for (const it of items) out[it.role] += 1;
  return out;
}
