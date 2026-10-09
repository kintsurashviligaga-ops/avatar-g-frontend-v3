/**
 * lib/video/director/planInput.ts — the plan route's body, checked: the fields the planner reads and nothing else, each
 * within what Veo and the storyboard rules accept, so a bad request is a 400 listing every problem instead of an LLM call.
 */
import { isSupportedReferenceImage, VEO_ASPECT_RATIOS, VEO_QUALITIES, VEO_SHOT_DURATIONS } from './storyboard';
import type { StoryboardPlanInput } from './types';

const MAX_BRIEF = 4_000;
const MAX_SHOTS = 12;

const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffff_ffff;

/** The plan input, or the list of what is wrong with it. Only the fields the planner reads are kept. */
export function parsePlanInput(body: unknown): { ok: true; input: StoryboardPlanInput } | { ok: false; problems: string[] } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const problems: string[] = [];
  const brief = typeof b.brief === 'string' ? b.brief.trim() : '';
  if (!brief || brief.length > MAX_BRIEF) problems.push(`brief must be 1–${MAX_BRIEF} characters`);
  if (typeof b.aspectRatio !== 'string' || !VEO_ASPECT_RATIOS.includes(b.aspectRatio)) problems.push(`aspectRatio must be ${VEO_ASPECT_RATIOS.join(' or ')}`);
  if (b.shotCount !== undefined && !(Number.isInteger(b.shotCount) && (b.shotCount as number) >= 1 && (b.shotCount as number) <= MAX_SHOTS)) {
    problems.push(`shotCount must be a whole number from 1 to ${MAX_SHOTS}`);
  }
  if (b.durationSeconds !== undefined && !VEO_SHOT_DURATIONS.includes(b.durationSeconds as number)) problems.push(`durationSeconds must be ${VEO_SHOT_DURATIONS.join(', ')}`);
  if (b.quality !== undefined && !(typeof b.quality === 'string' && VEO_QUALITIES.includes(b.quality))) problems.push(`quality must be ${VEO_QUALITIES.join(', ')}`);
  if (b.seed !== undefined && !isUint32(b.seed)) problems.push('seed must be a whole number from 0 to 4294967295');
  if (b.characterReference !== undefined && !isSupportedReferenceImage(b.characterReference)) problems.push('characterReference must be an https or data:image URL');
  if (b.title !== undefined && !(typeof b.title === 'string' && b.title.length <= 200)) problems.push('title must be text of at most 200 characters');
  if (b.language !== undefined && !(typeof b.language === 'string' && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(b.language))) problems.push('language must be a BCP-47 tag');
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    input: {
      brief,
      aspectRatio: b.aspectRatio as string,
      ...(b.title !== undefined ? { title: b.title as string } : {}),
      ...(b.shotCount !== undefined ? { shotCount: b.shotCount as number } : {}),
      ...(b.durationSeconds !== undefined ? { durationSeconds: b.durationSeconds as number } : {}),
      ...(b.quality !== undefined ? { quality: b.quality as string } : {}),
      ...(b.seed !== undefined ? { seed: b.seed as number } : {}),
      ...(b.characterReference !== undefined ? { characterReference: b.characterReference as string } : {}),
      ...(b.language !== undefined ? { language: b.language as string } : {}),
    },
  };
}
