/**
 * lib/avatar/studio/flag.ts — AVATAR_STUDIO_V2: who sees the Virtual Studio avatar pipeline (Phase 8.6).
 *
 * OFF unless set. 'admin' = admins only (the first real test on myavatar.ge), 'everyone' = every signed-in user. Any
 * other value, including '1' or 'true', is OFF: opening a paid multi-scene feature to everyone must be said in words.
 * Same contract as DIRECTORS_WORKFLOW, IMAGE_ART_DIRECTOR and MUSIC_PRODUCER_V2.
 */
export type StudioAudience = 'off' | 'admin' | 'everyone';

export function studioAudience(env: Record<string, string | undefined> = process.env): StudioAudience {
  const v = (env.AVATAR_STUDIO_V2 ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone' ? v : 'off';
}

export function studioAllowed(isAdmin: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const a = studioAudience(env);
  return a === 'everyone' || (a === 'admin' && isAdmin);
}

/**
 * The chat's Agent G hook (a presentation asked in the chat): the browser only knows NEXT_PUBLIC_AVATAR_STUDIO_V2, so it
 * shows the card when that says 'admin' or 'everyone'; the server's AVATAR_STUDIO_V2 still decides per user (404).
 */
export function studioChatClientOn(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone';
}
