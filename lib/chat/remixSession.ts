/**
 * lib/chat/remixSession.ts
 * ========================
 * Multi-turn memory for the Gemini Remix (Unified Master Prompt §6.5). Edits are
 * CUMULATIVE: "make scene 3 darker" then "…and add rain to it" compose into one
 * scene-3 re-render, and a later dialogue note on the same scene escalates it to
 * a full regen. The accumulated `RemixPlan` is always re-derived from the full
 * turn history, so the executor only ever needs the latest session snapshot.
 *
 * Pure reducer: callers pass `at` (a timestamp) so this stays Date-free and
 * unit-testable; the server-side store that holds sessions across requests lives
 * in `geminiRemixAgent.ts`.
 */

import { buildRemixPlan, type RemixPlan, type RemixSceneEdit } from './remixPlanner';

export interface RemixTurn {
  request: string;
  edits: RemixSceneEdit[];
  at: number;
}

export interface RemixSession {
  sessionId: string;
  sceneCount: number;
  turns: RemixTurn[];
  /** Plan accumulated across EVERY turn so far. */
  plan: RemixPlan;
}

export function startRemixSession(sessionId: string, sceneCount: number): RemixSession {
  return { sessionId, sceneCount, turns: [], plan: buildRemixPlan(sceneCount, []) };
}

/**
 * Fold a new edit turn into the session, re-deriving the cumulative plan from
 * the complete turn history. Returns a new session (never mutates the input).
 */
export function addRemixTurn(
  session: RemixSession,
  request: string,
  edits: RemixSceneEdit[],
  at: number,
): RemixSession {
  const turns = [...session.turns, { request, edits, at }];
  const allEdits = turns.flatMap((t) => t.edits);
  return {
    ...session,
    turns,
    plan: buildRemixPlan(session.sceneCount, allEdits),
  };
}

/** Gemini conversation history (its own `history` shape) reconstructed from turns. */
export function toGeminiHistory(session: RemixSession): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const turn of session.turns) {
    history.push({ role: 'user', parts: [{ text: turn.request }] });
    history.push({
      role: 'model',
      parts: [{ text: JSON.stringify({ edits: turn.edits.map((e) => ({ ordinal: e.ordinal, kind: e.kind })) }) }],
    });
  }
  return history;
}
