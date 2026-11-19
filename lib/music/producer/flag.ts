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

/**
 * The CLIENT switch for the chat (NEXT_PUBLIC_MUSIC_PRODUCER_V2, read literally so Next inlines it): 'admin' or 'everyone'
 * lets the chat show Agent G's music plan card. The server's MUSIC_PRODUCER_V2 still decides per user; turn both on together.
 */
export const producerChatClientOn = (value: string | undefined): boolean => {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone';
};

/** A line the chat hands to the Music Producer: in the Music tool any music ask; elsewhere only one that names a video. */
export function producerChatTakes(text: string, mode: string, ask: { target: unknown } | null): boolean {
  if (!text.trim() || !ask) return false;
  return mode === 'music' || ask.target != null;
}
