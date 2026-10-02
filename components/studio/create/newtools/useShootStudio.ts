'use client';

/**
 * useShootStudio — the state and the runner behind the Interior designer and the Photographer.
 *
 * One hook, called once in OmniStudio, so the studio's giant component gains ONE line instead of two dozen useStates: the
 * two forms (photos · room / preset · camera · brief · aspect · quality · count), the runs their presses started, and the
 * handlers. The panels (components/studio/create/*CreatePanel.tsx) and the result pane are pure views bound to what this
 * returns through props.
 *
 * HOW A PRESS RUNS. A press makes `shootTiles(photos, count)` renders. Each is its own job in the capped-parallel queue
 * (store/useJobQueue — three at a time, the rest wait with a position, the tray shows them) and its own
 * POST /api/nanobanana/image with ONE reference photo, a `studio` object of ids (lib/studio/shootWire) and a per-render
 * `jobId` + `batchTile`. The ROUTE reserves creditCostFor('image') before the provider call and refunds it on every
 * failure exit; this hook never charges, never trusts a price, and shows `shootCredits(photos, count)` — the same function
 * — on the button. A guest is sent to sign-in before anything is submitted (the same `myavatar:auth-required` gate as the
 * composer's Run), and a balance known to be short turns the tap into the top-up (`myavatar:open-credits`).
 *
 * „3D plan" runs the EXISTING /api/orchestrator/interior/produce (its own PRODUCE_COST, reserved and refunded by that
 * route); „Walkthrough" hands the picture to the Video studio (8 s), which prices and charges it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useJobQueue } from '@/store/useJobQueue';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { trackJobComplete, trackJobFail, trackJobUpdate } from '@/lib/jobs/trackJob';
import { gelToCredits } from '@/lib/credits/pricing';
import { easedPct } from '@/components/studio/ui/GenerationProgress';
import { describeGenerationFailure } from '@/components/studio/ui/serviceError';
import { INTERIOR_PANEL_DEFAULTS, interiorTemplate, roomOption } from '@/lib/studio/templates.interior';
import { PHOTOSHOOT_PANEL_DEFAULTS, photoshootTemplate } from '@/lib/studio/templates.photoshoot';
import { TOOL_META } from '@/lib/studio/tools';
import type { AngleId, DofId, LensId, LightId, RoomId, ShootKind, StudioWire } from '@/lib/studio/shootWire';
import {
  PLAN_3D_CREDITS, SHOOT_BRIEF_MAX, SHOOT_MAX_PHOTOS, nearestAspect, shootCredits, shootTargetSec, shootTiles, walkthroughCredits,
  type ShootAspect, type ShootCount, type ShootQuality,
} from '@/lib/studio/shootQuote';
import { SHOOT_COPY, shootLang } from './copy';
import { checkPhotoFile, readPhoto } from './photoFiles';
import { PlanError, runPlan3d } from './plan3d';
import { SHOOT_RUNS_KEY, parseRuns, runsReducer, serializeRuns, type ShootPhotoRef, type ShootRun, type ShootTile } from './shootRuns';

export type AspectChoice = ShootAspect | 'auto';

interface FormBase { photos: ShootPhotoRef[]; brief: string; aspect: AspectChoice; quality: ShootQuality; count: ShootCount }
export interface InteriorForm extends FormBase { room: RoomId; template: string | null }
export interface PhotoshootForm extends FormBase { template: string | null; lens: LensId | null; light: LightId | null; angle: AngleId | null; dof: DofId | null }

const initialInterior = (): InteriorForm => ({
  photos: [], brief: '', room: INTERIOR_PANEL_DEFAULTS.room, template: INTERIOR_PANEL_DEFAULTS.template,
  aspect: INTERIOR_PANEL_DEFAULTS.aspect, quality: INTERIOR_PANEL_DEFAULTS.quality, count: INTERIOR_PANEL_DEFAULTS.count,
});
const initialPhotoshoot = (): PhotoshootForm => ({
  photos: [], brief: '', template: PHOTOSHOOT_PANEL_DEFAULTS.template, lens: PHOTOSHOOT_PANEL_DEFAULTS.lens, light: PHOTOSHOOT_PANEL_DEFAULTS.light,
  angle: PHOTOSHOOT_PANEL_DEFAULTS.angle, dof: PHOTOSHOOT_PANEL_DEFAULTS.dof,
  aspect: PHOTOSHOOT_PANEL_DEFAULTS.aspect, quality: PHOTOSHOOT_PANEL_DEFAULTS.quality, count: PHOTOSHOOT_PANEL_DEFAULTS.count,
});

/** The ratio a render without a photo falls back to under „Auto" (a room is wider than tall). */
export const AUTO_ASPECT_FALLBACK: ShootAspect = '4:3';

export interface ShootDeps {
  locale: string;
  /** OmniStudio's completion choke point: the credit toast, the bell, the native notification, the balance refresh. */
  notifyCredit: (kind: 'image') => void;
  /** A press has started — the phone's settings sheet closes so the results are on screen. */
  onStarted?: () => void;
  /** „Walkthrough": hand this picture to the Video studio (one 8 s clip) with a prompt in its composer. */
  onWalkthrough: (url: string, prompt: string) => void;
}

const isGuest = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.authed === '0';
const fire = (name: string): void => { try { window.dispatchEvent(new CustomEvent(name)); } catch { /* no window */ } };

/** `signal` plus a deadline, where the platform has AbortSignal.any / .timeout (the studio's own image runner assumes both). */
function withDeadline(signal: AbortSignal, ms: number): AbortSignal {
  const A = AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal; timeout?: (n: number) => AbortSignal };
  return typeof A.any === 'function' && typeof A.timeout === 'function' ? A.any([signal, A.timeout(ms)]) : signal;
}

const uid = (p: string): string => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Whether a press has anything to go on: a photo, a chosen card, or the user's own words. */
export const canGenerateForm = (f: { photos: readonly unknown[]; template: string | null; brief: string }): boolean =>
  f.photos.length > 0 || !!f.template || f.brief.trim().length > 0;

/** The ratio a tile is rendered in: the chip's, or — under „Auto" — its own photo's nearest supported shape. */
export function resolveAspect(choice: AspectChoice, photo: { w: number; h: number } | undefined): ShootAspect {
  if (choice !== 'auto') return choice;
  return photo && photo.w > 0 && photo.h > 0 ? nearestAspect(photo.w, photo.h) : AUTO_ASPECT_FALLBACK;
}

/** The English caption a render is asked with when the user wrote nothing — Latin script, so the route's translation leg is skipped. */
export function defaultPrompt(tool: ShootKind, f: { template: string | null; room?: RoomId }): string {
  if (tool === 'interior') {
    const room = f.room && f.room !== 'auto' ? roomOption(f.room)?.label.en : null;
    const style = interiorTemplate(f.template)?.label.en;
    return `Interior design${room ? `: ${room}` : ''}${style ? `, ${style}` : ', a tasteful redesign'}`;
  }
  const preset = photoshootTemplate(f.template);
  return `Photoshoot${preset ? `: ${preset.label.en}` : ''}`;
}

/** What the request names, as ids (lib/studio/shootWire) — never text. */
export function wireOf(tool: 'interior', f: InteriorForm): StudioWire;
export function wireOf(tool: 'photoshoot', f: PhotoshootForm): StudioWire;
export function wireOf(tool: ShootKind, f: InteriorForm | PhotoshootForm): StudioWire {
  if (tool === 'interior') {
    const i = f as InteriorForm;
    return { kind: 'interior', ...(i.template ? { template: i.template } : {}), room: i.room };
  }
  const p = f as PhotoshootForm;
  return {
    kind: 'photoshoot',
    ...(p.template ? { template: p.template } : {}),
    ...(p.lens ? { lens: p.lens } : {}), ...(p.light ? { light: p.light } : {}), ...(p.angle ? { angle: p.angle } : {}), ...(p.dof ? { dof: p.dof } : {}),
  };
}

export function useShootStudio(deps: ShootDeps) {
  const lang = shootLang(deps.locale);
  const copy = SHOOT_COPY[lang];
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [interior, setInterior] = useState<InteriorForm>(initialInterior);
  const [photoshoot, setPhotoshoot] = useState<PhotoshootForm>(initialPhotoshoot);
  const [runs, dispatch] = useReducer(runsReducer, [] as ShootRun[]);
  const [notice, setNotice] = useState<{ tool: ShootKind; text: string } | null>(null);
  const balance = useCreditsBalance((s) => s.balance);
  const balanceCredits = balance === null ? null : gelToCredits(balance);

  // The latest values, for handlers that must stay stable (a job's runner outlives the render that made it).
  const formsRef = useRef({ interior, photoshoot });
  formsRef.current = { interior, photoshoot };
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const balanceRef = useRef(balanceCredits);
  balanceRef.current = balanceCredits;
  const lastPressRef = useRef(0);

  // ─── Restore the gallery (only what is safe to show again — see shootRuns) and keep it saved ──────────────────────
  const hydrated = useRef(false);
  useEffect(() => {
    try { dispatch({ type: 'hydrate', runs: parseRuns(window.localStorage.getItem(SHOOT_RUNS_KEY)) }); } catch { /* private mode — start empty */ }
    hydrated.current = true;
    // The balance behind the Generate button's `insufficient` — cached and de-duplicated by the store.
    if (!isGuest()) void useCreditsBalance.getState().get();
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    try { window.localStorage.setItem(SHOOT_RUNS_KEY, serializeRuns(runs)); } catch { /* quota / private mode — the Library has them */ }
  }, [runs]);

  // ─── Form setters ──────────────────────────────────────────────────────────────────────────────────────────────────
  const patchInterior = useCallback((p: Partial<InteriorForm>) => setInterior((f) => ({ ...f, ...p })), []);
  const patchPhotoshoot = useCallback((p: Partial<PhotoshootForm>) => setPhotoshoot((f) => ({ ...f, ...p })), []);

  /** Picking a shoot preset also suggests its shape once (the aspect chip stays free to change it); an interior style does not. */
  const pickPhotoshoot = useCallback((id: string) => {
    const card = photoshootTemplate(id);
    setPhotoshoot((f) => ({ ...f, template: id, ...(card ? { aspect: card.aspect } : {}) }));
  }, []);

  const updatePhotos = useCallback((tool: ShootKind, fn: (photos: ShootPhotoRef[]) => ShootPhotoRef[]) => {
    if (tool === 'interior') setInterior((f) => ({ ...f, photos: fn(f.photos).slice(0, SHOOT_MAX_PHOTOS) }));
    else setPhotoshoot((f) => ({ ...f, photos: fn(f.photos).slice(0, SHOOT_MAX_PHOTOS) }));
  }, []);

  const addPhotos = useCallback(async (tool: ShootKind, files: File[]) => {
    const form = tool === 'interior' ? formsRef.current.interior : formsRef.current.photoshoot;
    const room = SHOOT_MAX_PHOTOS - form.photos.length;
    const c = SHOOT_COPY[shootLang(depsRef.current.locale)];
    if (room <= 0) { setNotice({ tool, text: c.tooMany }); return; }
    const added: ShootPhotoRef[] = [];
    let bad = false;
    for (const file of files.slice(0, room)) {
      if (checkPhotoFile(file) !== 'ok') { bad = true; continue; }
      try {
        const r = await readPhoto(file);
        added.push({ id: uid('ph'), src: r.src, w: r.w, h: r.h, ...(file.name ? { name: file.name } : {}) });
      } catch { bad = true; }
    }
    // The cap is applied to the state at the moment of the write: two quick picks must not overwrite each other.
    if (added.length) { setNotice(null); updatePhotos(tool, (p) => [...p, ...added]); }
    if (bad) setNotice({ tool, text: c.badFile });
    else if (files.length > room) setNotice({ tool, text: c.tooMany });
  }, [updatePhotos]);

  /** A finished picture becomes the next reference („use as reference" / „make it again from this"). */
  const useAsReference = useCallback((tool: ShootKind, url: string, aspect: ShootAspect) => {
    const [aw, ah] = aspect.split(':').map(Number) as [number, number];
    updatePhotos(tool, (p) => [...p, { id: uid('ph'), src: url, w: aw * 100, h: ah * 100 }].slice(-SHOOT_MAX_PHOTOS));
    setNotice(null);
  }, [updatePhotos]);

  const removePhoto = useCallback((tool: ShootKind, id: string) => {
    updatePhotos(tool, (p) => p.filter((x) => x.id !== id));
    setNotice(null);
  }, [updatePhotos]);

  // ─── One render = one queue job = one POST /api/nanobanana/image ─────────────────────────────────────────────────
  const submitTile = useCallback((run: ShootRun, tile: ShootTile, seq: number, total: number) => {
    const L = depsRef.current.locale;
    const c = SHOOT_COPY[shootLang(L)];
    const photo = tile.photoIndex >= 0 ? run.photos[tile.photoIndex] : undefined;
    const patch = (p: Partial<ShootTile>) => dispatch({ type: 'tile', runId: run.id, tileId: tile.id, patch: p });
    const fail = (error: string, code?: string) => dispatch({ type: 'fail', runId: run.id, tileId: tile.id, error, ...(code ? { code } : {}) });
    const jobId = useJobQueue.getState().submit({
      kind: 'image',
      label: `${run.label} (${seq + 1}/${total})`.slice(0, 60),
      createParams: { prompt: run.prompt },
      // A settle that is not 'done' and wrote no reason (a transport throw, an abort, a cancel while still QUEUED — run()
      // never executed) must still end the tile: the queue guarantees a terminal state, so the card is closed here.
      onSettle: (job) => {
        if (job.status === 'done') { trackJobComplete(job.id, typeof job.result === 'string' ? job.result : undefined); return; }
        trackJobFail(job.id, job.status === 'canceled' ? 'canceled' : (job.error ?? undefined));
        fail(job.status === 'canceled' ? c.stopped : c.failed);
      },
      run: async ({ signal, onProgress, jobId: id }) => {
        const startedAt = Date.now();
        patch({ status: 'rendering', jobId: id, startedAt });
        trackJobUpdate(id, 'Rendering', 8);
        onProgress({ pct: 8 });
        const hb = window.setInterval(() => {
          const p = easedPct(Math.round((Date.now() - startedAt) / 1000), shootTargetSec(run.quality));
          onProgress({ pct: p });
          trackJobUpdate(id, 'Rendering', p);
        }, 6000);
        try {
          const res = await fetch('/api/nanobanana/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            // The route's own ceiling is 300 s: past this deadline, if it was going to answer, it already has.
            signal: withDeadline(signal, 330_000),
            body: JSON.stringify({
              prompt: run.prompt, quality: run.quality, aspectRatio: tile.aspect, jobId: id, batchTile: seq,
              ...(photo ? { referenceImage: photo.src } : {}),
              studio: run.wire,
            }),
          });
          const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string; code?: string; message?: string; refunded?: boolean; authRequired?: boolean };
          onProgress({ pct: 100 });
          if (j.success && j.url) {
            patch({ status: 'ready', url: j.url, error: undefined });
            depsRef.current.notifyCredit('image');
            return j.url;
          }
          const signedOut = res.status === 401 || j.authRequired === true;
          if (signedOut) fire('myavatar:auth-required');
          // ONLY THE SERVER MAY SAY „REFUNDED" (describeGenerationFailure reads `refunded: true`); a photo it could not read
          // keeps its own, more useful line, with the refund notice appended only when it is true.
          const reason = j.code === 'reference_unavailable'
            ? `${c.photoUnreadable}${j.refunded === true ? ` ${describeGenerationFailure({ refunded: true }, L, '')}` : ''}`
            : signedOut ? c.signIn : describeGenerationFailure(j, L, c.failed);
          fail(reason, typeof j.code === 'string' ? j.code : undefined);
          throw new Error(reason);
        } catch (e) {
          const aborted = signal.aborted || (e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message)));
          if (!aborted) fail(c.failed); // a dropped connection: the reason lands on the tile before the rejection escapes (a no-op if one is there)
          throw e;
        } finally {
          window.clearInterval(hb);
        }
      },
    });
    patch({ jobId });
  }, []);

  const buildRun = useCallback((tool: ShootKind): ShootRun => {
    const lg = shootLang(depsRef.current.locale);
    const f = tool === 'interior' ? formsRef.current.interior : formsRef.current.photoshoot;
    const style = tool === 'interior' ? interiorTemplate(f.template) : photoshootTemplate(f.template);
    const roomId = tool === 'interior' ? (f as InteriorForm).room : 'auto';
    const room = roomId !== 'auto' ? roomOption(roomId)?.label[lg] : null;
    const label = [style?.label[lg] ?? TOOL_META[tool].name[lg], room].filter(Boolean).join(' · ');
    const brief = f.brief.trim().slice(0, SHOOT_BRIEF_MAX);
    const photos = f.photos.slice(0, SHOOT_MAX_PHOTOS);
    const sources = photos.length ? photos.map((_, i) => i) : [-1];
    const runId = uid('run');
    const tiles: ShootTile[] = [];
    for (const photoIndex of sources) {
      for (let v = 0; v < f.count; v++) {
        tiles.push({ id: `${runId}_${tiles.length}`, photoIndex, variant: v, aspect: resolveAspect(f.aspect, photoIndex >= 0 ? photos[photoIndex] : undefined), status: 'queued' });
      }
    }
    return {
      id: runId, tool, createdAt: Date.now(), label, brief, quality: f.quality, photos, tiles,
      wire: tool === 'interior' ? wireOf('interior', f as InteriorForm) : wireOf('photoshoot', f as PhotoshootForm),
      prompt: brief || defaultPrompt(tool, { template: f.template, room: roomId }),
    };
  }, []);

  /** The Generate button. Returns what it did, so a test (and the panel) can tell a press from a refusal. */
  const generate = useCallback((tool: ShootKind): 'started' | 'sign-in' | 'top-up' | 'empty' | 'locked' => {
    if (isGuest()) { fire('myavatar:auth-required'); return 'sign-in'; }
    const f = tool === 'interior' ? formsRef.current.interior : formsRef.current.photoshoot;
    if (!canGenerateForm(f)) return 'empty';
    const price = shootCredits(f.photos.length, f.count);
    if (balanceRef.current !== null && balanceRef.current < price) { fire('myavatar:open-credits'); return 'top-up'; }
    // A double tap must not queue the same press twice (the route's mutex would 409 the second, but the user would see two runs).
    const now = Date.now();
    if (now - lastPressRef.current < 1200) return 'locked';
    lastPressRef.current = now;
    const run = buildRun(tool);
    dispatch({ type: 'add', run });
    run.tiles.forEach((t, i) => submitTile(run, t, i, run.tiles.length));
    depsRef.current.onStarted?.();
    return 'started';
  }, [buildRun, submitTile]);

  /** „Another": one more render with the run's own settings (a new reservation, one image's price). */
  const another = useCallback((runId: string, tileId: string): 'started' | 'sign-in' | 'top-up' | 'gone' => {
    if (isGuest()) { fire('myavatar:auth-required'); return 'sign-in'; }
    const run = runsRef.current.find((r) => r.id === runId);
    const tile = run?.tiles.find((t) => t.id === tileId);
    if (!run || !tile) return 'gone';
    if (balanceRef.current !== null && balanceRef.current < shootCredits(0, 1)) { fire('myavatar:open-credits'); return 'top-up'; }
    const seq = run.tiles.length;
    const next: ShootTile = { id: `${run.id}_${seq}`, photoIndex: tile.photoIndex, variant: seq, aspect: tile.aspect, status: 'queued' };
    dispatch({ type: 'addTile', runId, tile: next });
    submitTile(run, next, seq, seq + 1);
    return 'started';
  }, [submitTile]);

  /** Try again after a failure: the failed render was refunded by the route, so this is one fresh reservation. */
  const retry = useCallback((runId: string, tileId: string): 'started' | 'sign-in' | 'top-up' | 'gone' => {
    if (isGuest()) { fire('myavatar:auth-required'); return 'sign-in'; }
    const run = runsRef.current.find((r) => r.id === runId);
    const index = run ? run.tiles.findIndex((t) => t.id === tileId) : -1;
    const tile = run && index >= 0 ? run.tiles[index] : undefined;
    if (!run || !tile) return 'gone';
    if (balanceRef.current !== null && balanceRef.current < shootCredits(0, 1)) { fire('myavatar:open-credits'); return 'top-up'; }
    dispatch({ type: 'tile', runId, tileId, patch: { status: 'queued', error: undefined, code: undefined, url: undefined, jobId: undefined } });
    submitTile(run, { ...tile, status: 'queued' }, index, run.tiles.length);
    return 'started';
  }, [submitTile]);

  const cancel = useCallback((jobId: string | undefined) => { if (jobId) useJobQueue.getState().cancel(jobId); }, []);

  // ─── „3D plan" — the existing interior produce pipeline, on the room's ORIGINAL photo ──────────────────────────────
  const plan3d = useCallback((runId: string, tileId: string): 'started' | 'sign-in' | 'top-up' | 'gone' | 'no-photo' => {
    if (isGuest()) { fire('myavatar:auth-required'); return 'sign-in'; }
    const run = runsRef.current.find((r) => r.id === runId);
    const tile = run?.tiles.find((t) => t.id === tileId);
    if (!run || !tile) return 'gone';
    const src = tile.photoIndex >= 0 ? run.photos[tile.photoIndex]?.src : undefined;
    if (!src) return 'no-photo';
    if (tile.plan?.status === 'running') return 'gone';
    if (balanceRef.current !== null && balanceRef.current < PLAN_3D_CREDITS) { fire('myavatar:open-credits'); return 'top-up'; }
    const L = depsRef.current.locale;
    const c = SHOOT_COPY[shootLang(L)];
    const setPlan = (plan: ShootTile['plan']) => dispatch({ type: 'tile', runId, tileId, patch: { plan } });
    setPlan({ status: 'running', pct: 5 });
    const wire = run.wire as { template?: string; room?: RoomId };
    const style = interiorTemplate(wire.template ?? null)?.label.en;
    const brief = [style ? `${style} style` : '', wire.room && wire.room !== 'auto' ? roomOption(wire.room)?.label.en : '', run.brief].filter(Boolean).join(', ');
    void runPlan3d({ imageUrls: [src], brief, onProgress: (pct, stage) => setPlan({ status: 'running', pct, ...(stage ? { stage } : {}) }) })
      .then((r) => { setPlan({ status: 'ready', geometry: r.geometry, style: r.style }); fire('myavatar:credits-updated'); void useCreditsBalance.getState().get(true); })
      .catch((e: unknown) => {
        if (e instanceof PlanError && e.code === 'unauthorized') fire('myavatar:auth-required');
        const short = e instanceof PlanError && e.code === 'insufficient_credits';
        if (short) fire('myavatar:open-credits');
        setPlan({ status: 'error', error: short ? describeGenerationFailure({ code: 'insufficient_credits' }, L, c.plan3dFailed) : c.plan3dFailed });
      });
    return 'started';
  }, []);

  /** „Walkthrough video": the Video studio opens on this picture with one 8 s clip; ITS button prices and charges it. */
  const walkthrough = useCallback((url: string) => {
    const c = SHOOT_COPY[shootLang(depsRef.current.locale)];
    depsRef.current.onWalkthrough(url, c.walkthroughPrompt);
  }, []);

  // ─── What the views read ────────────────────────────────────────────────────────────────────────────────────────────
  const interiorNotice = notice?.tool === 'interior' ? notice.text : null;
  const photoshootNotice = notice?.tool === 'photoshoot' ? notice.text : null;

  const interiorProps = useMemo(() => {
    const credits = shootCredits(interior.photos.length, interior.count);
    return {
      locale: deps.locale,
      form: interior,
      credits,
      tiles: shootTiles(interior.photos.length, interior.count),
      insufficient: balanceCredits !== null && balanceCredits < credits,
      canGenerate: canGenerateForm(interior),
      notice: interiorNotice,
      onPatch: patchInterior,
      onAddPhotos: (files: File[]) => { void addPhotos('interior', files); },
      onRemovePhoto: (id: string) => removePhoto('interior', id),
      onGenerate: () => { generate('interior'); },
    };
  }, [deps.locale, interior, balanceCredits, interiorNotice, patchInterior, addPhotos, removePhoto, generate]);

  const photoshootProps = useMemo(() => {
    const credits = shootCredits(photoshoot.photos.length, photoshoot.count);
    return {
      locale: deps.locale,
      form: photoshoot,
      credits,
      tiles: shootTiles(photoshoot.photos.length, photoshoot.count),
      insufficient: balanceCredits !== null && balanceCredits < credits,
      canGenerate: canGenerateForm(photoshoot),
      notice: photoshootNotice,
      onPatch: patchPhotoshoot,
      onPickPreset: pickPhotoshoot,
      onAddPhotos: (files: File[]) => { void addPhotos('photoshoot', files); },
      onRemovePhoto: (id: string) => removePhoto('photoshoot', id),
      onGenerate: () => { generate('photoshoot'); },
    };
  }, [deps.locale, photoshoot, balanceCredits, photoshootNotice, patchPhotoshoot, pickPhotoshoot, addPhotos, removePhoto, generate]);

  /** The composer's tool chip: the style or preset in one short word, and ×N when it is more than one. */
  const summary = (tool: ShootKind): string => {
    const f = tool === 'interior' ? interior : photoshoot;
    const card = tool === 'interior' ? interiorTemplate(f.template) : photoshootTemplate(f.template);
    const n = f.photos.length > 1 ? `${f.photos.length}×${f.count}` : f.count > 1 ? `×${f.count}` : null;
    return [card?.label[lang], n].filter(Boolean).join(' · ');
  };

  return {
    interior, photoshoot, runs, balanceCredits,
    interiorProps, photoshootProps,
    generate, another, retry, cancel, plan3d, walkthrough, useAsReference, summary,
    dismissRun: (runId: string) => dispatch({ type: 'dismiss', runId }),
    dismissTile: (runId: string, tileId: string) => dispatch({ type: 'dropTile', runId, tileId }),
    clearRuns: (tool: ShootKind) => dispatch({ type: 'clear', tool }),
    addPhotos, removePhoto,
    prices: { plan3d: PLAN_3D_CREDITS, walkthrough: walkthroughCredits(), image: shootCredits(0, 1) },
    copy,
  };
}

export type ShootStudio = ReturnType<typeof useShootStudio>;
