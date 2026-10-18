/**
 * The product ad's photo queue (the owner's PRD, 2026-10-18: three reference photos picked at once must all arrive).
 *
 * The ad takes MAX_AD_IMAGES photos: one primary (the locked foreground) and the rest as extra angles. Photos picked
 * together, or picked again before the last ones were read, are placed here in ONE step, in the order they were picked:
 * the primary first if it is empty, then the extras, and whatever is past the limit is counted, never dropped silently.
 * Pure, so the rule is tested on its own; the studio reads the files and calls it once per pick.
 */
import { MAX_AD_IMAGES } from './adInputValidation';

export interface ProductShots {
  primary: string | null;
  extras: string[];
}

export function placeProductShots(current: ProductShots, picked: readonly string[], max = MAX_AD_IMAGES): ProductShots & { overflow: number } {
  const queue = picked.filter((u) => typeof u === 'string' && u.length > 0);
  const primary = current.primary ?? queue.shift() ?? null;
  const room = Math.max(0, max - 1 - current.extras.length);
  const extras = [...current.extras, ...queue.slice(0, room)];
  return { primary, extras, overflow: Math.max(0, queue.length - room) };
}

/** A picked file as a data URL, or null when the browser cannot read it. */
export function readAsDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}
