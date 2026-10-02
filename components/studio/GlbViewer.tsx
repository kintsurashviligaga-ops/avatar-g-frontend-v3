'use client';

/**
 * components/studio/GlbViewer.tsx — GLB preview on the installed R3F stack.
 *
 * WHY NOT <model-viewer>: types/model-viewer.d.ts declares the JSX element globally, so `<model-viewer>`
 * typechecks cleanly — but `@google/model-viewer` is NOT in package.json. It would render as an inert
 * unknown element with no error. three + @react-three/fiber + drei ARE installed and already used by
 * components/chat/RoomViewer.tsx, so this builds on those.
 *
 * ⚠️ BUILD MEMORY — read before "simplifying" this back to drei helpers.
 * `next build` is SIGKILLed by the Vercel container's OOM killer when peak memory creeps up; the config
 * already spends its two big levers (experimental.cpus and optimizePackageImports). This file therefore
 * deliberately uses the NARROWEST possible surface:
 *   · `useLoader(GLTFLoader)` from fiber, NOT drei's `useGLTF` — useGLTF auto-wires Draco, KTX2 and
 *     Meshopt decoders, pulling three whole decoder toolchains into the compile graph for a feature we
 *     actively do not want (Draco decoders load wasm from a Google CDN that this app's CSP blocks).
 *   · plain lights, NOT drei's `<Stage>` — Stage drags in AccumulativeShadows, ContactShadows,
 *     Environment, Center and BBAnchor for what amounts to three lights and a camera position.
 * `OrbitControls` is kept because RoomViewer already imports it, so it costs nothing new.
 *
 * The GLB must be served from our own storage: the app's CSP has no Meshy host in `connect-src`. The
 * pipeline re-hosts an uncompressed GLB for exactly that reason.
 *
 * Mounted through next/dynamic({ ssr: false }) by its parent — three touches `window` on import.
 *
 * `FramedGlb` (the loader + the framing) is exported for the 3D scene (components/studio/scene/SceneCanvas), so the
 * two never drift into two ways of loading a model.
 */
import { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3 } from 'three';
import { fitToBox, type FitAnchor } from '@/lib/studio/scene3d';
import { GLB_VIEWER_FRAME } from './glbFrame';

/**
 * One GLB, loaded and framed: `size` units on its longest side, centred on the origin (`anchor: 'base'` — standing on
 * it instead). Suspends while loading and THROWS when the file cannot be loaded (an expired signed URL, a truncated
 * file): the caller owns the Suspense and the ErrorBoundary.
 */
export function FramedGlb({ url, size = 2, anchor = 'center' }: { url: string; size?: number; anchor?: FitAnchor }) {
  // useLoader suspends and caches by url; the caller's Suspense boundary holds until the mesh is ready.
  const gltf = useLoader(GLTFLoader, url);

  // A generated mesh arrives at an arbitrary scale and offset — a 200-unit model or one centred at the
  // origin of some CAD space renders as an empty canvas. `Stage` did this framing for us; doing it by
  // hand is ~10 lines and costs nothing at build time.
  // ⚠️ MEASURED ON THE DETACHED CLONE, APPLIED BY A WRAPPER GROUP. Box3.setFromObject reads WORLD matrices, so
  // measuring the mounted node counted its parents' transforms too: fine alone in this viewer, wrong for a scene
  // object that sits inside a moved / rotated / scaled group. A fresh clone has no parent — its world space is its
  // own — and the fit goes on a wrapper, so whatever is above it composes cleanly.
  const { scene, fit } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.updateMatrixWorld(true);
    const box = new Box3().setFromObject(clone);
    return {
      scene: clone,
      fit: box.isEmpty() ? null : fitToBox([box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z], size, anchor),
    };
  }, [gltf, size, anchor]);

  return (
    <group scale={fit?.scale ?? 1} position={fit?.offset ?? [0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export default function GlbViewer({ url }: { url: string }) {
  return (
    // ⚠️ A FIXED 420px CANVAS TRAPPED TOUCH SCROLLING ON A PHONE. This sits inside a panel capped at
    // 52vh that must therefore scroll internally — and 52vh of a 667px iPhone SE viewport is ~347px, so
    // the canvas ALONE overflowed it. OrbitControls sets `touchAction = 'none'` on its element to take
    // over dragging, which means a finger landing anywhere in the viewer could not scroll the panel;
    // the download button directly beneath it was unreachable without finding the thin strip beside
    // the canvas. Sized to the viewport now: comfortable on desktop, scrollable past on a phone.
    // The box is shared with the loading placeholder (glbFrame.tsx), so the panel does not jump when this lands.
    <div className={GLB_VIEWER_FRAME}>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }} dpr={[1, 2]}>
        {/* A raw GLB with no lighting renders black. Three lights is what Stage was giving us. */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} />
        <directionalLight position={[-5, -2, -5]} intensity={0.4} />
        <Suspense fallback={null}>
          <FramedGlb url={url} />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} />
      </Canvas>
    </div>
  );
}
