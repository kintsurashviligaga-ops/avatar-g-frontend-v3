'use client';

/**
 * components/studio/scene/SceneDock.tsx — the 3D scene: a right-hand panel on a desktop (≥ 1024 px, the dashboard's
 * `lg`), a bottom sheet on a phone — the same two shapes as the code canvas (ArtifactCanvas), mounted next to it.
 *
 * Always mounted, and LIGHT: it owns the `myavatar:scene-action` listener (lib/studio/scene3d), the panel, the object
 * list and the buttons that move things. The 3D view itself (three.js + R3F, SceneCanvas) is next/dynamic with
 * ssr: false and is fetched the first time a scene actually opens — never on a dashboard visit that has no scene.
 *
 * The event contract: a valid action the scene took gets preventDefault() as its RECEIPT; an invalid one (a NaN, a
 * non-Supabase URL, a 100-object batch) is dropped whole with a console warning, and so is a refusal (a 25th object,
 * an unknown id). Producers today: the 3D panel's "Add to scene". Planned: a Live `place_object` tool — left dark
 * until the Live probe passes (a 400 on the lock drops every action, docs/SUPER_APP_PLAN.md Wave 3b).
 *
 * ⚠️ ONE RIGHT-HAND CANVAS AT A TIME. The code canvas is 45 % of the row too; both open beside the settings column
 * would squeeze the chat to nothing (and on a phone stack two sheets). Opening either closes the other.
 * ⚠️ THE VIEW IS INSIDE ITS OWN ErrorBoundary. R3F re-throws what it cannot handle (a lost context, a failed chunk)
 * into the page; without this a broken 3D view would replace the whole studio with the error screen.
 * ⚠️ THE PHONE SHEET IS PORTALED TO <body>. Its trigger, "Add to scene", sits INSIDE the settings sheet — the same
 * z-[95] layer, later in the DOM — so a sheet rendered in place would open underneath it, invisible. Portaled it is
 * the newest layer, as BottomSheet stacks over the settings; useDialogA11y's stack gives it Escape and returns focus
 * to the button on close, with the settings still open beneath.
 * ⚠️ MOTION IS TRANSFORM + OPACITY ONLY, AND NONE UNDER prefers-reduced-motion — as ArtifactCanvas.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, CopyPlus, Minus, Plus, RotateCcw, RotateCw, Trash2, X,
} from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useArtifactStore } from '@/components/chat/artifacts/artifactStore';
import {
  SCENE_ACTION_EVENT, SCENE_MAX_OBJECTS, SCENE_POSITION_LIMIT, SCENE_SCALE_MAX, SCENE_SCALE_MIN, validateSceneAction,
  type SceneObject, type SceneShape,
} from '@/lib/studio/scene3d';
import { CHIP_BASE, CHIP_OFF, CHIP_ON, ICON_BTN } from '../ui/tokens';
import { useSceneStore } from './sceneStore';
import type { SceneCanvasProps } from './SceneCanvas';

const SceneCanvas = dynamic<SceneCanvasProps>(() => import('./SceneCanvas'), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-full w-full bg-app-elevated/40 motion-safe:animate-pulse" />,
});

type Locale = 'ka' | 'en' | 'ru';

interface DockLabels {
  title: string;
  count: (n: number, of: number) => string;
  close: string;
  empty: string;
  objects: string;
  model: string;
  shapes: Record<SceneShape, string>;
  move: string;
  shape: string;
  left: string;
  right: string;
  back: string;
  forward: string;
  up: string;
  down: string;
  turnLeft: string;
  turnRight: string;
  smaller: string;
  bigger: string;
  duplicate: string;
  remove: string;
  broken: string;
  brokenShort: string;
  failed: string;
}

const LABELS: Record<Locale, DockLabels> = {
  ka: {
    title: '3D სცენა',
    count: (n, of) => `${n} ობიექტი ${of}-დან`,
    close: 'დახურვა',
    empty: 'სცენა ცარიელია. შექმენი 3D მოდელი და დააჭირე „სცენაზე დამატება“.',
    objects: 'ობიექტები',
    model: '3D მოდელი',
    shapes: { cube: 'კუბი', sphere: 'სფერო', cylinder: 'ცილინდრი', cone: 'კონუსი', torus: 'ტორი' },
    move: 'გადაადგილება',
    shape: 'მობრუნება და ზომა',
    left: 'მარცხნივ',
    right: 'მარჯვნივ',
    back: 'უკან',
    forward: 'წინ',
    up: 'აწევა',
    down: 'დაწევა',
    turnLeft: 'მარცხნივ შემობრუნება',
    turnRight: 'მარჯვნივ შემობრუნება',
    smaller: 'დაპატარავება',
    bigger: 'გადიდება',
    duplicate: 'დუბლირება',
    remove: 'წაშლა',
    broken: 'ვერ ჩაიტვირთა — წაშალე და მოდელი თავიდან დაამატე.',
    brokenShort: 'ვერ ჩაიტვირთა',
    failed: '3D ხედმა მუშაობა შეწყვიტა. ობიექტების სია ქვემოთაა.',
  },
  en: {
    title: '3D scene',
    count: (n, of) => `${n} of ${of} objects`,
    close: 'Close',
    empty: 'The scene is empty. Make a 3D model, then press “Add to scene”.',
    objects: 'Objects',
    model: '3D model',
    shapes: { cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone', torus: 'Torus' },
    move: 'Move',
    shape: 'Turn and size',
    left: 'Move left',
    right: 'Move right',
    back: 'Move back',
    forward: 'Move forward',
    up: 'Raise',
    down: 'Lower',
    turnLeft: 'Turn left',
    turnRight: 'Turn right',
    smaller: 'Smaller',
    bigger: 'Bigger',
    duplicate: 'Duplicate',
    remove: 'Remove',
    broken: 'Could not load — remove it and add the model again.',
    brokenShort: 'Could not load',
    failed: 'The 3D view stopped working. The objects are still listed below.',
  },
  ru: {
    title: '3D-сцена',
    count: (n, of) => `${n} из ${of} объектов`,
    close: 'Закрыть',
    empty: 'Сцена пуста. Создайте 3D-модель и нажмите «Добавить в сцену».',
    objects: 'Объекты',
    model: '3D-модель',
    shapes: { cube: 'Куб', sphere: 'Сфера', cylinder: 'Цилиндр', cone: 'Конус', torus: 'Тор' },
    move: 'Перемещение',
    shape: 'Поворот и размер',
    left: 'Влево',
    right: 'Вправо',
    back: 'Назад',
    forward: 'Вперёд',
    up: 'Поднять',
    down: 'Опустить',
    turnLeft: 'Повернуть влево',
    turnRight: 'Повернуть вправо',
    smaller: 'Меньше',
    bigger: 'Больше',
    duplicate: 'Дублировать',
    remove: 'Удалить',
    broken: 'Не удалось загрузить — удалите и добавьте модель заново.',
    brokenShort: 'Не загрузилось',
    failed: '3D-вид перестал работать. Список объектов — ниже.',
  },
};

/** The dashboard's `lg` — the query ArtifactCanvas and OmniStudio use for their desktop layout. */
export const SCENE_DESKTOP_QUERY = '(min-width: 1024px)';
/** One button press: half a metre, 15°, a quarter bigger or smaller. */
export const SCENE_NUDGE_M = 0.5;
export const SCENE_TURN_RAD = Math.PI / 12;
export const SCENE_SCALE_STEP = 1.25;

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];
const HEADER_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:w-9';

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

/** What a model's failure is recorded against: a re-pointed object (another file) starts clean. */
const sourceKey = (o: SceneObject): string => (o.kind === 'glb' ? o.url : o.shape);

/** "Clay jug", or "3D model 2" / "Cube 3" — numbered by place in the list, so two unnamed models stay apart. */
function sceneObjectName(o: SceneObject, index: number, labels: Pick<DockLabels, 'model' | 'shapes'>): string {
  if (o.label) return o.label;
  return `${o.kind === 'glb' ? labels.model : labels.shapes[o.shape]} ${index + 1}`;
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={ICON_BTN} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function Inspector({ object: o, name, labels, broken, full }: { object: SceneObject; name: string; labels: DockLabels; broken: boolean; full: boolean }) {
  const { apply } = useSceneStore.getState();
  const [x, y, z] = o.position;
  const move = (dx: number, dy: number, dz: number) => apply({ type: 'update_object', id: o.id, position: [x + dx, y + dy, z + dz] });
  const turn = (d: number) => apply({ type: 'update_object', id: o.id, rotation: [o.rotation[0], o.rotation[1] + d, o.rotation[2]] });
  const resize = (k: number) => apply({ type: 'update_object', id: o.id, scale: o.scale * k });
  const duplicate = () => apply({
    type: 'place_object',
    object: {
      ...(o.kind === 'glb' ? { kind: 'glb' as const, url: o.url } : { kind: 'shape' as const, shape: o.shape, color: o.color }),
      ...(o.label ? { label: o.label } : {}),
      // Beside the original (clamped to the floor by the reducer), facing the same way, the same size.
      position: [x + 1, y, z],
      rotation: o.rotation,
      scale: o.scale,
    },
  });
  const L = SCENE_POSITION_LIMIT;
  return (
    <div role="group" aria-label={name} className="space-y-2" data-scene-inspector={o.id}>
      <div role="group" aria-label={labels.move} className="flex flex-wrap items-center gap-1.5">
        <IconAction label={labels.left} onClick={() => move(-SCENE_NUDGE_M, 0, 0)} disabled={x <= -L}><ArrowLeft size={17} aria-hidden /></IconAction>
        <IconAction label={labels.right} onClick={() => move(SCENE_NUDGE_M, 0, 0)} disabled={x >= L}><ArrowRight size={17} aria-hidden /></IconAction>
        <IconAction label={labels.back} onClick={() => move(0, 0, -SCENE_NUDGE_M)} disabled={z <= -L}><ArrowUp size={17} aria-hidden /></IconAction>
        <IconAction label={labels.forward} onClick={() => move(0, 0, SCENE_NUDGE_M)} disabled={z >= L}><ArrowDown size={17} aria-hidden /></IconAction>
        <IconAction label={labels.up} onClick={() => move(0, SCENE_NUDGE_M, 0)} disabled={y >= L}><ChevronUp size={17} aria-hidden /></IconAction>
        <IconAction label={labels.down} onClick={() => move(0, -SCENE_NUDGE_M, 0)} disabled={y <= -L}><ChevronDown size={17} aria-hidden /></IconAction>
      </div>
      <div role="group" aria-label={labels.shape} className="flex flex-wrap items-center gap-1.5">
        <IconAction label={labels.turnLeft} onClick={() => turn(SCENE_TURN_RAD)}><RotateCcw size={17} aria-hidden /></IconAction>
        <IconAction label={labels.turnRight} onClick={() => turn(-SCENE_TURN_RAD)}><RotateCw size={17} aria-hidden /></IconAction>
        <IconAction label={labels.smaller} onClick={() => resize(1 / SCENE_SCALE_STEP)} disabled={o.scale <= SCENE_SCALE_MIN}><Minus size={17} aria-hidden /></IconAction>
        <IconAction label={labels.bigger} onClick={() => resize(SCENE_SCALE_STEP)} disabled={o.scale >= SCENE_SCALE_MAX}><Plus size={17} aria-hidden /></IconAction>
        <IconAction label={labels.duplicate} onClick={duplicate} disabled={full}><CopyPlus size={17} aria-hidden /></IconAction>
        <IconAction label={labels.remove} onClick={() => apply({ type: 'remove_object', id: o.id })}><Trash2 size={17} aria-hidden /></IconAction>
      </div>
      {broken && <p role="status" className="text-[12.5px] leading-[1.5] text-app-warning">{labels.broken}</p>}
    </div>
  );
}

function SceneBody({ labels, headingId, locale, phone }: { labels: DockLabels; headingId: string; locale: Locale; phone: boolean }) {
  const objects = useSceneStore((s) => s.objects);
  const selectedId = useSceneStore((s) => s.selectedId);
  const { apply } = useSceneStore.getState();
  // id → the source it failed with (see sourceKey).
  const [broken, setBroken] = useState<ReadonlyMap<string, string>>(() => new Map());
  const onObjectError = useCallback((id: string) => {
    const o = useSceneStore.getState().objects.find((x) => x.id === id);
    if (!o) return;
    setBroken((prev) => (prev.get(o.id) === sourceKey(o) ? prev : new Map(prev).set(o.id, sourceKey(o))));
  }, []);
  const onSelect = useCallback((id: string | null) => {
    useSceneStore.getState().apply({ type: 'select_object', id });
  }, []);
  const isBroken = (o: SceneObject) => broken.get(o.id) === sourceKey(o);
  const selectedIndex = objects.findIndex((o) => o.id === selectedId);
  const selected = selectedIndex >= 0 ? objects[selectedIndex]! : null;

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 pl-4 pr-2 pt-2">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-[15px] font-semibold leading-[1.4] text-app-text">{labels.title}</h2>
          <p className="text-[12px] leading-[1.4] tabular-nums text-app-muted">{labels.count(objects.length, SCENE_MAX_OBJECTS)}</p>
        </div>
        <button type="button" className={HEADER_BUTTON} onClick={() => apply({ type: 'close_scene' })} aria-label={labels.close} title={labels.close} data-scene-close="">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className={`relative mt-2 bg-app-elevated/40 ${phone ? 'h-[42svh] shrink-0' : 'min-h-[260px] flex-1'}`}>
        <ErrorBoundary fallback={<p role="status" className="p-6 text-center text-[13px] leading-[1.6] text-app-muted">{labels.failed}</p>}>
          <SceneCanvas objects={objects} selectedId={selectedId} onSelect={onSelect} onObjectError={onObjectError} locale={locale} />
        </ErrorBoundary>
      </div>

      <div className={`space-y-3 border-t border-app-border/10 px-4 py-3 ${phone ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : 'max-h-[45%] shrink-0 overflow-y-auto overscroll-contain'}`}>
        {objects.length === 0 ? (
          <p className="text-[13px] leading-[1.6] text-app-muted">{labels.empty}</p>
        ) : (
          <>
            <div role="group" aria-label={labels.objects} className="flex flex-wrap gap-1.5" data-scene-objects="">
              {objects.map((o, i) => {
                const name = sceneObjectName(o, i, labels);
                const on = o.id === selectedId;
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => apply({ type: 'select_object', id: on ? null : o.id })}
                    className={`${CHIP_BASE} max-w-full ${on ? CHIP_ON : CHIP_OFF}`} data-scene-object={o.id}>
                    {isBroken(o) && <AlertTriangle size={14} className="shrink-0 text-app-warning" role="img" aria-label={labels.brokenShort} />}
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                );
              })}
            </div>
            {selected && (
              <Inspector object={selected} name={sceneObjectName(selected, selectedIndex, labels)} labels={labels}
                broken={isBroken(selected)} full={objects.length >= SCENE_MAX_OBJECTS} />
            )}
          </>
        )}
      </div>
    </>
  );
}

export interface SceneDockProps {
  locale?: Locale;
}

/** Mount once per studio, next to ArtifactCanvas. Renders nothing until a scene opens. */
export function SceneDock({ locale = 'ka' }: SceneDockProps) {
  const labels = LABELS[locale] ?? LABELS.ka;
  const open = useSceneStore((s) => s.open);
  const isDesktop = useMediaQuery(SCENE_DESKTOP_QUERY);
  const reduceMotion = useReducedMotion();
  const headingId = useId();
  const close = useCallback(() => { useSceneStore.getState().apply({ type: 'close_scene' }); }, []);
  const sheetRef = useDialogA11y<HTMLDivElement>(open && !isDesktop, close);
  // The portal target exists only after mount (document.body).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // The event contract (lib/studio/scene3d) and the host registration that makes the 3D panel offer "Add to scene".
  useEffect(() => {
    const unregister = useSceneStore.getState().registerHost();
    const onAction = (e: Event) => {
      if (e.defaultPrevented) return; // another mounted scene already took it — never apply one action twice
      const v = validateSceneAction((e as CustomEvent<unknown>).detail);
      if (!v.ok) {
        console.warn(`[scene] ${SCENE_ACTION_EVENT} ignored: ${v.reason}`);
        return;
      }
      const r = useSceneStore.getState().apply(v.action);
      if (!r.ok) {
        console.warn(`[scene] ${SCENE_ACTION_EVENT} refused: ${r.reason}`);
        return;
      }
      // ⚠️ preventDefault() IS THE RECEIPT, given only once the scene took the action — never for a refusal.
      e.preventDefault();
    };
    window.addEventListener(SCENE_ACTION_EVENT, onAction);
    return () => {
      window.removeEventListener(SCENE_ACTION_EVENT, onAction);
      unregister();
    };
  }, []);

  // One right-hand canvas at a time (see the header): the scene opening closes the code canvas, and vice versa.
  useEffect(() => {
    if (!open) return;
    const artifacts = useArtifactStore.getState();
    if (artifacts.open) artifacts.close();
  }, [open]);
  useEffect(() => useArtifactStore.subscribe((s, prev) => {
    if (s.open && !prev.open && useSceneStore.getState().open) useSceneStore.getState().apply({ type: 'close_scene' });
  }), []);

  const fade = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE };
  const slide = reduceMotion ? { duration: 0 } : { duration: 0.26, ease: EASE };

  return (
    <>
      <AnimatePresence>
        {open && isDesktop && (
          <motion.aside
            key="scene-dock-desktop"
            aria-labelledby={headingId}
            data-scene-dock="desktop"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={slide}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.defaultPrevented) return;
              e.preventDefault();
              close();
            }}
            className="flex min-h-0 w-[45%] min-w-[320px] max-w-[880px] shrink-0 flex-col self-stretch border-l border-app-border/10 bg-app-surface"
          >
            <SceneBody labels={labels} headingId={headingId} locale={locale} phone={false} />
          </motion.aside>
        )}
      </AnimatePresence>
      {mounted && createPortal(
        <AnimatePresence>
          {open && !isDesktop && (
            // z-[95]: the studio's sheet layer, as ArtifactCanvas — over ChatChrome (≤ z-[86]), under its modals.
            <motion.div key="scene-dock-phone" data-scene-dock="phone" className="fixed inset-0 z-[95] flex items-end justify-center">
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 bg-black/55"
                onClick={close}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              />
              <motion.div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                transition={slide}
                className="relative flex h-[88svh] w-full flex-col overflow-hidden rounded-t-[28px] border border-app-border/10 bg-app-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                <div className="flex shrink-0 justify-center pt-2.5" aria-hidden="true">
                  <span className="h-1 w-10 rounded-full bg-app-border/25" />
                </div>
                <SceneBody labels={labels} headingId={headingId} locale={locale} phone />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

export default SceneDock;
