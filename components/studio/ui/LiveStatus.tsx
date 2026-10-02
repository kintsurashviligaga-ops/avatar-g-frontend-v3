'use client';

/**
 * components/studio/ui/LiveStatus.tsx — the screen-reader voice of a long job: "started", "ready", "failed".
 *
 * A visually hidden aria-live="polite" region (the same shape ResultCard uses). It is ALWAYS rendered, empty until
 * there is news: a live region that mounts together with its first message is often not announced at all.
 *
 * ⚠️ NOT role="status". Several surfaces (the photo workspace, the 3D scene) already carry exactly one role="status"
 * notice, and their tests — like assistive tech users — count on finding just that one.
 * ⚠️ ANNOUNCE STATE CHANGES, NOT TICKS. A percentage or a per-photo counter in a live region talks over everything
 * else the user is doing; say when it starts and how it ends.
 */

type Lang = 'ka' | 'en' | 'ru';
export type GenerationState = 'idle' | 'started' | 'done' | 'failed';

const STATE_WORD: Record<Lang, Record<Exclude<GenerationState, 'idle'>, string>> = {
  ka: { started: 'დაიწყო', done: 'მზადაა', failed: 'ვერ მოხერხდა' },
  en: { started: 'started', done: 'ready', failed: 'failed' },
  ru: { started: 'запущено', done: 'готово', failed: 'не удалось' },
};

/** "3D model — started" / "3D მოდელი — მზადაა" / "3D-модель — не удалось: <why>". Empty while idle. */
export function generationAnnouncement(label: string, state: GenerationState, locale?: string, detail?: string | null): string {
  if (state === 'idle') return '';
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const why = state === 'failed' && detail && detail.trim() ? `: ${detail.trim()}` : '';
  return `${label} — ${STATE_WORD[lang][state]}${why}`;
}

export function LiveStatus({ text, testId = 'live-status' }: { text: string; testId?: string }) {
  return <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid={testId}>{text}</p>;
}
