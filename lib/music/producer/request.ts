/**
 * lib/music/producer/request.ts — what the Music Producer route accepts. Pure, client-safe.
 *
 *  - generate: a full ProducerSpec (parseProducerSpec checks it).
 *  - restyle:  parentId + the new style (genre / moods / instruments / avoid). The server keeps the parent's lyrics,
 *              structure, tempo, length and vocals — "Restyle (new take)", GG 2026-11-15.
 *  - extend:   parentId only. "Add 30 s (new section, same style)".
 * A parent is always read back from the caller's own saved recipe, never from the client.
 */
import { z } from 'zod';
import { parseProducerSpec, type ProducerSpec } from './spec';

const Id = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

export const StyleChangeSchema = z.object({
  genre: z.string().max(40).nullable().optional(),
  moods: z.array(z.string().max(40)).max(2).optional(),
  instruments: z.array(z.string().max(40)).max(6).optional(),
  avoid: z.string().max(200).optional(),
});
export type StyleChange = z.infer<typeof StyleChangeSchema>;

export type ProducerRequest =
  | { action: 'generate'; spec: ProducerSpec }
  | { action: 'restyle'; parentId: string; style: StyleChange }
  | { action: 'extend'; parentId: string };

export type RequestCheck = { ok: true; request: ProducerRequest } | { ok: false; errors: string[] };

export function parseProducerRequest(raw: unknown): RequestCheck {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (o.action === 'generate') {
    const s = parseProducerSpec(o.spec);
    return s.ok ? { ok: true, request: { action: 'generate', spec: s.spec } } : { ok: false, errors: s.errors };
  }
  if (o.action === 'restyle' || o.action === 'extend') {
    const id = Id.safeParse(o.parentId);
    if (!id.success) return { ok: false, errors: ['parentId'] };
    if (o.action === 'extend') return { ok: true, request: { action: 'extend', parentId: id.data } };
    const st = StyleChangeSchema.safeParse(o.style ?? {});
    if (!st.success) return { ok: false, errors: st.error.issues.map((i) => `style.${i.path.join('.')}`) };
    return { ok: true, request: { action: 'restyle', parentId: id.data, style: st.data } };
  }
  return { ok: false, errors: ['action'] };
}

/** The parent's spec with only the style swapped (lyrics, tempo, length, vocals and structure stay). */
export function restyleSpec(parent: ProducerSpec, parentLyrics: string, style: StyleChange): ProducerSpec {
  return {
    ...parent,
    genre: style.genre !== undefined ? style.genre : parent.genre,
    moods: style.moods ?? parent.moods,
    instruments: style.instruments ?? parent.instruments,
    avoid: style.avoid ?? parent.avoid,
    // The words that were sung are kept word for word, even when Lyria wrote them the first time.
    lyrics: parent.vocals ? (parentLyrics || parent.lyrics) : '',
    autoLyrics: parent.vocals ? !(parentLyrics || parent.lyrics) : false,
  };
}
