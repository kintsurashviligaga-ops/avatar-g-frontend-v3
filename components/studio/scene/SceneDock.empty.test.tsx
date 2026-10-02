/**
 * @jest-environment jsdom
 *
 * SceneDock — the EMPTY scene (every object removed) is not a dead end: an icon, the one line, and one next step,
 * "Describe a model", which puts the caret in the studio composer (where "a 3D model of …" opens the 3D tool filled).
 * On a phone the scene is a sheet over the composer: it closes first, and the composer is focused once it has gone.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('next/dynamic', () => () => function MockSceneCanvas() {
  return <div data-testid="scene-canvas" />;
});

import { SCENE_ACTION_EVENT } from '@/lib/studio/scene3d';
import { resetArtifactStore } from '@/components/chat/artifacts/artifactStore';
import { SCENE_DESKTOP_QUERY, SceneDock } from './SceneDock';
import { resetSceneStore, useSceneStore } from './sceneStore';

let desktop = true;
let warnSpy: jest.SpyInstance;
afterEach(() => warnSpy.mockRestore());
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === SCENE_DESKTOP_QUERY ? desktop : /prefers-reduced-motion/.test(query),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
});
beforeEach(() => {
  desktop = true;
  resetSceneStore();
  resetArtifactStore();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); // framer's reduced-motion notice
});

function Studio() {
  return (
    <>
      <div data-tour="composer"><textarea aria-label="prompt" /></div>
      <SceneDock locale="en" />
    </>
  );
}

function openWithACubeThenEmpty() {
  act(() => { window.dispatchEvent(new CustomEvent(SCENE_ACTION_EVENT, { detail: { type: 'place_object', shape: 'cube' }, cancelable: true })); });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Remove' })); });
}

it('an emptied scene shows the empty state with one next step', () => {
  render(<Studio />);
  openWithACubeThenEmpty();
  const empty = screen.getByTestId('scene-empty');
  expect(empty.textContent).toContain('The scene is empty.');
  expect(screen.getByRole('button', { name: 'Describe a model' })).toBeTruthy();
});

it('on a desktop "Describe a model" focuses the composer beside the panel, which stays open', () => {
  render(<Studio />);
  openWithACubeThenEmpty();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Describe a model' })); });
  expect(document.activeElement).toBe(screen.getByLabelText('prompt'));
  expect(useSceneStore.getState().open).toBe(true);
});

it('on a phone it closes the sheet first, then focuses the composer', async () => {
  desktop = false;
  render(<Studio />);
  openWithACubeThenEmpty();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Describe a model' })); });
  expect(useSceneStore.getState().open).toBe(false);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('prompt')), { timeout: 2000 });
});

it.each([
  ['ka', 'აღწერე მოდელი'],
  ['ru', 'Опишите модель'],
] as const)('speaks %s', (locale, label) => {
  render(<SceneDock locale={locale} />);
  act(() => { window.dispatchEvent(new CustomEvent(SCENE_ACTION_EVENT, { detail: { type: 'open_scene' }, cancelable: true })); });
  expect(screen.getByRole('button', { name: label })).toBeTruthy();
});
