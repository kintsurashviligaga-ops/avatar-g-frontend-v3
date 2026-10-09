'use client';

/**
 * FilmStudioHome
 * ==============
 * The `/dashboard` landing surface: it mounts ServiceHub, which is the one studio window (chat + every tool) and
 * Agent G. The earlier homes (the three-card hub, the "Music Video" director, the Lip-Sync studio, the card film studio
 * and /studio "Studio Beta") were retired 2026-10-09 (owner: "old, confusing"); their links land in the studio's tools.
 */

import { ServiceHub } from '@/components/studio/ServiceHub';

interface FilmStudioHomeProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  isAuthenticated?: boolean;
}

export function FilmStudioHome({ locale, isAuthenticated = false }: FilmStudioHomeProps) {
  return <ServiceHub locale={locale} isAuthenticated={isAuthenticated} />;
}

export default FilmStudioHome;
