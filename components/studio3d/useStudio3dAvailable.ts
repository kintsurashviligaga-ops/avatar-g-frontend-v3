'use client';
/**
 * Is the Google-first 3D Studio (STUDIO_3D_V2) open for this person?
 *   1. NEXT_PUBLIC_STUDIO_3D_V2 (inlined at build) must say 'admin' or 'everyone', else NOTHING is asked and the old 3D
 *      panel renders exactly as before — flag off changes no behaviour, not even a request;
 *   2. then GET /api/studio3d once per page load decides for this person (the server flag + admin check):
 *      200 → yes; 404, 401 or a network miss → no.
 */
import { useEffect, useState } from 'react';

let cached: Promise<boolean> | null = null;
export const __resetStudio3dAvailable = () => { cached = null; };

export function studio3dAvailable(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  if (!cached) cached = fetchImpl('/api/studio3d', { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
  return cached;
}

export function studio3dClientSwitch(v: string | undefined = process.env.NEXT_PUBLIC_STUDIO_3D_V2): boolean {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'admin' || s === 'everyone';
}

/** null while asking. `enabled: false` (another service's panel, or the client switch off) never asks. */
export function useStudio3dAvailable(want: boolean, fetchImpl?: typeof fetch, clientSwitch: boolean = studio3dClientSwitch()): boolean | null {
  const enabled = want && clientSwitch;
  const [on, setOn] = useState<boolean | null>(enabled ? null : false);
  useEffect(() => {
    if (!enabled) { setOn(false); return; }
    let alive = true;
    studio3dAvailable(fetchImpl).then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, [enabled, fetchImpl]);
  return on;
}
