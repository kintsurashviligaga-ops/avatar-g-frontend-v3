/**
 * Virtual Studio UI (Phase 8.6), all network mocked: the library filters, the karaoke word lit by time (and a click
 * seeks), and the panel flow — script → storyboard with prices → Make sends the price the card shows → Presenter Card →
 * Regenerate / Change voice / Edit script as new takes → Join → final player + SRT. A moved price (409) shows the
 * "nothing was charged" line; an Omni scene is polled until ready.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresenterLibrary } from './StudioControls';
import { KaraokeTranscript } from './PresenterCard';
import { VirtualStudio, type ApiResult, type StudioApi } from './VirtualStudio';
import { L10N } from './labels';
import { buildStudioPlan } from '@/lib/avatar/studio/plan';
import { sceneToMake } from '@/lib/avatar/studio/sceneRun';
import { OMNI_PRESENTERS } from '@/lib/avatar/studio/catalog';
import { parseStudioAsk } from '@/lib/avatar/studio/agent';
import { resetStudioClips, studioClips } from '@/lib/avatar/studio/videoHandoff';

const SCRIPT = 'Welcome to our studio. Today we show how one script becomes a short presentation with a presenter.';

const job = (over: Record<string, unknown> = {}) => ({
  id: 'job-1', sceneIndex: 0, take: 0, engine: 'live', state: 'ready', text: SCRIPT, turn: 0, turns: 1,
  url: 'https://storage.example/scene.mp4', durationSec: 6.5,
  timings: [{ word: 'Welcome', start: 0.3, end: 0.8 }, { word: 'to', start: 0.8, end: 1 }],
  timingSource: 'live', warnings: [], reason: null, credits: 9, voiceId: 'Kore', presenterId: 'live-kira', ...over,
});

type Body = { [k: string]: unknown; take: number; projectId: string; request: { voiceId?: string } };

function mockApi(handlers: Partial<Record<'scene' | 'poll' | 'stitch' | 'background', (body: Body) => ApiResult>>) {
  const calls: Array<{ url: string; body: Body }> = [];
  const api: StudioApi = {
    post: jest.fn(async (url: string, body: unknown) => {
      calls.push({ url, body: body as Body });
      const key = url.endsWith('/scene') ? 'scene' : url.endsWith('/stitch') ? 'stitch' : 'background';
      return handlers[key]?.(body as Body) ?? { status: 500, data: {} };
    }),
    get: jest.fn(async (url: string) => { calls.push({ url, body: {} as Body }); return handlers.poll?.({} as Body) ?? { status: 500, data: {} }; }),
  };
  return { api, calls };
}

describe('PresenterLibrary', () => {
  it('filters by engine, gender and look', () => {
    render(<PresenterLibrary value="live-kira" onChange={() => {}} lang="en" book="today" />);
    const all = screen.getAllByRole('button', { pressed: undefined }).filter((b) => b.dataset.testid?.startsWith('vs-presenter-'));
    expect(all.length).toBe(3 + OMNI_PRESENTERS.length);
    fireEvent.click(screen.getByTestId('vs-f-live'));
    expect(screen.queryAllByTestId(/^vs-presenter-/).map((b) => b.dataset.testid)).toEqual(['vs-presenter-live-kira', 'vs-presenter-live-ben', 'vs-presenter-live-leo']);
    fireEvent.click(screen.getByTestId('vs-f-male'));
    fireEvent.click(screen.getByTestId('vs-f-casual'));
    expect(screen.queryAllByTestId(/^vs-presenter-/).map((b) => b.dataset.testid)).toEqual(['vs-presenter-live-leo']);
    fireEvent.click(screen.getByTestId('vs-f-live')); // toggles off
    expect(screen.queryAllByTestId(/^vs-presenter-/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the 30 s price of each engine on its chip', () => {
    render(<PresenterLibrary value="live-kira" onChange={() => {}} lang="en" book="today" />);
    expect(screen.getByTestId('vs-f-live').textContent).toContain('✦27');
    expect(screen.getByTestId('vs-f-omni').textContent).toMatch(/✦\d+/);
  });
});

describe('KaraokeTranscript', () => {
  const timings = [{ word: 'one', start: 0, end: 0.5 }, { word: 'two', start: 0.5, end: 1 }, { word: 'three', start: 1, end: 1.6 }];
  it('lights the word being said', () => {
    render(<KaraokeTranscript timings={timings} text="one two three" time={0.7} />);
    expect(screen.getByTestId('vs-word-1').dataset.active).toBe('true');
    expect(screen.getByTestId('vs-word-0').dataset.active).toBe('false');
  });
  it('a click on a word seeks there', () => {
    const onSeek = jest.fn();
    render(<KaraokeTranscript timings={timings} text="one two three" time={0} onSeek={onSeek} />);
    fireEvent.click(screen.getByTestId('vs-word-2'));
    expect(onSeek).toHaveBeenCalledWith(1);
  });
  it('without timings it shows the plain text', () => {
    render(<KaraokeTranscript timings={null} text="plain words" time={0} />);
    expect(screen.getByTestId('vs-transcript').textContent).toBe('plain words');
  });
});

describe('VirtualStudio panel', () => {
  const expected = () => {
    const b = buildStudioPlan({ script: SCRIPT, presenterId: 'live-kira', voiceId: 'Kore', tone: 'friendly', pace: 'natural' }, { book: 'today' });
    if (!b.ok) throw new Error(b.detail);
    const s = sceneToMake(b.plan, 0, 'today');
    if (!s.ok) throw new Error(s.reason);
    return s.credits;
  };

  it('script → storyboard → Make (sends the shown price) → card → Regenerate → Join → final + SRT', async () => {
    const { api, calls } = mockApi({
      scene: (body) => ({ status: 200, data: { ok: true, job: job({ id: `job-${body.take}`, take: body.take }) } }),
      stitch: () => ({ status: 200, data: { ok: true, url: 'https://storage.example/presentation.mp4', srt: '1\n00:00:00,300 --> 00:00:01,000\nWelcome to\n', durationSec: 6.5 } }),
    });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} />);
    fireEvent.change(screen.getByTestId('vs-script'), { target: { value: SCRIPT } });
    const make = screen.getByTestId('vs-make-0');
    expect(make.textContent).toContain(`✦${expected()}`);
    await act(async () => { fireEvent.click(make); });
    const first = calls.find((c) => c.url === '/api/avatar/studio/scene')!;
    expect(first.body).toMatchObject({ sceneIndex: 0, take: 0, expectedCredits: expected(), request: { presenterId: 'live-kira', voiceId: 'Kore' } });
    expect(first.body.projectId).toMatch(/^vs[a-z0-9]+$/);
    expect(await screen.findByTestId('vs-card-0')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByTestId('vs-regenerate')); });
    expect(calls.filter((c) => c.url === '/api/avatar/studio/scene').map((c) => c.body.take)).toEqual([0, 1]);

    await act(async () => { fireEvent.click(screen.getByTestId('vs-join')); });
    const stitch = calls.find((c) => c.url === '/api/avatar/studio/stitch')!;
    expect(stitch.body).toEqual({ projectId: first.body.projectId, jobIds: ['job-1'] });
    expect(await screen.findByTestId('vs-final')).toBeTruthy();
    expect(screen.getByTestId('vs-srt').getAttribute('href')).toContain(encodeURIComponent('Welcome to'));
  });

  it('a moved price is refused free and says so', async () => {
    const { api } = mockApi({ scene: () => ({ status: 409, data: { ok: false, error: 'price_changed', credits: 99 } }) });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} />);
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    expect(screen.getByTestId('vs-error-0').textContent).toBe(L10N.priceChanged.en);
    expect(screen.queryByTestId('vs-card-0')).toBeNull();
  });

  it('Change voice and Edit script remake the scene as a new take', async () => {
    const { api, calls } = mockApi({ scene: (body) => ({ status: 200, data: { ok: true, job: job({ take: body.take, voiceId: body.request.voiceId }) } }) });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} />);
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    fireEvent.click(await screen.findByTestId('vs-change-voice'));
    await act(async () => { fireEvent.click(within(screen.getByTestId('vs-voices')).getByTestId('vs-voice-Algieba')); });
    const scenes = calls.filter((c) => c.url === '/api/avatar/studio/scene');
    expect(scenes[1]!.body).toMatchObject({ take: 1, request: { voiceId: 'Algieba' } });

    fireEvent.click(screen.getByTestId('vs-edit-script'));
    fireEvent.change(screen.getByTestId('vs-edit'), { target: { value: 'Welcome to the studio.' } });
    await act(async () => { fireEvent.click(screen.getByTestId('vs-edit-save')); });
    const last = calls.filter((c) => c.url === '/api/avatar/studio/scene').at(-1)!;
    expect(last.body).toMatchObject({ take: 2, text: 'Welcome to the studio.' });
    expect(typeof last.body.expectedCredits).toBe('number');
  });

  it('a cinematic scene is polled until it is ready', async () => {
    const omni = OMNI_PRESENTERS[0]!;
    let polls = 0;
    const { api } = mockApi({
      scene: () => ({ status: 200, data: { ok: true, job: job({ engine: 'omni', state: 'processing', url: null, presenterId: omni.id, voiceId: null }) } }),
      poll: () => { polls++; return { status: 200, data: { ok: true, job: job({ engine: 'omni', state: polls < 2 ? 'processing' : 'ready', presenterId: omni.id, voiceId: null }) } }; },
    });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} />);
    fireEvent.click(screen.getByTestId(`vs-presenter-${omni.id}`));
    expect(screen.getByTestId('vs-omni-voice')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    await waitFor(() => expect(screen.getByTestId('vs-card-0')).toBeTruthy());
    expect(polls).toBe(2);
    expect(screen.queryByTestId('vs-change-voice')).toBeNull(); // Omni speaks in its own voice
  });

  it('a failed scene shows the refund line', async () => {
    const { api } = mockApi({
      scene: () => ({ status: 200, data: { ok: true, job: job({ state: 'processing', url: null }) } }),
      poll: () => ({ status: 200, data: { ok: true, job: job({ state: 'failed', url: null, reason: 'provider' }) } }),
    });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} />);
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    await waitFor(() => expect(screen.getByTestId('vs-error-0').textContent).toBe(L10N.refunded.en));
  });
});

describe('PR C: Studio voice, Use in Video, Agent G card', () => {
  beforeEach(() => resetStudioClips());

  it('a Cinematic presenter can take a named Studio voice, with exact speed/pitch sliders only then', async () => {
    const omni = OMNI_PRESENTERS[0]!;
    const { api, calls } = mockApi({ scene: () => ({ status: 200, data: { ok: true, job: job({ engine: 'omni', state: 'ready', presenterId: omni.id, voiceId: 'Algieba', dub: true }) } }) });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} />);
    expect(screen.queryByTestId('vs-dub-sliders')).toBeNull();
    fireEvent.click(screen.getByTestId(`vs-presenter-${omni.id}`));
    expect(screen.queryByTestId('vs-dub-sliders')).toBeNull();
    fireEvent.change(screen.getByTestId('vs-omni-voice'), { target: { value: 'Algieba' } });
    fireEvent.change(screen.getByTestId('vs-voice-speed'), { target: { value: '1.1' } });
    fireEvent.change(screen.getByTestId('vs-voice-pitch'), { target: { value: '-1.5' } });
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    expect(calls[0]!.body.request).toMatchObject({ presenterId: omni.id, voiceId: 'Algieba', voiceSpeed: 1.1, voicePitch: -1.5 });
    expect(await screen.findByTestId('vs-dub-label')).toBeTruthy();
    expect(screen.getByTestId('vs-change-voice')).toBeTruthy();
  });

  it('Use in Video opens Montage with the scene, or offers it to the Director\'s Workflow (free)', async () => {
    const onOpenMontage = jest.fn();
    const { api } = mockApi({ scene: () => ({ status: 200, data: { ok: true, job: job() } }) });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} onOpenMontage={onOpenMontage} />);
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    fireEvent.click(screen.getByTestId('vs-use-in-video'));
    fireEvent.click(screen.getByTestId('vs-use-director'));
    expect(screen.getByTestId('vs-use-offered')).toBeTruthy();
    expect(studioClips()[0]).toMatchObject({ url: 'https://storage.example/scene.mp4', durationSec: 6.5, title: 'Scene 1', format: '9:16' });
    fireEvent.click(screen.getByTestId('vs-use-montage'));
    expect(onOpenMontage).toHaveBeenCalledWith('https://storage.example/scene.mp4');
    expect(screen.queryByTestId('vs-use-sheet')).toBeNull();
  });

  it('the joined presentation says it is in the Library and can go to video too', async () => {
    const { api } = mockApi({
      scene: () => ({ status: 200, data: { ok: true, job: job() } }),
      stitch: () => ({ status: 200, data: { ok: true, url: 'https://storage.example/p.mp4', srt: '', durationSec: 6.5, savedToLibrary: true } }),
    });
    render(<VirtualStudio lang="en" book="today" api={api} pollMs={0} initialScript={SCRIPT} />);
    await act(async () => { fireEvent.click(screen.getByTestId('vs-make-0')); });
    await act(async () => { fireEvent.click(screen.getByTestId('vs-join')); });
    expect(screen.getByTestId('vs-in-library').textContent).toBe(L10N.library.en);
    fireEvent.click(screen.getByTestId('vs-final-use'));
    fireEvent.click(screen.getByTestId('vs-use-director'));
    expect(studioClips()[0]!.key).toMatch(/:all$/);
  });

  it('Agent G\'s card starts from the request read in the chat', () => {
    const ask = parseStudioAsk(`Make a presentation from this script with a male presenter: ${SCRIPT}`)!;
    const { api } = mockApi({});
    render(<VirtualStudio lang="en" book="today" api={api} compact initialRequest={ask.request} />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect((screen.getByTestId('vs-script') as HTMLTextAreaElement).value).toBe(SCRIPT);
    expect(screen.getByTestId('vs-presenter-live-ben').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('vs-make-0')).toBeTruthy();
  });

  it('an ask without a script says to paste it', () => {
    const ask = parseStudioAsk('make a presentation from my script')!;
    render(<VirtualStudio lang="en" book="today" api={mockApi({}).api} compact initialRequest={ask.request} />);
    expect(screen.getByTestId('vs-no-script').textContent).toBe(L10N.noScript.en);
  });
});
