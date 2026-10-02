/**
 * @jest-environment jsdom
 *
 * The report viewer: what is on screen for a finished report, and what each way of talking to it does — the three command
 * buttons, a typed line (through the planner), Read aloud, Go live — against a mocked network and a fake voice.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { done, job } from './testing';
import { getResearchState, researchActions, resetResearchStoreForTests } from './store';
import { resetEnsureJobForTests } from './useEnsureJob';
import type { AudioLike, SpeechDeps } from './speech';

const mockPrime = jest.fn();
jest.mock('../../../lib/voice/livePrime', () => ({ primeLive: () => mockPrime() }));
jest.mock('../Markdown', () => ({ Markdown: ({ children }: { children: string }) => <div data-testid="md">{children}</div> }));

const synthCalls: string[] = [];
class FakeAudio implements AudioLike {
  src = ''; onended: (() => void) | null = null; onerror: (() => void) | null = null; currentSrc: string | undefined; error: unknown = null;
  plays: string[] = [];
  play() { this.currentSrc = this.src; this.plays.push(this.src); return Promise.resolve(); }
  pause() {}
  load() { this.currentSrc = this.src; }
}
let audio = new FakeAudio();
jest.mock('./speech', () => {
  const actual = jest.requireActual('./speech');
  const deps = (): SpeechDeps => ({
    async synth(text) { synthCalls.push(text); return new Blob([text]); },
    createAudio: () => audio,
    createObjectURL: () => `blob:${synthCalls.length}`,
    revokeObjectURL: () => undefined,
  });
  return { ...actual, browserSpeechDeps: deps };
});

// eslint-disable-next-line import/first
import { ReportViewer } from './ReportViewer';

const REPORT = '# EV market\n\n## Summary\n\nSales grew fast in 2025 [1], driven by tax cuts.\n\n## Findings\n\n- Georgia leads [2].';
const SOURCES = [
  { url: 'https://www.example-ev.com/report', title: 'EV Outlook 2026' },
  { url: 'https://stats.gov.ge/ev', title: 'Geostat' },
  { url: 'javascript:alert(1)', title: 'Not a page' },
  { url: 'not a url', title: 'Garbage' },
];

const asks: Array<Record<string, unknown>> = [];
function network(answer = 'Georgia leads the region.') {
  asks.length = 0;
  (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/ask')) {
      asks.push(JSON.parse(String(init?.body)));
      return { status: 200, ok: true, json: async () => ({ answer, truncated: false }) } as Response;
    }
    return { status: 404, ok: false, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

const open = (over: Parameters<typeof done>[0] = {}, props: { canLive?: boolean; locale?: string } = {}) => {
  act(() => researchActions.upsertJob(done({ id: 'd', report: REPORT, sources: SOURCES, ...over })));
  return render(<ReportViewer id="d" locale={props.locale ?? 'en'} canLive={props.canLive ?? true} />);
};
const typeAndSend = (text: string) => {
  const box = screen.getByTestId('research-ask-input');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
};

beforeEach(() => {
  resetResearchStoreForTests();
  resetEnsureJobForTests();
  synthCalls.length = 0;
  mockPrime.mockClear();
  audio = new FakeAudio();
  network();
});

describe('what is on screen', () => {
  test('title, meta, the report, and only REAL web sources as chips (never a javascript: link)', async () => {
    open();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'EV market in the Caucasus' })).toBeTruthy();
    expect(screen.getByTestId('research-meta').textContent).toContain('3 sources');
    expect(screen.getByTestId('research-report').textContent).toContain('Sales grew fast in 2025');
    const chips = screen.getAllByTestId('research-source');
    expect(chips.map((c) => c.getAttribute('data-domain'))).toEqual(['example-ev.com', 'stats.gov.ge']);
    expect(chips[0]!.getAttribute('href')).toBe('https://www.example-ev.com/report');
    expect(chips[0]!.getAttribute('target')).toBe('_blank');
    expect(chips[0]!.getAttribute('rel')).toBe('noopener noreferrer');
    // the favicon is OUR proxy, never a third party
    expect(chips[0]!.querySelector('img')!.getAttribute('src')).toBe('/api/research/favicon?domain=example-ev.com');
    expect(chips[0]!.className).toContain('min-h-[44px]');
  });

  test('a failed icon falls back to the domain\'s letter', async () => {
    open();
    const chip = (await screen.findAllByTestId('research-source'))[0]!;
    fireEvent.error(chip.querySelector('img')!);
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('span')!.textContent).toBe('e');
  });

  test('an incomplete report says so', async () => {
    open({ incomplete: true });
    expect(await screen.findByText(/marked this report as incomplete/)).toBeTruthy();
  });

  test('Go live only when Live can open (a flag and an account)', async () => {
    const { unmount } = open({}, { canLive: true });
    expect(await screen.findByTestId('research-go-live')).toBeTruthy();
    unmount();
    open({}, { canLive: false });
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('research-go-live')).toBeNull();
  });

  test('a job that is not finished shows its card (no report, no ask box)', async () => {
    act(() => researchActions.upsertJob(job({ id: 'run' })));
    render(<ReportViewer id="run" locale="en" canLive />);
    expect((await screen.findByTestId('research-card')).getAttribute('data-state')).toBe('running');
    expect(screen.queryByTestId('research-report')).toBeNull();
    expect(screen.queryByTestId('research-ask-input')).toBeNull();
  });

  test('Escape closes it', async () => {
    act(() => researchActions.openViewer('d'));
    open();
    await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(getResearchState().viewer).toBeNull();
  });
});

describe('talking to the report', () => {
  test('the three command buttons: Summarize and Key takeaways ask the report in their mode', async () => {
    open();
    fireEvent.click(await screen.findByTestId('research-summarize'));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]).toMatchObject({ mode: 'summarize', locale: 'en' });
    expect((await screen.findAllByTestId('research-answer'))[0]!.textContent).toContain('Georgia leads the region.');
    fireEvent.click(screen.getByTestId('research-takeaways'));
    await waitFor(() => expect(asks).toHaveLength(2));
    expect(asks[1]).toMatchObject({ mode: 'takeaways' });
  });

  test('a typed question goes to the model as a question', async () => {
    open();
    await screen.findByRole('dialog');
    typeAndSend('Which country has the highest share?');
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]).toMatchObject({ mode: 'ask', question: 'Which country has the highest share?' });
    expect((screen.getByTestId('research-ask-input') as HTMLTextAreaElement).value).toBe('');
  });

  test('a typed command is a command: "შეაჯამე" summarizes, in Georgian too', async () => {
    open({}, { locale: 'ka' });
    await screen.findByRole('dialog');
    typeAndSend('შეაჯამე');
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]).toMatchObject({ mode: 'summarize', locale: 'ka' });
  });

  test('"ხმამაღლა შეაჯამე" asks, then READS THE ANSWER aloud', async () => {
    network('Georgia leads the region.');
    open({}, { locale: 'ka' });
    await screen.findByRole('dialog');
    typeAndSend('ხმამაღლა შეაჯამე');
    await waitFor(() => expect(synthCalls).toEqual(['Georgia leads the region.']));
  });

  test('"წამიკითხე" reads the REPORT aloud: plain text, in short chunks; a bare "stop" then stops the voice, never asking the model', async () => {
    open();
    await screen.findByRole('dialog');
    typeAndSend('წამიკითხე');
    await waitFor(() => expect(synthCalls.length).toBeGreaterThan(0));
    expect(synthCalls[0]).toContain('Sales grew fast in 2025');
    expect(synthCalls[0]).not.toMatch(/#|\[1\]|\*\*/);
    expect(synthCalls[0]!.length).toBeLessThanOrEqual(600);
    expect(asks).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId('research-reading').getAttribute('data-state')).toBe('playing'));
    typeAndSend('stop');
    await waitFor(() => expect(screen.queryByTestId('research-reading')).toBeNull());
    expect(asks).toHaveLength(0);
  });

  test('a bare "stop" with nothing playing does nothing at all (it is not a question)', async () => {
    open();
    await screen.findByRole('dialog');
    typeAndSend('stop');
    await act(async () => { await Promise.resolve(); });
    expect(asks).toHaveLength(0);
    expect(synthCalls).toHaveLength(0);
  });

  test('Read aloud is a toggle: it reads, shows pause + stop, and Stop ends it', async () => {
    open();
    fireEvent.click(await screen.findByTestId('research-read-aloud'));
    await waitFor(() => expect(screen.getByTestId('research-reading').getAttribute('data-state')).toBe('playing'));
    expect(screen.getByTestId('research-read-aloud').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(screen.getByTestId('research-reading').getAttribute('data-state')).toBe('paused'));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.getByTestId('research-reading').getAttribute('data-state')).toBe('playing'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]!);
    await waitFor(() => expect(screen.queryByTestId('research-reading')).toBeNull());
  });

  test('the mic and the send button are real 44 px controls with names', async () => {
    open();
    await screen.findByRole('dialog');
    for (const name of ['Start the microphone', 'Send']) {
      const b = screen.getByRole('button', { name });
      expect(b.className).toContain('h-11');
      expect(b.className).toContain('w-11');
    }
  });
});

describe('Go live', () => {
  test('primes the audio inside the tap, closes the viewer and opens the call for THIS report', async () => {
    act(() => researchActions.openViewer('d'));
    open();
    fireEvent.click(await screen.findByTestId('research-go-live'));
    expect(mockPrime).toHaveBeenCalledTimes(1);
    expect(getResearchState().live).toEqual({ id: 'd', returnToViewer: true });
    expect(getResearchState().viewer).toBeNull();
  });
});
