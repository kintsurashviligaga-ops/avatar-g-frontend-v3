/**
 * lib/chat/interiorRouting.ts
 * ===========================
 * PHASE 56 — the Interior REDESIGN routing decision, isolated in a
 * dependency-free module so it can be unit-tested without importing
 * providerRouter (which pulls in the Replicate SDK and other heavy provider
 * deps that need web globals the jest env lacks). Mirrors the specialistRouting
 * split for `prefersClaudeSpecialist`.
 *
 * A "redesign" re-renders the SAME uploaded room (new materials / furniture /
 * lighting) as a flat depth-locked "after" photo. The WorldLabs path builds a
 * navigable 3D world instead. This gate chooses between them.
 */

/** Minimal structural shape this decision reads (OrchestratorInput satisfies it). */
export interface InteriorRoutingInput {
  serviceContext?: string;
  message?: string;
  imageUrl?: string;
  selectedOptions?: Record<string, string>;
}

// Explicit 3D / world / walkthrough / tour phrasing (EN/RU/KA) routes to the
// WorldLabs navigable-world path instead of a flat depth-locked redesign image.
export const INTERIOR_WORLD_RE =
  /\b(3\s*-?\s*d|3d|three[\s-]?dimensional|world\s*labs|worldlabs|marble|walk\s*-?\s*through|walkthrough|virtual\s*tour|fly[\s-]?through|navigable)\b|3დ|სამყარო|სეირნ|ვირტუალურ|ტური|обход|тур|трёхмерн|трехмерн|виртуальн/i;

/**
 * Choose the depth-locked FLUX redesign over the WorldLabs 3D world.
 *
 * It is the auto-default whenever a room photo is attached in the Interior
 * service, UNLESS the user explicitly asks for a 3D world / virtual walkthrough
 * / tour (those still fall through to the WorldLabs/Marble navigable-world
 * path), or has pinned the provider to worldlabs/marble.
 */
export function shouldRedesignInterior(input: InteriorRoutingInput): boolean {
  const context = String(input.serviceContext || '').toLowerCase();
  if (context !== 'interior' && context !== 'interior-design') return false;

  const imageUrl =
    input.imageUrl || input.selectedOptions?.image_url || input.selectedOptions?.reference_image;
  if (!imageUrl) return false;

  // Honour an explicit provider pin to WorldLabs/Marble even with a photo.
  const provider = String(
    input.selectedOptions?.provider || input.selectedOptions?.interior_provider || '',
  ).toLowerCase();
  if (provider === 'worldlabs' || provider === 'marble') return false;

  // An explicit 3D / world / walkthrough ask still routes to WorldLabs.
  if (INTERIOR_WORLD_RE.test(String(input.message || ''))) return false;

  return true;
}
