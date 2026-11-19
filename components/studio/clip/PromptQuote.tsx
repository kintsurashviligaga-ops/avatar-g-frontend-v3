'use client';

/**
 * The words a clip or edit card will send, as typed — folded to three lines when they are long (GG 2026-10-26 08:46Z: the
 * card repeated a whole brief the user had just written, under their own bubble). The text is all there (the card's tests
 * and the screen reader read it whole); only its height is folded, and one tap shows it all.
 */
import { useState } from 'react';

/** Longer than this, or more than three lines, and the quote starts folded. */
const FOLD_CHARS = 180;

export function PromptQuote({ text, locale, testId }: { text: string; locale: string; testId: string }) {
  const long = text.length > FOLD_CHARS || text.split('\n').length > 3;
  const [open, setOpen] = useState(false);
  const folded = long && !open;
  const more = locale === 'en' ? 'Show all' : locale === 'ru' ? 'Показать всё' : 'სრულად ნახვა';
  const less = locale === 'en' ? 'Show less' : locale === 'ru' ? 'Свернуть' : 'შეკეცვა';
  return (
    <div className="rounded-2xl bg-app-elevated/70 px-3.5 py-2.5">
      <blockquote data-testid={testId} data-folded={folded ? 'true' : 'false'}
        className={`whitespace-pre-wrap break-words text-[13.5px] leading-snug text-app-text ${folded ? 'line-clamp-3' : ''}`}>
        „{text}“
      </blockquote>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid={`${testId}-toggle`}
          className="mt-1 text-[12px] font-medium text-app-accent hover:underline">
          {open ? less : more}
        </button>
      )}
    </div>
  );
}
