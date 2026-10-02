'use client';

/**
 * SourceVideoCard — the 3–30 s video whose MOTION (Motion) or whose picture (Swap) the op works from.
 *
 * Empty: a dashed card with a round video icon (Higgsfield's „Add video to extend"). Picked: a muted preview with its
 * length on a badge and a 44 px remove button. The browser has already refused what cannot work (a wrong type, over
 * 50 MB, shorter than 3 s or longer than 30 s — with the actual length in the message) before an upload starts; the
 * server measures the stored file again. The picker input is a SIBLING of its label (the iOS Safari trap
 * components/studio/ui/controls.Dropzone documents).
 */
import { Loader2, Video, X } from 'lucide-react';
import { copyFor } from './copy';
import { formatSeconds } from './media';

export interface SourceVideo {
  name: string;
  /** A blob: URL for the local preview. */
  previewUrl: string;
  durationSec: number;
  sizeBytes: number;
  /** The storage path once uploaded; null while uploading. */
  path: string | null;
}

export interface SourceVideoCardProps {
  locale: string;
  video: SourceVideo | null;
  /** An upload or a length probe is running. */
  busy: boolean;
  /** Already-localized, or null. */
  error: string | null;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

export function SourceVideoCard({ locale, video, busy, error, disabled, onPick, onRemove }: SourceVideoCardProps) {
  const c = copyFor(locale);
  const inputId = 'vfx-video-input';
  return (
    <section aria-label={c.videoTitle} data-testid="vfx-video" className="min-w-0 space-y-2">
      {video ? (
        <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-app-border/15">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a preview of the user's own upload */}
          <video src={video.previewUrl} muted playsInline preload="metadata" className="aspect-video w-full object-cover" />
          <span data-testid="vfx-video-length" className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white">
            {c.videoSeconds(formatSeconds(video.durationSec))}
          </span>
          <button
            type="button"
            aria-label={c.videoRemove}
            title={c.videoRemove}
            disabled={disabled}
            onClick={onRemove}
            className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 transition-colors hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-accent disabled:opacity-40"
          >
            <X size={16} aria-hidden="true" />
          </button>
          {busy && (
            <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 text-[12.5px] font-medium text-white">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {c.videoUploading}
            </div>
          )}
        </div>
      ) : (
        <>
          <label
            htmlFor={inputId}
            data-testid="vfx-video-drop"
            className={`flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-app-border/30 bg-app-elevated/30 p-3 text-center transition-colors hover:bg-app-elevated/60 focus-within:border-app-accent/60 ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onPick(f);
            }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
              {busy ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <Video size={19} aria-hidden="true" />}
            </span>
            <span className="text-[13px] font-semibold text-app-text">{busy ? c.checking : c.videoTitle}</span>
            <span className="text-[11.5px] leading-snug text-app-muted">{c.videoHint}</span>
          </label>
          <input
            id={inputId}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
            disabled={disabled || busy}
            className="sr-only"
            data-testid="vfx-video-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = '';
              if (f) onPick(f);
            }}
          />
        </>
      )}
      {error && (
        <p role="alert" data-testid="vfx-video-error" className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-red-300 ring-1 ring-red-500/25">{error}</p>
      )}
    </section>
  );
}
