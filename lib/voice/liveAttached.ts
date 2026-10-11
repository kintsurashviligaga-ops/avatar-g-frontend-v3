/**
 * lib/voice/liveAttached.ts — the user's attached files, as a Live call's ask_agent_g hands them to Agent G.
 *
 * ⚠️ AGENT G NEVER SAW THE USER'S FILES FROM A CALL. ask_agent_g sent the task alone, so „montage the four files I
 * attached" reached Agent G with nothing to cut, while the same words typed send the files' stored paths. The studio
 * registers a reader of what the user attached (the composer's checked uploads, else the newest turn's) and the call's
 * ask carries the same paths. A tiny module on its own, so the studio does not pull in the call's code to register.
 */

/** /api/agent/run takes at most this many file references (lib/agent/media/montageAsk MAX_FILES). */
export const LIVE_AGENT_FILES_MAX = 13;

let reader: () => readonly string[] = () => [];

/** The studio says how to read the user's attached files' stored paths (called on every render; the last one wins). */
export function setLiveAttachedRefs(fn: () => readonly string[]): void {
  reader = fn;
}

/** The stored paths of the user's attached files, in order, at most LIVE_AGENT_FILES_MAX. Never throws. */
export function liveAttachedRefs(): string[] {
  try {
    return reader().filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 2048).slice(0, LIVE_AGENT_FILES_MAX);
  } catch {
    return [];
  }
}
