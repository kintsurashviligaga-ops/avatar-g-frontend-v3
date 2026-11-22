/**
 * @jest-environment jsdom
 *
 * The 3D Studio viewer's controls, with three.js mocked away (fiber's Canvas is a <div>, FramedGlb reports what it was
 * asked to draw, OrbitControls reports its switches): wireframe, spin, pan, reset, light preset, full screen with the
 * iPhone overlay fallback, the tap-to-rotate cover on touch screens, the stats line, and the labels in ka / en / ru.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('@react-three/fiber', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    Canvas: ({ children, ...p }: { children: ReactNode; 'data-reset'?: number }) => createElement('div', { 'data-testid': 'canvas', 'data-reset': p['data-reset'] }, children),
  };
});
jest.mock('@react-three/drei', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    OrbitControls: (p: { enabled?: boolean; autoRotate?: boolean; enablePan?: boolean }) =>
      createElement('div', { 'data-testid': 'orbit', 'data-enabled': String(p.enabled), 'data-spin': String(p.autoRotate), 'data-pan': String(p.enablePan) }),
  };
});
jest.mock('../studio/GlbViewer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  return {
    __esModule: true,
    FramedGlb: ({ url, wireframe, onStats }: { url: string; wireframe?: boolean; onStats?: (s: { triangles: number; vertices: number }) => void }) => {
      React.useEffect(() => onStats?.({ triangles: 48_200, vertices: 25_000 }), [onStats]);
      return React.createElement('div', { 'data-testid': 'glb', 'data-url': url, 'data-wireframe': String(wireframe) });
    },
  };
});

import Studio3dViewer from './Studio3dViewer';

let coarse = false;
let errorSpy: jest.SpyInstance;
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: q === '(pointer: coarse)' ? coarse : false, media: q, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});
beforeEach(() => {
  coarse = false;
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // R3F lowercase tags in react-dom
});
afterEach(() => {
  errorSpy.mockRestore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (HTMLElement.prototype as any).requestFullscreen;
});

const URL = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/studio3d/u/j/model.glb?token=t';

it('draws the model with pan + spin on, and shows the face count', () => {
  render(<Studio3dViewer url={URL} locale="en" />);
  expect(screen.getByTestId('glb').dataset.url).toBe(URL);
  expect(screen.getByTestId('orbit').dataset).toMatchObject({ enabled: 'true', spin: 'true', pan: 'true' });
  expect(screen.getByText('48.2k faces')).toBeTruthy();
  expect(screen.getByRole('img', { name: '3D Studio' })).toBeTruthy();
});

it('wireframe and spin toggle, reset remounts the camera', () => {
  render(<Studio3dViewer url={URL} locale="en" />);
  const wire = screen.getByRole('button', { name: 'Wireframe' });
  expect(wire.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(wire);
  expect(wire.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByTestId('glb').dataset.wireframe).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }));
  expect(screen.getByTestId('orbit').dataset.spin).toBe('false');
  expect(screen.getByTestId('canvas').dataset.reset).toBe('0');
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
  expect(screen.getByTestId('canvas').dataset.reset).toBe('1');
});

it('light preset changes', () => {
  render(<Studio3dViewer url={URL} locale="en" />);
  const sel = screen.getByRole('combobox', { name: 'Light' }) as HTMLSelectElement;
  fireEvent.change(sel, { target: { value: 'dramatic' } });
  expect(sel.value).toBe('dramatic');
});

it('full screen: uses the Fullscreen API when there is one', async () => {
  const req = jest.fn(async function (this: HTMLElement) {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).requestFullscreen = req;
  const { container } = render(<Studio3dViewer url={URL} locale="en" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Full screen' })); });
  expect(req).toHaveBeenCalled();
  expect((container.firstChild as HTMLElement).dataset.fullscreen).toBe('native');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

it('full screen: falls back to a fixed overlay on iPhone (no API), Esc closes it', async () => {
  const { container } = render(<Studio3dViewer url={URL} locale="ka" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'სრული ეკრანი' })); });
  const box = container.firstChild as HTMLElement;
  expect(box.dataset.fullscreen).toBe('overlay');
  expect(box.className).toContain('fixed inset-0');
  expect(document.body.style.overflow).toBe('hidden');
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(box.dataset.fullscreen).toBe('off');
  expect(document.body.style.overflow).toBe('');
});

it('touch screen: camera starts inert under a cover; a tap hands it the gestures', () => {
  coarse = true;
  render(<Studio3dViewer url={URL} locale="ru" />);
  expect(screen.getByTestId('orbit').dataset.enabled).toBe('false');
  expect(screen.queryByRole('toolbar')).toBeNull();
  fireEvent.click(screen.getByText('Коснитесь, чтобы вращать'));
  expect(screen.getByTestId('orbit').dataset.enabled).toBe('true');
  expect(screen.getByRole('button', { name: 'Сетка' })).toBeTruthy();
});
