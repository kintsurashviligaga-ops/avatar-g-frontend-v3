/** @jest-environment node */
/**
 * Two promises that live in source rather than behaviour:
 *  · OmniStudio opens the 'photo' tool as its own mode, and the workspace's early return sits BELOW every hook (the
 *    Surgical Editor's return taught that lesson with React error #300);
 *  · „photos never leave your device" — the tool's own line — holds because nothing under components/studio/photo or
 *    lib/photo can talk to a network. A fetch added here must fail CI before it can ship a broken promise.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const omni = readFileSync(join(root, 'components', 'studio', 'OmniStudio.tsx'), 'utf8');

describe('OmniStudio wiring', () => {
  it("has 'photo' in its mode union — the state and the setter — and selectTool maps the tool onto it", () => {
    expect(omni).toMatch(/useState<'chat' \| [^>]*'photo'[^>]*>\('chat'\)/);
    expect(omni).toMatch(/const setMode = useCallback\(\(m: [^)]*'photo'/);
    expect(omni).toMatch(/case 'photo': setMode\('photo'\); break;/);
    // A phone's settings sheet is put away as the workspace opens (it is not rendered there), as for the editor.
    expect(omni).toContain("if (mode === 'surgical' || mode === 'photo') setOptionsOpen(false);");
  });

  it('renders the workspace from an early return placed after the editor’s, i.e. below every hook', () => {
    const surgical = omni.indexOf("if (mode === 'surgical') {");
    const photo = omni.indexOf("if (mode === 'photo') {");
    expect(surgical).toBeGreaterThan(0);
    expect(photo).toBeGreaterThan(surgical);
    expect(omni.slice(photo, photo + 400)).toContain('<PhotoWorkspace locale={locale}');
    // No hook between the two returns.
    expect(omni.slice(surgical, photo)).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref|LayoutEffect)\(/);
  });
});

describe('photos never leave the device', () => {
  const dirs = [join(root, 'components', 'studio', 'photo'), join(root, 'lib', 'photo')];
  const sources = dirs.flatMap((d) => readdirSync(d)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .map((f) => ({ f, src: readFileSync(join(d, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') })));

  it('found the culling sources', () => {
    expect(sources.map((s) => s.f)).toEqual(expect.arrayContaining(['PhotoWorkspace.tsx', 'cull.worker.ts', 'cullMetrics.ts', 'grade.ts']));
  });

  it.each([
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/],
    ['WebSocket', /WebSocket/],
    ['EventSource', /EventSource/],
    ['an /api/ route', /['"`]\/api\//],
    ['Supabase', /supabase/i],
    ['the upload hook', /useUpload|uploadBigFile/],
  ])('no culling source uses %s', (_name, re) => {
    for (const { f, src } of sources) expect({ f, hit: re.test(src) }).toEqual({ f, hit: false });
  });
});
