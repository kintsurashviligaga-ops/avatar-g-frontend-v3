'use client';

/**
 * AvatarBackdrop — mobile-only full-screen 9:16 avatar video canvas.
 *
 * On phones the avatar becomes the immersive background: a fixed, object-cover
 * loop that fills the viewport (z-0), with a vertical scrim that darkens toward
 * the bottom so the glassmorphic chat panel layered above (z-10) stays readable.
 * Hidden on md+ (desktop keeps the anchored AvatarVideoStage card). Renders
 * nothing when no avatar video asset is configured.
 */

import { resolveAvatarVideo } from '@/lib/avatar/video-config';

const { idleUrl: VIDEO_URL, poster: POSTER, hasVideo: HAS_VIDEO } = resolveAvatarVideo();

export function AvatarBackdrop() {
  if (!HAS_VIDEO) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <video
        src={VIDEO_URL}
        poster={POSTER}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      {/* Readability scrim — crisp avatar up top, darker toward the bottom where the
          glass chat panel + control bar sit. Full-screen canvas on every viewport. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/85" />
    </div>
  );
}
