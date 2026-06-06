'use client';

/**
 * FilmStudioHome
 * ==============
 * The `/dashboard` landing surface. By product decision the 30-Second Cinematic
 * Film Studio is the home experience; the full multimodal chat hub
 * (MyAvatarChatV2) is preserved and demoted to `/{locale}/chat`, reachable from
 * the studio top bar.
 *
 * The studio now renders as a chat-first, full-height app shell
 * (ConversationalFilmStudio) optimised for App Store / Android WebView. That
 * shell owns its own top bar (brand, credits, theme, chat, sign-in) and bottom
 * composer, so this wrapper is intentionally thin — it just mounts the shell.
 * The contained CARD studio (CinematicFilmStudio) is still used by /studio and
 * /studio/film. Rollback path: render MyAvatarChatV2 (or the card studio) here.
 */

import { ServiceHub } from '@/components/studio/ServiceHub';

interface FilmStudioHomeProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  isAuthenticated?: boolean;
}

/**
 * The /dashboard landing now opens the grid-based Service Selection Hub (One
 * Window): three product cards — Film Studio (flagship), Omni Multimodal, and
 * Lipsync — each launching its studio in-window. The film studio remains the
 * flagship Card A. Rollback path: render ConversationalFilmStudio directly here.
 */
export function FilmStudioHome({ locale, isAuthenticated = false }: FilmStudioHomeProps) {
  return <ServiceHub locale={locale} isAuthenticated={isAuthenticated} />;
}

export default FilmStudioHome;
