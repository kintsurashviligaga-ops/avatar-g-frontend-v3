'use client';

import { usePathname } from 'next/navigation';
import { NotFoundView, localeFromPath } from '@/components/NotFoundView';

// An unmatched URL under /ka, /en or /ru reaches this ROOT not-found (no [locale] segment matched), so it used to show
// the English "Page not found / Return to Base" page on /ka/... (Production 2026-10-16). Take the language from the path.
export default function NotFound() {
  return <NotFoundView locale={localeFromPath(usePathname())} />;
}
