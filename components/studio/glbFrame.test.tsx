/**
 * @jest-environment jsdom
 *
 * The GLB viewer's loading state: three.js + R3F is a ~245 kB (gzip) chunk fetched only when a model arrives, so the
 * 3D panel shows a placeholder meanwhile — in the viewer's OWN box (components/studio/glbFrame.tsx), or the panel would
 * jump by the canvas's height when the chunk lands.
 *  · the placeholder and the viewer render the same box;
 *  · ServiceParamsPanel's next/dynamic import of the viewer is ssr: false and HAS that placeholder (it had none).
 * jsdom has no WebGL: fiber's Canvas is a plain <div>, and three's loader is a stub — only the box is under test.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('@react-three/fiber', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return { __esModule: true, Canvas: (_: { children?: ReactNode }) => createElement('div', { 'data-testid': 'r3f-canvas' }), useLoader: jest.fn() };
});
jest.mock('@react-three/drei', () => ({ __esModule: true, OrbitControls: () => null }));
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ __esModule: true, GLTFLoader: class {} }));
jest.mock('three', () => ({ __esModule: true, Box3: class {} }));

// Records every next/dynamic call ServiceParamsPanel makes at import time (its only one is the viewer).
const mockDynamicCalls: Array<{ loader: () => Promise<unknown>; opts: { ssr?: boolean; loading?: () => ReactNode } }> = [];
jest.mock('next/dynamic', () => (loader: () => Promise<unknown>, opts: { ssr?: boolean; loading?: () => ReactNode }) => {
  mockDynamicCalls.push({ loader, opts });
  return function MockDynamic() { return null; };
});

import { GLB_VIEWER_FRAME, GlbViewerSkeleton } from './glbFrame';
import GlbViewer from './GlbViewer';

test('the placeholder and the viewer are the same box; the placeholder only adds a pulse and hides from assistive tech', () => {
  const viewer = render(<GlbViewer url="https://x.supabase.co/storage/v1/object/sign/renders/m.glb?token=t" />).container.firstElementChild!;
  expect(viewer.className).toBe(GLB_VIEWER_FRAME);
  const skeleton = render(<GlbViewerSkeleton />).getByTestId('glb-viewer-skeleton');
  expect(skeleton.className).toBe(`${GLB_VIEWER_FRAME} motion-safe:animate-pulse`);
  expect(skeleton.getAttribute('aria-hidden')).toBe('true');
  // The phone and desktop heights both come along (a fixed 420 px trapped touch scrolling on a phone — GlbViewer.tsx).
  expect(GLB_VIEWER_FRAME).toContain('h-[min(48vh,240px)]');
  expect(GLB_VIEWER_FRAME).toContain('sm:h-[420px]');
});

test('ServiceParamsPanel loads the viewer client-only, showing that placeholder until the three.js chunk arrives', async () => {
  // Required here, not imported: its module-scope dynamic() call must find the recorder above already initialised.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./ServiceParamsPanel');
  expect(mockDynamicCalls).toHaveLength(1);
  const { loader, opts } = mockDynamicCalls[0]!;
  expect(opts.ssr).toBe(false);
  expect(typeof opts.loading).toBe('function');
  const placeholder = render(<>{opts.loading!()}</>).getByTestId('glb-viewer-skeleton');
  expect(placeholder.className).toContain(GLB_VIEWER_FRAME);
  // …and the import really is the viewer.
  const mod = (await loader()) as { default: unknown };
  expect(mod.default).toBe(GlbViewer);
});
