/** @jest-environment node */
/** App Builder input and build plan (Phase 4 prep, not wired). */
import { APP_MAX_FILES, APP_MAX_FILE_BYTES, appPath, buildPlan, checkAppSpec } from './spec';

const base = (extra: Record<string, unknown> = {}) => ({
  id: 'app_abc123', title: 'Tip calculator', template: 'static',
  files: [{ path: 'index.html', text: '<!doctype html><title>Tips</title><script src="src/app.js"></script>' }, { path: 'src/app.js', text: 'console.log(1)' }],
  ...extra,
});

test('a small static app passes; its plan only writes and collects (no install, no build, no network)', () => {
  const r = checkAppSpec(base());
  if (!r.ok) throw new Error(r.error);
  expect(buildPlan(r.app)).toEqual([{ phase: 'write', files: 2 }, { phase: 'collect', from: '.', to: 'apps/app_abc123/dist', maxFiles: 200 }]);
});

test('a vite-react app: lockfile install, allowlisted extras, a deny-all build, then dist', () => {
  const r = checkAppSpec(base({ template: 'vite-react', files: [{ path: 'index.html', text: '<div id=root></div>' }, { path: 'src/main.tsx', text: 'export {}' }], packages: ['date-fns@4.1.0'] }));
  if (!r.ok) throw new Error(r.error);
  const plan = buildPlan(r.app);
  expect(plan.map((p) => p.phase)).toEqual(['write', 'install', 'install', 'build', 'collect']);
  expect(plan.find((p) => p.phase === 'build')).toMatchObject({ egress: [] });
  for (const p of plan) if (p.phase === 'install') expect(p.argv).toContain('--ignore-scripts');
});

test('paths: only text files under src/ or public/ (or index.html); never the template files or a path trick', () => {
  for (const ok of ['index.html', 'src/a.js', 'public/logo.svg', 'src/ui/Button.tsx']) expect(appPath(ok)).toBe(ok);
  for (const bad of ['package.json', 'vite.config.ts', '.npmrc', '../x.js', '/etc/passwd', 'src/../package.json', 'src/.env', 'src\\a.js', 'server.js', 'src/a.exe', 'node_modules/x/index.js', '']) {
    expect(appPath(bad)).toBeNull();
  }
});

test('anything that looks like a key is refused: a built site is public', () => {
  for (const secret of ['const k = "AIza' + 'x'.repeat(35) + '"', 'sk-' + 'a'.repeat(30), '-----BEGIN PRIVATE KEY-----', 'eyJhbGciOiJIUzI1.eyJyb2xlIjoic2VydmljZV9.abcdefghijklmnop', 'SUPABASE_SERVICE_ROLE']) {
    const r = checkAppSpec(base({ files: [{ path: 'index.html', text: 'x' }, { path: 'src/k.js', text: secret }] }));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/key or secret/);
  }
});

test('sizes, counts, duplicates, a missing index.html and template rules', () => {
  expect(checkAppSpec(base({ files: Array.from({ length: APP_MAX_FILES + 1 }, (_, i) => ({ path: `src/f${i}.js`, text: '' })) }))).toMatchObject({ ok: false });
  expect(checkAppSpec(base({ files: [{ path: 'index.html', text: 'x'.repeat(APP_MAX_FILE_BYTES + 1) }] }))).toMatchObject({ ok: false });
  expect(checkAppSpec(base({ files: [{ path: 'index.html', text: 'a' }, { path: 'index.html', text: 'b' }] }))).toMatchObject({ ok: false, error: 'index.html: twice' });
  expect(checkAppSpec(base({ files: [{ path: 'src/a.js', text: 'a' }] }))).toMatchObject({ ok: false, error: 'index.html is needed' });
  expect(checkAppSpec(base({ files: [{ path: 'index.html', text: 'a' }, { path: 'src/a.tsx', text: '' }] }))).toMatchObject({ ok: false });
  expect(checkAppSpec(base({ packages: ['lodash@4.17.21'] }))).toMatchObject({ ok: false, error: 'static apps install no packages' });
  expect(checkAppSpec(base({ template: 'vite-react', packages: ['left-pad@1.3.0'] }))).toMatchObject({ ok: false, error: 'left-pad: not on the allowed list' });
  expect(checkAppSpec(base({ template: 'next' }))).toMatchObject({ ok: false });
  expect(checkAppSpec(base({ id: '../x' }))).toMatchObject({ ok: false, error: 'id' });
});
