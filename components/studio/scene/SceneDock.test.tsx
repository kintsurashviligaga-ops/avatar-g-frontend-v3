/**
 * @jest-environment jsdom
 *
 * SceneDock — the always-mounted half of the 3D scene: the `myavatar:scene-action` listener, the panel / sheet, the
 * object list and the buttons that move things. The 3D view (SceneCanvas, three.js) is next/dynamic and is replaced
 * by a stub that shows what it was given and can report a broken model.
 *
 * ⚠️ WHAT THESE PIN — the Browser-pane check of docs/SUPER_APP_PLAN.md Wave 3b, without a browser:
 *  · dispatching a cube place_object opens the scene, with preventDefault() as the receipt;
 *  · a hostile event (a non-Supabase URL, a NaN position, 100 objects) is ignored WITH A WARNING and no receipt;
 *  · the 25th object is refused the same way;
 *  · the code canvas and the scene are never open together.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SceneCanvasProps } from './SceneCanvas';

jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('next/dynamic', () => () => function MockSceneCanvas({ objects, selectedId, onObjectError }: SceneCanvasProps) {
  return (
    <div data-testid="scene-canvas" data-count={objects.length} data-selected={selectedId ?? ''}>
      <button type="button" data-testid="break-first" onClick={() => objects[0] && onObjectError?.(objects[0].id)}>break</button>
    </div>
  );
});

import { SCENE_ACTION_EVENT, SCENE_MAX_OBJECTS } from '@/lib/studio/scene3d';
import { resetArtifactStore, useArtifactStore } from '@/components/chat/artifacts/artifactStore';
import { SCENE_DESKTOP_QUERY, SCENE_NUDGE_M, SCENE_SCALE_STEP, SCENE_TURN_RAD, SceneDock } from './SceneDock';
import { resetSceneStore, useSceneStore } from './sceneStore';

const GLB = 'https://abcd1234.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=t';

let desktop = true;
let warnSpy: jest.SpyInstance;

beforeAll(() => {
  // Reduced motion on: every transition is 0 s, so AnimatePresence exits settle without real time.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === SCENE_DESKTOP_QUERY ? desktop : /prefers-reduced-motion/.test(query),
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
  desktop = true;
  resetSceneStore();
  resetArtifactStore();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

/** Dispatches like a producer does; returns whether the scene gave its receipt. */
function send(detail: unknown): boolean {
  let received = false;
  act(() => {
    const ev = new CustomEvent(SCENE_ACTION_EVENT, { detail, cancelable: true });
    window.dispatchEvent(ev);
    received = ev.defaultPrevented;
  });
  return received;
}
const sceneWarnings = () => warnSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('[scene]'));

describe('mounting', () => {
  it('renders nothing until a scene opens, and registers itself as a host while mounted', () => {
    const { container, unmount } = render(<SceneDock locale="en" />);
    expect(container.innerHTML).toBe('');
    expect(useSceneStore.getState().hosts).toBe(1);
    unmount();
    expect(useSceneStore.getState().hosts).toBe(0);
  });
});

describe('the myavatar:scene-action contract', () => {
  it('a cube place_object opens the desktop panel, lists the cube and gives the receipt', () => {
    const { container } = render(<SceneDock locale="en" />);
    expect(send({ type: 'place_object', shape: 'cube' })).toBe(true);
    const aside = container.querySelector('aside[data-scene-dock="desktop"]') as HTMLElement;
    expect(aside).toBeTruthy();
    expect(aside.className).toContain('w-[45%]');
    expect(within(aside).getByRole('heading', { name: '3D scene' })).toBeTruthy();
    expect(within(aside).getByText('1 of 24 objects')).toBeTruthy();
    expect(within(aside).getByRole('button', { name: 'Cube 1', pressed: true })).toBeTruthy();
    expect(screen.getByTestId('scene-canvas').getAttribute('data-count')).toBe('1');
    expect(sceneWarnings()).toEqual([]);
  });

  it.each([
    ['a non-Supabase URL', { type: 'place_object', url: 'https://evil.example/model.glb' }, 'bad_url'],
    ['a NaN position', { type: 'place_object', shape: 'cube', position: [Number.NaN, 0, 0] }, 'bad_position'],
    ['100 objects', { type: 'set_scene', objects: Array.from({ length: 100 }, () => ({ shape: 'cube' })) }, 'too_many_objects'],
    ['not an object', 'place_object', 'not_an_object'],
  ])('a hostile event (%s) is ignored with a warning and no receipt', (_name, detail, reason) => {
    const { container } = render(<SceneDock locale="en" />);
    expect(send(detail)).toBe(false);
    expect(sceneWarnings()).toEqual([`[scene] ${SCENE_ACTION_EVENT} ignored: ${reason}`]);
    expect(container.innerHTML).toBe('');
    expect(useSceneStore.getState().objects).toEqual([]);
  });

  it(`the ${SCENE_MAX_OBJECTS + 1}th object is refused with a warning and no receipt`, () => {
    render(<SceneDock locale="en" />);
    for (let i = 0; i < SCENE_MAX_OBJECTS; i++) expect(send({ type: 'place_object', shape: 'sphere' })).toBe(true);
    expect(send({ type: 'place_object', url: GLB })).toBe(false);
    expect(sceneWarnings()).toEqual([`[scene] ${SCENE_ACTION_EVENT} refused: scene_full`]);
    expect(useSceneStore.getState().objects).toHaveLength(SCENE_MAX_OBJECTS);
    expect(screen.getByText('24 of 24 objects')).toBeTruthy();
  });

  it('an action another scene already took (defaultPrevented) is not applied twice', () => {
    render(<SceneDock locale="en" />);
    const first = (e: Event) => e.preventDefault();
    window.addEventListener(SCENE_ACTION_EVENT, first, { capture: true });
    try {
      send({ type: 'place_object', shape: 'cube' });
    } finally {
      window.removeEventListener(SCENE_ACTION_EVENT, first, { capture: true });
    }
    expect(useSceneStore.getState().objects).toEqual([]);
  });
});

describe('moving things with the buttons', () => {
  function placeCube() {
    render(<SceneDock locale="en" />);
    send({ type: 'place_object', shape: 'cube', label: 'Box' });
    return () => useSceneStore.getState().objects.find((o) => o.label === 'Box')!;
  }
  const press = (name: string) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });

  it('nudges, raises, turns, resizes — through the reducer, so the bounds hold', () => {
    const box = placeCube();
    press('Move right');
    press('Raise');
    press('Move back');
    expect(box().position).toEqual([SCENE_NUDGE_M, SCENE_NUDGE_M, -SCENE_NUDGE_M]);
    press('Turn left');
    expect(box().rotation[1]).toBeCloseTo(SCENE_TURN_RAD, 12);
    press('Bigger');
    expect(box().scale).toBeCloseTo(SCENE_SCALE_STEP, 12);
    press('Smaller');
    press('Smaller');
    expect(box().scale).toBeCloseTo(1 / SCENE_SCALE_STEP, 12);
  });

  it('disables a move at the edge of the floor', () => {
    const box = placeCube();
    act(() => { useSceneStore.getState().apply({ type: 'update_object', id: box().id, position: [10, 0, 0] }); });
    expect((screen.getByRole('button', { name: 'Move right' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move left' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('duplicates beside the original and removes', () => {
    const box = placeCube();
    press('Duplicate');
    const objects = useSceneStore.getState().objects;
    expect(objects).toHaveLength(2);
    expect(objects[1]).toMatchObject({ kind: 'shape', shape: 'cube', label: 'Box', position: [1, 0, 0] });
    expect(useSceneStore.getState().selectedId).toBe(objects[1]!.id);
    press('Remove');
    expect(useSceneStore.getState().objects.map((o) => o.id)).toEqual([box().id]);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull(); // nothing selected, no inspector
  });

  it('the list selects and deselects', () => {
    placeCube();
    const chip = screen.getByRole('button', { name: 'Box', pressed: true });
    act(() => { fireEvent.click(chip); });
    expect(useSceneStore.getState().selectedId).toBeNull();
    expect(screen.getByRole('button', { name: 'Box', pressed: false })).toBeTruthy();
  });

  it('a model that failed to load is marked in the list and explained', () => {
    render(<SceneDock locale="en" />);
    send({ type: 'place_object', url: GLB });
    act(() => { fireEvent.click(screen.getByTestId('break-first')); });
    expect(screen.getByLabelText('Could not load')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Could not load — remove it and add the model again.');
  });
});

describe('closing', () => {
  // The exit animation is 0 s under reduced motion, but AnimatePresence still unmounts on the next frame.
  it('the close button and Escape close the desktop panel; the objects stay for next time', async () => {
    const { container } = render(<SceneDock locale="en" />);
    send({ type: 'place_object', shape: 'cube' });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
    expect(useSceneStore.getState().open).toBe(false);
    await waitFor(() => expect(container.querySelector('[data-scene-dock]')).toBeNull());
    expect(useSceneStore.getState().objects).toHaveLength(1);
    send({ type: 'open_scene' });
    act(() => { fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' }); });
    expect(useSceneStore.getState().open).toBe(false);
    await waitFor(() => expect(container.querySelector('[data-scene-dock]')).toBeNull());
  });

  it('on a phone it is a modal bottom sheet that closes on Escape and on the backdrop', async () => {
    desktop = false;
    const { container } = render(<SceneDock locale="en" />);
    send({ type: 'place_object', shape: 'cube' });
    const sheet = screen.getByRole('dialog', { name: '3D scene' });
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(useSceneStore.getState().open).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    send({ type: 'open_scene' });
    act(() => { fireEvent.click(document.querySelector('[data-scene-dock="phone"] > [aria-hidden="true"]')!); });
    expect(useSceneStore.getState().open).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(container.innerHTML).toBe('');
  });

  it('the phone sheet is the newest layer — portaled to <body>, so it opens OVER the settings sheet that holds its button', () => {
    desktop = false;
    // The studio's settings sheet: the same z-[95] layer, rendered after the scene in OmniStudio's tree.
    const { container } = render(
      <div>
        <SceneDock locale="en" />
        <div data-testid="settings-sheet" className="fixed inset-0 z-[95]" />
      </div>,
    );
    send({ type: 'place_object', shape: 'cube' });
    const phone = document.querySelector('[data-scene-dock="phone"]')!;
    expect(container.contains(phone)).toBe(false);
    expect(phone.parentElement).toBe(document.body);
    // Later in the document than the settings sheet → painted above it at the same z-index.
    const settings = screen.getByTestId('settings-sheet');
    expect(settings.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('one right-hand canvas at a time', () => {
  it('the scene opening closes the code canvas, and the code canvas opening closes the scene', async () => {
    const { container } = render(<SceneDock locale="en" />);
    act(() => { useArtifactStore.getState().openArtifact({ language: 'python', code: 'print(1)' }); });
    expect(useArtifactStore.getState().open).toBe(true);

    send({ type: 'place_object', shape: 'cube' });
    expect(useSceneStore.getState().open).toBe(true);
    expect(useArtifactStore.getState().open).toBe(false);

    act(() => { useArtifactStore.getState().openArtifact({ language: 'python', code: 'print(2)' }); });
    expect(useArtifactStore.getState().open).toBe(true);
    expect(useSceneStore.getState().open).toBe(false);
    await waitFor(() => expect(container.querySelector('[data-scene-dock]')).toBeNull());
  });
});

describe('locale', () => {
  it('speaks Georgian by default', () => {
    render(<SceneDock />);
    send({ type: 'place_object', shape: 'torus' });
    expect(screen.getByRole('heading', { name: '3D სცენა' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ტორი 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'დახურვა' })).toBeTruthy();
  });
});
