/**
 * @jest-environment jsdom
 *
 * lib/studio/scene3d — the `myavatar:scene-action` contract: what the validator lets through (clamped), what it drops
 * whole, and what the reducer does with it. jsdom only for `dispatchSceneAction`; the rest is pure.
 */
import {
  EMPTY_SCENE,
  SCENE_ACTION_EVENT,
  SCENE_DEFAULT_COLOR,
  SCENE_MAX_OBJECTS,
  SCENE_POSITION_LIMIT,
  SCENE_SCALE_MAX,
  SCENE_SCALE_MIN,
  applySceneAction,
  clampPosition,
  clampScale,
  dispatchSceneAction,
  fitToBox,
  isSceneGlbUrl,
  sceneIdForUrl,
  sceneReducer,
  validateSceneAction,
  wrapAngle,
  type SceneAction,
  type SceneState,
} from './scene3d';

const GLB = 'https://abcd1234.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=eyJhbGciOi.x.y';
const GLB_PUBLIC = 'https://abcd1234.supabase.co/storage/v1/object/public/renders/models3d/pred123.glb';

function valid(detail: unknown): SceneAction {
  const v = validateSceneAction(detail);
  if (!v.ok) throw new Error(`expected a valid action, got ${v.reason}`);
  return v.action;
}
function reason(detail: unknown): string {
  const v = validateSceneAction(detail);
  if (v.ok) throw new Error(`expected a refusal, got ${JSON.stringify(v.action)}`);
  return v.reason;
}
/** Applies a list of raw details through the validator, as the scene's listener does. */
function run(details: unknown[], from: SceneState = EMPTY_SCENE): SceneState {
  return details.reduce<SceneState>((s, d) => sceneReducer(s, valid(d)), from);
}
const cube = (extra: Record<string, unknown> = {}) => ({ type: 'place_object', shape: 'cube', ...extra });
const model = (extra: Record<string, unknown> = {}) => ({ type: 'place_object', url: GLB, ...extra });

describe('the contract', () => {
  it('is the myavatar:scene-action event with the planned bounds', () => {
    expect(SCENE_ACTION_EVENT).toBe('myavatar:scene-action');
    expect(SCENE_POSITION_LIMIT).toBe(10);
    expect([SCENE_SCALE_MIN, SCENE_SCALE_MAX]).toEqual([0.05, 10]);
    expect(SCENE_MAX_OBJECTS).toBe(24);
  });
});

describe('GLB URLs: Supabase Storage only', () => {
  it.each([
    ['a signed URL', GLB],
    ['a public URL', GLB_PUBLIC],
    ['an upper-case host (URL lowercases it)', 'https://ABCD1234.SUPABASE.CO/storage/v1/object/public/a/b.GLB'],
  ])('accepts %s', (_name, url) => {
    expect(isSceneGlbUrl(url)).toBe(true);
  });

  it.each([
    ['http', 'http://abcd1234.supabase.co/storage/v1/object/public/a/b.glb'],
    ['another host', 'https://evil.example/storage/v1/object/public/a/b.glb'],
    ['a look-alike suffix', 'https://abcd1234.supabase.co.evil.example/storage/v1/object/public/a/b.glb'],
    ['a look-alike prefix', 'https://evilsupabase.co/storage/v1/object/public/a/b.glb'],
    ['the bare apex', 'https://supabase.co/storage/v1/object/public/a/b.glb'],
    ['a nested subdomain', 'https://a.b.supabase.co/storage/v1/object/public/a/b.glb'],
    ['a trailing-dot host', 'https://abcd1234.supabase.co./storage/v1/object/public/a/b.glb'],
    ['credentials smuggling another host', 'https://abcd1234.supabase.co@evil.example/storage/v1/object/public/a/b.glb'],
    ['credentials', 'https://user:pw@abcd1234.supabase.co/storage/v1/object/public/a/b.glb'],
    ['a port', 'https://abcd1234.supabase.co:8443/storage/v1/object/public/a/b.glb'],
    ['an edge function', 'https://abcd1234.supabase.co/functions/v1/x.glb'],
    ['the REST API', 'https://abcd1234.supabase.co/rest/v1/x.glb'],
    ['a traversal out of Storage', 'https://abcd1234.supabase.co/storage/v1/object/../../functions/v1/x.glb'],
    ['an encoded traversal', 'https://abcd1234.supabase.co/storage/v1/object/%2e%2e/%2e%2e/functions/v1/x.glb'],
    ['a .gltf', 'https://abcd1234.supabase.co/storage/v1/object/public/a/b.gltf'],
    ['a .glb.png', 'https://abcd1234.supabase.co/storage/v1/object/public/a/b.glb.png'],
    ['whitespace', 'https://abcd1234.supabase.co/storage/v1/object/public/a/b .glb'],
    ['a newline', 'https://abcd1234.supabase.co/storage/v1/object/public/a/b.glb\n'],
    ['a backslash', 'https://abcd1234.supabase.co\\@evil.example/storage/v1/object/public/a/b.glb'],
    ['javascript:', 'javascript:alert(1)//.supabase.co/storage/v1/object/a.glb'],
    ['a data: URL', 'data:model/gltf-binary;base64,Z2xURg=='],
    ['a relative path', '/storage/v1/object/public/a/b.glb'],
    ['an over-long URL', `https://abcd1234.supabase.co/storage/v1/object/public/${'a'.repeat(2100)}.glb`],
  ])('refuses %s', (_name, url) => {
    expect(isSceneGlbUrl(url)).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    for (const v of [undefined, null, 1, {}, [GLB], new URL(GLB)]) expect(isSceneGlbUrl(v)).toBe(false);
  });

  it('gives one Storage object one stable id — re-signed, public or signed alike', () => {
    const id = sceneIdForUrl(GLB);
    expect(id).toMatch(/^glb-[a-z0-9]{1,8}$/);
    expect(sceneIdForUrl(GLB.replace('token=eyJhbGciOi.x.y', 'token=another'))).toBe(id);
    expect(sceneIdForUrl(GLB_PUBLIC)).toBe(id);
    expect(sceneIdForUrl(GLB.replace('pred123', 'pred124'))).not.toBe(id);
    expect(sceneIdForUrl('https://evil.example/a.glb')).toBeNull();
  });
});

describe('validateSceneAction — clamps what is merely out of range', () => {
  it('a bare cube is a valid placement', () => {
    expect(valid(cube())).toEqual({ type: 'place_object', object: { kind: 'shape', shape: 'cube' } });
  });

  it('clamps positions to ±10 on every axis, in array or {x,y,z} form', () => {
    expect(valid(cube({ position: [100, -50, 3.5] }))).toMatchObject({ object: { position: [10, -10, 3.5] } });
    expect(valid(cube({ position: { x: 12 } }))).toMatchObject({ object: { position: [10, 0, 0] } });
    expect(valid(cube({ position: { x: -1e308, y: 2, z: 1e308 } }))).toMatchObject({ object: { position: [-10, 2, 10] } });
  });

  it('clamps scale to 0.05–10 and wraps rotations into (−π, π]', () => {
    expect(valid(cube({ scale: 100 }))).toMatchObject({ object: { scale: 10 } });
    expect(valid(cube({ scale: 0.0001 }))).toMatchObject({ object: { scale: 0.05 } });
    expect(valid(cube({ scale: -3 }))).toMatchObject({ object: { scale: 0.05 } });
    const a = valid(cube({ rotation: [Math.PI * 2 + 0.5, -Math.PI * 2 - 0.5, 1e300] }));
    if (a.type !== 'place_object') throw new Error('type');
    const [x, y, z] = a.object.rotation!;
    expect(x).toBeCloseTo(0.5, 10);
    expect(y).toBeCloseTo(-0.5, 10);
    expect(Math.abs(z)).toBeLessThanOrEqual(Math.PI);
  });

  it('normalises the URL, the colour and the label', () => {
    expect(valid(model())).toMatchObject({ object: { kind: 'glb', url: new URL(GLB).href } });
    expect(valid(cube({ color: '#AABBCC' }))).toMatchObject({ object: { color: '#aabbcc' } });
    const label = valid(cube({ label: '  Clay\njug\u202e evil\u0000  ' }));
    expect(label).toMatchObject({ object: { label: 'Clay jug evil' } });
    const long = valid(cube({ label: '🧊'.repeat(80) }));
    if (long.type !== 'place_object') throw new Error('type');
    expect(Array.from(long.object.label!)).toHaveLength(60); // code points, never half an emoji
    expect(valid(cube({ label: '   ' }))).toEqual({ type: 'place_object', object: { kind: 'shape', shape: 'cube' } });
  });

  it('copies the vectors: the action never holds the producer\'s (possibly hostile) objects', () => {
    const position = [1, 2, 3];
    const a = valid(cube({ position }));
    if (a.type !== 'place_object') throw new Error('type');
    expect(a.object.position).toEqual([1, 2, 3]);
    expect(a.object.position).not.toBe(position);
  });

  it('reads each field once: a getter cannot pass the check with one value and deliver another', () => {
    let reads = 0;
    const position = [0, 0, 0];
    Object.defineProperty(position, 0, { get: () => (reads++ === 0 ? 1 : Number.NaN) });
    const a = valid(cube({ position }));
    if (a.type !== 'place_object') throw new Error('type');
    expect(a.object.position).toEqual([1, 0, 0]);
    expect(reads).toBe(1);
  });
});

describe('validateSceneAction — drops a hostile event whole', () => {
  it.each([
    ['a non-Supabase URL', model({ url: 'https://evil.example/model.glb' }), 'bad_url'],
    ['a NaN position', cube({ position: [Number.NaN, 0, 0] }), 'bad_position'],
    ['a NaN position (object form)', cube({ position: { x: Number.NaN } }), 'bad_position'],
    ['an Infinity position', cube({ position: [0, Infinity, 0] }), 'bad_position'],
    ['string coordinates', cube({ position: ['1', '2', '3'] }), 'bad_position'],
    ['a two-axis position', cube({ position: [1, 2] }), 'bad_position'],
    ['a NaN rotation', cube({ rotation: [0, Number.NaN, 0] }), 'bad_rotation'],
    ['a NaN scale', cube({ scale: Number.NaN }), 'bad_scale'],
    ['a string scale', cube({ scale: '2' }), 'bad_scale'],
    ['both a URL and a shape', model({ shape: 'cube' }), 'ambiguous_source'],
    ['neither a URL nor a shape', { type: 'place_object', position: [0, 0, 0] }, 'missing_source'],
    ['an unknown shape', cube({ shape: 'dodecahedron' }), 'bad_shape'],
    ['a colour on a model', model({ color: '#ffffff' }), 'bad_color'],
    ['a CSS colour that is not #rrggbb', cube({ color: 'red' }), 'bad_color'],
    ['an id with a path in it', cube({ id: '../x' }), 'bad_id'],
    ['an over-long id', cube({ id: 'a'.repeat(41) }), 'bad_id'],
    ['a non-string label', cube({ label: { toString: () => 'x' } }), 'bad_label'],
    ['an unknown type', { type: 'delete_everything' }, 'unknown_type'],
    ['no type', { shape: 'cube' }, 'unknown_type'],
  ])('%s', (_name, detail, why) => {
    expect(reason(detail)).toBe(why);
  });

  it('refuses a 100-object set_scene without looking at the objects', () => {
    const objects = Array.from({ length: 100 }, () => ({ shape: 'cube' }));
    expect(reason({ type: 'set_scene', objects })).toBe('too_many_objects');
    // A sparse array claiming a billion entries is refused on its length alone (iterating it would hang).
    expect(reason({ type: 'set_scene', objects: new Array(1_000_000_000) })).toBe('too_many_objects');
  });

  it('refuses a set_scene with one bad entry, naming it', () => {
    const objects = [{ shape: 'cube' }, { shape: 'sphere' }, { url: 'https://evil.example/x.glb' }];
    expect(reason({ type: 'set_scene', objects })).toBe('objects[2]: bad_url');
    expect(reason({ type: 'set_scene', objects: [{ shape: 'cube', id: 'a' }, { shape: 'cone', id: 'a' }] })).toBe('objects[1]: duplicate_id');
    expect(reason({ type: 'set_scene', objects: 'cubes' })).toBe('bad_objects');
  });

  it('accepts a full scene of exactly the cap', () => {
    const objects = Array.from({ length: SCENE_MAX_OBJECTS }, () => ({ shape: 'cube' }));
    expect(valid({ type: 'set_scene', objects })).toMatchObject({ type: 'set_scene' });
  });

  it.each([
    ['null', null],
    ['a string', 'place_object'],
    ['a number', 42],
    ['an array', [cube()]],
  ])('refuses %s as the detail', (_name, detail) => {
    expect(reason(detail)).toBe('not_an_object');
  });

  it('never throws: a throwing getter and a revoked Proxy are refused as unreadable', () => {
    const throwing = { type: 'place_object', get shape(): string { throw new Error('boom'); } };
    expect(reason(throwing)).toBe('unreadable');
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(reason(proxy)).toBe('unreadable');
    const hostilePosition = new Proxy([0, 0, 0], { get: () => { throw new Error('boom'); } });
    expect(reason(cube({ position: hostilePosition }))).toBe('unreadable');
  });

  it('validates the other action types', () => {
    expect(valid({ type: 'update_object', id: 'obj-1', position: [20, 0, 0], scale: 50 }))
      .toEqual({ type: 'update_object', id: 'obj-1', position: [10, 0, 0], scale: 10 });
    expect(reason({ type: 'update_object', id: 'obj-1' })).toBe('nothing_to_update');
    expect(reason({ type: 'update_object', position: [0, 0, 0] })).toBe('bad_id');
    expect(reason({ type: 'update_object', id: 'obj-1', position: [Number.NaN, 0, 0] })).toBe('bad_position');
    expect(valid({ type: 'remove_object', id: 'obj-1' })).toEqual({ type: 'remove_object', id: 'obj-1' });
    expect(reason({ type: 'remove_object', id: '' })).toBe('bad_id');
    expect(valid({ type: 'select_object', id: null })).toEqual({ type: 'select_object', id: null });
    expect(valid({ type: 'select_object' })).toEqual({ type: 'select_object', id: null });
    expect(reason({ type: 'select_object', id: 7 })).toBe('bad_id');
    for (const type of ['clear_scene', 'open_scene', 'close_scene']) expect(valid({ type, extra: 'ignored' })).toEqual({ type });
  });
});

describe('the reducer', () => {
  it('a placement opens the scene, gets an id, is selected and lands on the floor grid nearest first', () => {
    const s = run([cube(), cube(), cube(), cube()]);
    expect(s.open).toBe(true);
    expect(s.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2', 'obj-3', 'obj-4']);
    expect(s.selectedId).toBe('obj-4');
    // Centre, right, left, then the row behind — side by side, never inside each other.
    expect(s.objects.map((o) => o.position)).toEqual([[0, 0, 0], [1.5, 0, 0], [-1.5, 0, 0], [0, 0, -1.5]]);
    expect(s.objects[0]).toEqual({
      kind: 'shape', shape: 'cube', color: SCENE_DEFAULT_COLOR, id: 'obj-1', label: '', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1,
    });
  });

  it('a free slot is re-used after a removal', () => {
    const s = run([cube(), cube(), { type: 'remove_object', id: 'obj-1' }, cube()]);
    expect(s.objects.map((o) => [o.id, o.position])).toEqual([['obj-2', [1.5, 0, 0]], ['obj-3', [0, 0, 0]]]);
  });

  it(`refuses the ${SCENE_MAX_OBJECTS + 1}th object and leaves the scene exactly as it was`, () => {
    const full = run(Array.from({ length: SCENE_MAX_OBJECTS }, () => cube()));
    expect(full.objects).toHaveLength(SCENE_MAX_OBJECTS);
    const r = applySceneAction(full, valid(model()));
    expect(r).toEqual({ ok: false, reason: 'scene_full', state: full });
    expect(r.state).toBe(full);
    // …but an object ALREADY in the scene can still be re-placed.
    expect(applySceneAction(full, valid(cube({ id: 'obj-3', position: [5, 0, 5] }))).ok).toBe(true);
  });

  it('placing an id that is already there updates it — keeping what the placement leaves out', () => {
    const id = sceneIdForUrl(GLB)!;
    const first = run([model({ id, label: 'Jug' }), { type: 'update_object', id, position: [3, 0, 2], scale: 2 }, { type: 'select_object', id: null }]);
    const again = run([model({ id })], first);
    expect(again.objects).toHaveLength(1);
    expect(again.objects[0]).toMatchObject({ id, label: 'Jug', position: [3, 0, 2], scale: 2 });
    expect(again.selectedId).toBe(id);
    expect(again.open).toBe(true);
    // A shape re-placed without a colour keeps the one it had.
    const coloured = run([cube({ id: 'c', color: '#112233' }), cube({ id: 'c', shape: 'sphere' })]);
    expect(coloured.objects[0]).toMatchObject({ shape: 'sphere', color: '#112233' });
  });

  it('a generated id never collides with an obj-N the producer chose', () => {
    const s = run([cube({ id: 'obj-1' }), cube(), cube()]);
    expect(s.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2', 'obj-3']);
  });

  it('update_object clamps again, keeps the other fields, and refuses an unknown id', () => {
    const s = run([cube()]);
    const moved = sceneReducer(s, { type: 'update_object', id: 'obj-1', position: [99, 0, -99] });
    expect(moved.objects[0]!.position).toEqual([10, 0, -10]);
    expect(moved.objects[0]!.scale).toBe(1);
    // A typed caller's NaN keeps the old value rather than corrupting the object.
    const same = sceneReducer(moved, { type: 'update_object', id: 'obj-1', position: [Number.NaN, 0, 0], scale: Number.NaN });
    expect(same.objects[0]).toMatchObject({ position: [10, 0, -10], scale: 1 });
    expect(applySceneAction(s, { type: 'update_object', id: 'nope', scale: 2 })).toMatchObject({ ok: false, reason: 'unknown_id' });
  });

  it('remove_object clears the selection it removes; select_object refuses an unknown id', () => {
    const s = run([cube(), cube()]);
    const removed = sceneReducer(s, { type: 'remove_object', id: 'obj-2' });
    expect(removed.objects.map((o) => o.id)).toEqual(['obj-1']);
    expect(removed.selectedId).toBeNull();
    expect(applySceneAction(removed, { type: 'remove_object', id: 'obj-2' })).toMatchObject({ ok: false, reason: 'unknown_id' });
    expect(applySceneAction(removed, { type: 'select_object', id: 'obj-9' })).toMatchObject({ ok: false, reason: 'unknown_id' });
    expect(sceneReducer(removed, { type: 'select_object', id: 'obj-1' }).selectedId).toBe('obj-1');
  });

  it('set_scene replaces everything, honours the ids it names, and opens the scene', () => {
    const before = run([cube(), cube()]);
    const s = run([{ type: 'set_scene', objects: [{ shape: 'cone' }, { url: GLB, id: 'obj-1', position: [2, 0, 2] }] }], before);
    expect(s.open).toBe(true);
    expect(s.selectedId).toBeNull();
    // The batch named obj-1 for its SECOND entry; the first entry's generated id steps around it.
    expect(s.objects.map((o) => [o.id, o.kind])).toEqual([['obj-3', 'shape'], ['obj-1', 'glb']]);
    expect(s.objects[1]!.position).toEqual([2, 0, 2]);
  });

  it('clear / open / close — a no-op returns the same state object (no re-render)', () => {
    const s = run([cube()]);
    expect(sceneReducer(s, { type: 'open_scene' })).toBe(s);
    const closed = sceneReducer(s, { type: 'close_scene' });
    expect(closed.open).toBe(false);
    expect(closed.objects).toBe(s.objects);
    expect(sceneReducer(closed, { type: 'close_scene' })).toBe(closed);
    const cleared = sceneReducer(s, { type: 'clear_scene' });
    expect(cleared).toMatchObject({ objects: [], selectedId: null, open: true });
    expect(sceneReducer(cleared, { type: 'clear_scene' })).toBe(cleared);
  });

  it('never mutates the state it is given', () => {
    const deepFreeze = <T,>(v: T): T => {
      if (v && typeof v === 'object' && !Object.isFrozen(v)) {
        Object.freeze(v);
        for (const x of Object.values(v as Record<string, unknown>)) deepFreeze(x);
      }
      return v;
    };
    const s = deepFreeze(run([cube(), model()]));
    const actions: SceneAction[] = [
      valid(cube()), valid(model({ id: s.objects[1]!.id, scale: 3 })), { type: 'update_object', id: 'obj-1', scale: 2 },
      { type: 'remove_object', id: 'obj-1' }, { type: 'select_object', id: 'obj-2' }, { type: 'clear_scene' },
      { type: 'close_scene' }, valid({ type: 'set_scene', objects: [{ shape: 'torus' }] }),
    ];
    for (const a of actions) expect(() => applySceneAction(s, a)).not.toThrow();
  });
});

describe('clamp helpers (typed callers)', () => {
  it('turn non-finite values into safe defaults instead of NaN', () => {
    expect(clampPosition([Number.NaN, Infinity, -Infinity])).toEqual([0, 0, 0]);
    expect(clampPosition([-0, 0, 0])).toEqual([0, 0, 0]);
    expect(Object.is(clampPosition([-0, 0, 0])[0], 0)).toBe(true);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(0)).toBe(SCENE_SCALE_MIN);
    expect(wrapAngle(Number.NaN)).toBe(0);
    expect(wrapAngle(Math.PI)).toBe(Math.PI);
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
  });
});

describe('fitToBox — the framing GlbViewer and the scene share', () => {
  it("centre: the longest side becomes `size`, the box centre the origin (GlbViewer's original math)", () => {
    const fit = fitToBox([10, 20, 30], [110, 70, 40], 2)!;
    expect(fit.scale).toBeCloseTo(2 / 100, 12);
    expect(fit.offset[0]).toBeCloseTo(-60 * 0.02, 12);
    expect(fit.offset[1]).toBeCloseTo(-45 * 0.02, 12);
    expect(fit.offset[2]).toBeCloseTo(-35 * 0.02, 12);
  });

  it('base: x/z centred, the bottom on the floor', () => {
    const fit = fitToBox([-1, 3, -1], [1, 7, 1], 1, 'base')!;
    expect(fit.scale).toBe(0.25);
    expect(fit.offset).toEqual([0, -0.75, 0]); // y = −min.y × k: the model's lowest point lands at y = 0
  });

  it('refuses an empty or degenerate box, and never returns −0', () => {
    expect(fitToBox([0, 0, 0], [0, 0, 0], 2)).toBeNull();
    expect(fitToBox([Infinity, 0, 0], [-Infinity, 0, 0], 2)).toBeNull();
    expect(fitToBox([0, 0, 0], [1, 1, 1], 0)).toBeNull();
    const fit = fitToBox([-1, -1, -1], [1, 1, 1], 2)!;
    for (const n of fit.offset) expect(Object.is(n, 0)).toBe(true);
  });
});

describe('dispatchSceneAction', () => {
  afterEach(() => jest.restoreAllMocks());

  it('dispatches a cancelable event and returns the receipt', () => {
    const seen: CustomEvent[] = [];
    const listener = (e: Event) => { seen.push(e as CustomEvent); e.preventDefault(); };
    window.addEventListener(SCENE_ACTION_EVENT, listener);
    try {
      expect(dispatchSceneAction(cube())).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0]!.cancelable).toBe(true);
      expect(seen[0]!.detail).toEqual(cube());
    } finally {
      window.removeEventListener(SCENE_ACTION_EVENT, listener);
    }
  });

  it('returns false with no scene to take it, and dispatches nothing invalid', () => {
    expect(dispatchSceneAction(cube())).toBe(false);
    const spy = jest.spyOn(window, 'dispatchEvent');
    expect(dispatchSceneAction(model({ url: 'https://evil.example/x.glb' }))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
