/** Shared fixtures for the research UI tests. Not shipped: only *.test.ts(x) import it. */
import type { ResearchJobPublic } from '@/lib/research/types';

/**
 * The fixtures' clock: the start of the current minute. It was a fixed 2026-10-02T12:00Z, and the toasts announce only a
 * job settled within TOAST_MAX_AGE_MS (24 h) of the REAL clock — so from 2026-10-03 12:00Z every „finished" fixture was a
 * day old and the store / toast suites failed for everyone. Anchored to now, the fixtures stay fresh.
 */
export const NOW = Math.floor(Date.now() / 60_000) * 60_000;

export function job(over: Partial<ResearchJobPublic> = {}): ResearchJobPublic {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'running',
    prompt: 'How is the electric car market in the Caucasus developing?',
    locale: 'en',
    title: null,
    credits: 120,
    createdAt: new Date(NOW - 3 * 60_000).toISOString(),
    startedAt: new Date(NOW - 3 * 60_000).toISOString(),
    completedAt: null,
    progress: {},
    hasReport: false,
    reportChars: 0,
    sourcesCount: 0,
    incomplete: false,
    errorCode: null,
    refunded: false,
    refundPending: false,
    cancelRequested: false,
    contextFiles: [],
    ...over,
  };
}

export const done = (over: Partial<ResearchJobPublic> = {}): ResearchJobPublic =>
  job({
    status: 'completed',
    hasReport: true,
    reportChars: 4200,
    sourcesCount: 3,
    title: 'EV market in the Caucasus',
    completedAt: new Date(NOW - 60_000).toISOString(),
    ...over,
  });
