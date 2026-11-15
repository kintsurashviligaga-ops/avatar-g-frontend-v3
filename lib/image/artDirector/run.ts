/**
 * lib/image/artDirector/run.ts — one Art Director press, end to end, with every side effect injected (tests mock them).
 * Server only (sharp).
 *
 * 1. Load the owner-checked pictures: the base (edit/mask/extend/upscale/vary), the brush, up to 14 references
 *    (normalised to PNG, longest side ≤ 1536, combined ≤ MAX_REFERENCE_BYTES).
 * 2. Build the "where" picture for a region edit (mask guide) or the bigger canvas for extend.
 * 3. runGrid: hold the total, one Vertex call per image (max 2 at once), charge each delivered image, never a failed one.
 * 4. For a region edit with keepRest: paste the original back outside the mask; store the unmasked digest as proof.
 * 5. Save PNG privately, record it in the Library with the full recipe.
 */
import 'server-only';
import { randomInt } from 'node:crypto';
import sharp from 'sharp';
import { ArtError } from './errors';
import { buildArtBody, imageFromResponse, type InlineImage } from './body';
import { composeArtPrompt } from './prompt';
import { runGrid } from './grid';
import { artLibraryMeta, type ArtLibraryMeta } from './library';
import { artWarnings, type ArtRequest } from './request';
import { MAX_REFERENCE_BYTES, nearestRatio } from './spec';
import { toRaw, fromRaw, normaliseMask, maskGuide, pasteBack, unmaskedDigest, extendCanvas, type BinaryMask, type RawImage } from './mask';

export const REF_MAX_SIDE = 1536;

export interface ArtRunDeps {
  /** Owner-checked bytes of a storage path; throws ArtError('not_found') for anything the user does not own. */
  load(path: string, userId: string): Promise<Buffer>;
  /** One Vertex generateContent call; returns the JSON answer. */
  generate(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  hold(userId: string, total: number): Promise<boolean>;
  charge(userId: string, credits: number, ref: string): Promise<boolean>;
  refund(userId: string, credits: number, ref: string): Promise<void>;
  save(userId: string, id: string, png: Buffer): Promise<{ path: string; url: string }>;
  record(userId: string, id: string, url: string, meta: ArtLibraryMeta): Promise<void>;
  newId(): string;
  now(): Date;
}

export interface ArtSlotView {
  index: number;
  status: 'done' | 'failed';
  id?: string;
  url?: string;
  path?: string;
  meta?: ArtLibraryMeta;
  error?: string;
  charged: number;
  refunded: number;
}

export interface ArtRunResult { gridId: string; slots: ArtSlotView[]; charged: number; refunded: number; warnings: string[] }

const b64 = (buf: Buffer): InlineImage => ({ mimeType: 'image/png', data: buf.toString('base64') });

async function normaliseRef(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes).rotate().resize(REF_MAX_SIDE, REF_MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw new ArtError('invalid_reference', 'A reference picture could not be read.');
  }
}

export async function runArt(deps: ArtRunDeps, userId: string, req: ArtRequest, perImage: number, signal: AbortSignal = new AbortController().signal): Promise<ArtRunResult> {
  // ── 1. pictures ──
  let base: RawImage | null = null;
  if (req.basePath) {
    try { base = await toRaw(await deps.load(req.basePath, userId)); } catch (e) {
      if (e instanceof ArtError) throw e;
      throw new ArtError('invalid_reference', 'The image to change could not be read.');
    }
  }
  let mask: BinaryMask | null = null;
  if (req.operation === 'mask_edit' && base) {
    mask = await normaliseMask(await deps.load(req.maskPath as string, userId), base.width, base.height);
    if (!mask) throw new ArtError('empty_mask', 'Paint the area to change.');
  }
  if (req.operation === 'extend' && base) {
    const ext = await extendCanvas(base, req.aspectRatio);
    base = ext.canvas;
    mask = ext.mask;
  }
  const refs: InlineImage[] = [];
  let refBytes = 0;
  for (const r of req.references) {
    const png = await normaliseRef(await deps.load(r.path, userId));
    refBytes += png.length;
    if (refBytes > MAX_REFERENCE_BYTES) throw new ArtError('invalid_reference', 'The reference pictures are too large together.');
    refs.push(b64(png));
  }
  const basePart = base ? b64(await fromRaw(base)) : null;
  const guidePart = base && mask ? b64(await maskGuide(base, mask)) : null;

  // A changed image keeps its own shape (extend's canvas already has the asked ratio).
  const ratio = base ? nearestRatio(base.width, base.height) : req.aspectRatio;

  // ── 2. words ──
  const finalPrompt = composeArtPrompt({
    operation: req.operation, prompt: req.prompt, references: req.references, styleId: req.styleId ?? null,
    avoid: req.avoid, hasBase: !!base,
  });

  // ── 3. grid ──
  const gridId = deps.newId();
  const ref = (i: number) => `art:${gridId}:${i}`;
  const seeds = Array.from({ length: req.count }, (_, i) => (req.seed != null ? (req.seed + i) % 2_147_483_648 : randomInt(0, 2_147_483_647)));
  const views: ArtSlotView[] = [];
  type Made = { id: string; png: Buffer; width: number; height: number; digest: string | null };
  const grid = await runGrid<Made>(req.count, perImage, {
    hold: (total) => deps.hold(userId, total),
    render: async (i, sig) => {
      const body = buildArtBody({ text: finalPrompt, base: basePart, mask: guidePart, references: refs, aspectRatio: ratio, size: req.size, seed: seeds[i] });
      const answer = imageFromResponse(await deps.generate(body, sig));
      if (!answer) return null;
      let out: Buffer = Buffer.from(answer.data, 'base64');
      let digest: string | null = null;
      if (base && mask && req.keepRest) {
        const pasted = await pasteBack(base, out, mask);
        digest = unmaskedDigest(pasted, mask);
        out = await fromRaw(pasted);
      } else {
        out = await sharp(out).png().toBuffer();
      }
      const m = await sharp(out).metadata();
      return { id: deps.newId(), png: out, width: m.width ?? 0, height: m.height ?? 0, digest };
    },
    charge: (i, c) => deps.charge(userId, c, ref(i)),
    refund: (i, c) => deps.refund(userId, c, ref(i) + ':refund'),
    deliver: async (i, made) => {
      const saved = await deps.save(userId, made.id, made.png);
      const meta = artLibraryMeta({
        operation: req.operation, prompt: req.prompt, finalPrompt, styleId: req.styleId ?? null, avoid: req.avoid,
        aspectRatio: ratio, size: req.size, seed: seeds[i] ?? null, references: req.references,
        parentId: req.basePath ?? null, gridId, gridIndex: i, credits: perImage, width: made.width, height: made.height,
        unmaskedDigest: made.digest, now: deps.now(),
      });
      await deps.record(userId, made.id, saved.url, meta);
      views[i] = { index: i, status: 'done', id: made.id, url: saved.url, path: saved.path, meta, charged: perImage, refunded: 0 };
    },
  }, signal);
  if (!grid.started) throw new ArtError('insufficient_credits', 'Not enough credits for this many images.', 402);
  const slots = grid.slots.map((s) => (s.status === 'done' && views[s.index] ? views[s.index] as ArtSlotView
    : { index: s.index, status: 'failed' as const, error: s.error, charged: s.charged, refunded: s.refunded }));
  return { gridId, slots, charged: grid.charged - grid.refunded, refunded: grid.refunded, warnings: artWarnings(req) };
}
