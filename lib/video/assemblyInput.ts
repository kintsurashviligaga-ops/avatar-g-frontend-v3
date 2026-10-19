/** Submitted clips for an explicit final-length contract must survive unchanged.
 * This validates the request, not approval authority, decoded media or a scene manifest.
 */
export const MAX_ASSEMBLY_SEGMENTS = 24;

export type ContractedSegmentsError =
  | 'not_an_array' | 'empty' | 'too_many' | 'invalid_entry' | 'missing_url'
  | 'duplicate_url' | 'unknown_duration' | 'invalid_ordinal' | 'duplicate_ordinal';

export function contractedSegmentsError(input: unknown): ContractedSegmentsError | null {
  if (!Array.isArray(input)) return 'not_an_array';
  if (input.length === 0) return 'empty';
  if (input.length > MAX_ASSEMBLY_SEGMENTS) return 'too_many';
  const urls = new Set<string>();
  const ordinals = new Set<number>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'invalid_entry';
    // Do not admit an alias which fetch/URL would trim back to another submitted URL.
    if (typeof item.url !== 'string' || !item.url.trim() || item.url !== item.url.trim()) return 'missing_url';
    if (urls.has(item.url)) return 'duplicate_url';
    urls.add(item.url);
    if (typeof item.durationSec !== 'number' || !Number.isFinite(item.durationSec) || item.durationSec <= 0) return 'unknown_duration';
    if (item.ordinal !== undefined) {
      if (!Number.isSafeInteger(item.ordinal) || item.ordinal < 1) return 'invalid_ordinal';
      if (ordinals.has(item.ordinal)) return 'duplicate_ordinal';
      ordinals.add(item.ordinal);
    }
  }
  return null;
}
