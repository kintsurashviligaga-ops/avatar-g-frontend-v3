/**
 * @jest-environment jsdom
 *
 * ServiceParamsPanel × the 3D scene — "Add to scene" on a finished model, end to end through the real event contract:
 * the panel dispatches `myavatar:scene-action`, a mounted SceneDock validates and applies it, and the receipt decides
 * what the panel says.
 *
 *   · offered only while a scene is mounted to take it (as a code block's "Open in canvas");
 *   · the model lands in the scene with the description as its name, and the scene opens;
 *   · pressing it again shows the same model — no stacked copy (the id comes from the Storage object);
 *   · a full scene is refused, and the panel says why;
 *   · a closed scene with objects in it can be reopened from the 3D tool.
 * fetch is mocked; nothing leaves the test. Both 3D views (the panel's GlbViewer, the scene's SceneCanvas) are
 * next/dynamic and stubbed out — what is under test is the contract around them.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../lib/services/model3d/model3dPlan', () => ({
  ...jest.requireActual('../../lib/services/model3d/model3dPlan'),
  pollDelayMs: () => 0,
}));
jest.mock('next/dynamic', () => () => function MockDynamic() {
  return null;
});

import { SCENE_MAX_OBJECTS, sceneIdForUrl } from '@/lib/studio/scene3d';
import { resetArtifactStore } from '@/components/chat/artifacts/artifactStore';
import { ServiceParamsPanel } from './ServiceParamsPanel';
import { SceneDock } from './scene/SceneDock';
import { resetSceneStore, useSceneStore } from './scene/sceneStore';

const GLB = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=t';
const REF = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/ref.png?token=t';

let warnSpy: jest.SpyInstance;
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 1024px)' || /prefers-reduced-motion/.test(query),
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
  resetSceneStore();
  resetArtifactStore();
  (globalThis as { fetch: unknown }).fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.startsWith('/api/v2/model3d/create')) return json({ jobId: 'job-1', predictionId: 'pred123', referenceUrl: REF, charge: 'sig' });
    if (url.startsWith('/api/v2/model3d/status')) return json({ status: 'succeeded', glbUrl: GLB });
    return json({});
  });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

async function makeModel({ withScene = true } = {}) {
  render(
    <>
      <ServiceParamsPanel service="model3d" locale="en" onClose={() => {}} prefill={{ topic: 'an old clay jug' }} />
      {withScene && <SceneDock locale="en" />}
    </>,
  );
  const run = screen.getByRole('button', { name: 'Create' });
  await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(run); });
  // The download/share row is the sign the model arrived.
  await screen.findByRole('button', { name: 'Download' });
}

describe('Add to scene', () => {
  it('is not offered when no scene is mounted to take it', async () => {
    await makeModel({ withScene: false });
    expect(screen.queryByRole('button', { name: 'Add to scene' })).toBeNull();
  });

  it('puts the model in the scene under its description, opens the scene and confirms', async () => {
    await makeModel();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add to scene' })); });
    const { objects, open, selectedId } = useSceneStore.getState();
    expect(open).toBe(true);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ kind: 'glb', url: new URL(GLB).href, label: 'an old clay jug', id: sceneIdForUrl(GLB) });
    expect(selectedId).toBe(objects[0]!.id);
    expect(screen.getByText('In the scene ✓')).toBeTruthy();
    // The scene's own list shows it.
    expect(screen.getByRole('button', { name: 'an old clay jug', pressed: true })).toBeTruthy();
  });

  it('pressing it again shows the same model instead of stacking a copy', async () => {
    await makeModel();
    const add = screen.getByRole('button', { name: 'Add to scene' });
    act(() => { fireEvent.click(add); });
    act(() => { useSceneStore.getState().apply({ type: 'close_scene' }); });
    act(() => { fireEvent.click(add); });
    expect(useSceneStore.getState().objects).toHaveLength(1);
    expect(useSceneStore.getState().open).toBe(true);
  });

  it('a full scene refuses it, and the panel says why', async () => {
    await makeModel();
    act(() => {
      useSceneStore.getState().apply({ type: 'set_scene', objects: Array.from({ length: SCENE_MAX_OBJECTS }, () => ({ kind: 'shape' as const, shape: 'cube' as const })) });
    });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add to scene' })); });
    expect(useSceneStore.getState().objects.every((o) => o.kind === 'shape')).toBe(true);
    expect(screen.getByText(`Could not add it to the scene — it holds up to ${SCENE_MAX_OBJECTS} objects.`)).toBeTruthy();
  });

  it('a closed scene with objects can be reopened from the 3D tool', async () => {
    await makeModel();
    expect(screen.queryByRole('button', { name: /Open scene/ })).toBeNull(); // nothing in the scene yet
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add to scene' })); });
    expect(screen.queryByRole('button', { name: /Open scene/ })).toBeNull(); // it is open
    act(() => { useSceneStore.getState().apply({ type: 'close_scene' }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Open scene · 1' })); });
    expect(useSceneStore.getState().open).toBe(true);
  });
});
