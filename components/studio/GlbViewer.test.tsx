/**
 * @jest-environment jsdom
 *
 * GlbViewer — the 3D tool's model preview, on a phone and for a screen reader:
 *  · the picture is named (a bare <canvas> says nothing), in the studio's languages;
 *  · on a touch screen the camera starts OFF under a "tap to turn" cover, so a finger can scroll the panel past it;
 *    a tap hands the gestures to the camera and "Done" hands them back (as the 3D scene's own view);
 *  · with a mouse there is no cover — the camera is live at once.
 * three.js does not run here: fiber's Canvas is a plain <div>, the model load suspends, drei's OrbitControls reports
 * whether it is enabled.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {} }));
jest.mock('@react-three/fiber', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    Canvas: ({ children }: { children: ReactNode }) => createElement('div', { 'data-testid': 'r3f-canvas' }, children),
    useLoader: () => { throw new Promise(() => {}); }, // the model is "still downloading": Suspense holds
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

import GlbViewer from './GlbViewer';

let coarse = false;
let errorSpy: jest.SpyInstance;
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
});
beforeEach(() => {
  coarse = false;
  // react-dom does not know R3F's lowercase tags (<ambientLight> …) — expected noise here.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const URL = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=t';

it.each([
  ['en', '3D model preview'],
  ['ka', '3D მოდელის გადახედვა'],
  ['ru', 'Просмотр 3D-модели'],
] as const)('names the picture for assistive tech (%s)', (locale, name) => {
  render(<GlbViewer url={URL} locale={locale} />);
  expect(screen.getByRole('img', { name })).toBeTruthy();
});

it('with a mouse the camera is live at once — no cover', () => {
  render(<GlbViewer url={URL} locale="en" />);
  expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('true');
  expect(screen.queryByRole('button')).toBeNull();
});

it('on a touch screen the camera waits under a cover; a tap engages it and Done gives the scroll back', () => {
  coarse = true;
  render(<GlbViewer url={URL} locale="en" />);
  expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('false');
  const cover = screen.getByRole('button', { name: 'Tap to turn the model' });
  act(() => { fireEvent.click(cover); });
  expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('true');
  const done = screen.getByRole('button', { name: 'Done' });
  expect(done.className).toContain('h-11'); // a 44 px target
  act(() => { fireEvent.click(done); });
  expect(screen.getByTestId('orbit').getAttribute('data-enabled')).toBe('false');
  expect(screen.getByRole('button', { name: 'Tap to turn the model' })).toBeTruthy();
});
