'use client';

/**
 * /[locale]/studio/history — Library · History (Task 2).
 *
 * The signed-in user's durable media Library: a DB-synced grid (RLS-scoped per
 * user) of every film and generation the account has produced, with per-card
 * Download / Share / Copy-prompt. Films rendered in the conversational studio are
 * filed into the same generation_jobs table by the assemble route, so this is the
 * single, unified history surface. Strict studio palette: black · white · cyan.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import StudioLibraryGrid from '@/components/studio/StudioLibraryGrid';

type Lang = 'ka' | 'en' | 'ru';

const HEADING: Record<Lang, { studio: string; title: string }> = {
  ka: { studio: 'სტუდია', title: 'ბიბლიოთეკა · ისტორია' },
  en: { studio: 'Studio', title: 'Library · History' },
  ru: { studio: 'Студия', title: 'Библиотека · История' },
};

export default function HistoryPage() {
  const params = useParams();
  const raw = Array.isArray(params?.locale) ? params.locale[0] : params?.locale;
  const locale: Lang = raw === 'en' ? 'en' : raw === 'ru' ? 'ru' : 'ka';
  const h = HEADING[locale];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-black/85 backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00D2FF]/30 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center gap-3">
            <Link
              href={`/${locale}/studio`}
              className="flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1.5 text-sm text-neutral-400 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">{h.studio}</span>
            </Link>
            <div className="h-5 w-px bg-white/[0.12]" />
            <h1 className="flex items-center gap-2 text-sm font-bold text-white">
              <History size={15} className="text-[#00D2FF]" />
              {h.title}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <StudioLibraryGrid locale={locale} />
      </main>
    </div>
  );
}
