/**
 * lib/music/producer/flag.ts — MUSIC_PRODUCER_V2: who sees the Music Producer pipeline (Phase 8.5).
 *
 * OFF unless set. 'admin' = admins only (the first real test on myavatar.ge), 'everyone' = every signed-in user. Any other
 * value, including '1' or 'true', is OFF: opening a paid feature to everyone must be said in words. Same contract as
 * IMAGE_ART_DIRECTOR (lib/image/artDirector/flag.ts) and DIRECTORS_WORKFLOW.
 */
export type ProducerAudience = 'off' | 'admin' | 'everyone';

export function producerAudience(env: Record<string, string | undefined> = process.env): ProducerAudience {
  const v = (env.MUSIC_PRODUCER_V2 ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone' ? v : 'off';
}

export function producerAllowed(isAdmin: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const a = producerAudience(env);
  return a === 'everyone' || (a === 'admin' && isAdmin);
}
