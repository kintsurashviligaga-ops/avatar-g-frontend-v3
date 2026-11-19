/** lib/music/producer/book.ts — which price book a Music Producer press uses (same switch as the Art Director). Pure. */
import type { ProducerBook } from './price';

export function producerBook(value: string | undefined = process.env.NEXT_PUBLIC_PRICING_V8): ProducerBook {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' ? 'v8' : 'today';
}

/** Georgian script anywhere in the words the song will be sung from: the UI shows the small "Beta" tag (GG 2026-11-15). */
export const GEORGIAN_RE = /[Ⴀ-ჿᲐ-Ჿ]/;
export const singsGeorgian = (s: { vocals: boolean; brief: string; lyrics: string; language?: string }): boolean =>
  s.vocals && (s.language === 'ka' || ((s.language ?? 'auto') === 'auto' && GEORGIAN_RE.test(`${s.brief} ${s.lyrics}`)));
