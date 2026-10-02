/**
 * @jest-environment jsdom
 *
 * ServiceParamsPanel — what a screen reader hears about a studio job (montage, dubbing, deck, 3D): one polite live
 * region that says "started" when Run is pressed and "ready" or "failed" when it ends — never the percentage ticks.
 * A 3D model is ready when its MESH is: the reference image that arrives first is still part of the wait.
 * fetch is mocked; nothing leaves the test.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../lib/services/model3d/model3dPlan', () => ({
  ...jest.requireActual('../../lib/services/model3d/model3dPlan'),
  pollDelayMs: () => 0,
}));
jest.mock('next/dynamic', () => () => function MockGlbViewer() { return null; });

import { ServiceParamsPanel } from './ServiceParamsPanel';

const GLB = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=t';
const REF = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/ref.png?token=t';
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

let releaseStatus: (() => void) | null = null;
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  releaseStatus = null;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); // "[service] unmapped error" — expected here
});
afterEach(() => warnSpy.mockRestore());

function mount(locale: 'en' | 'ka' = 'en') {
  render(<ServiceParamsPanel service="model3d" locale={locale} onClose={() => {}} prefill={{ topic: 'an old clay jug' }} />);
}
async function pressRun(locale: 'en' | 'ka' = 'en') {
  const runBtn = screen.getAllByRole('button').find((b) => b.textContent === (locale === 'en' ? 'Run' : 'გაშვება'))!;
  await waitFor(() => expect((runBtn as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(runBtn); });
}
async function run(locale: 'en' | 'ka' = 'en') {
  mount(locale);
  await pressRun(locale);
}
const live = () => screen.getByTestId('live-status').textContent;

it('says nothing before a run, "started" while the mesh is still being built, then "ready"', async () => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/v2/model3d/create')) return json({ jobId: 'job-1', predictionId: 'pred123', referenceUrl: REF, charge: 'sig' });
    if (url.startsWith('/api/v2/model3d/status')) {
      await new Promise<void>((resolve) => { releaseStatus = resolve; });
      return json({ status: 'succeeded', glbUrl: GLB });
    }
    return json({});
  });
  mount();
  expect(live()).toBe(''); // mounted before there is anything to say — a region born with its message may stay silent
  await pressRun();
  // The reference image is on screen, the mesh is not: still "started".
  await waitFor(() => expect(releaseStatus).not.toBeNull());
  expect(live()).toBe('3D Model — started');
  await act(async () => { releaseStatus!(); });
  await waitFor(() => expect(live()).toBe('3D Model — ready'));
});

it('says "failed", with the reason when there is one, in the page language', async () => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => json({ message: 'Daily limit reached' }, 429));
  await run('ka');
  await waitFor(() => expect(live()).toMatch(/^3D მოდელი — ვერ მოხერხდა/));
});

it('a bare failure does not repeat itself ("failed: Failed")', async () => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => { throw new Error('offline'); });
  await run();
  await waitFor(() => expect(live()).toBe('3D Model — failed'));
});

it("while the 3D viewer's chunk loads, a placeholder in the viewer's OWN box holds its place (no jump)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const panel = readFileSync(join(__dirname, 'ServiceParamsPanel.tsx'), 'utf8');
  const viewer = readFileSync(join(__dirname, 'GlbViewer.tsx'), 'utf8');
  const frame = readFileSync(join(__dirname, 'glbFrame.tsx'), 'utf8');
  // The panel's lazy import shows the shared-box skeleton; the viewer renders in that same box (one constant).
  expect(panel).toMatch(/loading: \(\) => <GlbViewerSkeleton \/>/);
  expect(viewer).toMatch(/className=\{GLB_VIEWER_FRAME\}/);
  for (const cls of ['h-[min(48vh,240px)]', 'w-full', 'sm:h-[420px]']) expect(frame).toContain(cls);
});
