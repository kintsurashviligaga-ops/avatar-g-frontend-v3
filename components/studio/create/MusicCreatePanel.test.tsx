/**
 * @jest-environment jsdom
 *
 * The Music Create screen (ref2): the elements in ref2's order, Simple / Advanced, Instrumental keeping the lyrics box empty,
 * the sliders emitting numbers, the price on Create being exactly the shared quote at the seconds the route bills, and every
 * locked control being inert — no handler, no effect — rather than a button that pretends.
 */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { quoteCredits } from '@/lib/credits/quote';
import { SLIDER_DEFAULT, type VocalGender } from '@/lib/ai/musicControls';
import { MUSIC_ENGINE_KEY } from '@/lib/studio/musicEnginePref';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { MusicCreatePanel, type MusicCreatePanelProps } from './MusicCreatePanel';
import { resetMusicEnginesCache } from './useMusicEngines';

const STATUS = {
  engines: {
    lyria: { configured: true, busy: false, controls: 'prompt' },
    udio: { configured: false, busy: false, controls: 'prompt' },
    'elevenlabs-music': { configured: true, busy: false, controls: 'prompt' },
    musicgen: { configured: true, busy: false, controls: 'native' },
  },
  references: { cover: true, voice: true },
  chain: ['lyria', 'elevenlabs-music', 'musicgen'],
};

const STYLE_OPTIONS = [
  { id: 'r&b', label: 'R&B' }, { id: 'jazz', label: 'Jazz' }, { id: 'pop', label: 'Pop' }, { id: 'rock', label: 'Rock' },
];

let fetchMock: jest.Mock;
// jsdom has no Response: a fetch result is just { ok, status, json() } to the code under test.
const respond = (body: unknown, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response);

beforeEach(() => {
  window.localStorage.clear();
  resetMusicEnginesCache();
  useCreditsBalance.setState({ balance: 50, fetchedAt: Date.now(), inflight: null });
  fetchMock = jest.fn((url: string) => (String(url).includes('/api/ai/music/engines') ? respond(STATUS) : respond({})));
  global.fetch = fetchMock as unknown as typeof fetch;
});

type Over = Partial<MusicCreatePanelProps>;

/** A stateful host: the panel is a view, so the states it binds to live here (as they do in OmniStudio). */
function Host({ over = {}, spy = {} }: { over?: Over; spy?: Partial<Record<'onCreate' | 'onPickAudio' | 'onSliders', jest.Mock>> }) {
  const [lyrics, setLyrics] = useState(over.lyrics ?? '');
  const [instrumental, setInstrumental] = useState(over.instrumental ?? false);
  const [styleText, setStyleText] = useState(over.styleText ?? '');
  const [styles, setStyles] = useState<string[]>(over.styles ?? ['r&b']);
  const [vocal, setVocal] = useState<VocalGender>('auto');
  const [sliders, setSliders] = useState({ weirdness: SLIDER_DEFAULT, styleInfluence: SLIDER_DEFAULT });
  const [duration, setDuration] = useState(over.duration ?? 30);
  const [tempo, setTempo] = useState<'slow' | 'medium' | 'fast'>('medium');
  const props: MusicCreatePanelProps = {
    locale: 'en', isDesktop: false, guest: false,
    styleText, onStyleText: setStyleText, lyrics, onLyrics: setLyrics, instrumental, onInstrumental: setInstrumental,
    styles, onStyles: setStyles, styleOptions: STYLE_OPTIONS, vocal, onVocal: setVocal,
    sliders, onSliders: (n) => { setSliders(n); spy.onSliders?.(n); },
    duration: duration as MusicCreatePanelProps['duration'], onDuration: setDuration, tempo, onTempo: setTempo,
    templates: { items: [], activeId: null, onPick: jest.fn() },
    audio: null, audioMode: 'cover', onAudioMode: jest.fn(), onPickAudio: spy.onPickAudio ?? jest.fn(), onClearAudio: jest.fn(),
    recording: { active: false, sec: 0, start: jest.fn(), stop: jest.fn() },
    trainedVoice: { available: false, on: false, onChange: jest.fn() },
    onCreate: spy.onCreate ?? jest.fn(),
    result: { track: null, actions: null, label: 'Music' },
    ...over,
    // the stateful values win over `over` for the fields the host owns
    lyrics, instrumental, styleText, styles, duration: duration as MusicCreatePanelProps['duration'],
  };
  return <MusicCreatePanel {...props} />;
}

const ids = (...t: string[]) => t.map((id) => screen.getByTestId(id));
const inOrder = (els: HTMLElement[]) => els.every((el, i) => i === 0 || !!(els[i - 1]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
const price = () => Number(screen.getByTestId('music-create').getAttribute('data-price'));

test('the elements are ref2\'s, in ref2\'s order: title · + Audio | + Voice · Lyrics · Styles · More Options · tiles · Create', async () => {
  render(<Host />);
  const order = ids('music-title', 'music-refs', 'music-lyrics', 'music-styles-card', 'music-more', 'music-tiles', 'music-create');
  expect(inOrder(order)).toBe(true);
  // Inside the Lyrics card: [library] [✓ Instrumental] [camera] … [expand]; inside Styles: [library] chips [expand].
  const lyrics = screen.getByTestId('music-lyrics');
  expect(inOrder([
    within(lyrics).getByTestId('music-lyrics-wand'), within(lyrics).getByTestId('music-lyrics-input'),
    within(lyrics).getByTestId('music-lyrics-library'), within(lyrics).getByTestId('music-instrumental'),
    within(lyrics).getByTestId('music-lyrics-expand'),
  ])).toBe(true);
  const styles = screen.getByTestId('music-styles-card');
  expect(inOrder([
    within(styles).getByTestId('music-styles-wand'), within(styles).getByTestId('music-styles-input'),
    within(styles).getByTestId('music-styles-library'), within(styles).getByTestId('music-style-chips'),
    within(styles).getByTestId('music-styles-expand'),
  ])).toBe(true);
  expect(screen.getByPlaceholderText('Describe what you want your song to sound like')).toBeTruthy();
  expect(screen.queryByTestId('music-balance')).toBeNull(); // the balance is the shell's; the price is on Create
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/music/engines', expect.anything()));
});

test('Simple is one prompt card + Create; Advanced is the whole screen; the choice is remembered', () => {
  const { unmount } = render(<Host />);
  expect(screen.getByTestId('music-mode-advanced').getAttribute('aria-checked')).toBe('true'); // both options on screen, no menu
  fireEvent.click(screen.getByTestId('music-mode-simple'));
  expect(screen.getByTestId('music-simple')).toBeTruthy();
  for (const gone of ['music-lyrics', 'music-styles-card', 'music-more']) expect(screen.queryByTestId(gone)).toBeNull();
  expect(screen.queryByTestId('music-add-audio')).toBeNull();
  expect(screen.getByTestId('music-create')).toBeTruthy();
  expect(window.localStorage.getItem('myavatar:music-ui-mode')).toBe('simple');
  unmount();
  render(<Host />); // a new visit opens in Simple
  return waitFor(() => expect(screen.getByTestId('music-simple')).toBeTruthy());
});

describe('Instrumental keeps the lyrics box empty', () => {
  test('turning it on clears the lyrics; turning it off brings them back', () => {
    render(<Host over={{ lyrics: 'la la la' }} />);
    const box = screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement;
    expect(box.value).toBe('la la la');
    fireEvent.click(screen.getByTestId('music-instrumental'));
    expect((screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByTestId('music-instrumental').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('music-instrumental'));
    expect((screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement).value).toBe('la la la');
  });

  test('typing words while it is on switches it off — words mean a sung track', () => {
    render(<Host over={{ instrumental: true }} />);
    fireEvent.change(screen.getByTestId('music-lyrics-input'), { target: { value: 'new words' } });
    expect(screen.getByTestId('music-instrumental').getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement).value).toBe('new words');
  });
});

test('the sliders have ticks and an accent thumb, and emit numbers', () => {
  const onSliders = jest.fn();
  render(<Host spy={{ onSliders }} />);
  expect(screen.getAllByTestId('slider-ticks')).toHaveLength(2);
  const weird = screen.getByRole('slider', { name: 'Weirdness' });
  const influence = screen.getByRole('slider', { name: 'Style influence' });
  expect(weird.className).toContain('slider-accent');
  fireEvent.change(weird, { target: { value: '80' } });
  expect(onSliders).toHaveBeenLastCalledWith({ weirdness: 80, styleInfluence: SLIDER_DEFAULT });
  fireEvent.change(influence, { target: { value: '15' } });
  expect(onSliders).toHaveBeenLastCalledWith({ weirdness: 80, styleInfluence: 15 });
  expect(screen.getByTestId('music-sliders-hint').getAttribute('data-mode')).toBe('prompt'); // approximate on Lyria
});

test('the price on Create is the shared quote: 30 s → 5, 60 s → 8, 90 s → 12 (Full song at the 90 s tier)', () => {
  for (const [duration, tool] of [[30, 30], [60, 60], [90, 90], [0, 90]] as const) {
    const { unmount } = render(<Host over={{ duration }} />);
    expect(price()).toBe(quoteCredits({ tool: 'music', seconds: tool }));
    expect(screen.getByTestId('music-create').textContent).toContain(String(price()));
    unmount();
  }
  expect([30, 60, 90].map((s) => quoteCredits({ tool: 'music', seconds: s }))).toEqual([5, 8, 12]);
});

test('a cover is a flat 30 s: the price ignores the length picker and the length tile says it is fixed', async () => {
  render(<Host over={{ duration: 90, audio: { name: 'song.wav' }, audioMode: 'cover' }} />);
  expect(price()).toBe(5);
  expect(screen.getByTestId('music-tile-length').getAttribute('aria-disabled')).toBe('true');
});

describe('controls that would do nothing are not drawn', () => {
  test('no camera button (it was a permanently locked "soon")', () => {
    render(<Host />);
    expect(screen.queryByTestId('music-camera')).toBeNull();
  });

  test('"+ Audio" / "+ Voice" with no provider on this deployment are not drawn — no dead buttons, no picker', async () => {
    fetchMock.mockImplementation((url: string) => (String(url).includes('/engines') ? respond({ ...STATUS, references: { cover: false, voice: false } }) : respond({})));
    render(<Host />);
    await waitFor(() => expect(screen.queryByTestId('music-add-audio')).toBeNull());
    expect(screen.queryByTestId('music-add-voice')).toBeNull();
  });

  test('only the half that works is drawn', async () => {
    fetchMock.mockImplementation((url: string) => (String(url).includes('/engines') ? respond({ ...STATUS, references: { cover: false, voice: true } }) : respond({})));
    render(<Host />);
    await waitFor(() => expect(screen.queryByTestId('music-add-audio')).toBeNull());
    expect(screen.getByTestId('music-add-voice')).toBeTruthy();
  });

  test('an unconfigured engine (Udio) and MusicGen-for-a-song are listed but cannot be picked', async () => {
    render(<Host />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('music-engine-pill'));
    await waitFor(() => expect(screen.getByTestId('engine-lyria').getAttribute('aria-disabled')).toBeNull());
    expect(screen.getByTestId('engine-udio').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('engine-musicgen').getAttribute('data-blocked')).toBe('instrumental-only');
    fireEvent.click(screen.getByTestId('engine-udio'));
    expect(window.localStorage.getItem(MUSIC_ENGINE_KEY)).toBeNull();
    fireEvent.click(screen.getByTestId('engine-elevenlabs-music'));
    expect(window.localStorage.getItem(MUSIC_ENGINE_KEY)).toBe('elevenlabs-music');
    expect(screen.getByTestId('music-engine-pill').textContent).toContain('ElevenLabs Music');
  });
});

describe('Create', () => {
  test('sends the description as the prompt — or, with an empty field, the style line (what send() always fell back to)', () => {
    const onCreate = jest.fn();
    render(<Host spy={{ onCreate }} />);
    fireEvent.click(screen.getByTestId('music-create'));
    expect(onCreate).toHaveBeenLastCalledWith('r&b music');
    fireEvent.change(screen.getByTestId('music-styles-input'), { target: { value: '  dreamy lofi  ' } });
    fireEvent.click(screen.getByTestId('music-create'));
    expect(onCreate).toHaveBeenLastCalledWith('dreamy lofi');
  });

  test('a balance below the price turns the tap into a top-up: the price stays, nothing is created', () => {
    useCreditsBalance.setState({ balance: 3, fetchedAt: Date.now() });
    const onCreate = jest.fn();
    const opened = jest.fn();
    window.addEventListener('myavatar:open-credits', opened);
    render(<Host spy={{ onCreate }} />);
    const btn = screen.getByTestId('music-create');
    expect(btn.textContent).toContain('Top up');
    expect(btn.textContent).toContain('5');
    fireEvent.click(btn);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
    window.removeEventListener('myavatar:open-credits', opened);
  });
});

describe('the wands say what happened', () => {
  test('lyrics: success fills the box; a 401 and a 429 are each said in words, with a sign-in action for the first', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/engines')) return respond(STATUS);
      return respond({ success: true, lyrics: 'Rain on the window' });
    });
    render(<Host over={{ styleText: 'a rainy night' }} />);
    fireEvent.click(screen.getByTestId('music-lyrics-wand'));
    await waitFor(() => expect((screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement).value).toBe('Rain on the window'));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/ai/lyrics'))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({ theme: 'a rainy night', language: 'en', style: 'r&b' });

    fetchMock.mockImplementation(() => respond({ error: 'auth_required' }, 401));
    fireEvent.click(screen.getByTestId('music-lyrics-wand'));
    const note = await screen.findByTestId('music-lyrics-note');
    expect(note.textContent).toMatch(/sign in/i);
    expect(within(note).getByRole('button', { name: /sign in/i })).toBeTruthy();

    fetchMock.mockImplementation(() => respond({ error: 'rate_limited' }, 429));
    fireEvent.click(screen.getByTestId('music-lyrics-wand'));
    await waitFor(() => expect(screen.getByTestId('music-lyrics-note').textContent).toMatch(/too many requests/i));
  });

  test('styles: an empty description asks for a few words first and calls nothing', async () => {
    render(<Host />);
    await act(async () => { fireEvent.click(screen.getByTestId('music-styles-wand')); });
    expect(screen.getByTestId('music-styles-note').textContent).toMatch(/few words/i);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('magic-wand'))).toBe(false);
  });
});

test('the saved lists and the full-screen editor are reachable, and an edit in the editor is the card\'s own text', () => {
  render(<Host over={{ lyrics: 'one line' }} />);
  fireEvent.click(screen.getByTestId('music-lyrics-expand'));
  const editor = screen.getByTestId('music-expand-input') as HTMLTextAreaElement;
  expect(editor.value).toBe('one line');
  fireEvent.change(editor, { target: { value: 'one line\nanother' } });
  fireEvent.click(screen.getByTestId('music-expand-done'));
  expect((screen.getByTestId('music-lyrics-input') as HTMLTextAreaElement).value).toBe('one line\nanother');

  fireEvent.click(screen.getByTestId('music-lyrics-library'));
  fireEvent.click(screen.getByTestId('music-library-save'));
  expect(screen.getAllByTestId('music-library-item')).toHaveLength(1);
  fireEvent.click(screen.getByTestId('music-library-delete'));
  expect(screen.queryAllByTestId('music-library-item')).toHaveLength(0);
});
