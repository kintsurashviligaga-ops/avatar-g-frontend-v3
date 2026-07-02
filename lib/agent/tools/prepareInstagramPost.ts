/**
 * prepare_instagram_post — STEP 3 agent tool, PREPARE-ONLY (⛔ HARD GATE).
 *
 * This tool NEVER publishes. It assembles a ready-to-post package (normalized caption +
 * hashtags + media reference + a copy-paste block) and returns it with `requiresManualPost:
 * true`. Publishing to Instagram/any social network is a user action performed by the user in
 * their own app — the agent stops here by design. There is deliberately no Graph API call, no
 * token use, and no network in this module: the gate is structural, not a runtime check that
 * could be flipped by config.
 *
 * Pure (assembleInstagramCaption) → unit-testable, no network.
 */
import { z } from 'zod';

export const IG_CAPTION_MAX = 2200; // Instagram hard limit
export const IG_HASHTAG_MAX = 30; // Instagram hard limit

export const prepareInstagramPostInput = z.object({
  caption: z.string().min(1).max(IG_CAPTION_MAX),
  hashtags: z.array(z.string()).max(60).optional(),
  mediaUrl: z.string().url().optional(),
});
export type PrepareInstagramPostInput = z.infer<typeof prepareInstagramPostInput>;

export interface PreparedInstagramPost {
  requiresManualPost: true; // literal — this tool can NEVER report a completed post
  caption: string; // final caption incl. hashtags, <= IG_CAPTION_MAX
  hashtags: string[]; // normalized, deduped, <= IG_HASHTAG_MAX
  mediaUrl?: string;
  copyPasteBlock: string; // what the user pastes into Instagram
  instructions: string;
}

/** Normalize one hashtag: strip leading #, keep [\w] runs, lowercase. '' if nothing usable. */
export function normalizeHashtag(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_]+/gu, ''); // IG tags allow letters/numbers/underscore
  return cleaned ? `#${cleaned}` : '';
}

/** Assemble the final caption (caption + deduped, capped hashtags), never exceeding IG limits. Pure. */
export function assembleInstagramCaption(
  caption: string,
  hashtags: string[] = [],
): { caption: string; hashtags: string[] } {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of hashtags) {
    const n = normalizeHashtag(t);
    const key = n.toLowerCase();
    if (n && !seen.has(key)) {
      seen.add(key);
      tags.push(n);
      if (tags.length >= IG_HASHTAG_MAX) break;
    }
  }
  const base = caption.trim();
  const tagLine = tags.join(' ');
  let full = tagLine ? `${base}\n\n${tagLine}` : base;
  // If hashtags push us over the limit, drop tags from the end until it fits.
  while (full.length > IG_CAPTION_MAX && tags.length > 0) {
    tags.pop();
    const line = tags.join(' ');
    full = line ? `${base}\n\n${line}` : base;
  }
  return { caption: full.slice(0, IG_CAPTION_MAX), hashtags: tags };
}

/** Build the prepare-only package. Never posts; never touches the network. */
export function prepareInstagramPost(input: PrepareInstagramPostInput): PreparedInstagramPost {
  const parsed = prepareInstagramPostInput.parse(input);
  const { caption, hashtags } = assembleInstagramCaption(parsed.caption, parsed.hashtags ?? []);
  return {
    requiresManualPost: true,
    caption,
    hashtags,
    ...(parsed.mediaUrl ? { mediaUrl: parsed.mediaUrl } : {}),
    copyPasteBlock: caption,
    instructions:
      'Prepared, not posted. Download the media, open Instagram, and paste this caption. ' +
      'MyAvatar never publishes on your behalf.',
  };
}
