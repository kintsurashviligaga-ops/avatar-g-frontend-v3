/**
 * Vercel ships a route's lambda with only the files Next's tracer finds. ffmpeg-static's binary and @resvg's native
 * module are not found on their own, so every route that reaches them must list them in next.config.js
 * `outputFileTracingIncludes`, or the lambda ENOENTs at runtime while every local and CI run passes. Agent G's edit
 * route went without its entry: each edit's probe failed inside a catch and the file read as unreadable.
 *
 * This walks the import graph (static and dynamic imports, `@/` and relative paths) of every Agent G and task route
 * and fails when a route reaches either package without the entry.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';

const ROOT = join(__dirname, '..');
const NATIVE = { ffmpeg: 'ffmpeg-static', resvg: '@resvg/resvg-js' } as const;
// …and the talking avatar's two routes (lib/avatar/voicedClip): the poll that lays its ElevenLabs line over the clip; and
// the video service's direct clip (app/api/video/clip), whose Georgian line the same poll lays on (lib/video/voicedClip);
// and the uploaded video's edit / extend (app/api/video/omni-edit), which ffmpeg measures and re-encodes before pricing.
const SCOPES = [
  'app/api/agent', 'app/api/tasks', 'app/api/genjutsu/status', 'app/api/avatar/veo', 'app/api/video/clip', 'app/api/video/omni-edit',
  'app/api/film/sweep',
];

/** Routes that import a module reaching the package but never run it. Each needs a reason a reviewer can check. */
const NEVER_RUNS: Record<string, { ffmpeg?: string; resvg?: string }> = {
  '/api/agent/approvals': {
    ffmpeg: 'imports montageLive for `audit` only',
    resvg: 'imports montageLive for `audit` only',
  },
  '/api/agent/video-queue': {
    ffmpeg: 'enqueue and status only; the watermark runs in /api/agent/video-queue/drain',
    resvg: 'enqueue and status only; the watermark runs in /api/agent/video-queue/drain',
  },
  '/api/agent/media/audio': { resvg: 'takes the sound out of a video; draws no text' },
  '/api/agent/media/analyze': { resvg: 'probes the file; draws nothing' },
  '/api/agent/run': { resvg: 'its tools quote; renders run in the edit and task workers' },
  '/api/genjutsu/status': { resvg: 'crops a clip and lays the avatar line over it (lib/video/remixOps); draws no text' },
  '/api/avatar/veo': {
    ffmpeg: 'speaks the line and submits the clip; ffmpeg runs where it is delivered (/api/genjutsu/status)',
    resvg: 'speaks the line and submits the clip; draws nothing',
  },
  '/api/video/clip': {
    ffmpeg: 'speaks a Georgian line and submits the clip; ffmpeg runs where it is delivered (/api/genjutsu/status)',
    resvg: 'speaks a Georgian line and submits the clip; draws nothing',
  },
};

function routeFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) return routeFiles(relative(ROOT, p));
    return name === 'route.ts' ? [p] : [];
  });
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : join(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function reaches(entry: string): Set<string> {
  const seen = new Set<string>();
  const found = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      if (spec === NATIVE.ffmpeg || spec.startsWith(`${NATIVE.ffmpeg}/`)) found.add('ffmpeg');
      else if (spec === NATIVE.resvg) found.add('resvg');
      else if (spec.startsWith('@/') || spec.startsWith('.')) {
        const next = resolveLocal(file, spec);
        if (next && !/\.test\.tsx?$/.test(next)) stack.push(next);
      }
    }
  }
  return found;
}

function tracingIncludes(): Map<string, string> {
  const text = readFileSync(join(ROOT, 'next.config.js'), 'utf8');
  const block = text.slice(text.indexOf('outputFileTracingIncludes'));
  const out = new Map<string, string>();
  for (const m of block.matchAll(/'(\/api\/[^']+)':\s*\[([^\]]*)\]/g)) out.set(m[1]!, m[2]!);
  return out;
}

describe('native binaries ride with every Agent G, task and avatar route that uses them', () => {
  const includes = tracingIncludes();
  const routes = SCOPES.flatMap(routeFiles);

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes.map((r) => [relative(ROOT, r)]))('%s', (file) => {
    const found = reaches(join(ROOT, file));
    const route = `/${dirname(file).replace(/^app\//, '')}`;
    const listed = includes.get(route) ?? '';
    const missing = [...found].filter(
      (k) => !listed.includes(`./node_modules/${k === 'ffmpeg' ? 'ffmpeg-static' : '@resvg'}/**`) && !NEVER_RUNS[route]?.[k as 'ffmpeg' | 'resvg'],
    );
    expect({ route, missing }).toEqual({ route, missing: [] });
  });
});
