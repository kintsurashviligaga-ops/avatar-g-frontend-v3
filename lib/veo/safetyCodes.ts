/**
 * lib/veo/safetyCodes.ts — Google's Veo support codes → the safety category Google files them under.
 *
 * ⚠️ WHY. A scene Veo declines comes back as "1 videos were filtered out because they violated Vertex AI's usage
 * guidelines … Support codes: 15236754" and nothing else. The code is the only marker of WHY, and the why decides what a
 * person can do about it: a `celebrity` refusal is about the FACE in the frame (Google judged it to look like a well-known
 * person), not about the words of the prompt, so "rephrase it" is the wrong advice. The ad film of 2026-10-15 lost scene 2
 * to exactly that code while scene 1, with the same face, rendered.
 *
 * Source: Google Cloud, "Responsible AI for Veo", table "Safety filter code categories" (read 2026-10-15). A code that is
 * not in the table maps to null: the caller says "Google's safety rules" without guessing a category.
 */

export type VeoSafetyCategory =
  | 'child'
  | 'celebrity'
  | 'video_safety'
  | 'dangerous'
  | 'hate'
  | 'other'
  | 'prohibited'
  | 'third_party'
  | 'sexual'
  | 'toxic'
  | 'violence'
  | 'vulgar';

const CATEGORY_BY_CODE: Readonly<Record<string, VeoSafetyCategory>> = {
  '58061214': 'child',
  '17301594': 'child',
  '29310472': 'celebrity',
  '15236754': 'celebrity',
  '64151117': 'video_safety',
  '42237218': 'video_safety',
  '62263041': 'dangerous',
  '57734940': 'hate',
  '22137204': 'hate',
  '74803281': 'other',
  '29578790': 'other',
  '42876398': 'other',
  '89371032': 'prohibited',
  '49114662': 'prohibited',
  '63429089': 'prohibited',
  '72817394': 'prohibited',
  '60599140': 'prohibited',
  '35561574': 'third_party',
  '35561575': 'third_party',
  '90789179': 'sexual',
  '43188360': 'sexual',
  '78610348': 'toxic',
  '61493863': 'violence',
  '56562880': 'violence',
  '32635315': 'vulgar',
};

const CATEGORIES: ReadonlySet<string> = new Set(Object.values(CATEGORY_BY_CODE));

/** The category of the first code Google's table knows, or null (no code, or none of them in the table). */
export function veoSafetyCategory(codes: ReadonlyArray<string> | null | undefined): VeoSafetyCategory | null {
  for (const code of codes ?? []) {
    const category = typeof code === 'string' ? CATEGORY_BY_CODE[code.trim()] : undefined;
    if (category) return category;
  }
  return null;
}

/** A value read back off the wire (the film matrix) as a category, or null. */
export function asVeoSafetyCategory(value: unknown): VeoSafetyCategory | null {
  return typeof value === 'string' && CATEGORIES.has(value) ? (value as VeoSafetyCategory) : null;
}
