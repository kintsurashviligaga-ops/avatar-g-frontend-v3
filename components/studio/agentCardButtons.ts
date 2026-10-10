import { useEffect, useState } from 'react';

/** The Agent G cards' two button looks (AgentMontageCard, AgentAudioCard): the step's main action, and a quiet one. */
export const primaryBtn = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[13px] font-semibold text-app-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg';
export const quietBtn = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-border/30 px-4 py-2 text-[13px] font-medium text-app-text transition-colors hover:bg-app-border/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-60';

/**
 * How long Stop stays inert after Start. Stop appears where Start was, so the second tap of a double-tapped Start landed
 * on it and stopped the job it had just started (the edit card's browser test, 2026-10-10).
 */
export const STOP_ARM_MS = 700;

/**
 * False until STOP_ARM_MS after `t0` (when the run started), then true. No t0: armed. Read from the clock on every
 * render, so the very render that swaps Start for Stop already has it disarmed (a state set in an effect left Stop live
 * for one frame); the timer only asks for the render that arms it.
 */
export function useStopArmed(t0: number | undefined): boolean {
  const [, setTick] = useState(0);
  const armed = typeof t0 !== 'number' || Date.now() - t0 >= STOP_ARM_MS;
  useEffect(() => {
    if (typeof t0 !== 'number') return undefined;
    const left = t0 + STOP_ARM_MS - Date.now();
    if (left <= 0) return undefined;
    const id = setTimeout(() => setTick((n) => n + 1), left + 1);
    return () => clearTimeout(id);
  }, [t0]);
  return armed;
}
