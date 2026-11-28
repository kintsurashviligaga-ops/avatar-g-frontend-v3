/** @jest-environment node */
/**
 * Phase 8.26 — what Vercel runs before it deploys. Each case is a hole that was open until 2026-11-28:
 *  - types and lint were skipped on Vercel (`ignoreBuildErrors: VERCEL === '1'`, `ignoreDuringBuilds: true`);
 *  - vercel.json `functions` is FIRST MATCH WINS (@vercel/build-utils findMatchingFunction walks the keys in order),
 *    so the Live avatar route listed after `app/api/avatar/**` got 30 s instead of its 60 s;
 *  - npm 12 blocks dependency install scripts that `allowScripts` does not cover, and ffmpeg-static only gets its
 *    binary from its install script: without it every ffmpeg route ENOENTs inside a catch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const minimatch: (path: string, pattern: string) => boolean = require('minimatch');

const root = process.cwd();
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  buildCommand: string;
  functions: Record<string, { maxDuration?: number }>;
};
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { allowScripts?: Record<string, boolean> };
const nextConfigSrc = readFileSync(join(root, 'next.config.js'), 'utf8');

describe('Vercel build gate', () => {
  it('runs tsc and next lint before next build, chained with && so an error stops the deploy', () => {
    const steps = vercel.buildCommand.split('&&').map((s) => s.trim());
    const tsc = steps.findIndex((s) => /(^|\s)tsc --noEmit$/.test(s));
    const lint = steps.findIndex((s) => /^next lint\b/.test(s));
    const build = steps.findIndex((s) => /^BUILD_CHECKS_PASSED=1 next build$/.test(s));
    expect(tsc).toBeGreaterThanOrEqual(0);
    expect(lint).toBeGreaterThan(tsc);
    expect(build).toBe(steps.length - 1);
    expect(build).toBeGreaterThan(lint);
  });

  it('next build skips its own checks only when that chain set BUILD_CHECKS_PASSED, never because it is on Vercel', () => {
    expect(nextConfigSrc).toMatch(/ignoreDuringBuilds:\s*process\.env\.BUILD_CHECKS_PASSED === '1'/);
    expect(nextConfigSrc).toMatch(/ignoreBuildErrors:\s*process\.env\.BUILD_CHECKS_PASSED === '1'/);
    expect(nextConfigSrc).not.toMatch(/ignoreBuildErrors:\s*process\.env\.VERCEL/);
    expect(nextConfigSrc).not.toMatch(/ignoreDuringBuilds:\s*true/);
  });

  it('every functions pattern matches a route and no specific entry is shadowed by an earlier glob', () => {
    const routes = globSync('app/api/**/route.{ts,tsx,js}', { cwd: root });
    const patterns = Object.keys(vercel.functions);
    const firstMatch = (file: string) => patterns.find((p) => file === p || minimatch(file, p));
    for (const p of patterns) {
      expect({ pattern: p, matches: routes.some((r) => r === p || minimatch(r, p)) }).toEqual({ pattern: p, matches: true });
    }
    for (const r of routes) {
      if (patterns.includes(r)) expect({ route: r, winner: firstMatch(r) }).toEqual({ route: r, winner: r });
    }
  });

  it('allowScripts lets the native binaries (ffmpeg, sharp, swc) run their install scripts', () => {
    const allow = pkg.allowScripts ?? {};
    for (const name of ['ffmpeg-static', 'sharp', '@swc/core']) expect({ name, allowed: allow[name] }).toEqual({ name, allowed: true });
  });
});
