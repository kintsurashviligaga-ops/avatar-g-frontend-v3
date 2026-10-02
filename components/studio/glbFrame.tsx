/**
 * components/studio/glbFrame.tsx — the GLB viewer's box, shared by the viewer (GlbViewer.tsx: three.js + R3F, a ~245 kB
 * gzip chunk fetched only when a model arrives) and the placeholder its parent shows while that chunk downloads. Same
 * box, so the panel does not jump by the canvas's height when the viewer lands. (Why these heights: GlbViewer.tsx.)
 *
 * ⚠️ A LIGHT MODULE ON PURPOSE. A parent must never value-import anything from GlbViewer.tsx — even a constant would put
 * three.js back into the parent's chunk — so the box and the placeholder live here.
 */
export const GLB_VIEWER_FRAME = 'h-[min(48vh,240px)] w-full overflow-hidden rounded-xl border border-app-border/15 bg-app-elevated/40 sm:h-[420px]';

/** The viewer's box, pulsing until next/dynamic swaps the canvas in. Decorative: the panel's own text says what is coming. */
export function GlbViewerSkeleton() {
  return <div aria-hidden="true" data-testid="glb-viewer-skeleton" className={`${GLB_VIEWER_FRAME} motion-safe:animate-pulse`} />;
}
