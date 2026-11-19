/**
 * lib/image/artDirector/flag.ts — IMAGE_ART_DIRECTOR: who sees the Art Director image pipeline (Phase 8.4).
 *
 * OFF unless set. 'admin' = admins only (the first real test on myavatar.ge), 'everyone' = all signed-in users. Any other
 * value, including '1' or 'true', is OFF: opening a paid multi-image feature to everyone must be said in words.
 * Same contract as DIRECTORS_WORKFLOW (lib/video/directorsWorkflow/flag.ts).
 */
export type ArtAudience = 'off' | 'admin' | 'everyone';

export function artDirectorAudience(env: Record<string, string | undefined> = process.env): ArtAudience {
  const v = (env.IMAGE_ART_DIRECTOR ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone' ? v : 'off';
}

export function artDirectorAllowed(isAdmin: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const a = artDirectorAudience(env);
  return a === 'everyone' || (a === 'admin' && isAdmin);
}
