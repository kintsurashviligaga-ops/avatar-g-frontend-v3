/**
 * Avatar video-source resolution — pure, testable, env-driven.
 *
 * The onboarding talking-avatar viewport (AvatarVideoStage) is driven by three
 * optional public env vars. Resolving them here (instead of inline in the
 * component) gives us a single source of truth we can unit-test, and lets us
 * trim stray whitespace/newlines that creep into copy-pasted Vercel env values
 * (a trailing "\n" silently breaks a <video src>).
 *
 * NOTE: the literal `process.env.NEXT_PUBLIC_*` member accesses are intentional —
 * Next.js statically inlines them into the client bundle at build time. Tests
 * inject values via the optional `source` argument instead.
 */

export interface AvatarVideoConfig {
  /** Idle cinematic loop URL (empty string when unset). */
  idleUrl: string;
  /** Talking loop URL (empty string when unset). */
  talkUrl: string;
  /** Optional poster frame, or undefined when unset/blank. */
  poster: string | undefined;
  /** True when an idle video asset is configured (else: animated-orb fallback). */
  hasVideo: boolean;
  /** True only when BOTH idle + talking layers are configured. */
  hasTalkingLayer: boolean;
}

export interface AvatarVideoSource {
  idle?: string | undefined;
  talk?: string | undefined;
  poster?: string | undefined;
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

export function resolveAvatarVideo(source?: AvatarVideoSource): AvatarVideoConfig {
  const idleUrl = clean(source?.idle ?? process.env.NEXT_PUBLIC_AVATAR_IDLE_VIDEO_URL);
  const talkUrl = clean(source?.talk ?? process.env.NEXT_PUBLIC_AVATAR_TALKING_VIDEO_URL);
  const poster = clean(source?.poster ?? process.env.NEXT_PUBLIC_AVATAR_POSTER_URL);
  const hasVideo = idleUrl.length > 0;
  return {
    idleUrl,
    talkUrl,
    poster: poster.length > 0 ? poster : undefined,
    hasVideo,
    hasTalkingLayer: hasVideo && talkUrl.length > 0,
  };
}
