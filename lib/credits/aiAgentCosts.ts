/**
 * Credit cost per /api/ai agent — the ONE place the route charges from and the service pages print from.
 *
 * Final P0/P1 repair run: /{lang}/services/software posts to /api/orbit/code-generation, which proxies /api/ai as the
 * `copy` agent and debits 3 credits — while its button said nothing about a price (docs/DESIGN.md §7: the button
 * carries the number the route charges). The table used to live inside app/api/ai/route.ts, where nothing else could
 * read it; it lives here now so the page and the route cannot disagree.
 */
export type AiAgentType = 'avatar' | 'image' | 'video' | 'music' | 'copy';

export const AI_AGENT_COSTS: Readonly<Record<AiAgentType, number>> = {
  avatar: 10,
  image: 5,
  video: 15,
  music: 8,
  copy: 3,
};
