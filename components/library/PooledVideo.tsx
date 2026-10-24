'use client';

/**
 * A Library film card's <video>, kept for the next time the same card is shown (MASTER TASK v3.1 §4.2.5, §4.2.6).
 *
 * Each Library screen rebuilt its <video> elements whenever a tab, a page or the slide-over came back, and every new
 * element read its file again (preload="metadata" plus the #t=0.1 first frame). Here the element of a work outlives its
 * card: when the card goes, the element is set aside (paused, still loaded); when a card for the same work comes back
 * with the same link, it gets that element back, first frame and length already known, and nothing is read again.
 * A play starts at once for the same reason.
 *
 * A card only gives its element a link once it is near the screen (300 px; at once where IntersectionObserver is
 * missing), so a page's films below the fold read nothing until they are scrolled to.
 *
 * The pool itself (lib/library/videoPool) keeps few elements, private by account.
 */
import { type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keepVideo, takeKeptVideo, videoFailed, videoRetried } from '@/lib/library/videoPool';

// Effects that must run before paint in the browser, and quietly on the server.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface PooledVideoProps {
  /** Which work's film (videoKey: owner, then id): the same key on a later card gets the same element back. */
  poolKey: string;
  /** The link, with any media fragment (#t=0.1). */
  src: string;
  className?: string;
  hostClassName?: string;
  controls?: boolean;
  onLoadedMetadata?: (el: HTMLVideoElement) => void;
  onLoadedData?: () => void;
  onError?: () => void;
  onEnded?: () => void;
  onClick?: () => void;
  videoRef?: MutableRefObject<HTMLVideoElement | null>;
}

export function PooledVideo({
  poolKey, src, className, hostClassName = 'h-full w-full', controls = false,
  onLoadedMetadata, onLoadedData, onError, onEnded, onClick, videoRef,
}: PooledVideoProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const el = useRef<HTMLVideoElement | null>(null);
  // The latest handlers, so the element's listeners never call a stale one.
  const on = useRef({ onLoadedMetadata, onLoadedData, onError, onEnded, onClick });
  on.current = { onLoadedMetadata, onLoadedData, onError, onEnded, onClick };
  const [near, setNear] = useState(() => typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'function');

  // Take this work's element back (or make one) and put it in the card; set it aside again when the card goes.
  useIsoLayoutEffect(() => {
    const box = host.current;
    if (!box) return;
    const video = takeKeptVideo(poolKey) ?? document.createElement('video');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    el.current = video;
    if (videoRef) videoRef.current = video;
    const fire = {
      loadedmetadata: () => on.current.onLoadedMetadata?.(video),
      loadeddata: () => on.current.onLoadedData?.(),
      error: () => { videoFailed(video); on.current.onError?.(); },
      ended: () => on.current.onEnded?.(),
      click: () => on.current.onClick?.(),
    };
    for (const [type, fn] of Object.entries(fire)) video.addEventListener(type, fn);
    box.appendChild(video);
    // An element that comes back already loaded says so at once.
    if (video.error) fire.error();
    else {
      if (video.readyState >= 1) fire.loadedmetadata();
      if (video.readyState >= 2) fire.loadeddata();
    }
    return () => {
      for (const [type, fn] of Object.entries(fire)) video.removeEventListener(type, fn);
      if (video.parentNode === box) box.removeChild(video);
      if (videoRef?.current === video) videoRef.current = null;
      el.current = null;
      keepVideo(poolKey, video);
    };
  }, [poolKey, videoRef]);

  // Appearance follows the props.
  useIsoLayoutEffect(() => {
    const video = el.current;
    if (!video) return;
    video.className = className ?? '';
    video.controls = controls;
  }, [className, controls, poolKey]);

  // The link, once the card is near the screen. The same link on a kept element is left alone: nothing is read again.
  useIsoLayoutEffect(() => {
    const video = el.current;
    if (!video || !near) return;
    if (video.getAttribute('src') !== src) { videoRetried(video); video.setAttribute('src', src); }
  }, [src, near, poolKey]);

  // Near the screen yet? An element that already has this link counts as near (it costs nothing to show).
  useEffect(() => {
    if (near) return;
    if (el.current?.getAttribute('src') === src) { setNear(true); return; }
    const box = host.current;
    if (!box || typeof IntersectionObserver !== 'function') { setNear(true); return; }
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); watch.disconnect(); }
    }, { rootMargin: '300px' });
    watch.observe(box);
    return () => watch.disconnect();
  }, [near, src, poolKey]);

  return <div ref={host} className={hostClassName} />;
}
