'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CinematicFilmStudio } from '@/components/studio/CinematicFilmStudio';
import { CreditBadge } from '@/components/ui/CreditBadge';

export default function FilmStudioPage() {
  return (
    <div className="min-h-screen bg-transparent text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/studio"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Studio
          </Link>
          <CreditBadge />
        </div>
        <CinematicFilmStudio />
      </div>
    </div>
  );
}
