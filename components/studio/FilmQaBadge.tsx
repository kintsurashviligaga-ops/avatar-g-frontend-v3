'use client';

/**
 * FilmQaBadge — one line under a finished film: the assembler's quality check (/api/video/assemble → `qa`, read by
 * lib/chat/filmStudioClient as FilmQaSummary). A pass is a quiet accent line; a failed check is a red alert, so a cut with
 * a real defect is never presented as final without saying so. No `qa` (a cut the checker did not see) → nothing.
 *
 * The retired Music Video director showed this; the Video tool's result bubble now does.
 */
import type { FilmQaSummary } from '@/lib/chat/filmStudioClient';

export function filmQaText(qa: FilmQaSummary, locale: string): string {
  const head = qa.pass
    ? (locale === 'en' ? 'Quality check passed' : locale === 'ru' ? 'Проверка качества пройдена' : 'ხარისხის შემოწმება გავლილია')
    : (locale === 'en' ? 'Quality warning: review before sharing' : locale === 'ru' ? 'Предупреждение о качестве: проверьте перед публикацией' : 'ხარისხის გაფრთხილება: გადახედე გაზიარებამდე');
  return `${head} · ${qa.grade} · ${qa.score}/100`;
}

export function FilmQaBadge({ qa, locale }: { qa: FilmQaSummary | null | undefined; locale: string }) {
  if (!qa) return null;
  return (
    <div
      data-testid="film-qa"
      data-pass={qa.pass ? 'true' : 'false'}
      role={qa.pass ? undefined : 'alert'}
      className={[
        'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium ring-1',
        qa.pass ? 'bg-app-accent/10 text-app-accent ring-app-accent/25' : 'bg-red-500/10 text-red-500 ring-red-500/30',
      ].join(' ')}
    >
      <span aria-hidden="true">{qa.pass ? '✓' : '⚠'}</span>
      <span className="min-w-0">{filmQaText(qa, locale)}</span>
    </div>
  );
}
