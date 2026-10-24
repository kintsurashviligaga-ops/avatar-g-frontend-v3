'use client';

/**
 * What both Library screens (LibraryGallery, StudioLibraryGrid) say when they have no works of the person's to show
 * (§4.2.7): the Library could not be reached, it failed, or the visitor is signed out and sees the shared demo library.
 * „Nothing created yet" is only ever the answer to a read that worked.
 *
 * Sign-in goes through the shell both screens sit in (ChatChrome listens for `myavatar:auth-required`), so it opens the
 * same sheet as everywhere else.
 */
import { AlertTriangle, LogIn, RefreshCw, Sparkles } from 'lucide-react';
import type { LibraryFailure } from '@/lib/library/libraryQuery';

type Lang = 'ka' | 'en' | 'ru';

export const LIBRARY_STATE_COPY: Record<Lang, {
  unavailable: string; failed: string; safe: string; retry: string; demo: string; guestEmpty: string; signIn: string;
}> = {
  ka: {
    unavailable: 'ბიბლიოთეკა ახლა მიუწვდომელია.',
    failed: 'ბიბლიოთეკა ვერ ჩაიტვირთა.',
    safe: 'შენი ნამუშევრები შენახულია.',
    retry: 'თავიდან ცდა',
    demo: 'ეს მაგალითებია. შედი სისტემაში, რომ შენი ნამუშევრები ნახო.',
    guestEmpty: 'შედი სისტემაში, რომ შენი ნამუშევრები ნახო.',
    signIn: 'შესვლა',
  },
  en: {
    unavailable: 'The Library is not reachable right now.',
    failed: 'The Library could not be loaded.',
    safe: 'Your works are safe.',
    retry: 'Try again',
    demo: 'These are examples. Sign in to see your own works.',
    guestEmpty: 'Sign in to see your works.',
    signIn: 'Sign in',
  },
  ru: {
    unavailable: 'Библиотека сейчас недоступна.',
    failed: 'Не удалось загрузить библиотеку.',
    safe: 'Ваши работы сохранены.',
    retry: 'Повторить',
    demo: 'Это примеры. Войдите, чтобы увидеть свои работы.',
    guestEmpty: 'Войдите, чтобы увидеть свои работы.',
    signIn: 'Войти',
  },
};

const copyFor = (lang: string) => LIBRARY_STATE_COPY[lang as Lang] ?? LIBRARY_STATE_COPY.ka;

function openSignIn() {
  try { window.dispatchEvent(new CustomEvent('myavatar:auth-required', { detail: 'login' })); } catch { /* SSR */ }
}

/** The read failed: say so, say the works are not lost, and offer the read again. */
export function LibraryFailed({ lang, failure, onRetry, retrying = false }: { lang: string; failure: LibraryFailure; onRetry: () => void; retrying?: boolean }) {
  const t = copyFor(lang);
  return (
    <div role="alert" data-testid="library-failed" data-failure={failure} className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <AlertTriangle size={36} strokeWidth={1.5} aria-hidden="true" className="text-app-muted/80" />
      <div>
        <p className="text-[14px] font-semibold text-app-text">{failure === 'unavailable' ? t.unavailable : t.failed}</p>
        <p className="mt-1 text-[13px] text-app-muted">{t.safe}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-elevated px-4 text-[13px] font-semibold text-app-text transition hover:bg-app-elevated/70 disabled:opacity-60"
      >
        <RefreshCw size={14} aria-hidden="true" className={retrying ? 'animate-spin motion-reduce:animate-none' : ''} /> {t.retry}
      </button>
    </div>
  );
}

/** Above the shared demo library a signed-out visitor sees: these are examples, not their works. */
export function DemoNotice({ lang }: { lang: string }) {
  const t = copyFor(lang);
  return (
    <div role="note" data-testid="library-demo" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-app-border/15 bg-app-elevated/50 px-3.5 py-2.5">
      <p className="flex items-center gap-2 text-[13px] text-app-text">
        <Sparkles size={15} aria-hidden="true" className="shrink-0 text-app-accent" /> {t.demo}
      </p>
      <SignInButton lang={lang} />
    </div>
  );
}

/** A signed-out visitor with no demo works to look at. */
export function GuestEmpty({ lang }: { lang: string }) {
  const t = copyFor(lang);
  return (
    <div data-testid="library-guest" className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-[14px] text-app-muted">{t.guestEmpty}</p>
      <SignInButton lang={lang} />
    </div>
  );
}

function SignInButton({ lang }: { lang: string }) {
  const t = copyFor(lang);
  return (
    <button
      type="button"
      onClick={openSignIn}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-accent px-3.5 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90"
    >
      <LogIn size={14} aria-hidden="true" /> {t.signIn}
    </button>
  );
}
