'use client';

/**
 * PlanView — a finished interior „3D plan": the orbit-able RoomViewer, the style's palette and a caption saying what it is
 * (the room's layout, not the redesign). Shown under the Interior designer's tile and on the plan's Library card.
 */
import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { NOTE_BASE, NOTE_TONE } from '@/components/studio/ui/tokens';
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';
import type { ShootCopy } from './copy';

// Three.js / R3F is client-only and heavy: it loads when a plan is first shown.
const RoomViewer = dynamic(() => import('@/components/chat/RoomViewer'), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full rounded-2xl bg-app-elevated/40" aria-hidden="true" />,
});

/**
 * ⚠️ A DEVICE WITHOUT WEBGL MUST NOT TAKE THE STUDIO DOWN. three.js throws „Error creating WebGL context" when the browser has no
 * GPU context to give (older phones, some embedded browsers, a headless test) and React unmounts the nearest page up the tree.
 * The viewer is optional garnish on a plan that is already computed, so a failure here shows the layout in numbers instead.
 */
class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* the fallback below is the whole handling */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PlanView({ geometry, style, copy }: { geometry: RoomGeometry; style: StyleGuide; copy: ShootCopy }) {
  return (
    <figure data-testid="plan-ready" className="space-y-2">
      <ViewerBoundary fallback={(
        <p data-testid="plan-fallback" className={`${NOTE_BASE} ${NOTE_TONE.info}`}>
          {copy.plan3dNoWebgl} {copy.planFacts(
            geometry.floor.widthM, geometry.floor.depthM, geometry.wallHeightM,
            geometry.openings.filter((o) => o.type === 'window').length, geometry.openings.filter((o) => o.type === 'door').length,
          )}
        </p>
      )}>
        <RoomViewer geometry={geometry} style={style} />
      </ViewerBoundary>
      <figcaption className="flex flex-wrap items-center gap-2 text-[12.5px] leading-snug text-app-muted">
        <span className="flex gap-1" aria-hidden="true">
          {style.palette.slice(0, 5).map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: c }} />)}
        </span>
        <span>{style.styleName} — {copy.plan3dCaption}</span>
      </figcaption>
    </figure>
  );
}
