/** @jest-environment node */
/**
 * The 3D scene's promises that live in source rather than behaviour (OmniStudio is 9k lines behind a dynamic import,
 * so — as the other studio suites do — these read the SOURCE for the lines each promise hangs on):
 *  · OmniStudio mounts the scene next to the code canvas, and a 3D result's model rides on the message as `glbUrl` —
 *    kept by leanMessages (a reload) and sent to the chat model (historySerializer);
 *  · three.js is never in the dashboard's first load: SceneCanvas is reachable only through next/dynamic, ssr: false;
 *  · the narrow R3F surface GlbViewer fought for (`next build` OOM) holds: no drei Stage, useGLTF or TransformControls,
 *    and models load through GlbViewer's own FramedGlb;
 *  · the controller is isomorphic (this file runs in node);
 *  · the Live `place_object` declaration stays dark until the Live probe passes (docs/SUPER_APP_PLAN.md Wave 3b).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSceneAction } from '@/lib/studio/scene3d';
import { LIVE_ACTION_NAMES, LIVE_FUNCTION_DECLARATIONS } from '@/lib/voice/liveTools';

const root = join(__dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
/** Source without comments, so a ⚠️ note that NAMES a banned helper does not count as using it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const omni = read('components', 'studio', 'OmniStudio.tsx');
const dock = code(read('components', 'studio', 'scene', 'SceneDock.tsx'));
const canvas = code(read('components', 'studio', 'scene', 'SceneCanvas.tsx'));
const viewer = code(read('components', 'studio', 'GlbViewer.tsx'));

describe('OmniStudio wiring', () => {
  it('mounts the scene right next to the code canvas', () => {
    expect(omni).toContain("import { SceneDock } from './scene/SceneDock';");
    const artifact = omni.indexOf('<ArtifactCanvas locale={locale} />');
    const scene = omni.indexOf('<SceneDock locale={locale} />');
    expect(artifact).toBeGreaterThan(0);
    expect(scene).toBeGreaterThan(artifact);
    // Nothing but a comment between them: the two right-hand canvases are siblings in the same row.
    expect(omni.slice(artifact, scene).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace('<ArtifactCanvas locale={locale} />', '').trim()).toBe('');
    expect(omni.match(/<SceneDock /g)).toHaveLength(1);
  });

  it('a 3D result carries its model as data, kept on reload and sent to the chat model', () => {
    const msg = omni.slice(omni.indexOf('interface Msg {'), omni.indexOf('}', omni.indexOf('glbUrl?: string')) + 1);
    expect(msg).toMatch(/glbUrl\?: string/);
    const lean = omni.slice(omni.indexOf('function leanMessages('), omni.indexOf('function conversationTitle('));
    expect(lean).toContain('...(m.glbUrl ? { glbUrl: m.glbUrl } : {}),');
    const payload = omni.slice(omni.indexOf('const payload = serializeHistory(history.map((m) => ({'), omni.indexOf('const chatMode = getChatMode();'));
    expect(payload).toContain('...(m.glbUrl ? { glbUrl: m.glbUrl } : {}),');
    expect(omni).toMatch(/if \(r\.glbUrl\) \{[\s\S]{0,700}glbUrl: r\.glbUrl,/);
  });
});

describe('three.js stays out of the first load', () => {
  it('SceneDock reaches SceneCanvas only through next/dynamic with ssr: false', () => {
    expect(dock).toMatch(/dynamic<SceneCanvasProps>\(\(\) => import\('\.\/SceneCanvas'\), \{\s*ssr: false,/);
    // The one other mention is a type-only import, which compiles away.
    expect(dock.match(/from '\.\/SceneCanvas'/g)).toHaveLength(1);
    expect(dock).toContain("import type { SceneCanvasProps } from './SceneCanvas';");
    for (const heavy of ['three', '@react-three/fiber', '@react-three/drei', '../GlbViewer']) {
      expect({ heavy, imported: dock.includes(`from '${heavy}`) }).toEqual({ heavy, imported: false });
    }
  });
});

describe('the narrow R3F surface (GlbViewer header: `next build` runs near the OOM line)', () => {
  it.each([
    ['drei Stage', /\bStage\b/],
    ['useGLTF', /\buseGLTF\b/],
    ['TransformControls', /\bTransformControls\b/],
    ['a Draco / KTX2 / Meshopt decoder', /DRACOLoader|KTX2Loader|MeshoptDecoder/],
  ])('neither SceneCanvas nor GlbViewer uses %s', (_name, re) => {
    expect(re.test(canvas)).toBe(false);
    expect(re.test(viewer)).toBe(false);
  });

  it("SceneCanvas loads models through GlbViewer's FramedGlb, the one loader + framing", () => {
    expect(canvas).toContain("import { FramedGlb } from '../GlbViewer';");
    expect(canvas).toContain('<FramedGlb url={o.url} size={1} anchor="base" />');
    expect(canvas).not.toContain('useLoader');
    expect(viewer).toContain('<FramedGlb url={url} />');
  });

  it('every object is wrapped in its own ErrorBoundary and Suspense', () => {
    expect(canvas).toMatch(/objects\.map\(\(o\) => \([\s\S]{0,400}<ErrorBoundary key=\{[^}]*o\.id[^}]*\}[\s\S]{0,200}<SceneItem /);
    expect(canvas).toMatch(/<Suspense fallback=\{<MarkerBox [^>]*\/>\}>\s*<FramedGlb /);
  });
});

describe('the controller', () => {
  it('is isomorphic: it imports and validates in node, with no window', () => {
    expect(typeof window).toBe('undefined');
    expect(validateSceneAction({ type: 'place_object', shape: 'cube' }).ok).toBe(true);
  });
});

describe('left dark', () => {
  it('the Live lock declares no place_object yet — a 400 on the lock would drop every Live action', () => {
    expect(LIVE_ACTION_NAMES as readonly string[]).not.toContain('place_object');
    expect(LIVE_FUNCTION_DECLARATIONS.map((d) => d.name as string)).not.toContain('place_object');
  });
});
