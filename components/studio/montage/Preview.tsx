'use client';

/**
 * components/studio/montage/Preview.tsx — the player frame, at the edit's format.
 *
 * The frame is sized in JS from the stage (ResizeObserver): CSS `aspect-ratio` cannot fit a box inside BOTH a
 * width and a height limit. Clips FILL it (object-cover) — what the export's center-crop does
 * (lib/video/remixOps fitAspect) — and a photo drifts in slowly, the Ken Burns move the export gives it.
 * The caption is drawn at the export's own size: the same fraction of the frame height (captionFontSize).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ASPECT_DIMS, captionFontSize, type MontageAspect, type MontageGrade } from '@/lib/services/montage/montagePlan';
import { captionMaxWidth, captionPad, wrapCaption } from '@/lib/text/wrapCaption';
import { aspectRatio, gradeCss } from './copy';
import type { PlayerClip } from './usePlayer';

export interface PreviewProps {
  aspect: MontageAspect;
  grade: MontageGrade;
  clip: PlayerClip | null;
  caption: { text: string; pos: 'bottom' | 'center' } | null;
  videoA: RefObject<HTMLVideoElement | null>;
  videoB: RefObject<HTMLVideoElement | null>;
  activeSlot: 0 | 1;
  playing: boolean;
  onToggle: () => void;
  playLabel: string;
  pauseLabel: string;
  /** Nothing on the timeline yet: an empty frame of the chosen format. */
  empty?: boolean;
}

export function Preview(p: PreviewProps) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const r = aspectRatio(p.aspect);
      const w = Math.min(W, H * r);
      setBox({ w: Math.floor(w), h: Math.floor(w / r) });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [p.aspect]);

  const filter = gradeCss(p.grade);
  const isImage = p.clip?.kind === 'image';
  // THE EXPORT'S OWN LINES, scaled: the same font size share of the frame, the same line breaks (lib/text/wrapCaption),
  // the same bottom margin. The browser is not allowed to wrap on its own — that is how a preview and a render drift.
  const dims = ASPECT_DIMS[p.aspect];
  const scale = box.h > 0 ? box.h / dims.h : 0;
  const cap = p.caption && p.caption.text.trim() ? (() => {
    const fs = captionFontSize(p.aspect, p.caption.pos);
    const position = p.caption.pos === 'center' ? 'center' : 'bottom-center';
    return {
      lines: wrapCaption(p.caption.text, fs, captionMaxWidth(position, fs, dims.w)),
      fontPx: Math.max(6, fs * scale),
      bottomPx: Math.max(0, (captionPad(fs) - fs * 0.25) * scale),
      center: p.caption.pos === 'center',
    };
  })() : null;

  return (
    <div ref={stage} className="relative flex h-full w-full items-center justify-center" data-testid="montage-preview">
      <div
        className="relative overflow-hidden bg-black"
        style={{ width: box.w || undefined, height: box.h || undefined }}
        data-aspect={p.aspect}
      >
        <button
          type="button"
          onClick={p.onToggle}
          disabled={p.empty}
          aria-label={p.playing ? p.pauseLabel : p.playLabel}
          className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60 disabled:cursor-default"
        />
        <div className="absolute inset-0" style={filter ? { filter } : undefined}>
          {[p.videoA, p.videoB].map((ref, slot) => (
            <video
              key={slot}
              ref={ref as RefObject<HTMLVideoElement>}
              playsInline
              muted
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ visibility: !isImage && p.clip && p.activeSlot === slot ? 'visible' : 'hidden' }}
            />
          ))}
          {isImage && p.clip && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.clip.id}
              src={p.clip.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover motion-safe:animate-[montageKenBurns_5s_linear_forwards]"
              style={{ animationPlayState: p.playing ? 'running' : 'paused' }}
            />
          )}
        </div>
        {cap && scale > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-[5] flex justify-center text-center ${cap.center ? 'top-1/2 -translate-y-1/2' : ''}`}
            style={cap.center ? undefined : { bottom: cap.bottomPx }}
            aria-hidden="true"
            data-testid="montage-preview-caption"
          >
            <span
              className="whitespace-pre font-medium text-white"
              style={{ fontSize: cap.fontPx, lineHeight: 1.2, textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.9)' }}
            >
              {cap.lines.join('\n')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
