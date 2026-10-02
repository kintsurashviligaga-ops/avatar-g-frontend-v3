'use client';

/**
 * useReferencePhotos — the dropzone's state: up to 40 photos, each checked (type, size), downscaled to ≤ 1280 px in the
 * browser, given a role, reorderable and removable — and uploaded LAZILY.
 *
 * ⚠️ UPLOAD ONLY WHAT THE ENGINE WILL USE. An engine takes 1–5 of the 40; the selection rule is a pure function the
 * panel runs to preview "Using 3 of 12", so it asks for exactly those photos to be uploaded, at the moment they are
 * needed (a quote, a generation). The other 37 never leave the device — no bandwidth, no storage, no one else's copy.
 * A photo uploaded once stays cached by id, so re-quoting after a chip change never re-sends it.
 *
 * Files are decoded three at a time and appended IN THE ORDER THEY WERE PICKED (a fast small photo never jumps ahead of
 * a slow big one), so the order the user sees is the order the selection rule reads.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_REFERENCES } from '@/lib/genjutsu/limits';
import type { ReferenceRole } from '@/lib/genjutsu/types';
import { uploadFileToStorage, type UploadError } from '@/components/studio/ui/useUpload';
import { checkPhotoFile, downscaleImage, type DownscaleResult, type PhotoRefusal } from './media';

export interface RefPhoto {
  id: string;
  name: string;
  role: ReferenceRole;
  /** The downscaled JPEG that is uploaded. */
  blob: Blob;
  /** An object URL for the thumbnail (revoked on remove / unmount). */
  thumb: string;
  width: number;
  height: number;
}

export interface SkippedPhoto {
  name: string;
  reason: PhotoRefusal | 'small' | 'unreadable';
}

export type UploadOutcome = { ok: true; paths: Record<string, string> } | { ok: false; error: UploadError };

export interface UseReferencePhotosOptions {
  max?: number;
  /** Injectable for tests (jsdom has no canvas). */
  decode?: (file: File) => Promise<DownscaleResult>;
  upload?: (file: File) => Promise<{ path: string } | { error: UploadError }>;
}

const DECODE_CONCURRENCY = 3;
let counter = 0;
const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ref-${Date.now().toString(36)}-${(counter++).toString(36)}`);

export function useReferencePhotos({ max = MAX_REFERENCES, decode = downscaleImage, upload = uploadFileToStorage }: UseReferencePhotosOptions = {}) {
  const [photos, setPhotos] = useState<RefPhoto[]>([]);
  const [pending, setPending] = useState(0);
  const [skipped, setSkipped] = useState<SkippedPhoto[]>([]);
  const [overflow, setOverflow] = useState(0);
  const photosRef = useRef<RefPhoto[]>([]);
  photosRef.current = photos;
  const pendingRef = useRef(0);
  const paths = useRef(new Map<string, string>());
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      for (const p of photosRef.current) URL.revokeObjectURL(p.thumb);
    };
  }, []);

  const add = useCallback(async (files: File[]): Promise<void> => {
    const room = Math.max(0, max - photosRef.current.length - pendingRef.current);
    const take = files.slice(0, room);
    setOverflow(files.length - take.length);
    setSkipped([]);
    if (take.length === 0) return;

    pendingRef.current += take.length;
    setPending(pendingRef.current);
    const results: Array<RefPhoto | { skip: SkippedPhoto } | undefined> = new Array(take.length).fill(undefined);
    let nextToStart = 0;
    let nextToShow = 0;

    // Append the finished PREFIX only: photo 2 waits for photo 1, so the user's order is kept whatever finishes first.
    const flush = () => {
      const ready: RefPhoto[] = [];
      const skips: SkippedPhoto[] = [];
      while (nextToShow < take.length && results[nextToShow] !== undefined) {
        const r = results[nextToShow]!;
        if ('skip' in r) skips.push(r.skip);
        else ready.push(r);
        nextToShow += 1;
      }
      if (!live.current) {
        for (const p of ready) URL.revokeObjectURL(p.thumb);
        return;
      }
      if (ready.length) setPhotos((cur) => [...cur, ...ready]);
      if (skips.length) setSkipped((cur) => [...cur, ...skips]);
    };

    const worker = async () => {
      for (;;) {
        const i = nextToStart++;
        if (i >= take.length) return;
        const file = take[i]!;
        const refusal = checkPhotoFile(file);
        if (refusal) {
          results[i] = { skip: { name: file.name, reason: refusal } };
        } else {
          const d = await decode(file).catch((): DownscaleResult => ({ ok: false, reason: 'unreadable' }));
          results[i] = d.ok
            ? { id: newId(), name: file.name, role: 'character', blob: d.blob, thumb: URL.createObjectURL(d.blob), width: d.width, height: d.height }
            : { skip: { name: file.name, reason: d.reason } };
        }
        pendingRef.current -= 1;
        if (live.current) setPending(pendingRef.current);
        flush();
      }
    };
    await Promise.all(Array.from({ length: Math.min(DECODE_CONCURRENCY, take.length) }, worker));
  }, [decode, max]);

  const remove = useCallback((id: string) => {
    const gone = photosRef.current.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.thumb);
    paths.current.delete(id);
    setPhotos((cur) => cur.filter((p) => p.id !== id));
  }, []);

  const clear = useCallback(() => {
    for (const p of photosRef.current) URL.revokeObjectURL(p.thumb);
    paths.current.clear();
    setPhotos([]);
    setSkipped([]);
    setOverflow(0);
  }, []);

  const setRole = useCallback((id: string, role: ReferenceRole) => {
    setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, role } : p)));
  }, []);

  /** Moves a photo one place earlier (-1) or later (+1) — how the user chooses which one is "best". */
  const move = useCallback((id: string, delta: -1 | 1) => {
    setPhotos((cur) => {
      const i = cur.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }, []);

  /**
   * Uploads exactly these photos (the ones the engine will use) that are not on the server yet, three at a time, and
   * returns id → storage path. One failure fails the batch with the upload's own reason (auth / rate / too-large / fail).
   */
  const ensureUploaded = useCallback(async (ids: readonly string[]): Promise<UploadOutcome> => {
    const out: Record<string, string> = {};
    const todo: RefPhoto[] = [];
    for (const id of ids) {
      const cached = paths.current.get(id);
      if (cached) { out[id] = cached; continue; }
      const p = photosRef.current.find((x) => x.id === id);
      if (p) todo.push(p);
    }
    const state: { failure: UploadError | null } = { failure: null };
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= todo.length || state.failure) return;
        const p = todo[i]!;
        const res = await upload(new File([p.blob], `${p.id}.jpg`, { type: 'image/jpeg' }));
        if ('path' in res) { paths.current.set(p.id, res.path); out[p.id] = res.path; }
        else state.failure = res.error;
      }
    };
    await Promise.all(Array.from({ length: Math.min(DECODE_CONCURRENCY, todo.length) }, worker));
    return state.failure ? { ok: false, error: state.failure } : { ok: true, paths: out };
  }, [upload]);

  return { photos, pending, skipped, overflow, max, add, remove, clear, setRole, move, ensureUploaded };
}
