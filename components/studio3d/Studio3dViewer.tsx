'use client';

/**
 * components/studio3d/Studio3dViewer.tsx — the 3D Studio's in-chat model viewer (Phase 8.8, flag STUDIO_3D_V2).
 *
 * Built on the SAME narrow R3F surface as components/studio/GlbViewer (read its BUILD MEMORY note): fiber's useLoader via
 * FramedGlb, plain lights, drei's OrbitControls only. No @google/model-viewer (not installed), no drei Stage/Environment.
 *
 * Controls: rotate (drag), zoom (wheel / pinch), PAN (right-drag / two fingers), Wireframe, Spin, Reset view, Light
 * preset, Full screen, and a stats line (triangles). Full screen uses the Fullscreen API; iPhone Safari has none for a
 * <div>, so the same button falls back to a fixed full-viewport overlay (Esc / "Exit" closes both).
 * On a touch screen the camera starts inert under a "tap to rotate" cover so the chat still scrolls (as GlbViewer).
 *
 * Mount through next/dynamic({ ssr: false }) — three touches `window` on import.
 */
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { FramedGlb } from '@/components/studio/GlbViewer';
import { t, type Lang } from '@/lib/studio3d/labels';

export type LightPreset = 'studio' | 'soft' | 'dramatic';
export const LIGHTS: Record<LightPreset, { ambient: number; key: number; fill: number; label: Record<Lang, string> }> = {
  studio: { ambient: 0.6, key: 1.1, fill: 0.4, label: { ka: 'სტუდია', en: 'Studio', ru: 'Студия' } },
  soft: { ambient: 1.0, key: 0.5, fill: 0.5, label: { ka: 'რბილი', en: 'Soft', ru: 'Мягкий' } },
  dramatic: { ambient: 0.15, key: 1.8, fill: 0.1, label: { ka: 'დრამატული', en: 'Dramatic', ru: 'Драматичный' } },
};
const PRESETS = Object.keys(LIGHTS) as LightPreset[];

function useCoarsePointer(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const mql = window.matchMedia('(pointer: coarse)');
    mql.addEventListener?.('change', cb);
    return () => mql.removeEventListener?.('change', cb);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}

const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

export interface Studio3dViewerProps {
  url: string;
  locale?: Lang;
  /** Shown as the picture's accessible name. */
  title?: string;
}

export default function Studio3dViewer({ url, locale = 'ka', title }: Studio3dViewerProps) {
  const box = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();
  const [engaged, setEngaged] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [spin, setSpin] = useState(true);
  const [light, setLight] = useState<LightPreset>('studio');
  const [resetKey, setResetKey] = useState(0);
  const [nativeFull, setNativeFull] = useState(false);
  const [overlayFull, setOverlayFull] = useState(false);
  const [stats, setStats] = useState<{ triangles: number; vertices: number } | null>(null);
  const full = nativeFull || overlayFull;
  const interactive = !coarse || engaged || full;

  useEffect(() => {
    const onChange = () => setNativeFull(typeof document !== 'undefined' && document.fullscreenElement === box.current && !!box.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!overlayFull) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOverlayFull(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [overlayFull]);

  const toggleFull = useCallback(async () => {
    if (full) {
      if (nativeFull && document.exitFullscreen) await document.exitFullscreen().catch(() => {});
      setOverlayFull(false);
      return;
    }
    const el = box.current;
    if (el && typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* refused (iframe, iOS): fall through to the overlay */
      }
    }
    setOverlayFull(true);
  }, [full, nativeFull]);

  const L = LIGHTS[light];
  const btn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-app-bg/80 px-3 text-[12px] font-medium text-app-text backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 aria-pressed:bg-app-accent aria-pressed:text-white';

  return (
    <div
      ref={box}
      data-studio3d-viewer=""
      data-fullscreen={full ? (overlayFull ? 'overlay' : 'native') : 'off'}
      data-interactive={interactive ? 'true' : 'false'}
      className={
        overlayFull
          ? 'fixed inset-0 z-[100] bg-app-bg'
          : `relative w-full overflow-hidden rounded-xl border border-app-border/15 bg-app-elevated/40 ${nativeFull ? 'h-full' : 'h-[min(56vh,320px)] sm:h-[440px]'}`
      }
    >
      <div role="img" aria-label={title || t('title', locale)} className="h-full w-full">
        <Canvas key={resetKey} data-reset={resetKey} camera={{ position: [0, 0.4, 4], fov: 45 }} dpr={[1, 2]}>
          <ambientLight intensity={L.ambient} />
          <directionalLight position={[5, 5, 5]} intensity={L.key} />
          <directionalLight position={[-5, -2, -5]} intensity={L.fill} />
          <Suspense fallback={null}>
            <FramedGlb url={url} wireframe={wireframe} onStats={setStats} />
          </Suspense>
          <OrbitControls makeDefault enablePan enableZoom enabled={interactive} autoRotate={spin} autoRotateSpeed={1.2} />
        </Canvas>
      </div>

      {interactive && (
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t('title', locale)}>
          <button type="button" className={btn} aria-pressed={wireframe} onClick={() => setWireframe((w) => !w)}>{t('wireframe', locale)}</button>
          <button type="button" className={btn} aria-pressed={spin} onClick={() => setSpin((s) => !s)}>{t('autoRotate', locale)}</button>
          <button type="button" className={btn} onClick={() => setResetKey((k) => k + 1)}>{t('reset', locale)}</button>
          <label className={`${btn} gap-1`}>
            <span className="sr-only">{t('light', locale)}</span>
            <select aria-label={t('light', locale)} value={light} onChange={(e) => setLight(e.target.value as LightPreset)} className="bg-transparent text-[12px] outline-none">
              {PRESETS.map((p) => <option key={p} value={p}>{LIGHTS[p].label[locale] ?? LIGHTS[p].label.ka}</option>)}
            </select>
          </label>
          <button type="button" className={`${btn} ml-auto`} onClick={toggleFull} data-studio3d-fullscreen="">
            {full ? t('exitFullscreen', locale) : t('fullscreen', locale)}
          </button>
          {coarse && engaged && !full && (
            <button type="button" className={btn} onClick={() => setEngaged(false)}>✓</button>
          )}
        </div>
      )}

      {stats && (
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-app-text/70" data-studio3d-stats="">
          {fmt(stats.triangles)} {t('faces', locale)}
        </p>
      )}

      {!interactive && (
        <button type="button" onClick={() => setEngaged(true)} data-studio3d-cover=""
          className="absolute inset-0 flex items-end justify-center pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60">
          <span className="rounded-full bg-app-bg/75 px-4 py-2.5 text-[13px] font-medium text-app-text">{t('tapToRotate', locale)}</span>
        </button>
      )}
    </div>
  );
}
