/**
 * lib/studio/scene3d.ts — the 3D scene's controller: the `myavatar:scene-action` window-event contract, the validator
 * every event goes through, and the pure reducer the scene (components/studio/scene) runs.
 *
 * Producers never import the scene. They dispatch, cancelable:
 *
 *   window.dispatchEvent(new CustomEvent('myavatar:scene-action', { cancelable: true, detail: {
 *     type: 'place_object',
 *     url: 'https://<ref>.supabase.co/storage/v1/object/sign/renders/models3d/<id>.glb?token=…',  // or shape: 'cube'
 *     position: [0, 0, 0],   // or {x, y, z}; metres, the object's BASE point; clamped to ±10
 *     rotation: [0, 0, 0],   // radians, wrapped to (−π, π]
 *     scale: 1,              // uniform, clamped to 0.05–10
 *     label: 'Clay jug', id: 'jug-1', color: '#cbd5e1',   // all optional
 *   } }));
 *
 * or `dispatchSceneAction(detail)` below. A mounted SceneDock calls preventDefault() as its RECEIPT once the scene took
 * the action — the contract ArtifactCanvas gives `myavatar:open-artifact`. No receipt = nothing changed.
 *
 *   place_object   add one object (or, with an `id` already in the scene, update that one — so "Add to scene" twice
 *                  shows the model instead of stacking a copy); opens the scene and selects it
 *   update_object  {id, position?, rotation?, scale?} — absolute values, clamped
 *   remove_object  {id}          select_object {id | null}
 *   set_scene      {objects: [...]} — replace everything, at most SCENE_MAX_OBJECTS
 *   clear_scene · open_scene · close_scene
 *
 * ⚠️ THE DETAIL IS UNTRUSTED. Today's producer is our own "Add to scene" button; the planned one is a Live `place_object`
 * call — model output, steerable by whatever the model was just shown. So every field is re-validated here and an
 * event with ANY bad field is dropped WHOLE with a reason (a NaN, an Infinity, a non-Supabase URL, a 100-object batch):
 * no partial scene, no exception into the producer. Out-of-range numbers are CLAMPED, not refused — "a bit further
 * left than the floor" is a placement, NaN is not.
 * ⚠️ GLBs ONLY FROM `https://<project>.supabase.co/storage/v1/object/…/*.glb`. Our pipeline re-hosts every model there
 * (app/api/v2/model3d/status), it is the only model host in the CSP's connect-src, and anything else would have the
 * canvas fetch an arbitrary URL on the producer's say-so. Refused at the door, the producer gets a reason instead of a
 * broken object.
 * ⚠️ NOTHING HERE SPENDS. Placing is free; MAKING a model is the 3D panel's paid Run and stays a user tap.
 *
 * Pure and isomorphic (no three.js, no DOM beyond the guarded dispatch helper): it imports and runs in node as well.
 */

// ─── Contract ────────────────────────────────────────────────────────────────

/** The window event every scene producer dispatches (detail = an action, see the header). */
export const SCENE_ACTION_EVENT = 'myavatar:scene-action';

/** Positions are clamped to ±this on every axis (metres; the floor grid is drawn to the same bound). */
export const SCENE_POSITION_LIMIT = 10;
export const SCENE_SCALE_MIN = 0.05;
export const SCENE_SCALE_MAX = 10;
/** A scene holds at most this many objects: a place beyond it is refused, a bigger set_scene is dropped whole. */
export const SCENE_MAX_OBJECTS = 24;
export const SCENE_LABEL_MAX_CHARS = 60;
export const SCENE_URL_MAX_CHARS = 2048;

export const SCENE_SHAPES = ['cube', 'sphere', 'cylinder', 'cone', 'torus'] as const;
export type SceneShape = (typeof SCENE_SHAPES)[number];

export const SCENE_ACTION_TYPES = [
  'place_object', 'update_object', 'remove_object', 'select_object', 'set_scene', 'clear_scene', 'open_scene', 'close_scene',
] as const;
export type SceneActionType = (typeof SCENE_ACTION_TYPES)[number];

/** A neutral "clay" — shapes are scene content, not UI, but the product has one accent and this is not a second one. */
export const SCENE_DEFAULT_COLOR = '#cbd5e1';

export type Vec3 = readonly [number, number, number];

type SceneSource = { kind: 'glb'; url: string } | { kind: 'shape'; shape: SceneShape; color: string };

export type SceneObject = SceneSource & {
  id: string;
  /** '' = none given; the UI names it ("3D model", "Cube"). */
  label: string;
  /** The object's base point. */
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
  scale: number;
};

/** A validated placement: the source is required, the rest is filled by the reducer. */
export type ScenePlacement = ({ kind: 'glb'; url: string } | { kind: 'shape'; shape: SceneShape; color?: string }) & {
  id?: string;
  label?: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: number;
};

export type SceneAction =
  | { type: 'place_object'; object: ScenePlacement }
  | { type: 'update_object'; id: string; position?: Vec3; rotation?: Vec3; scale?: number }
  | { type: 'remove_object'; id: string }
  | { type: 'select_object'; id: string | null }
  | { type: 'set_scene'; objects: ScenePlacement[] }
  | { type: 'clear_scene' }
  | { type: 'open_scene' }
  | { type: 'close_scene' };

export interface SceneState {
  open: boolean;
  objects: readonly SceneObject[];
  selectedId: string | null;
  /** Counter behind generated ids (`obj-N`). */
  seq: number;
}

export const EMPTY_SCENE: SceneState = Object.freeze({
  open: false,
  objects: Object.freeze([]) as readonly SceneObject[],
  selectedId: null,
  seq: 0,
});

// ─── Field validators ────────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
/** Exactly one project label: `<ref>.supabase.co`. new URL() has already lowercased and punycoded the host. */
const SUPABASE_HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co$/;
const STORAGE_PATH = '/storage/v1/object/';
const TAU = Math.PI * 2;

/**
 * True for a model this scene may load: https, `<project>.supabase.co` exactly (no port, no credentials), a Storage
 * object path, a `.glb` file, no whitespace or control characters, ≤ SCENE_URL_MAX_CHARS. The path is checked AFTER
 * URL normalisation, so `/storage/v1/object/../../functions/v1/x.glb` is judged as the `/storage/functions/…` it is.
 */
export function isSceneGlbUrl(raw: unknown): raw is string {
  return normalizeGlbUrl(raw) !== null;
}

/** The canonical form of an allowed model URL (`URL.href`), or null. */
function normalizeGlbUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > SCENE_URL_MAX_CHARS) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\]/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (!SUPABASE_HOST_RE.test(u.hostname)) return null;
  if (!u.pathname.startsWith(STORAGE_PATH) || !/\.glb$/i.test(u.pathname)) return null;
  return u.href;
}

/**
 * A stable object id for a model URL: the same Storage object — signed again, or public vs signed — gets the same id,
 * so placing it twice updates the one already in the scene. FNV-1a over host + object path; null for a refused URL.
 */
export function sceneIdForUrl(raw: unknown): string | null {
  const href = normalizeGlbUrl(raw);
  if (!href) return null;
  const u = new URL(href);
  const object = u.pathname.slice(STORAGE_PATH.length).replace(/^(?:sign|public|authenticated)\//, '');
  let h = 0x811c9dc5;
  for (const ch of `${u.hostname}/${object}`) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `glb-${h.toString(36)}`;
}

const isShape = (v: unknown): v is SceneShape => typeof v === 'string' && (SCENE_SHAPES as readonly string[]).includes(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** `|| 0` turns −0 into 0. A non-finite input never reaches here from an event (the validator refuses it). */
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n)) || 0;
const axis = (n: number): number => (Number.isFinite(n) ? clamp(n, -SCENE_POSITION_LIMIT, SCENE_POSITION_LIMIT) : 0);

/** Each axis into ±SCENE_POSITION_LIMIT; a non-finite axis from a typed caller becomes 0, never NaN. */
export function clampPosition(v: Vec3): Vec3 {
  return [axis(v[0]), axis(v[1]), axis(v[2])];
}

/** Into SCENE_SCALE_MIN–SCENE_SCALE_MAX; a non-finite scale from a typed caller becomes 1. */
export function clampScale(s: number): number {
  return Number.isFinite(s) ? clamp(s, SCENE_SCALE_MIN, SCENE_SCALE_MAX) : 1;
}

/**
 * Into (−π, π]. `%` is exact in IEEE arithmetic, so even 1e300 rad lands in range (a round-trip division would not).
 * NaN / ±Infinity (typed callers only — events with them are refused) become 0.
 */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r <= -Math.PI) r += TAU;
  return r || 0;
}

const wrapRotation = (v: Vec3): Vec3 => [wrapAngle(v[0]), wrapAngle(v[1]), wrapAngle(v[2])];

/**
 * `[x, y, z]` (exactly three) or `{x?, y?, z?}` (a missing axis is 0) of finite numbers. undefined = absent,
 * null = present but invalid. Each slot is read ONCE: a getter that answers differently on a second read must not
 * slip a NaN past the check.
 */
function readVec3(v: unknown): Vec3 | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object') return null;
  let x: unknown;
  let y: unknown;
  let z: unknown;
  if (Array.isArray(v)) {
    if (v.length !== 3) return null;
    [x, y, z] = [v[0], v[1], v[2]];
  } else {
    ({ x = 0, y = 0, z = 0 } = v as { x?: unknown; y?: unknown; z?: unknown });
  }
  return finite(x) && finite(y) && finite(z) ? [x, y, z] : null;
}

/** One visible line: no control or bidi-override characters, whitespace collapsed, at most SCENE_LABEL_MAX_CHARS. */
function cleanLabel(raw: string): string {
  const flat = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(flat); // never split a surrogate pair
  return chars.length > SCENE_LABEL_MAX_CHARS ? chars.slice(0, SCENE_LABEL_MAX_CHARS).join('').trimEnd() : flat;
}

// ─── Event validation ────────────────────────────────────────────────────────

export type SceneValidation = { ok: true; action: SceneAction } | { ok: false; reason: string };

const refuse = (reason: string): SceneValidation => ({ ok: false, reason });

type PlacementResult = { ok: true; placement: ScenePlacement } | { ok: false; reason: string };

function readPlacement(raw: unknown): PlacementResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not_an_object' };
  const { id, url, shape, color, label, position, rotation, scale } = raw as Record<string, unknown>;
  if (url !== undefined && shape !== undefined) return { ok: false, reason: 'ambiguous_source' };
  if (url === undefined && shape === undefined) return { ok: false, reason: 'missing_source' };

  let source: ScenePlacement;
  if (url !== undefined) {
    const href = normalizeGlbUrl(url);
    if (!href) return { ok: false, reason: 'bad_url' };
    if (color !== undefined) return { ok: false, reason: 'bad_color' }; // a model has its own materials
    source = { kind: 'glb', url: href };
  } else {
    if (!isShape(shape)) return { ok: false, reason: 'bad_shape' };
    if (color !== undefined && (typeof color !== 'string' || !COLOR_RE.test(color))) return { ok: false, reason: 'bad_color' };
    source = { kind: 'shape', shape, ...(typeof color === 'string' ? { color: color.toLowerCase() } : {}) };
  }

  if (id !== undefined && (typeof id !== 'string' || !ID_RE.test(id))) return { ok: false, reason: 'bad_id' };
  if (label !== undefined && typeof label !== 'string') return { ok: false, reason: 'bad_label' };
  const pos = readVec3(position);
  if (pos === null) return { ok: false, reason: 'bad_position' };
  const rot = readVec3(rotation);
  if (rot === null) return { ok: false, reason: 'bad_rotation' };
  if (scale !== undefined && !finite(scale)) return { ok: false, reason: 'bad_scale' };

  const name = typeof label === 'string' ? cleanLabel(label) : '';
  return {
    ok: true,
    placement: {
      ...source,
      ...(typeof id === 'string' ? { id } : {}),
      ...(name ? { label: name } : {}),
      ...(pos ? { position: clampPosition(pos) } : {}),
      ...(rot ? { rotation: wrapRotation(rot) } : {}),
      ...(finite(scale) ? { scale: clampScale(scale) } : {}),
    },
  };
}

function validateDetail(detail: object): SceneValidation {
  const d = detail as Record<string, unknown>;
  const type = d.type;
  if (typeof type !== 'string' || !(SCENE_ACTION_TYPES as readonly string[]).includes(type)) return refuse('unknown_type');

  switch (type as SceneActionType) {
    case 'place_object': {
      const p = readPlacement(detail);
      return p.ok ? { ok: true, action: { type: 'place_object', object: p.placement } } : refuse(p.reason);
    }
    case 'update_object': {
      const { id, position, rotation, scale } = d;
      if (typeof id !== 'string' || !ID_RE.test(id)) return refuse('bad_id');
      const pos = readVec3(position);
      if (pos === null) return refuse('bad_position');
      const rot = readVec3(rotation);
      if (rot === null) return refuse('bad_rotation');
      if (scale !== undefined && !finite(scale)) return refuse('bad_scale');
      if (!pos && !rot && scale === undefined) return refuse('nothing_to_update');
      return {
        ok: true,
        action: {
          type: 'update_object',
          id,
          ...(pos ? { position: clampPosition(pos) } : {}),
          ...(rot ? { rotation: wrapRotation(rot) } : {}),
          ...(finite(scale) ? { scale: clampScale(scale) } : {}),
        },
      };
    }
    case 'remove_object': {
      const { id } = d;
      return typeof id === 'string' && ID_RE.test(id) ? { ok: true, action: { type: 'remove_object', id } } : refuse('bad_id');
    }
    case 'select_object': {
      const { id } = d;
      if (id === undefined || id === null) return { ok: true, action: { type: 'select_object', id: null } };
      return typeof id === 'string' && ID_RE.test(id) ? { ok: true, action: { type: 'select_object', id } } : refuse('bad_id');
    }
    case 'set_scene': {
      const { objects } = d;
      if (!Array.isArray(objects)) return refuse('bad_objects');
      // The length FIRST: a sparse `new Array(1e9)` or a Proxy claiming a huge length is refused without iterating.
      if (objects.length > SCENE_MAX_OBJECTS) return refuse('too_many_objects');
      const out: ScenePlacement[] = [];
      const ids = new Set<string>();
      for (let i = 0; i < objects.length; i++) {
        const p = readPlacement(objects[i]);
        if (!p.ok) return refuse(`objects[${i}]: ${p.reason}`);
        if (p.placement.id !== undefined) {
          if (ids.has(p.placement.id)) return refuse(`objects[${i}]: duplicate_id`);
          ids.add(p.placement.id);
        }
        out.push(p.placement);
      }
      return { ok: true, action: { type: 'set_scene', objects: out } };
    }
    case 'clear_scene':
    case 'open_scene':
    case 'close_scene':
      return { ok: true, action: { type } as SceneAction };
  }
}

/**
 * An event's `detail` → a validated, clamped action, or the reason it was refused. Never throws, whatever `detail` is —
 * a throwing getter or a revoked Proxy is refused as `unreadable`.
 */
export function validateSceneAction(detail: unknown): SceneValidation {
  if (detail === null || typeof detail !== 'object') return refuse('not_an_object');
  try {
    // Inside the try: Array.isArray itself throws on a revoked Proxy.
    if (Array.isArray(detail)) return refuse('not_an_object');
    return validateDetail(detail);
  } catch {
    return refuse('unreadable');
  }
}

/**
 * For producers: dispatches the action (cancelable) when it is valid. Returns true only when a mounted scene took it
 * (its preventDefault receipt); false for an invalid detail (nothing is dispatched), no scene, or a refusal.
 */
export function dispatchSceneAction(detail: unknown): boolean {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return false;
  if (!validateSceneAction(detail).ok) return false;
  try {
    const ev = new CustomEvent(SCENE_ACTION_EVENT, { detail, cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  } catch {
    return false; // a throwing listener is that listener's bug
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export type SceneApplyResult =
  | { ok: true; state: SceneState }
  | { ok: false; reason: 'scene_full' | 'unknown_id'; state: SceneState };

const SLOT_SPACING = 1.5;
/**
 * Where a placement without a position lands: a 5 × 5 floor grid around the origin (25 ≥ the cap), nearest first;
 * among equals the same row first (right, then left), then the row behind — so a later object does not stand in front
 * of an earlier one from the default camera.
 */
const SLOTS: readonly Vec3[] = (() => {
  const out: Array<[number, number, number]> = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) out.push([j * SLOT_SPACING, 0, i * SLOT_SPACING]);
  return out.sort((a, b) => a[0] ** 2 + a[2] ** 2 - (b[0] ** 2 + b[2] ** 2)
    || Math.abs(a[2]) - Math.abs(b[2]) || a[2] - b[2] || b[0] - a[0]);
})();

/** The nearest free slot — "Add to scene" three times puts three models side by side, not inside each other. */
function freeSlot(objects: readonly SceneObject[]): Vec3 {
  const minGap = SLOT_SPACING / 2;
  return SLOTS.find((s) => objects.every((o) => Math.hypot(o.position[0] - s[0], o.position[2] - s[2]) >= minGap)) ?? [0, 0, 0];
}

/** The next `obj-N` not in use. A producer may have named its own object `obj-N`; a generated id never collides. */
function nextId(taken: ReadonlySet<string>, seq: number): { id: string; seq: number } {
  let n = seq;
  let id: string;
  do {
    n += 1;
    id = `obj-${n}`;
  } while (taken.has(id));
  return { id, seq: n };
}

/** The placement's source; a re-placed shape with no colour keeps the colour it had. */
function sourceOf(p: ScenePlacement, prev?: SceneObject): SceneSource {
  if (p.kind === 'glb') return { kind: 'glb', url: p.url };
  return { kind: 'shape', shape: p.shape, color: p.color ?? (prev?.kind === 'shape' ? prev.color : SCENE_DEFAULT_COLOR) };
}

function create(p: ScenePlacement, id: string, others: readonly SceneObject[]): SceneObject {
  return {
    ...sourceOf(p),
    id,
    label: p.label ?? '',
    position: p.position ? clampPosition(p.position) : freeSlot(others),
    rotation: p.rotation ? wrapRotation(p.rotation) : [0, 0, 0],
    scale: p.scale !== undefined ? clampScale(p.scale) : 1,
  };
}

/** Finite values only — a typed caller's NaN keeps the old value instead of corrupting the scene. */
function patchVec(prev: Vec3, next: Vec3 | undefined, fit: (v: Vec3) => Vec3): Vec3 {
  return next && next.every((n) => Number.isFinite(n)) ? fit(next) : prev;
}

/**
 * Applies one VALIDATED action. Pure: never mutates `state`, and returns the same `state` object when nothing changes.
 * Refusals: `scene_full` (a new object past SCENE_MAX_OBJECTS) and `unknown_id`. Numbers are clamped again here, so a
 * typed caller (the scene's own buttons) cannot push an object off the floor either.
 */
export function applySceneAction(state: SceneState, action: SceneAction): SceneApplyResult {
  const ok = (next: SceneState): SceneApplyResult => ({ ok: true, state: next });
  const no = (reason: 'scene_full' | 'unknown_id'): SceneApplyResult => ({ ok: false, reason, state });

  switch (action.type) {
    case 'place_object': {
      const p = action.object;
      const at = p.id !== undefined ? state.objects.findIndex((o) => o.id === p.id) : -1;
      if (at >= 0) {
        const prev = state.objects[at]!;
        const next: SceneObject = {
          ...sourceOf(p, prev),
          id: prev.id,
          label: p.label ?? prev.label,
          position: patchVec(prev.position, p.position, clampPosition),
          rotation: patchVec(prev.rotation, p.rotation, wrapRotation),
          scale: p.scale !== undefined && Number.isFinite(p.scale) ? clampScale(p.scale) : prev.scale,
        };
        const objects = state.objects.slice();
        objects[at] = next;
        return ok({ ...state, objects, open: true, selectedId: next.id });
      }
      if (state.objects.length >= SCENE_MAX_OBJECTS) return no('scene_full');
      const { id, seq } = p.id !== undefined ? { id: p.id, seq: state.seq } : nextId(new Set(state.objects.map((o) => o.id)), state.seq);
      const obj = create(p, id, state.objects);
      return ok({ ...state, objects: [...state.objects, obj], open: true, selectedId: obj.id, seq });
    }
    case 'update_object': {
      const at = state.objects.findIndex((o) => o.id === action.id);
      if (at < 0) return no('unknown_id');
      const prev = state.objects[at]!;
      const next: SceneObject = {
        ...prev,
        position: patchVec(prev.position, action.position, clampPosition),
        rotation: patchVec(prev.rotation, action.rotation, wrapRotation),
        scale: action.scale !== undefined && Number.isFinite(action.scale) ? clampScale(action.scale) : prev.scale,
      };
      const objects = state.objects.slice();
      objects[at] = next;
      return ok({ ...state, objects });
    }
    case 'remove_object': {
      if (!state.objects.some((o) => o.id === action.id)) return no('unknown_id');
      return ok({
        ...state,
        objects: state.objects.filter((o) => o.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      });
    }
    case 'select_object': {
      if (action.id === state.selectedId) return ok(state);
      if (action.id !== null && !state.objects.some((o) => o.id === action.id)) return no('unknown_id');
      return ok({ ...state, selectedId: action.id });
    }
    case 'set_scene': {
      if (action.objects.length > SCENE_MAX_OBJECTS) return no('scene_full');
      const objects: SceneObject[] = [];
      // Every id the batch names is reserved up front, so a generated `obj-N` never takes one a LATER entry asked for.
      const taken = new Set<string>();
      for (const p of action.objects) if (p.id !== undefined) taken.add(p.id);
      const used = new Set<string>();
      let seq = state.seq;
      for (const p of action.objects) {
        let id: string;
        if (p.id !== undefined && !used.has(p.id)) id = p.id;
        else ({ id, seq } = nextId(taken, seq));
        taken.add(id);
        used.add(id);
        objects.push(create(p, id, objects));
      }
      return ok({ open: true, objects, selectedId: null, seq });
    }
    case 'clear_scene':
      return state.objects.length === 0 && state.selectedId === null ? ok(state) : ok({ ...state, objects: [], selectedId: null });
    case 'open_scene':
      return state.open ? ok(state) : ok({ ...state, open: true });
    case 'close_scene':
      return state.open ? ok({ ...state, open: false }) : ok(state);
  }
}

/** `applySceneAction` for `useReducer`: a refusal leaves the state as it was. */
export function sceneReducer(state: SceneState, action: SceneAction): SceneState {
  return applySceneAction(state, action).state;
}

// ─── Framing (shared with components/studio/GlbViewer) ───────────────────────

export type FitAnchor = 'center' | 'base';
export interface BoxFit {
  scale: number;
  offset: [number, number, number];
}

/**
 * The uniform scale + offset that make a box `size` units on its longest side, centred on the origin — or, with
 * `anchor: 'base'`, standing ON it (x/z centred, the bottom at y = 0), which is how a scene object sits on the floor.
 * A generated mesh arrives at an arbitrary scale and offset; this is the framing drei's Stage did, by hand. null for an
 * empty or degenerate box.
 */
export function fitToBox(min: Vec3, max: Vec3, size: number, anchor: FitAnchor = 'center'): BoxFit | null {
  const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(longest > 0) || !Number.isFinite(longest) || !(size > 0) || !Number.isFinite(size)) return null;
  const k = size / longest;
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] as const;
  return {
    scale: k,
    offset: [-c[0] * k || 0, (anchor === 'base' ? -min[1] * k : -c[1] * k) || 0, -c[2] * k || 0],
  };
}
