/**
 * @jest-environment jsdom
 *
 * PR C wiring, mocked: "Use in Video" hands the turntable to the open studio's Montage (pendingEdit + event),
 * "Add to scene" places the model in the 3D scene, the download links, and the 3D panel switch (no request at all
 * while NEXT_PUBLIC_STUDIO_3D_V2 is off).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { addToScene, downloadHref, sendToVideo } from './Studio3dCard';
import { useStudio3dAvailable, studio3dClientSwitch, __resetStudio3dAvailable } from './useStudio3dAvailable';
import { takePendingEdit, PENDING_EDIT_EVENT } from '@/lib/studio/pendingEdit';
import { SCENE_ACTION_EVENT } from '@/lib/studio/scene3d';

const MP4 = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/studio3d/u/j/turntable.mp4?token=t';
const GLB = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/studio3d/u/j/model.glb?token=t';

beforeEach(() => {
  sessionStorage.clear();
  __resetStudio3dAvailable();
});

it('Use in Video stashes the turntable as a video and tells the open studio', () => {
  const heard = jest.fn();
  window.addEventListener(PENDING_EDIT_EVENT, heard);
  expect(sendToVideo(MP4)).toBe(true);
  expect(heard).toHaveBeenCalledTimes(1);
  expect(takePendingEdit()).toMatchObject({ url: MP4, kind: 'video' });
  window.removeEventListener(PENDING_EDIT_EVENT, heard);
  expect(sendToVideo('javascript:alert(1)')).toBe(false);
});

it('Add to scene opens the scene and places the model (only when a scene takes it)', () => {
  const actions: unknown[] = [];
  const take = (e: Event) => { actions.push((e as CustomEvent).detail); e.preventDefault(); };
  expect(addToScene(GLB, '')).toBe(false); // no scene mounted
  window.addEventListener(SCENE_ACTION_EVENT, take);
  expect(addToScene(GLB, 'car')).toBe(true);
  expect(actions.slice(-2)).toEqual([{ type: 'open_scene' }, { type: 'place_object', url: GLB, label: 'car' }]);
  expect(addToScene('https://evil.example/x.glb', '')).toBe(false);
  window.removeEventListener(SCENE_ACTION_EVENT, take);
});

it('download links name the format and clamp the STL height', () => {
  expect(downloadHref('id', 'glb')).toBe('/api/studio3d/id/download?format=glb');
  expect(downloadHref('id', 'obj')).toBe('/api/studio3d/id/download?format=obj');
  expect(downloadHref('id', 'stl', 150)).toBe('/api/studio3d/id/download?format=stl&mm=150');
  expect(downloadHref('id', 'stl', 9999)).toBe('/api/studio3d/id/download?format=stl&mm=500');
});

it('client switch off: the 3D panel never asks the server', async () => {
  const f = jest.fn();
  const { result } = renderHook(() => useStudio3dAvailable(true, f as unknown as typeof fetch, false));
  expect(result.current).toBe(false);
  expect(f).not.toHaveBeenCalled();
  expect(studio3dClientSwitch(undefined)).toBe(false);
  expect(studio3dClientSwitch('1')).toBe(false);
  expect(studio3dClientSwitch('admin')).toBe(true);
});

it('client switch on: the server decides (200 → on, 404 → off)', async () => {
  const ok = jest.fn(async () => ({ ok: true }));
  const a = renderHook(() => useStudio3dAvailable(true, ok as unknown as typeof fetch, true));
  expect(a.result.current).toBeNull();
  await waitFor(() => expect(a.result.current).toBe(true));
  __resetStudio3dAvailable();
  const nf = jest.fn(async () => ({ ok: false }));
  const b = renderHook(() => useStudio3dAvailable(true, nf as unknown as typeof fetch, true));
  await waitFor(() => expect(b.result.current).toBe(false));
  await act(async () => {});
});
