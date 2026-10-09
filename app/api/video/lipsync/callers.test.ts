/** @jest-environment node */
/**
 * Every client that STARTS a lip-sync job must also POLL it.
 *
 * ⚠️ POST /api/video/lipsync reserves the avatar price before any work and hands back a `jobId`; the reservation is
 * settled only by a GET `?id=<jobId>` poll — delivery (and the Library row) on success, the refund on a terminal
 * failure. A caller that POSTs and never polls charges the user for a render nobody delivers or refunds.
 *
 * That is exactly what the Film Studio's beta lip-sync toggle did: it POSTed the finished master and read `url` off
 * the reply, a field this route has never returned. It was a silent no-op while the route charged on the poll, and
 * became a 20-credit charge per film the moment the route started reserving at POST.
 *
 * Source-level and per file: a file may not contain more lip-sync STARTS than POLLS. Crude on purpose — it cannot
 * prove a poll belongs to its start, but it catches the shape that leaked: a start with no poll anywhere near it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const SCAN = ['app', 'components', 'hooks', 'lib', 'store'];
const SELF = join('app', 'api', 'video', 'lipsync');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !/\.(test|spec)\.[jt]sx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Source with comments stripped — the explanations quote the routes they describe. A block comment must open at a
 *  line start, after whitespace or inside JSX `{`: a bare `/*` also appears in strings like accept="image/*". */
const codeOf = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/(^|[\s{])\/\*[\s\S]*?\*\//gm, '$1')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** A START is a fetch of the bare route WITH an init (the POST); the readiness/health probes carry a query string. */
const STARTS = /fetch\(\s*['"`]\/api\/video\/lipsync['"`]\s*,/g;
const POLLS = /\/api\/video\/lipsync\?id=/g;

const usage = SCAN.flatMap((d) => walk(join(ROOT, d)))
  .filter((p) => !relative(ROOT, p).startsWith(SELF))
  .map((p) => {
    const src = codeOf(p);
    return { file: relative(ROOT, p), starts: (src.match(STARTS) ?? []).length, polls: (src.match(POLLS) ?? []).length };
  })
  .filter((u) => u.starts > 0);

describe('POST /api/video/lipsync callers', () => {
  it('finds the known callers (the scan is not silently empty)', () => {
    expect(usage.map((u) => u.file)).toEqual(expect.arrayContaining([
      join('components', 'studio', 'OmniStudio.tsx'),
      join('components', 'studio', 'MotionControlPanel.tsx'),
    ]));
  });

  it.each(usage.map((u) => [u.file, u] as const))('%s polls every job it starts', (_f, u) => {
    expect(u.polls).toBeGreaterThanOrEqual(u.starts);
  });
});
