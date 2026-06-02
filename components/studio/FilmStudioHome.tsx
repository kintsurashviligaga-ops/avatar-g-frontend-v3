'use client';

/**
 * FilmStudioHome
 * ==============
 * The `/dashboard` landing surface. By product decision the 30-Second Cinematic
 * Film Studio is now the home experience; the full multimodal chat hub
 * (MyAvatarChatV2) is preserved and demoted to `/{locale}/chat`, reachable from
 * the top bar here. This wrapper only adds the page chrome (brand, credits,
 * theme, sign-in, and the Chat entry); the studio card itself drives the REAL
 * generate → stitch → deliver pipeline (see CinematicFilmStudio).
 */

import Link from 'next/link';
import { MessageSquare, LogIn, Sparkles } from 'lucide-react';
import { CreditBadge } from '@/components/ui/CreditBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CinematicFilmStudio } from '@/components/studio/CinematicFilmStudio';

interface FilmStudioHomeProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  isAuthenticated?: boolean;
}

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, { chat: string; login: string; themed: string; lead: string }> = {
  ka: {
    chat: 'ჩათი',
    login: 'შესვლა',
    themed: 'თემის გადართვა',
    lead: 'შექმენი კინემატოგრაფიული 30-წამიანი ფილმი ერთი ბრძანებით.',
  },
  en: {
    chat: 'Chat',
    login: 'Sign in',
    themed: 'Toggle theme',
    lead: 'Produce a cinematic 30-second film from a single brief.',
  },
  ru: {
    chat: 'Чат',
    login: 'Войти',
    themed: 'Сменить тему',
    lead: 'Создай кинематографичный 30-секундный фильм одной командой.',
  },
};

export function FilmStudioHome({ locale, isAuthenticated = false }: FilmStudioHomeProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0a0f1e] to-black text-white">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      {/* Additive safe-area top inset (base 0 + env) keeps the bar below the
          translucent iOS status bar in standalone PWA mode — matches the
          calc(base + env(...)) convention the prior home used. */}
      <header
        className="sticky top-0 z-30 border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href={`/${locale}/dashboard`}
            className="flex items-center gap-2 font-bold tracking-tight text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 shadow-[0_0_18px_rgba(139,92,246,0.35)]">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="text-sm sm:text-base">MyAvatar.ge</span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <CreditBadge />
            <ThemeToggle label={t.themed} />
            <Link
              href={`/${locale}/chat`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.chat}</span>
            </Link>
            {!isAuthenticated && (
              <Link
                href={`/${locale}/login`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-1.5 text-xs font-semibold text-purple-200 transition-colors hover:bg-purple-400/20"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.login}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Studio ──────────────────────────────────────────────────── */}
      {/* Additive bottom inset (base 2rem + env) keeps the Compile action clear
          of the iOS home indicator in standalone PWA mode. */}
      <main
        className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <p className="mb-6 text-center text-sm text-white/45">{t.lead}</p>
        <CinematicFilmStudio locale={locale} />
      </main>
    </div>
  );
}

export default FilmStudioHome;
