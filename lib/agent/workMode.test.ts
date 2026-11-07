/**
 * @jest-environment node
 *
 * Work Mode end to end, offline (GG's audit ACTION 3): Research → CSV → Python → Chart → Georgian PDF → Library, every
 * step carried out by the same code paths the routes use, every step recorded in ONE task graph. The browser and the
 * sandbox are stubbed (the live ones need a Vercel Sandbox); the workspace, the quotes, the PDF renderer and the graph
 * are the real ones.
 */
import { memoryBlobs, workspaceStore } from './workspace/store';
import { workspaceAction, pdfPathOf, type ExportDeps } from './workspace/actions';
import { quoteBrowserTask, runBrowserQuote, type BrowserDeps } from './browser/quote';
import { quoteCodeRun, runCodeQuote, type CodeDeps } from './sandbox/codeQuote';
import type { SandboxRunner } from './sandbox/policy';
import type { BrowserRunner } from './browser/runner';
import { readGraph } from './taskGraphStore';
import { renderDocumentPdf } from '@/lib/documents/pdf';

const U = '11111111-2222-3333-4444-555555555555';
const sig = new AbortController().signal;

const REPORT = {
  title: 'ლარის კურსი',
  locale: 'ka',
  sections: [{
    heading: 'შედეგი',
    blocks: [
      { type: 'paragraph', text: 'აშშ დოლარი და ევრო ლართან მიმართებით.' },
      { type: 'table', columns: ['ვალუტა', 'კურსი'], rows: [['USD', '2.71'], ['EUR', '3.02']] },
      { type: 'chart', kind: 'bar', labels: ['USD', 'EUR'], values: [2.71, 3.02], unit: '₾' },
    ],
  }],
};

async function setup() {
  const store = workspaceStore(memoryBlobs());
  const w = await store.ensure(U, 'Agent G');
  if (!w.ok) throw new Error(w.message);
  const claimed = new Set<string>();
  const claim = async (_o: string, key: string) => (claimed.has(key) ? 'held' as const : (claimed.add(key), 'claimed' as const));
  let n = 0;
  const browserRunner: BrowserRunner = {
    async run() {
      return {
        ok: true,
        steps: [{ op: 'goto', ok: true, url: 'https://nbg.gov.ge/rates' }, { op: 'text', ok: true, text: 'USD\t2.71\nEUR\t3.02' }, { op: 'screenshot', ok: true, shot: 'rates' }],
        shots: [{ name: 'rates', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
        finalUrl: 'https://nbg.gov.ge/rates',
        wallMs: 3000,
      };
    },
  };
  const codeInputs: string[][] = [];
  const codeRunner: SandboxRunner = {
    async run(_plan, _s, io) {
      codeInputs.push(io!.inputs.map((f) => f.path));
      return {
        ok: true, exitCode: 0, stdout: '2 rows\n', stderr: '', outputs: [], wallMs: 800,
        collected: [
          { path: 'data.csv', bytes: Buffer.from('currency,rate\nUSD,2.71\nEUR,3.02\n') },
          { path: 'chart.svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
          { path: 'report.json', bytes: Buffer.from(JSON.stringify(REPORT)) },
        ],
      };
    },
  };
  const bd: BrowserDeps = { key: () => 'k', now: () => 1_000_000, newId: () => `job${++n}aaaaaaaa`, claim, enabled: () => true, runner: () => browserRunner, workspace: () => store };
  const cd: CodeDeps = { key: () => 'k', now: () => 1_000_000, newId: () => `job${++n}bbbbbbbb`, claim, enabled: () => true, runner: () => codeRunner, workspace: () => store };
  const filed: Array<{ path: string; contentType: string; bytes: number }> = [];
  const exp: ExportDeps = {
    async toLibrary(i) { filed.push({ path: i.path, contentType: i.contentType, bytes: i.bytes.length }); return 'lib-1'; },
    async renderPdf(spec) { return (await renderDocumentPdf(spec)).bytes; },
  };
  return { store, ws: w.workspace.id, bd, cd, exp, filed, codeInputs };
}

describe('Work Mode: one task graph from research to the Library', () => {
  it('runs the chain in order and the graph says what each step read and wrote', async () => {
    const { store, ws, bd, cd, exp, filed, codeInputs } = await setup();
    const plan = await workspaceAction(store, exp, U, {
      action: 'task_plan', workspaceId: ws,
      plan: {
        title: 'ლარის კურსი', nodes: [
          { id: 'research', kind: 'browser', title: 'Read the rates page' },
          { id: 'analyse', kind: 'code', title: 'CSV, chart, report.json', needs: ['research'] },
          { id: 'pdf', kind: 'pdf', title: 'Georgian PDF', needs: ['analyse'] },
          { id: 'library', kind: 'export', title: 'File it', needs: ['pdf'] },
        ],
      },
    }, 'agent');
    expect(plan.status).toBe(200);
    const graph = (plan.body.graph as { id: string }).id;
    const task = (node: string) => ({ graph, node });

    // Out of order: the PDF step before the analysis is refused, and nothing is written.
    const early = await workspaceAction(store, exp, U, { action: 'render_pdf', workspaceId: ws, path: 'report.json', task: task('pdf') }, 'agent');
    expect(early.status).toBe(404); // report.json does not exist yet
    const earlyCode = quoteCodeRun(cd, { userId: U, request: { language: 'python', code: 'x', workspaceId: ws, task: task('analyse') } });
    if (!earlyCode.ok) throw new Error(earlyCode.message);
    expect(await runCodeQuote(cd, { userId: U, request: earlyCode.request, token: earlyCode.token }, sig))
      .toMatchObject({ ok: false, error: 'bad_input', message: expect.stringContaining('research') });

    // 1. Research in the browser.
    const bq = quoteBrowserTask(bd, { userId: U, request: { steps: [{ op: 'goto', url: 'https://nbg.gov.ge/rates' }, { op: 'text' }, { op: 'screenshot', name: 'rates' }], workspaceId: ws, task: task('research') } });
    if (!bq.ok) throw new Error(bq.message);
    const br = await runBrowserQuote(bd, { userId: U, request: bq.request, token: bq.token }, sig);
    if (!br.ok) throw new Error(br.message);

    // 2. Python over what it found: CSV, chart, report.json. The early attempt used nothing up: the same quote runs now.
    expect(await runCodeQuote(cd, { userId: U, request: earlyCode.request, token: earlyCode.token }, sig)).toMatchObject({ ok: true });
    expect(codeInputs[0]).toEqual(expect.arrayContaining([`${br.workspace.folder}/text-1.txt`, `${br.workspace.folder}/rates.png`]));

    // 3. The Georgian PDF, 4. into the Library.
    const pdf = await workspaceAction(store, exp, U, { action: 'render_pdf', workspaceId: ws, path: 'report.json', task: task('pdf') }, 'agent');
    expect(pdf).toMatchObject({ status: 200, body: { ok: true, file: { path: 'report.pdf' } } });
    const bytes = await store.read(U, ws, 'report.pdf');
    expect(bytes.ok && bytes.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const lib = await workspaceAction(store, exp, U, { action: 'export', workspaceId: ws, path: 'report.pdf', task: task('library') }, 'agent');
    expect(lib).toMatchObject({ status: 200, body: { libraryId: 'lib-1', kind: 'document' } });
    expect(filed).toEqual([expect.objectContaining({ path: 'report.pdf', contentType: 'application/pdf' })]);

    // The evidence trail.
    const g = await readGraph(store, U, ws, graph);
    if (!g.ok) throw new Error(g.error);
    expect(g.graph.nodes.map((x) => x.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(g.graph.nodes[0]!.outputs).toEqual(expect.arrayContaining([`${br.workspace.folder}/steps.json`]));
    expect(g.graph.nodes[1]!.outputs).toEqual(['data.csv', 'chart.svg', 'report.json']);
    expect(g.graph.nodes[2]).toMatchObject({ inputs: ['report.json'], outputs: ['report.pdf'] });
    expect(g.graph.nodes[3]).toMatchObject({ inputs: ['report.pdf'], outputs: ['library:lib-1'] });
    const read = await workspaceAction(store, exp, U, { action: 'task_read', workspaceId: ws, graph }, 'agent');
    expect(read.body.summary).toContain('✓ library [export]');
    // A done step cannot run twice.
    expect(await workspaceAction(store, exp, U, { action: 'export', workspaceId: ws, path: 'report.pdf', task: task('library') }, 'agent'))
      .toMatchObject({ status: 409, body: { error: 'task_not_ready' } });
  });

  it('render_pdf refuses what is not a document spec, and needs a renderer', async () => {
    const { store, ws, exp } = await setup();
    await store.write(U, ws, 'bad.json', Buffer.from('{"title":"x"}'), 'user');
    await store.write(U, ws, 'broken.json', Buffer.from('{'), 'user');
    expect(await workspaceAction(store, exp, U, { action: 'render_pdf', workspaceId: ws, path: 'bad.json' })).toMatchObject({ status: 400, body: { message: expect.stringContaining('not a document spec') } });
    expect(await workspaceAction(store, exp, U, { action: 'render_pdf', workspaceId: ws, path: 'broken.json' })).toMatchObject({ status: 400 });
    expect(await workspaceAction(store, exp, U, { action: 'render_pdf', workspaceId: ws, path: 'notes.txt' })).toMatchObject({ status: 400 });
    expect(await workspaceAction(store, { toLibrary: exp.toLibrary }, U, { action: 'render_pdf', workspaceId: ws, path: 'bad.json' })).toMatchObject({ status: 503 });
    expect(pdfPathOf('out/report.json')).toBe('out/report.pdf');
    expect(pdfPathOf('report.json', 'final/ანგარიში.pdf')).toBe('final/ანგარიში.pdf');
    expect(pdfPathOf('report.json', '../x.pdf')).toBeNull();
    expect(pdfPathOf('report.json', 'x.txt')).toBeNull();
  });
});
