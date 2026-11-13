/** @jest-environment node */
/** Package installs for code runs (Phase 4 prep, not wired): allowlisted, exact pins, argv only, registries only. */
import { twoPhasePlan } from './packages';
import { INSTALL_EGRESS, PKG_MAX, checkPackages, parsePkg } from './packages';

test('exact pins on the list pass and give an argv install with no scripts, and only the registry hosts', () => {
  const r = checkPackages('pip', ['pandas==2.3.3', 'matplotlib==3.10.7', 'pandas==2.3.3']);
  expect(r).toMatchObject({ ok: true, packages: [{ name: 'pandas', version: '2.3.3' }, { name: 'matplotlib', version: '3.10.7' }], egress: INSTALL_EGRESS.pip });
  if (r.ok) expect(r.command).toEqual(expect.arrayContaining(['--only-binary=:all:', 'pandas==2.3.3', 'matplotlib==3.10.7']));
  const n = checkPackages('npm', ['lodash@4.17.21']);
  if (!n.ok) throw new Error(n.error);
  expect(n.command).toContain('--ignore-scripts');
  expect(n.egress).toEqual(['registry.npmjs.org']);
});

test('no packages: nothing to install and no network at all', () => {
  expect(checkPackages('pip', [])).toEqual({ ok: true, ecosystem: 'pip', packages: [], command: [], egress: [] });
});

test('ranges, latest, URLs, git, paths, extra flags and shell tricks are refused before anything runs', () => {
  for (const bad of ['pandas', 'pandas>=2', 'pandas==2.*', 'git+https://x/y.git', 'https://evil/x.whl', './local', '-e .', '--index-url=http://x', 'pandas==2.3.3; rm -rf /', 'pandas==2.3.3 --pre']) {
    expect(checkPackages('pip', [bad])).toMatchObject({ ok: false });
  }
  for (const bad of ['lodash', 'lodash@^4', 'lodash@latest', 'github:x/y', 'file:../x', 'lodash@4.17.21 && curl x']) {
    expect(checkPackages('npm', [bad])).toMatchObject({ ok: false });
  }
});

test('names off the list, versions off the list, too many, or not a list are refused by name', () => {
  expect(checkPackages('pip', ['requestz==2.32.5'])).toEqual({ ok: false, error: 'requestz: not on the allowed list' });
  expect(checkPackages('pip', ['pandas==1.0.0'])).toEqual({ ok: false, error: 'pandas: only 2.3.3' });
  expect(checkPackages('pip', Array.from({ length: PKG_MAX + 1 }, () => 'pandas==2.3.3'))).toMatchObject({ ok: false });
  expect(checkPackages('pip', 'pandas==2.3.3')).toMatchObject({ ok: false });
  expect(checkPackages('cargo' as never, [])).toMatchObject({ ok: false });
});

test('parsePkg normalizes case and pip underscores; scoped npm names parse', () => {
  expect(parsePkg('pip', 'Python_Docx==1.2.0')).toEqual({ name: 'python-docx', version: '1.2.0' });
  expect(parsePkg('npm', '@scope/pkg@1.0.0')).toEqual({ name: '@scope/pkg', version: '1.0.0' });
});

test('two phases (GG 2026-11-13): registry egress only while installing; the run is always deny-all', () => {
  const p = twoPhasePlan('pip', ['pandas==2.3.3'], 60);
  if (!p.ok) throw new Error(p.error);
  expect(p.phases.map((x) => x.phase)).toEqual(['install', 'run']);
  expect(p.phases[0]).toMatchObject({ egress: ['pypi.org', 'files.pythonhosted.org'] });
  expect(p.phases[1]).toEqual({ phase: 'run', egress: [], wallSec: 60 });
  const none = twoPhasePlan('npm', undefined, 60);
  expect(none).toEqual({ ok: true, phases: [{ phase: 'run', egress: [], wallSec: 60 }] });
  // A bad list refuses the whole run; it never falls back to running without the packages.
  expect(twoPhasePlan('npm', ['left-pad@1.3.0'], 60)).toMatchObject({ ok: false });
});

test('names that live on every object ("constructor", "tostring") are refused cleanly, never crash', () => {
  expect(checkPackages('pip', ['constructor==1.0.0'])).toEqual({ ok: false, error: 'constructor: not on the allowed list' });
  expect(checkPackages('npm', ['constructor@1.0.0'])).toEqual({ ok: false, error: 'constructor: not on the allowed list' });
  expect(checkPackages('npm', ['hasownproperty@1.0.0'])).toMatchObject({ ok: false });
});
