/**
 * lib/agent/run/engineFlags.ts — the Phase 3.5 switches, read on the server. Every one is OFF unless set, a Preview
 * included, so merging the code turns nothing on (GG 2026-11-13: "behind the flags and set to off by default").
 *
 *   AGENT_VALIDATE       off | on                 3.5a: VALIDATE every run plan before its quote is signed
 *   AGENT_ENGINE_MEDIA   off | admins | everyone  3.5b: new media runs are written as v2 runs on lib/agent/engine
 *
 * Turning a flag off again only changes NEW plans and runs: a run already started finishes on what it started on.
 */
export type EngineAudience = 'off' | 'admins' | 'everyone';

const raw = (v: string | undefined) => (v ?? '').trim().toLowerCase();

export function agentValidateOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = raw(env.AGENT_VALIDATE);
  return v === 'on' || v === '1' || v === 'true';
}

export function agentEngineMedia(env: NodeJS.ProcessEnv = process.env): EngineAudience {
  const v = raw(env.AGENT_ENGINE_MEDIA);
  if (v === 'admins' || v === 'admin') return 'admins';
  if (v === 'everyone' || v === 'on' || v === '1' || v === 'true') return 'everyone';
  return 'off';
}

/** Does a new media run for this user go on the engine (v2)? */
export function engineMediaFor(isAdmin: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  const a = agentEngineMedia(env);
  return a === 'everyone' || (a === 'admins' && isAdmin);
}
