'use client';

/**
 * components/studio/GlbViewer.tsx — GLB preview on the installed R3F stack.
 *
 * WHY NOT <model-viewer>: types/model-viewer.d.ts declares the JSX element globally, so `<model-viewer>`
 * typechecks cleanly — but `@google/model-viewer` is NOT in package.json. It would render as an inert
 * unknown element with no error. three + @react-three/fiber + drei ARE installed and already used by
 * components/chat/RoomViewer.tsx, so this builds on those.
 *
 * The GLB must be served from our own storage: the app's CSP has no Meshy host in `connect-src`, and a
 * Draco-compressed mesh would additionally pull decoder wasm from a Google CDN that `script-src` blocks.
 * The pipeline re-hosts an uncompressed GLB for exactly these reasons.
 *
 * This component is mounted through next/dynamic({ ssr: false }) by its parent — three touches `window`
 * during module evaluation and cannot be server-rendered.
 */
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';

function Model({ url }: { url: string }) {
  // useGLTF suspends; the Suspense boundary below renders the fallback until the mesh is ready.
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export default function GlbViewer({ url }: { url: string }) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-app-border/15 bg-app-elevated/40">
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          {/* Stage frames and lights the mesh automatically — a raw GLB with no lighting renders black. */}
          <Stage environment="city" intensity={0.5}>
            <Model url={url} />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault enablePan={false} />
      </Canvas>
    </div>
  );
}
