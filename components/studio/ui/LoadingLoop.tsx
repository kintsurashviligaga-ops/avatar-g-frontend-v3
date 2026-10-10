'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The loading loop: the avatar forming out of light (the owner's clip, 2026-10-09), drawn on every loading card
 * while a job is queued or running: the in-chat result tile (./ResultCard) and the progress card
 * (./GenerationProgress).
 *
 * The asset is the owner's 10 s, 720×1280 clip re-encoded for a card: 432×768, no sound, its last 0.7 s faded to
 * black so the loop lands on the near-black particles it starts from. Two files, the browser takes the first it can
 * decode: VP9 WebM (≈ 0.37 MB) and H.264 MP4 (≈ 0.5 MB, faststart) for the rest. Cached after the first card. The
 * poster is the wireframe frame at 3.3 s, and the first play starts there too, so the poster never jumps back to the
 * clip's near-black opening; every later loop plays the whole clip.
 *
 * Motion is opt-in per device, never assumed:
 *   · the poster renders first (server and client alike), the video only after mount;
 *   · prefers-reduced-motion or Save-Data keeps the poster and downloads nothing;
 *   · off screen (a long chat scrolled away from the card) the video pauses, and plays again when it is back.
 * Decorative only: hidden from assistive tech; the card's own caption and progressbar carry the state.
 */
export const LOADING_LOOP_WEBM = '/media/loading/avatar-forming.webm';
export const LOADING_LOOP_SRC = '/media/loading/avatar-forming.mp4';
export const LOADING_LOOP_POSTER = '/media/loading/avatar-forming.jpg';
/** Where the poster frame sits in the clip (s): the first play starts here. */
export const LOADING_LOOP_POSTER_AT = 3.3;

/** May this device play the loop? No under reduced motion or Save-Data. */
export function loopAllowed(w: Pick<Window, 'matchMedia'> | undefined, nav: Navigator | undefined): boolean {
  if (!w) return false;
  if (w.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const conn = (nav as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection;
  return conn?.saveData !== true;
}

export function LoadingLoop({ className = '', position = '50% 32%' }: {
  className?: string;
  /** object-position: a wide tile crops the portrait clip, and the face sits in its upper third. */
  position?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    setMotion(loopAllowed(typeof window === 'undefined' ? undefined : window, typeof navigator === 'undefined' ? undefined : navigator));
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!motion || !v) return;
    v.muted = true; // iOS plays inline only when muted
    const fromPoster = () => {
      try { if (v.currentTime < LOADING_LOOP_POSTER_AT) v.currentTime = LOADING_LOOP_POSTER_AT; } catch { /* not seekable yet: plays from 0 */ }
    };
    if (v.readyState >= 1) fromPoster();
    else v.addEventListener('loadedmetadata', fromPoster, { once: true });
    // autoPlay starts it; the observer only pauses it off screen and resumes it on screen.
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void v.play()?.catch(() => { /* autoplay refused: the poster stays */ });
      else v.pause();
    }, { threshold: 0 });
    io?.observe(v);
    return () => {
      v.removeEventListener('loadedmetadata', fromPoster);
      io?.disconnect();
    };
  }, [motion]);

  const fit = `absolute inset-0 h-full w-full object-cover ${className}`;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOADING_LOOP_POSTER} alt="" aria-hidden="true" decoding="async" className={fit} style={{ objectPosition: position }} data-testid="loading-loop-poster" />
      {motion && (
        <video
          ref={ref}
          poster={LOADING_LOOP_POSTER}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          tabIndex={-1}
          className={fit}
          style={{ objectPosition: position }}
          data-testid="loading-loop"
        >
          <source src={LOADING_LOOP_WEBM} type='video/webm; codecs="vp9"' />
          <source src={LOADING_LOOP_SRC} type="video/mp4" />
        </video>
      )}
    </>
  );
}
