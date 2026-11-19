'use client';

/**
 * The clip and edit cards' wait: a percent, the step it is on, and the time since Create (GG 2026-10-26 08:27Z: „არც
 * პროცენტის ნიშანი ეწერა ქარდზე რომ პროგრესი მენახა").
 *
 * ⚠️ THE NUMBER IS THE JOB'S OWN MILESTONES, NEVER THE CLOCK (MASTER TASK v3.1 §3.3: "server progress or a documented
 * milestone calculation"; components/studio/measuredPercent.test). Veo and Omni report no percent of their own, so it moves
 * at the steps the server reports (CLIP_STEP_PCT): 10 once Google has the order, 90 once Google has rendered it (the
 * status route says `delivering`: the Georgian line is being laid on, or the clip saved), 100 only as the video itself,
 * which replaces the card. The seconds beside it are measured, not a guess of what is left, so a render that sits at 10
 * for a minute still reads as alive.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fmtClock, useRisingPct } from '@/components/studio/ui/GenerationProgress';

/** Where a running clip or edit is: Google is rendering it, or Google rendered it and it is being finished for the chat. */
export type ClipStep = 'rendering' | 'finishing';

/** The documented milestone for each step (§3.3). 100 is never shown here: the delivered video replaces the card. */
export const CLIP_STEP_PCT: Record<ClipStep, number> = { rendering: 10, finishing: 90 };

/** The step a status poll reports: `delivering` means Google's part is done (lib/genjutsu/veoScene SceneProgress). */
export function clipStepFromState(state: unknown): ClipStep {
  return state === 'delivering' ? 'finishing' : 'rendering';
}

export function ClipProgress({ step, label, since, testId }: { step: ClipStep; label: string; since?: number; testId: string }) {
  const shown = useRisingPct(CLIP_STEP_PCT[step]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  const clock = since ? fmtClock(Math.max(0, Math.floor((now - since) / 1000))) : null;
  // The card's own panel, in the card's flow: nothing floats over the chat (the Renders tray leaves this job to the card).
  return (
    <div
      data-testid={testId}
      data-step={step}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={`${shown}% · ${label}`}
      className="rounded-2xl bg-app-elevated/70 px-3.5 py-2.5"
    >
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="shrink-0 animate-spin text-app-accent" aria-hidden="true" />
        <span data-testid={`${testId}-pct`} className="text-[20px] font-bold leading-none tabular-nums text-app-text">
          {shown}<span className="text-[13px] font-semibold text-app-muted">%</span>
        </span>
        {clock && <span data-testid={`${testId}-clock`} className="ml-auto text-[12px] tabular-nums text-app-muted">{clock}</span>}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-app-muted">{label}</p>
    </div>
  );
}
