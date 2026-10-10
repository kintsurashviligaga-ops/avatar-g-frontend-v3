/** @jest-environment node */
/**
 * THE DEAD ORCHESTRATION STACKS STAY DEAD (Agent G PART 1, gap A7 of docs/handoffs/agent-g/part-0-report.md).
 *
 * Agent G has one way in: lib/agent/intent → lib/agent/chatTurn in the chat, the typed registry (lib/agent/tools) for a
 * model, the Task API for work in flight. The older stacks below have no live caller and most read tables Production
 * does not have; removing them is the owner's call. Until then this is a ratchet: the files that import them today are
 * pinned, a NEW importer fails here, and an importer that goes away must leave the list (so it only ever shrinks).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SCAN = ['app', 'components', 'lib', 'hooks', 'store'];

/** The dead modules, as repo paths without extension (a directory covers everything in it). */
const DEAD = [
  'lib/agent-g/orchestrator',
  'lib/agentg',
  'lib/agents/agentGRouter',
  'lib/agents/orchestrator',
  'lib/decision-engine',
  'lib/automation',
  'lib/agent/videoQueue',
];

/** Today's importers from outside the dead modules (importer → dead module), pinned. Only removals are allowed. */
const PINNED = new Set([
  'app/api/agent-g/chat/route.ts → lib/agentg',
  'app/api/agent-g/execute/route.ts → lib/agent-g/orchestrator',
  'app/api/agent-g/orchestrate/route.ts → lib/agentg',
  'app/api/agent-g/output/route.ts → lib/agent-g/orchestrator',
  'app/api/agent-g/plan/route.ts → lib/agent-g/orchestrator',
  'app/api/agent/video-queue/drain/route.ts → lib/agent/videoQueue',
  'app/api/agent/video-queue/route.ts → lib/agent/videoQueue',
  'app/api/agents/chat/route.ts → lib/agents/agentGRouter',
  'app/api/agents/execute/route.ts → lib/agents/agentGRouter',
  'app/api/automation/route.ts → lib/automation',
  'app/api/decision/evaluate/route.ts → lib/decision-engine',
  'app/api/market/scan/route.ts → lib/decision-engine',
  'app/api/projects/[projectId]/versions/[versionId]/rerun/route.ts → lib/agents/agentGRouter',
  'app/api/projects/[projectId]/versions/route.ts → lib/agents/agentGRouter',
  'components/chat/ChatShell.tsx → lib/agents/orchestrator',
  'components/chat/UniversalChat.tsx → lib/agents/orchestrator',
  'lib/agent-g/channels/telegram-webhook-handler.ts → lib/agentg',
  'lib/agents/index.ts → lib/agents/orchestrator',
  'lib/chat/orchestration/agentRouter.ts → lib/agents/orchestrator',
]);

const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.(test|spec)\.(ts|tsx)$/;
function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SOURCE.test(e.name) && !TEST.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
}

const SPEC = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const repoPath = (abs: string) => path.relative(ROOT, abs).split(path.sep).join('/');
const deadOf = (rel: string): string | undefined => DEAD.find((d) => rel === d || rel.startsWith(`${d}/`) || rel.startsWith(`${d}.`));

function importers(): Set<string> {
  const files: string[] = [];
  for (const d of SCAN) walk(path.join(ROOT, d), files);
  const found = new Set<string>();
  for (const file of files) {
    const from = repoPath(file);
    if (deadOf(from)) continue; // inside a dead stack: its own business
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1]!;
      const target = spec.startsWith('@/') ? spec.slice(2)
        : spec.startsWith('.') ? repoPath(path.resolve(path.dirname(file), spec))
          : null;
      const dead = target ? deadOf(target.replace(/\.(ts|tsx|js)$/, '')) : undefined;
      if (dead) found.add(`${from} → ${dead}`);
    }
  }
  return found;
}

test('the dead modules all still exist (the list names real code)', () => {
  for (const d of DEAD) {
    const there = ['', '.ts', '.tsx'].some((ext) => fs.existsSync(path.join(ROOT, d + ext)));
    expect({ module: d, there }).toEqual({ module: d, there: true });
  }
});

test('no new code imports a dead orchestration stack', () => {
  const now = importers();
  const added = [...now].filter((x) => !PINNED.has(x)).sort();
  expect(added).toEqual([]);
});

test('an importer that went away leaves the pinned list (the ratchet only shrinks)', () => {
  const now = importers();
  const gone = [...PINNED].filter((x) => !now.has(x)).sort();
  expect(gone).toEqual([]);
});

test('Agent G\'s own path does not touch them', () => {
  const now = [...importers()];
  for (const own of ['lib/agent/intent.ts', 'lib/agent/chatTurn.ts', 'lib/agent/capabilities.ts', 'components/studio/OmniStudio.tsx', 'app/api/tasks/route.ts']) {
    expect(now.filter((x) => x.startsWith(`${own} →`))).toEqual([]);
  }
});
