'use client';

/**
 * components/studio/scene/SceneCanvas.tsx — the 3D scene's viewport: a floor, the objects, an orbit camera.
 *
 * Loaded ONLY through next/dynamic({ ssr: false }) by SceneDock, and only while the scene is open: three.js touches
 * `window` on import, and none of it should be fetched by a visitor who never opens a scene. Everything else about the
 * scene (the event contract, the list, the buttons that move things) lives outside this file and works without it.
 *
 * Built on the SAME narrow stack as GlbViewer (read its header — `next build` runs close to the OOM line): fiber's
 * Canvas + drei's OrbitControls only, models through GlbViewer's own `FramedGlb` (fiber's useLoader + GLTFLoader, the
 * framing by hand). No drei Stage, useGLTF or TransformControls — objects move with the scene's buttons, not gizmos.
 *
 * ⚠️ ONE ErrorBoundary PER OBJECT. A model that fails to load (an expired 7-day signed URL, a truncated file) throws
 * out of useLoader; R3F's Canvas re-throws anything uncaught into the page, so one dead file used to take the whole
 * view — and, without the dock's own boundary, the dashboard — with it. Each object is contained: a broken one becomes
 * a wireframe marker where it stood and is reported to the list (`onObjectError`); the rest keep rendering. Each also
 * has its own Suspense, so a model still downloading never blanks the others.
 * ⚠️ WEBGL IS CHECKED FIRST (./webgl): without it three throws while creating the renderer. A sentence instead.
 * ⚠️ TAP TO INTERACT ON A TOUCH SCREEN. OrbitControls sets `touch-action: none` on the canvas and owns every drag, so
 * a finger that only meant to scroll or swipe past spun the camera instead — and inside a scrolling container could
 * not scroll it at all (GlbViewer's phone bug). On a coarse pointer the view starts inert under a "tap to move the
 * view" cover that behaves like any other element; a tap hands the gestures to the camera, "Done" hands them back.
 * Keyed on the POINTER, never on the width (an iPad is 768 px and up, and still a finger).
 */

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ErrorBoundary from '@/components/ErrorBoundary';
import { FramedGlb } from '../GlbViewer';
import { hasWebGL } from './webgl';
import { SCENE_POSITION_LIMIT, type SceneObject, type SceneShape, type Vec3 } from '@/lib/studio/scene3d';

type Locale = 'ka' | 'en' | 'ru';

const LABELS: Record<Locale, { noWebgl: string; interact: string; done: string }> = {
  ka: {
    noWebgl: '3D ამ ბრაუზერში ვერ გამოჩნდება (WebGL გამორთულია ან არ არის მხარდაჭერილი). ობიექტების სია ქვემოთაა.',
    interact: 'შეეხე ხედის სამართავად',
    done: 'მზადაა',
  },
  en: {
    noWebgl: '3D can’t be shown in this browser (WebGL is off or unsupported). The objects are still listed below.',
    interact: 'Tap to move the view',
    done: 'Done',
  },
  ru: {
    noWebgl: '3D не отображается в этом браузере (WebGL выключен или не поддерживается). Список объектов — ниже.',
    interact: 'Нажмите, чтобы управлять видом',
    done: 'Готово',
  },
};

/** The same query the studio's 44 px targets key on (`[@media(pointer:fine)]`), inverted. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** The selection is an active state — the one place the accent (`--app-accent`, #338FE8) belongs in the view. */
const SELECTED = '#338fe8';
/** `--app-warning`: the marker left where a model failed to load. */
const BROKEN = '#f59e0b';
const LOADING = '#71717a';

export interface SceneCanvasProps {
  objects: readonly SceneObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** A model could not load (its own boundary caught it); the scene's list marks it. */
  onObjectError?: (id: string) => void;
  locale?: Locale;
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** fiber reads a position / rotation tuple and never writes to it, so the state's frozen tuple is passed as it is. */
const v3 = (v: Vec3) => v as unknown as [number, number, number];

/** Every shape fits a 1-unit box standing on y = 0, like a framed model does (`FramedGlb` with anchor 'base'). */
function ShapeGeometry({ shape }: { shape: SceneShape }) {
  switch (shape) {
    case 'cube': return <boxGeometry args={[1, 1, 1]} />;
    case 'sphere': return <sphereGeometry args={[0.5, 32, 16]} />;
    case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case 'cone': return <coneGeometry args={[0.5, 1, 32]} />;
    case 'torus': return <torusGeometry args={[0.35, 0.15, 16, 48]} />;
  }
}

function SelectionRing() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[0.62, 0.7, 48]} />
      <meshBasicMaterial color={SELECTED} />
    </mesh>
  );
}

function MarkerBox({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} wireframe transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

function SceneItem({ object: o, selected, onSelect }: { object: SceneObject; selected: boolean; onSelect: (id: string) => void }) {
  const select = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); // the nearest object wins; the canvas's onPointerMissed must not deselect it again
    onSelect(o.id);
  }, [o.id, onSelect]);
  return (
    <group position={v3(o.position)} rotation={v3(o.rotation)} scale={o.scale} onClick={select} name={o.id}>
      {o.kind === 'glb' ? (
        <Suspense fallback={<MarkerBox color={LOADING} opacity={0.5} />}>
          <FramedGlb url={o.url} size={1} anchor="base" />
        </Suspense>
      ) : (
        <mesh position={[0, 0.5, 0]}>
          <ShapeGeometry shape={o.shape} />
          <meshStandardMaterial color={o.color} roughness={0.6} metalness={0.05} />
        </mesh>
      )}
      {selected && <SelectionRing />}
    </group>
  );
}

/** What a failed object leaves behind: a marker where it stood (so it can be found and removed) and a report. */
function BrokenObject({ object: o, onError }: { object: SceneObject; onError?: (id: string) => void }) {
  useEffect(() => {
    onError?.(o.id);
  }, [o.id, onError]);
  return (
    <group position={v3(o.position)} rotation={v3(o.rotation)} scale={o.scale} name={o.id}>
      <MarkerBox color={BROKEN} />
    </group>
  );
}

export default function SceneCanvas({ objects, selectedId, onSelect, onObjectError, locale = 'ka' }: SceneCanvasProps) {
  const labels = LABELS[locale] ?? LABELS.ka;
  // Probed once per mount: client-only (ssr: false), and a probe per render would churn WebGL contexts.
  const [webgl] = useState(hasWebGL);
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  const [engaged, setEngaged] = useState(false);
  const interactive = !coarse || engaged;

  if (!webgl) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" data-scene-viewport="no-webgl">
        <p role="status" className="max-w-[34ch] text-center text-[13px] leading-[1.6] text-app-muted">{labels.noWebgl}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" data-scene-viewport="" data-interactive={interactive ? 'true' : 'false'}>
      {/* frameloop "demand": a still scene draws nothing. Props, loads and the controls' own changes invalidate. */}
      <Canvas frameloop="demand" camera={{ position: [7, 6, 9], fov: 45 }} dpr={[1, 2]} onPointerMissed={() => onSelect(null)}>
        {/* A raw GLB with no lighting renders black — the same three lights as GlbViewer. */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.1} />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} />
        {/* The floor is drawn to the placement bound, so "±10" is something the user can see. */}
        <gridHelper args={[SCENE_POSITION_LIMIT * 2, SCENE_POSITION_LIMIT * 2, '#52525b', '#27272a']} />
        {objects.map((o) => (
          // Keyed by id AND source: re-pointing an object at another file gets a fresh boundary and a fresh load.
          <ErrorBoundary key={`${o.id}|${o.kind === 'glb' ? o.url : o.shape}`} fallback={<BrokenObject object={o} onError={onObjectError} />}>
            <SceneItem object={o} selected={o.id === selectedId} onSelect={onSelect} />
          </ErrorBoundary>
        ))}
        <OrbitControls makeDefault enabled={interactive} target={[0, 0.5, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={2} maxDistance={40} />
      </Canvas>
      {!interactive && (
        <button
          type="button"
          onClick={() => setEngaged(true)}
          data-scene-cover=""
          className="absolute inset-0 flex items-end justify-center pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60"
        >
          <span className="rounded-full bg-app-bg/75 px-4 py-2.5 text-[13px] font-medium text-app-text">{labels.interact}</span>
        </button>
      )}
      {coarse && engaged && (
        <button
          type="button"
          onClick={() => setEngaged(false)}
          className="absolute right-2 top-2 inline-flex h-11 items-center rounded-full bg-app-bg/75 px-4 text-[13px] font-medium text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          {labels.done}
        </button>
      )}
    </div>
  );
}
