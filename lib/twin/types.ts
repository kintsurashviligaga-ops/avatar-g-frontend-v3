/**
 * lib/twin/types.ts — Digital Twin v0: the slots, limits and manifest shape shared by the capture UI, the routes and
 * the store.
 *
 * Pure (no server-only import), so components/twin/TwinCapture.tsx works from the same slots, MIME lists and caps the
 * server enforces: the browser says "too large" before a long upload, not after.
 *
 * ⚠️ THE MANIFEST IS THE SOURCE OF TRUTH (no `digital_twins` table in v0). One JSON object per user in the private
 * `twins` bucket says which capture is live; lib/twin/store.ts writes it last, so a capture that never commits is
 * never the twin.
 *
 * ⚠️ UPLOADS NEVER LAND IN THE LIVE TWIN. A signed upload URL stays valid for 2 hours and lets its holder overwrite its
 * path, so the browser only ever uploads into its own capture's `staging/<nonce>/`; the commit COPIES those objects server-side into a fresh
 * `twin-<captureId>/` folder no upload URL has ever named, and validates the copies. A stale or leaked upload URL can
 * then only touch staging — never the twin a person already approved.
 */

export const TWIN_PHOTO_SLOTS = ['front', 'left', 'right'] as const;
export type TwinPhotoSlot = (typeof TWIN_PHOTO_SLOTS)[number];

/** Photos are required; the voice sample is optional (a phone without a working mic can still make a face twin). */
export const TWIN_SLOTS = [...TWIN_PHOTO_SLOTS, 'voice'] as const;
export type TwinSlot = (typeof TWIN_SLOTS)[number];


/** Allowed base MIME → the extension in the object's path. Anything else is refused. */
export const TWIN_PHOTO_MIMES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** MediaRecorder output across browsers: Chrome/Android webm, Firefox ogg (or webm), Safari mp4/AAC. */
export const TWIN_VOICE_MIMES: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export const TWIN_LIMITS = {
  /** A 1024 px JPEG face is ~100–400 KB; 4 MB leaves room for a PNG fallback and refuses anything absurd. */
  photoMinBytes: 2 * 1024,
  photoMaxBytes: 4 * 1024 * 1024,
  /** 12 s of Opus is ~20 KB at the lowest browser bitrate; 30 s of 16-bit stereo WAV is ~5.8 MB. */
  voiceMinBytes: 8 * 1024,
  voiceMaxBytes: 8 * 1024 * 1024,
  /** The client downscales every photo to this longest edge before upload. */
  photoMaxEdgePx: 1024,
  voiceMinSec: 12,
  voiceMaxSec: 30,
  /** Digits the person reads aloud (server-issued; checking them against a transcript is left dark in v0). */
  digits: 8,
} as const;

export interface TwinObject {
  path: string;
  mime: string;
  bytes: number;
}

export interface TwinManifest {
  v: 1;
  userId: string;
  /** The committed capture folder `twins/<uid>/twin-<captureId>/` (16 hex chars, fresh per commit). */
  captureId: string;
  /** ISO time of the commit — also the twin's `updated_at` for /api/avatar/core and the desktop's phone poll. */
  committedAt: string;
  consent: {
    /** lib/legal/content.ts TWIN_CONSENT.version the person agreed to. */
    version: string;
    /**
     * When the person agreed: the SERVER's clock at /api/twin/upload-url, which the capture calls right after the box is
     * ticked (lib/twin/ticket.ts `c`). Never a client timestamp — a skewed phone clock must not block or fake it.
     */
    acceptedAt: string;
    /** When the server recorded it (server clock). */
    recordedAt: string;
  };
  photos: Record<TwinPhotoSlot, TwinObject>;
  voice: (TwinObject & { seconds: number | null }) | null;
  /** The digits shown for the voice step — issued and HMAC-bound by the server (lib/twin/ticket.ts). */
  digits: string;
  /** v0: never verified (speech-to-text is unfunded), so a voice sample is never treated as proven. */
  voiceVerified: false;
  /** v0: no provider holds a copy of the twin. */
  providerRefs: Record<string, never>;
  /** Which identity committed it: the browser's session, or the desktop's phone-handoff link. */
  via: 'session' | 'handoff';
}

/** What GET /api/twin answers. URLs are short-lived signed URLs for the caller's own objects. */
export type TwinStatusResponse =
  | { status: 'none' }
  | {
      status: 'ready';
      committedAt: string;
      consentVersion: string;
      voiceVerified: false;
      expiresIn: number;
      urls: Record<TwinPhotoSlot, string> & { voice: string | null };
    };

/** POST /api/twin/upload-url → one signed upload per slot, straight to storage (no base64, no 4.5 MB body cap). */
export interface TwinUploadUrlResponse {
  bucket: string;
  uploads: Partial<Record<TwinSlot, { path: string; token: string }>>;
  digits: string;
  ticket: string;
  expiresAt: string;
}
