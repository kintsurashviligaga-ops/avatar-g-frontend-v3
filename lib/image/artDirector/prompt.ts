/**
 * lib/image/artDirector/prompt.ts — the words sent with an Art Director image. Pure, client-safe.
 *
 * The user's own prompt is sent as written (any language; Georgian stays Georgian). Around it we add, in this order:
 *  1. a reference map: one line per picture, "Image A — face", in the order the pictures are attached, plus the user's
 *     own note for it ("use only the hairstyle"), so "the face from A, the outfit from B" means something to the model;
 *  2. the locked character (a saved reference set re-attached on every next image) as "Keep the same person as …";
 *  3. the style preset;
 *  4. for an edit: what must stay the same;
 *  5. "Avoid: …" — the negative prompt, best effort (the model has no negative-prompt field).
 */
import { REF_LETTERS, stylePreset, type ArtRole } from './spec';

export type ArtOperation = 'generate' | 'edit' | 'mask_edit' | 'extend' | 'upscale' | 'vary';

export interface ArtRefInput {
  role: ArtRole;
  /** Optional free text: what to take from this picture. */
  note?: string;
  /** Part of the locked character set. */
  locked?: boolean;
}

export interface ArtPromptInput {
  operation: ArtOperation;
  prompt: string;
  references: readonly ArtRefInput[];
  styleId?: string | null;
  avoid?: readonly string[];
  /** For edit / mask_edit / extend / upscale / vary the FIRST picture sent is the base image (not a reference). */
  hasBase?: boolean;
}

const ROLE_WORDS: Record<ArtRole, string> = {
  face: 'face and facial identity',
  character: 'the whole character (face, body, hair)',
  outfit: 'outfit and clothing',
  style: 'art style, palette and rendering',
  pose: 'pose and body position',
  composition: 'composition and framing',
  background: 'background and setting',
  product: 'the product, exactly as it looks',
  color: 'colour palette',
  object: 'this object',
};

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

export function refLetter(i: number): string {
  const l = REF_LETTERS[i];
  if (!l) throw new Error(`reference index ${i} has no letter`);
  return l;
}

export function composeArtPrompt(p: ArtPromptInput): string {
  const lines: string[] = [];
  const offset = p.hasBase ? 1 : 0;
  if (p.hasBase) {
    switch (p.operation) {
      case 'mask_edit':
        lines.push('The first picture is the image to edit. The second picture is a mask: change ONLY the area painted in solid red; everything outside it must stay exactly as it is.');
        break;
      case 'extend':
        lines.push('The first picture is the image to extend. The second picture is a mask: fill ONLY the area painted in solid red so it continues the scene seamlessly; leave the original part untouched.');
        break;
      case 'upscale':
        lines.push('Re-render the first picture at a higher resolution. Keep the same picture: same composition, subjects, faces, colours and lighting. Add fine, realistic detail only.');
        break;
      case 'vary':
        lines.push('Make a new variation of the first picture: same subject and idea, a fresh take on composition and details.');
        break;
      default:
        lines.push('The first picture is the image to edit. Change only what the instruction asks; keep everything else the same.');
    }
  }
  const refs = p.references;
  if (refs.length) {
    const start = offset + (p.operation === 'mask_edit' || p.operation === 'extend' ? 1 : 0);
    lines.push(`Reference pictures follow${start ? ' after that' : ''}, in this order:`);
    refs.forEach((r, i) => {
      const note = r.note ? ` (${clean(r.note, 200)})` : '';
      lines.push(`Image ${refLetter(i)} — use its ${ROLE_WORDS[r.role]}${note}.`);
    });
    const locked = refs.map((r, i) => (r.locked ? refLetter(i) : null)).filter(Boolean);
    if (locked.length) lines.push(`Keep the same person exactly as in Image ${locked.join(', ')}: identical face and identity.`);
  }
  lines.push(clean(p.prompt, 6000));
  const style = stylePreset(p.styleId);
  if (style && p.operation !== 'upscale') lines.push(`Style: ${style.prompt}.`);
  const avoid = (p.avoid ?? []).map((a) => clean(a, 200)).filter(Boolean);
  if (avoid.length) lines.push(`Avoid: ${avoid.join('; ')}.`);
  return lines.join('\n');
}
