/** @jest-environment node */
// Final P0/P1 repair run: no paid provider call may run from CI or an ordinary Preview build. The two owner-approved
// one-shot build checks (Gemini inference, media check) are armed only by a committed request file; this pins that
// neither request file is in the tree and that no build entry point calls them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PAID_HOOKS = ['preview-inference-check', 'preview-media-check'];

describe('paid build hooks are disarmed', () => {
  it('no request file arms a paid check', () => {
    expect(existsSync(join(ROOT, 'scripts/gcp/inference-check.request.json'))).toBe(false);
    expect(existsSync(join(ROOT, 'scripts/global-e2e/media-check.request.json'))).toBe(false);
  });
  it('no build entry point invokes a paid check', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { buildCommand?: string };
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const commands = [vercel.buildCommand ?? '', ...['build', 'prebuild', 'postbuild', 'vercel-build', 'postinstall'].map((k) => pkg.scripts[k] ?? '')];
    for (const c of commands) for (const hook of PAID_HOOKS) expect(c).not.toContain(hook);
  });
});
