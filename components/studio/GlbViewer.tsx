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
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3, type Group } from 'three';

function Model({ url }: { url: string }) {
  // useLoader suspends and caches by url; the Suspense boundary below holds until the mesh is ready.
  const gltf = useLoader(GLTFLoader, url);
  const ref = useRef<Group>(null);

  // A generated mesh arrives at an arbitrary scale and offset — a 200-unit model or one centred at the
  // origin of some CAD space renders as an empty canvas. `Stage` did this framing for us; doing it by
  // hand is ~10 lines and costs nothing at build time.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const box = new Box3().setFromObject(node);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    if (longest > 0 && Number.isFinite(longest)) {
      const k = 2 / longest;
      node.scale.setScalar(k);
      node.position.set(-centre.x * k, -centre.y * k, -centre.z * k);
    }
  }, [scene]);

  return <primitive ref={ref} object={scene} />;
}

export default function GlbViewer({ url }: { url: string }) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-app-border/15 bg-app-elevated/40">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }} dpr={[1, 2]}>
        {/* A raw GLB with no lighting renders black. Three lights is what Stage was giving us. */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} />
        <directionalLight position={[-5, -2, -5]} intensity={0.4} />
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} />
      </Canvas>
    </div>
  );
}
