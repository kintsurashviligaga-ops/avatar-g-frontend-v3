/**
 * lib/services/cardImage.ts — which services have a card still at /services/<id>.webp (public/services/).
 *
 * The /services hub's cards load that file and fall back to an SVG scene on a 404 (components/ui/ServiceCardVisual).
 * A client component cannot ask the disk, so this list says which files ship: the workspace header
 * (components/services/unified/ServiceWorkspaceView) shows the still as its thumbnail instead of a Unicode glyph
 * (⬡ ◈ ▷ …, some of them emoji) when the id is here — and never requests a file that is not, so no header 404s.
 * lib/services/cardImage.test.ts keeps this list and the folder in step, both ways.
 *
 * The 19 first stills came from scripts/generate-service-cards.mjs; voice, content-writer, podcast, character, event,
 * prompt-builder and terminal from the `site` art pack (scripts/site-art/shots.md, 2026-10-03), in the same look.
 *
 * Pure and isomorphic.
 */
export const SERVICE_CARD_IMAGE_IDS: ReadonlySet<string> = new Set([
  'agent-g', 'avatar', 'business', 'character', 'content-writer', 'editing', 'event', 'game', 'image', 'interior', 'media',
  'music', 'next', 'photo', 'podcast', 'prompt', 'prompt-builder', 'shop', 'software', 'terminal', 'text', 'tourism',
  'video', 'visual-intel', 'voice', 'workflow',
]);

/** `/services/<id>.webp` when that still ships, else null (the caller keeps its own fallback). */
export function serviceCardImage(id: string | null | undefined): string | null {
  return typeof id === 'string' && SERVICE_CARD_IMAGE_IDS.has(id) ? `/services/${id}.webp` : null;
}
