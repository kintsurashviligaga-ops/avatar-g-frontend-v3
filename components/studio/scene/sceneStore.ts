/**
 * components/studio/scene/sceneStore.ts — the 3D scene's state: lib/studio/scene3d's pure reducer behind a zustand
 * store (like `components/chat/artifacts/artifactStore`), plus how many scenes are mounted.
 *
 * A store rather than component state because the writers are far from the reader and need an answer AT ONCE: the
 * `myavatar:scene-action` listener must know synchronously whether the scene took an action before it gives the
 * event its preventDefault() receipt — a useReducer would only tell it on the next render. The scene's own buttons
 * write through the same `apply`, so there is one path into the state.
 *
 *   hosts   how many SceneDocks are mounted; the 3D panel offers "Add to scene" only when one is
 */

import { create } from 'zustand';
import { EMPTY_SCENE, applySceneAction, type SceneAction, type SceneApplyResult, type SceneState } from '@/lib/studio/scene3d';

export interface SceneStoreState extends SceneState {
  hosts: number;
  /** Applies a validated action; returns the reducer's verdict. The state changes only when the reducer changed it. */
  apply: (action: SceneAction) => SceneApplyResult;
  /** A mounted scene registers itself; the returned function unregisters it (idempotent). */
  registerHost: () => () => void;
}

function sceneOf(s: SceneStoreState): SceneState {
  return { open: s.open, objects: s.objects, selectedId: s.selectedId, seq: s.seq };
}

export const useSceneStore = create<SceneStoreState>((set, get) => ({
  ...EMPTY_SCENE,
  hosts: 0,

  apply: (action) => {
    const before = sceneOf(get());
    const result = applySceneAction(before, action);
    if (result.state !== before) set(result.state);
    return result;
  },

  registerHost: () => {
    set((s) => ({ hosts: s.hosts + 1 }));
    let done = false;
    return () => {
      if (done) return; // StrictMode / a double cleanup must not drive the count below the real number of hosts
      done = true;
      set((s) => ({ hosts: Math.max(0, s.hosts - 1) }));
    };
  },
}));

/** Tests only: back to an empty, closed, host-less scene. */
export function resetSceneStore(): void {
  useSceneStore.setState({ ...EMPTY_SCENE, hosts: 0 });
}
