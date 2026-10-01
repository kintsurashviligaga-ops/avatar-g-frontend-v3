/**
 * @jest-environment jsdom
 *
 * SceneCanvas — the 3D viewport's promises that do not need a GPU:
 *  · no WebGL → a sentence, and three is never asked to make a renderer;
 *  · models go through GlbViewer's own FramedGlb (one loader, one framing), standing on the floor at unit size;
 *  · ONE BAD MODEL IS CONTAINED: its own ErrorBoundary swaps it for a marker and reports it; the rest still render;
 *  · tap-to-interact on a coarse pointer: the camera is off under a cover until a tap, and "Done" gives it back;
 *  · a click on an object selects it and does not fall through to the canvas's deselect.
 *
 * jsdom has no WebGL, so fiber's Canvas is a plain <div> here and the R3F elements (<group>, <mesh>, …) render as
 * unknown DOM elements — enough to see the tree SceneCanvas builds. React's warnings about those tags are silenced.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SceneObject } from '@/lib/studio/scene3d';

jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

let mockWebgl = true;
jest.mock('./webgl', () => ({ hasWebGL: () => mockWebgl }));

jest.mock('@react-three/fiber', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    // A click that reaches the canvas itself is a miss — fiber calls onPointerMissed for those.
    Canvas: ({ children, onPointerMissed }: { children: ReactNode; onPointerMissed?: () => void }) =>
      createElement('div', { 'data-testid': 'r3f-canvas', onClick: () => onPointerMissed?.() }, children),
  };
});
jest.mock('@react-three/drei', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    OrbitControls: ({ enabled }: { enabled?: boolean }) => createElement('div', { 'data-testid': 'orbit', 'data-enabled': String(enabled) }),
  };
});
// GlbViewer's FramedGlb, standing in for useLoader: a URL containing "broken" throws the way an expired GLB does.
jest.mock('../GlbViewer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    FramedGlb: ({ url, size, anchor }: { url: string; size?: number; anchor?: string }) => {
      if (url.includes('broken')) throw new Error(`Could not load ${url}: 400`);
      return createElement('div', { 'data-testid': 'framed-glb', 'data-url': url, 'data-size': String(size), 'data-anchor': String(anchor) });
    },
  };
});

import SceneCanvas, { COARSE_POINTER_QUERY } from './SceneCanvas';

let coarse = false;
let errorSpy: jest.SpyInstance;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === COARSE_POINTER_QUERY ? coarse : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  mockWebgl = true;
  coarse = false;
  // R3F tags rendered by react-dom ("<group> is unrecognized", "incorrect casing") and the boundary's caught error.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const GLB = 'https://abcd.supabase.co/storage/v1/object/sign/renders/models3d/good.glb?token=t';
const BROKEN = 'https://abcd.supabase.co/storage/v1/object/sign/renders/models3d/broken.glb?token=t';

const cube: SceneObject = { kind: 'shape', shape: 'cube', color: '#cbd5e1', id: 'obj-1', label: '', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
const good: SceneObject = { kind: 'glb', url: GLB, id: 'obj-2', label: 'Jug', position: [1.5, 0, 0], rotation: [0, 0.5, 0], scale: 2 };
const bad: SceneObject = { kind: 'glb', url: BROKEN, id: 'obj-3', label: '', position: [-1.5, 0, 0], rotation: [0, 0, 0], scale: 1 };

const group = (container: HTMLElement, id: string) => container.querySelector(`group[name="${id}"]`);

describe('WebGL check', () => {
  it('without WebGL it says so — and never mounts a canvas', () => {
    mockWebgl = false;
    const { container } = render(<SceneCanvas objects={[cube]} selectedId={null} onSelect={() => {}} locale="en" />);
    expect(screen.getByRole('status').textContent).toMatch(/WebGL is off or unsupported/);
    expect(screen.queryByTestId('r3f-canvas')).toBeNull();
    expect(container.querySelector('[data-scene-viewport="no-webgl"]')).toBeTruthy();
  });
});

describe('objects', () => {
  it("renders shapes and models — a model through GlbViewer's FramedGlb, unit-sized and standing on the floor", () => {
    const { container } = render(<SceneCanvas objects={[cube, good]} selectedId={null} onSelect={() => {}} locale="en" />);
    expect(group(container, 'obj-1')?.querySelector('boxgeometry')).toBeTruthy();
    const model = screen.getByTestId('framed-glb');
    expect(model.getAttribute('data-url')).toBe(GLB);
    expect(model.getAttribute('data-size')).toBe('1');
    expect(model.getAttribute('data-anchor')).toBe('base');
    // The object's own transform is on its group.
    const g = group(container, 'obj-2')!;
    expect(g.getAttribute('position')).toBe('1.5,0,0');
    expect(g.getAttribute('rotation')).toBe('0,0.5,0');
    expect(g.getAttribute('scale')).toBe('2');
  });

  it('a model that fails to load is contained to its own object: a marker, a report, and the rest still render', () => {
    const onObjectError = jest.fn();
    const { container } = render(
      <SceneCanvas objects={[cube, bad, good]} selectedId={null} onSelect={() => {}} onObjectError={onObjectError} locale="en" />,
    );
    expect(onObjectError).toHaveBeenCalledWith('obj-3');
    expect(onObjectError).not.toHaveBeenCalledWith('obj-1');
    expect(onObjectError).not.toHaveBeenCalledWith('obj-2');
    // The broken one is a (warning-coloured, wireframe) marker where it stood…
    const marker = group(container, 'obj-3')!;
    expect(marker.getAttribute('position')).toBe('-1.5,0,0');
    expect(marker.querySelector('meshbasicmaterial')?.getAttribute('color')).toBe('#f59e0b');
    // …and the canvas, the cube and the good model are all still there.
    expect(screen.getByTestId('r3f-canvas')).toBeTruthy();
    expect(group(container, 'obj-1')).toBeTruthy();
    expect(screen.getByTestId('framed-glb').getAttribute('data-url')).toBe(GLB);
  });

  it('marks the selected object with a ring', () => {
    const { container, rerender } = render(<SceneCanvas objects={[cube, good]} selectedId={null} onSelect={() => {}} />);
    expect(container.querySelector('ringgeometry')).toBeNull();
    rerender(<SceneCanvas objects={[cube, good]} selectedId="obj-2" onSelect={() => {}} />);
    expect(group(container, 'obj-2')!.querySelector('ringgeometry')).toBeTruthy();
    expect(group(container, 'obj-1')!.querySelector('ringgeometry')).toBeNull();
  });

  it('a click on an object selects it and stops there; a click on empty space deselects', () => {
    const onSelect = jest.fn();
    const { container } = render(<SceneCanvas objects={[cube, good]} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(group(container, 'obj-1')!);
    expect(onSelect.mock.calls).toEqual([['obj-1']]); // not followed by the canvas's onPointerMissed(null)
    fireEvent.click(screen.getByTestId('r3f-canvas'));
    expect(onSelect.mock.calls).toEqual([['obj-1'], [null]]);
  });
});

describe('tap to interact on a touch screen', () => {
  it('a fine pointer gets the camera at once, with no cover', () => {
    render(<SceneCanvas objects={[cube]} selectedId={null} onSelect={() => {}} locale="en" />);
    expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Tap to move the view' })).toBeNull();
  });

  it('a coarse pointer starts inert under a cover; a tap engages the camera and "Done" hands the gestures back', () => {
    coarse = true;
    const { container } = render(<SceneCanvas objects={[cube]} selectedId={null} onSelect={() => {}} locale="en" />);
    const viewport = container.querySelector('[data-scene-viewport]')!;
    expect(viewport.getAttribute('data-interactive')).toBe('false');
    expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('false');
    const cover = screen.getByRole('button', { name: 'Tap to move the view' });

    act(() => { fireEvent.click(cover); });
    expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('true');
    expect(viewport.getAttribute('data-interactive')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Tap to move the view' })).toBeNull();

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Done' })); });
    expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('false');
    expect(screen.getByRole('button', { name: 'Tap to move the view' })).toBeTruthy();
  });

  it('speaks Georgian by default', () => {
    coarse = true;
    render(<SceneCanvas objects={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'შეეხე ხედის სამართავად' })).toBeTruthy();
  });
});
