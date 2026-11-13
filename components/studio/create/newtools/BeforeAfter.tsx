'use client';

/**
 * BeforeAfter — the uploaded room and its redesign, one over the other, with a divider the user drags (Phase 7.6 I3, behind
 * NEXT_PUBLIC_INTERIOR_UX_V2). Pure client: both pictures are already on the page; nothing is fetched or charged.
 *
 * The divider is a real range input (keyboard: ← → move it, Home/End jump), so it works without a pointer and a screen
 * reader says where it is. The "after" picture is clipped from the left by the same percentage.
 */
import { useId, useState } from 'react';

export function BeforeAfter({ before, after, labels, testId = 'before-after' }: {
  before: string; after: string;
  labels: { before: string; after: string; compare: string };
  testId?: string;
}) {
  const [pct, setPct] = useState(50);
  const id = useId();
  return (
    <figure data-testid={testId} className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-app-border/15">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt={labels.before} className="block h-auto w-full select-none" draggable={false} />
      <div aria-hidden="true" className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pct}%)` }} data-testid={`${testId}-after`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt="" className="h-full w-full select-none object-cover" draggable={false} />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: `${pct}%` }} />
      <span aria-hidden="true" className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{labels.before}</span>
      <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{labels.after}</span>
      <label htmlFor={id} className="sr-only">{labels.compare}</label>
      <input
        id={id} type="range" min={0} max={100} step={1} value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        aria-valuetext={`${labels.before} ${pct}% · ${labels.after} ${100 - pct}%`}
        data-testid={`${testId}-range`}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 focus-visible:opacity-100"
      />
    </figure>
  );
}
