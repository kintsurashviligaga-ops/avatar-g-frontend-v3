/**
 * lib/research/limits.ts — the platform's brakes on Deep Research, read from the environment at CALL time (like
 * lib/ai/google/models.ts), so changing one needs no deploy of code.
 *
 * ⚠️ EVERY TASK SPENDS THE PLATFORM'S OWN GOOGLE MONEY BEFORE THE USER'S CREDITS COME BACK (a refund pays the user in
 * full, the provider bills us for what ran). So the caps count a job the moment it is `counted` (reserved or running —
 * a job that failed before the debit never was) and the checks run AFTER the row is written, so two concurrent starts
 * can only over-reject, never both slip under a cap.
 *
 *   RESEARCH_ENABLED          opt-out kill switch (default ON — set 0/false/off to close the feature)
 *   RESEARCH_DAILY_CAP        the GLOBAL cap, tasks per UTC day. Default 60. `0` is the kill switch: nothing starts.
 *   RESEARCH_USER_DAILY_CAP   per account per UTC day. Default 4 (max 20).
 *   RESEARCH_MAX_ACTIVE       per account at once. Default 2 (1…3).
 *   RESEARCH_AGENT            the agent id (default lib/research/pricing RESEARCH_AGENT_ID). `…-max-…` ids are refused:
 *                             the Max agent costs $3–7 and this price list does not cover it.
 *
 * Anything that is not a whole number in range falls back to the default — a typo must never unbound the spend.
 */
import { isEnabledByDefault } from '@/lib/env/flag';
import { RESEARCH_AGENT_ID, RESEARCH_MAX_MINUTES } from './pricing';

export interface ResearchLimits {
  enabled: boolean;
  /** Tasks the whole platform may start per UTC day. 0 = closed. */
  globalDaily: number;
  userDaily: number;
  maxActive: number;
  agent: string;
  /** How long a running job may live before it is cancelled and refunded. */
  deadlineMs: number;
}

const DEFAULT_GLOBAL_DAILY = 60;
const MAX_GLOBAL_DAILY = 1_000;
const DEFAULT_USER_DAILY = 4;
const MAX_USER_DAILY = 20;
const DEFAULT_MAX_ACTIVE = 2;
const MAX_MAX_ACTIVE = 3;

type Env = Record<string, string | undefined>;

function wholeNumber(raw: string | undefined, min: number, max: number, fallback: number): number {
  const s = (raw ?? '').trim();
  if (!/^\d{1,6}$/.test(s)) return fallback;
  const n = Number(s);
  return n >= min && n <= max ? n : fallback;
}

/** The agent id: an allowlisted shape, never a Max id, else the default. */
export function resolveResearchAgent(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  return /^deep-research-(?!max)[a-z0-9][a-z0-9.-]{2,60}$/.test(s) ? s : RESEARCH_AGENT_ID;
}

export function researchLimits(env: Env = process.env as Env): ResearchLimits {
  return {
    enabled: isEnabledByDefault(env.RESEARCH_ENABLED),
    globalDaily: wholeNumber(env.RESEARCH_DAILY_CAP, 0, MAX_GLOBAL_DAILY, DEFAULT_GLOBAL_DAILY),
    userDaily: wholeNumber(env.RESEARCH_USER_DAILY_CAP, 1, MAX_USER_DAILY, DEFAULT_USER_DAILY),
    maxActive: wholeNumber(env.RESEARCH_MAX_ACTIVE, 1, MAX_MAX_ACTIVE, DEFAULT_MAX_ACTIVE),
    agent: resolveResearchAgent(env.RESEARCH_AGENT),
    deadlineMs: RESEARCH_MAX_MINUTES * 60_000,
  };
}

/** Midnight UTC of the day `nowMs` falls in, as an ISO string — the window the daily caps count from. */
export function utcDayStart(nowMs: number): string {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
