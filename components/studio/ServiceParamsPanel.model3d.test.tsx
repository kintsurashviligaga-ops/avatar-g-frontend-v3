/**
 * @jest-environment jsdom
 *
 * ServiceParamsPanel — the 3D lane, end to end in the browser half.
 *
 *   · "make a 3D model of an old clay jug" opens the panel WITH the description filled (studioIntent mines the
 *     subject as `topic`; it used to land only in the deck's topic box, leaving 3D's prompt blank);
 *   · the poll carries create's `charge` signature, which the status route needs before it will refund;
 *   · the delivered result carries the reference image, so the chat message gets a thumbnail;
 *   · a GLB that fails to load is contained to the viewer — the panel (and the studio around it) survive.
 * fetch is mocked; nothing leaves the test.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
// The poll waits 3 s+ between ticks; the cadence is not what is under test.
jest.mock('../../lib/services/model3d/model3dPlan', () => ({
  ...jest.requireActual('../../lib/services/model3d/model3dPlan'),
  pollDelayMs: () => 0,
}));
// The real viewer is three.js inside an R3F canvas; stand in a component the test can make throw, the way an
// expired or truncated GLB throws out of useLoader.
let mockViewerThrows = false;
jest.mock('next/dynamic', () => () => function MockGlbViewer({ url }: { url: string }): ReactNode {
  if (mockViewerThrows) throw new Error(`Could not load ${url}: 400`);
  return <div data-testid="glb-viewer">{url}</div>;
});

import { ServiceParamsPanel } from './ServiceParamsPanel';

const GLB = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/pred123.glb?token=t';
const REF = 'https://x.supabase.co/storage/v1/object/sign/renders/models3d/ref.png?token=t';

let fetchMock: jest.Mock;
let consoleError: jest.SpyInstance;
beforeEach(() => {
  mockViewerThrows = false;
  fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.startsWith('/api/v2/model3d/create')) {
      return json({ jobId: 'job-1', predictionId: 'pred123', referenceUrl: REF, charge: 'sig+/=' });
    }
    if (url.startsWith('/api/v2/model3d/status')) return json({ status: 'succeeded', glbUrl: GLB });
    return json({});
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  // React reports an error caught by a boundary on console.error; expected in the viewer-failure case.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('3D prefill', () => {
  it('puts the subject mined from the chat sentence into the 3D description', async () => {
    render(<ServiceParamsPanel service="model3d" locale="en" onClose={() => {}} prefill={{ topic: '  an old clay jug  ' }} />);
    const box = await screen.findByPlaceholderText('Describe the object — a single item, plain background');
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('an old clay jug'));
    // …which is what makes Run usable without retyping the request.
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('still fills the deck topic for a presentation', async () => {
    render(<ServiceParamsPanel service="presentation" locale="en" onClose={() => {}} prefill={{ topic: 'AI in schools' }} />);
    const box = await screen.findByPlaceholderText('What should the deck be about?');
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('AI in schools'));
  });
});

describe('3D delivery', () => {
  async function runOnce(onDelivered = jest.fn()) {
    render(<ServiceParamsPanel service="model3d" locale="en" onClose={() => {}} prefill={{ topic: 'an old clay jug' }} onDelivered={onDelivered} />);
    const run = screen.getByRole('button', { name: 'Run' });
    await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(run); });
    await waitFor(() => expect(onDelivered).toHaveBeenCalled());
    return onDelivered;
  }

  it('polls with the charge signature and hands the reference image to the conversation', async () => {
    const onDelivered = await runOnce();
    const statusCall = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.startsWith('/api/v2/model3d/status'));
    expect(statusCall).toContain('predictionId=pred123');
    expect(statusCall).toContain('jobId=job-1');
    expect(statusCall).toContain(`charge=${encodeURIComponent('sig+/=')}`);
    expect(onDelivered).toHaveBeenCalledWith('model3d', { glbUrl: GLB, referenceUrl: REF });
    expect(await screen.findByTestId('glb-viewer')).toBeTruthy();
  });

  it('a GLB that fails to load is contained to the viewer, not the studio', async () => {
    mockViewerThrows = true;
    await runOnce();
    expect(await screen.findByText('The 3D preview could not load — you can still download the model.')).toBeTruthy();
    // The panel is still mounted around it — the close control and the run button are still there.
    expect(screen.getByRole('button', { name: /Close/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  });
});
