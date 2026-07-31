/**
 * Package a finished deck as a ZIP of PNGs — the one export that works everywhere.
 *
 * ⚠️ WHY THIS MOVED HERE. The in-chat presentation panel rendered a finished deck as a grid of
 * thumbnails and stopped there. There was no download, no ZIP, no print — the deck existed, the user
 * had paid for it, and the only way to get it out of the browser was to right-click every slide one at
 * a time. The export already existed, but it lived inside SlidesStudio as a closure over that
 * component's state, so the panel could not reach it.
 *
 * Lifting it out is what makes both surfaces offer the same deliverable instead of one of them being a
 * demo of the other. The behaviour is unchanged: jszip stays a dynamic import so it never enters the
 * main bundle (it is only ever needed after a build has completed), and slide order is preserved by
 * zero-padding the index — '10-slide.png' must not sort before '2-slide.png' in the user's file manager.
 */

export interface DeckSlideRef {
  index: number;
  pngUrl: string;
}

/** Filename-safe, Unicode-aware: a Georgian title must survive as Georgian, not become dashes. */
export function deckFileName(title: string | undefined, ext: string): string {
  const base = (title || 'deck').slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${base || 'deck'}.${ext}`;
}

/** Zero-padded so a 10-slide deck keeps its order in any file listing. */
export function slideEntryName(index: number): string {
  return `${String(index).padStart(2, '0')}-slide.png`;
}

/**
 * Fetch every slide, zip them, and hand the blob to the browser as a download.
 *
 * Throws on failure so the caller can show its own message — swallowing the error here would leave a
 * button that does nothing, which is the failure mode this whole pass exists to remove.
 */
export async function downloadDeckZip(deck: {
  title?: string;
  coverUrl?: string | null;
  slides: DeckSlideRef[];
}): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  if (deck.coverUrl) {
    const cover: Blob = await fetch(deck.coverUrl).then((r) => r.blob());
    zip.file('00-cover.png', cover);
  }
  for (const s of deck.slides) {
    const blob: Blob = await fetch(s.pngUrl).then((r) => r.blob());
    zip.file(slideEntryName(s.index), blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = url;
  a.download = deckFileName(deck.title, 'zip');
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Deferred: revoking synchronously after click() can race the browser's own read of the blob.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
