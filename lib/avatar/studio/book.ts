/** lib/avatar/studio/book.ts — which price book a Studio press uses (same switch as the Art Director and Music Producer). Pure. */
import type { StudioBook } from './price';

export function studioBook(value: string | undefined = process.env.NEXT_PUBLIC_PRICING_V8): StudioBook {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' ? 'v8' : 'today';
}
