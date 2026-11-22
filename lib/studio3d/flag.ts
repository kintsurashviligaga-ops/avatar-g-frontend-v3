/**
 * lib/studio3d/flag.ts — STUDIO_3D_V2: who sees the Google-first 3D Studio (Phase 8.8).
 *
 * OFF unless set. 'admin' = admins only (the first real test on myavatar.ge), 'everyone' = every signed-in user. Any other
 * value, including '1' or 'true', is OFF: opening a paid feature to everyone must be said in words. Same contract as
 * MUSIC_PRODUCER_V2, IMAGE_ART_DIRECTOR and DIRECTORS_WORKFLOW.
 */
export type Studio3dAudience = 'off' | 'admin' | 'everyone';

export function studio3dAudience(env: Record<string, string | undefined> = process.env): Studio3dAudience {
  const v = (env.STUDIO_3D_V2 ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone' ? v : 'off';
}

export function studio3dAllowed(isAdmin: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const a = studio3dAudience(env);
  return a === 'everyone' || (a === 'admin' && isAdmin);
}
