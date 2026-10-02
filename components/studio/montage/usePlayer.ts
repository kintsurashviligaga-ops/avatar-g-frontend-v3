'use client';

/**
 * components/studio/montage/usePlayer.ts — plays the timeline in the browser, before anything is rendered.
 *
 * TWO <video> ELEMENTS, A/B. While clip N plays in one, clip N+1 is loaded and parked on its first frame in
 * the other; at the boundary they swap. One element switching `src` at every cut flashes black for as long
 * as the next file takes to decode — exactly the moment a cut is judged.
 *
 * The clock is the timeline's: a video clip reads its time from the element (so it can never drift from
 * the picture), a photo advances on requestAnimationFrame. A music bed follows the clock and is nudged back
 * when it wanders more than a fraction of a second.
 *
 * Per-frame work never goes through React state: `onFrame(t)` lets the editor move the timeline and the
 * clock imperatively. React hears about the clip index, play/pause and a ~8 fps time sample — what the UI
 * actually redraws on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlayerClip {
  id: string;
  kind: 'video' | 'image';
  url: string;
  /** Timeline window, seconds. */
  t0: number;
  t1: number;
  /** Source window, seconds (a photo: 0..length). */
  start: number;
  end: number;
  muted: boolean;
}

export interface PlayerOptions {
  clips: PlayerClip[];
  totalSec: number;
  musicUrl: string | null;
  /** Clip sound on? Off = every clip is silent in the preview, as in the export. */
  originalSound: boolean;
  onFrame?: (t: number) => void;
}

const EPS = 0.04;

/**
 * play(), and if the browser refuses it, play muted. iOS lets an element play with sound only once a tap has
 * started it; the A/B swap starts the second element from the playback loop, not from a tap, and a refused play
 * froze the preview on that cut. Silent preview beats a frozen one — the export's audio is unaffected.
 */
function safePlay(v: HTMLVideoElement): void {
  const p = v.play();
  if (!p || typeof p.catch !== 'function') return;
  p.catch((e: unknown) => {
    if ((e as { name?: string })?.name !== 'NotAllowedError' || v.muted) return;
    v.muted = true;
    void v.play().catch(() => {});
  });
}

export function usePlayer(opts: PlayerOptions) {
  const videoA = useRef<HTMLVideoElement | null>(null);
  const videoB = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [time, setTime] = useState(0);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timeRef = useRef(0);
  const idxRef = useRef(0);
  const slotRef = useRef<0 | 1>(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const lastSampleRef = useRef(0);

  const videoOf = (slot: 0 | 1) => (slot === 0 ? videoA.current : videoB.current);

  const emit = useCallback((t: number, force = false) => {
    timeRef.current = t;
    optsRef.current.onFrame?.(t);
    const now = performance.now();
    if (force || now - lastSampleRef.current > 120) {
      lastSampleRef.current = now;
      setTime(t);
    }
  }, []);

  /** Point a slot at a clip's source and park it `local` seconds in. Cheap when the source is already there. */
  const load = useCallback((slot: 0 | 1, c: PlayerClip, local: number) => {
    const v = videoOf(slot);
    if (!v) return;
    const at = Math.max(0, c.start + local);
    if (v.dataset.src !== c.url) {
      v.dataset.src = c.url;
      v.src = c.url;
      const seekWhenReady = () => { try { v.currentTime = at; } catch { /* not seekable yet */ } };
      v.addEventListener('loadedmetadata', seekWhenReady, { once: true });
      v.load();
    } else if (Math.abs(v.currentTime - at) > EPS) {
      try { v.currentTime = at; } catch { /* not seekable yet */ }
    }
    v.dataset.clip = c.id;
  }, []);

  const applyMute = useCallback((c: PlayerClip | undefined) => {
    const muted = !c || c.muted || !optsRef.current.originalSound;
    for (const v of [videoA.current, videoB.current]) if (v) v.muted = true;
    const v = videoOf(slotRef.current);
    if (v && c?.kind === 'video') v.muted = muted;
  }, []);

  /** Put clip `index` on screen, `local` seconds in, swapping to the pre-loaded slot when it holds it. */
  const show = useCallback((index: number, local: number) => {
    const c = optsRef.current.clips[index];
    idxRef.current = index;
    setClipIndex(index);
    if (!c) return;
    if (c.kind === 'video') {
      const active = slotRef.current;
      const other: 0 | 1 = active === 0 ? 1 : 0;
      const ov = videoOf(other);
      if (videoOf(active)?.dataset.clip !== c.id && ov?.dataset.clip === c.id) {
        videoOf(active)?.pause();
        slotRef.current = other;
        setActiveSlot(other);
      }
      load(slotRef.current, c, local);
    } else {
      videoA.current?.pause();
      videoB.current?.pause();
    }
    applyMute(c);
  }, [applyMute, load]);

  const syncMusic = useCallback((t: number, hard: boolean) => {
    const a = audioRef.current;
    const url = optsRef.current.musicUrl;
    if (!a || !url) return;
    const dur = Number.isFinite(a.duration) ? a.duration : Number.POSITIVE_INFINITY;
    if (t >= dur) { if (!a.paused) a.pause(); return; }
    if (hard || Math.abs(a.currentTime - t) > 0.3) {
      try { a.currentTime = t; } catch { /* not ready */ }
    }
    if (playingRef.current && a.paused) void a.play().catch(() => {});
    if (!playingRef.current && !a.paused) a.pause();
  }, []);

  const stopLoop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    stopLoop();
    videoA.current?.pause();
    videoB.current?.pause();
    audioRef.current?.pause();
    emit(timeRef.current, true);
  }, [emit]);

  const tick = useCallback((now: number) => {
    if (!playingRef.current) return;
    const { clips, totalSec } = optsRef.current;
    const dt = Math.min(0.1, Math.max(0, (now - lastTickRef.current) / 1000));
    lastTickRef.current = now;
    const i = idxRef.current;
    const c = clips[i];
    if (!c) { pause(); return; }

    let t = timeRef.current;
    let atEnd = false;
    if (c.kind === 'video') {
      const v = videoOf(slotRef.current);
      if (v) {
        if (v.paused && v.readyState >= 2) safePlay(v);
        if (v.readyState >= 2) t = c.t0 + Math.max(0, v.currentTime - c.start);
        atEnd = v.ended || v.currentTime >= c.end - EPS;
      }
    } else {
      t += dt;
      atEnd = t >= c.t1 - 1e-3;
    }

    // Park the NEXT video clip in the idle slot, so the cut is instant.
    const next = clips[i + 1];
    if (next?.kind === 'video') {
      const idle: 0 | 1 = slotRef.current === 0 ? 1 : 0;
      if (videoOf(idle)?.dataset.clip !== next.id) load(idle, next, 0);
    }

    if (atEnd) {
      if (next) {
        show(i + 1, 0);
        t = next.t0;
        const nv = next.kind === 'video' ? videoOf(slotRef.current) : null;
        if (nv) safePlay(nv);
      } else {
        emit(totalSec, true);
        pause();
        return;
      }
    }
    emit(Math.min(t, totalSec));
    syncMusic(timeRef.current, false);
    rafRef.current = requestAnimationFrame(tick);
  }, [emit, load, pause, show, syncMusic]);

  const seek = useCallback((tRaw: number) => {
    const { clips, totalSec } = optsRef.current;
    const t = Math.max(0, Math.min(totalSec, tRaw));
    let index = clips.length - 1;
    let local = 0;
    for (let k = 0; k < clips.length; k += 1) {
      const c = clips[k]!;
      if (t < c.t1 || k === clips.length - 1) { index = k; local = Math.max(0, Math.min(c.t1 - c.t0, t - c.t0)); break; }
    }
    if (index >= 0) show(index, local);
    emit(t, true);
    syncMusic(t, true);
  }, [emit, show, syncMusic]);

  const play = useCallback(() => {
    const { clips, totalSec } = optsRef.current;
    if (!clips.length) return;
    if (timeRef.current >= totalSec - 0.05) seek(0);
    playingRef.current = true;
    setPlaying(true);
    const c = clips[idxRef.current];
    if (c?.kind === 'video') {
      const v = videoOf(slotRef.current);
      if (v) safePlay(v);
    }
    syncMusic(timeRef.current, true);
    lastTickRef.current = performance.now();
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
  }, [seek, syncMusic, tick]);

  const toggle = useCallback(() => { if (playingRef.current) pause(); else play(); }, [pause, play]);

  // AN EDIT INVALIDATES THE CLOCK'S MAPPING: clip windows moved under it. Pause and re-place the playhead
  // at the same timeline time, now inside whatever clip is there.
  const signature = opts.clips.map((c) => `${c.id}:${c.url}:${c.start}:${c.end}:${c.t0}`).join('|');
  useEffect(() => {
    if (playingRef.current) pause();
    for (const v of [videoA.current, videoB.current]) if (v) delete v.dataset.clip;
    seek(Math.min(timeRef.current, optsRef.current.totalSec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => { applyMute(optsRef.current.clips[idxRef.current]); }, [opts.originalSound, applyMute]);

  useEffect(() => () => stopLoop(), []);

  return { videoA, videoB, audioRef, playing, clipIndex, activeSlot, time, timeRef, play, pause, toggle, seek };
}
