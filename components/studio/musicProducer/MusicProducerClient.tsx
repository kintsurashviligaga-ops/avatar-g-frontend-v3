'use client';

/** Client shell for the admin Music Producer preview. "Use in Video" is wired in PR C. */
import { MusicProducerPanel } from './MusicProducerPanel';
import type { ProducerLang } from '@/lib/music/producer/spec';
import type { ProducerBook } from '@/lib/music/producer/price';

export function MusicProducerClient({ lang, book }: { lang: ProducerLang; book: ProducerBook }) {
  return <MusicProducerPanel lang={lang} book={book} />;
}
