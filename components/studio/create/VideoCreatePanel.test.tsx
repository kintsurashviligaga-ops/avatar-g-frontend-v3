import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { quoteCredits } from '@/lib/credits/quote';
import { VIDEO_DURATION_STOPS } from '@/lib/video/duration';
import { CLOSED_CAPABILITIES, type VideoCapabilities } from '@/lib/video/createPanel';
import { initialVeoPlan, type VeoPlanAction } from '@/lib/video/veoPlan';
import { VideoCreatePanel, type VideoCreatePanelProps } from './VideoCreatePanel';
import { catalogueFor } from '@/lib/providers/catalogue';
import { __resetCatalogueStatusCache } from '../ui/useCatalogueStatus';

const OPEN: VideoCapabilities = { longform: true, maxSeconds: 240 };

// The model pick is remembered per browser (lib/studio/modelPick): one test's pick must not become the next one's mount.
beforeEach(() => { try { window.localStorage.clear(); } catch { /* jsdom always has it */ } });

const realFetch = global.fetch;
/** GET /api/studio/catalogue as this deployment would answer: the listed Higgsfield models run. */
function deployment(runs: string[]) {
  __resetCatalogueStatusCache();
  global.fetch = jest.fn(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.startsWith('/api/studio/catalogue')) {
      return ok({ models: catalogueFor('video').map((e) => (e.provider === 'higgsfield'
        ? { id: e.id, available: runs.includes(e.id), reason: runs.includes(e.id) ? null : 'not_enabled' }
        : { id: e.id, available: true, reason: null })) });
    }
    return ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response;
  }) as unknown as typeof fetch;
}
afterEach(() => { global.fetch = realFetch; });

function setup(over: Partial<VideoCreatePanelProps> = {}, gen: Partial<VideoCreatePanelProps['generate']> = {}, refs: Partial<VideoCreatePanelProps['refs']> = {}, audio: Partial<VideoCreatePanelProps['audio']> = {}) {
  const calls = {
    onSeconds: jest.fn(), onMode: jest.fn(), onFormat: jest.fn(), dispatch: jest.fn<void, [VeoPlanAction]>(),
    onSwitchTool: jest.fn(), onClose: jest.fn(), onAddImage: jest.fn(), onRemoveImage: jest.fn(),
    onAddAudio: jest.fn(), onRemoveAudio: jest.fn(),
    onNarration: jest.fn(), onNarratorGender: jest.fn(), onMusic: jest.fn(), onSubtitles: jest.fn(), onLipsync: jest.fn(),
  };
  const props: VideoCreatePanelProps = {
    locale: 'en', surface: 'sheet', toolName: 'Video', onSwitchTool: calls.onSwitchTool, onClose: calls.onClose,
    plan: initialVeoPlan({ tier: 'fast', lengthSec: 24 }), dispatch: calls.dispatch, engine: null,
    mode: 'documentary', onMode: calls.onMode, seconds: 24, onSeconds: calls.onSeconds, format: '9:16', onFormat: calls.onFormat,
    refs: { images: [], max: 3, onAddImage: calls.onAddImage, onRemoveImage: calls.onRemoveImage, audio: null, audioBusy: false, onAddAudio: calls.onAddAudio, onRemoveAudio: calls.onRemoveAudio, ...refs },
    generate: { ...gen },
    audio: {
      narration: true, onNarration: calls.onNarration, narratorGender: 'female', onNarratorGender: calls.onNarratorGender,
      music: true, onMusic: calls.onMusic, subtitles: false, onSubtitles: calls.onSubtitles, lipsync: true, onLipsync: calls.onLipsync, ...audio,
    },
    caps: CLOSED_CAPABILITIES,
    ...over,
  };
  const utils = render(<VideoCreatePanel {...props} />);
  const rerender = (next: Partial<VideoCreatePanelProps>) => utils.rerender(<VideoCreatePanel {...props} {...next} />);
  return { ...utils, props, calls, rerender };
}

const quality = () => screen.getByTestId('video-quality') as HTMLSelectElement;
/** The selected quality option's words — the tier and its price at THIS length and mode. */
const qualityText = () => quality().selectedOptions[0]?.textContent ?? '';
const optionText = (select: HTMLSelectElement, value: string) => Array.from(select.options).find((o) => o.value === value)?.textContent ?? '';

describe('one short panel — GG 2026-10-18: the prompt is typed in the chat box, the panel keeps only the switches that matter', () => {
  test('the DOM order: header → film | music video → length · format → the settings card (quality first) → the hint', () => {
    setup();
    const ids = ['video-tool-switch', 'video-mode-choice', 'video-tiles', 'video-settings', 'video-prompt-hint'];
    const els = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < els.length; i++) {
      expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(screen.getByTestId('video-settings')).getAllByRole('combobox')[0]).toBe(quality());
  });

  test('no second prompt box, no Generate, no disclosures, no hero, no resolution tile, no camera panel', () => {
    setup();
    for (const id of ['video-prompt', 'video-prompt-input', 'video-generate', 'video-generate-bar', 'video-disclosure-story', 'video-disclosure-voice',
      'video-disclosure-advanced', 'video-hero', 'video-tile-resolution', 'veo-parameters', 'video-elements']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('video-create-panel').querySelector('textarea')).toBeNull();
    // It says where the words go instead.
    expect(screen.getByTestId('video-prompt-hint').textContent).toBe('Describe the video in the chat box below and press Send');
  });

  test('the visible tiles are length · format, in that order, each with its value', () => {
    setup();
    const tiles = within(screen.getByTestId('video-tiles')).getAllByRole('button');
    expect(tiles.map((t) => t.getAttribute('data-testid'))).toEqual(['video-tile-length', 'video-tile-format']);
    expect(tiles.map((t) => t.textContent)).toEqual(['24s', '9:16']);
  });

  test('the header has the tool switcher and ✕', () => {
    const { calls } = setup();
    fireEvent.click(screen.getByTestId('video-tool-switch'));
    expect(calls.onSwitchTool).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('video-close'));
    expect(calls.onClose).toHaveBeenCalledTimes(1);
  });

  test('on the phone the sheet ends with „Done", which closes it — back to the chat box and its priced Send; the desktop column has none', () => {
    const { calls, unmount } = setup({ surface: 'sheet' });
    fireEvent.click(screen.getByTestId('video-settings-done'));
    expect(calls.onClose).toHaveBeenCalledTimes(1);
    unmount();
    setup({ surface: 'panel' });
    expect(screen.queryByTestId('video-settings-done')).toBeNull();
  });

  test('film or music video is a visible switch at the top of the panel (the owner could not find music video): one tap picks it', () => {
    const { calls, rerender } = setup();
    const choice = screen.getByTestId('video-mode-choice');
    expect(choice.getAttribute('role')).toBe('radiogroup');
    expect(screen.getByTestId('video-mode-documentary').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('video-mode-musicvideo').textContent).toContain('Music video');
    fireEvent.click(screen.getByTestId('video-mode-musicvideo'));
    expect(calls.onMode).toHaveBeenCalledWith('musicvideo');
    rerender({ mode: 'musicvideo' });
    expect(screen.getByTestId('video-mode-musicvideo').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('video-mode-documentary').getAttribute('aria-checked')).toBe('false');
  });
});

describe('the quality select is priced with the quote (the number the chat box\'s Send carries)', () => {
  test.each(VIDEO_DURATION_STOPS.filter((s) => s < 104).flatMap((s) => (['lite', 'fast', 'standard'] as const).map((t) => [s, t] as const)))(
    '%is · %s · documentary',
    (seconds, tier) => {
      setup({ seconds, plan: initialVeoPlan({ tier, lengthSec: seconds }) });
      expect(quality().value).toBe(tier);
      expect(qualityText()).toContain(`✦ ${quoteCredits({ tool: 'video', seconds, quality: tier, mode: 'documentary' })}`);
    },
  );

  test('a music video is priced as one (×1.4)', () => {
    setup({ seconds: 24, mode: 'musicvideo' });
    expect(qualityText()).toContain(`✦ ${quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'musicvideo' })}`);
    expect(quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'musicvideo' })).toBeGreaterThan(quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'documentary' }));
  });

  test('every tier shows its price for THIS length, the price follows the length, and picking one asks the plan for it', () => {
    const { calls, rerender } = setup({ seconds: 48 });
    for (const t of ['lite', 'fast', 'standard'] as const) {
      expect(optionText(quality(), t)).toContain(String(quoteCredits({ tool: 'video', seconds: 48, quality: t })));
    }
    rerender({ seconds: 96 });
    expect(qualityText()).toContain(String(quoteCredits({ tool: 'video', seconds: 96, quality: 'fast' })));
    fireEvent.change(quality(), { target: { value: 'lite' } });
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'tier', tier: 'lite' });
  });
});

describe('the sound switches are the studio\'s own state', () => {
  test('a film keeps Music and Subtitles without a narrator dropdown; no lip-sync', () => {
    const { calls } = setup();
    expect(screen.queryByTestId('video-narrator')).toBeNull();
    const music = screen.getByTestId('video-music');
    expect(music.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(music);
    expect(calls.onMusic).toHaveBeenCalledWith(false);
    const subs = screen.getByTestId('video-subtitles');
    expect(subs.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(subs);
    expect(calls.onSubtitles).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('video-lipsync')).toBeNull();
  });

  test('no narrator → no subtitles row or narrator dropdown', () => {
    setup({}, {}, {}, { narration: false });
    expect(screen.queryByTestId('video-narrator')).toBeNull();
    expect(screen.queryByTestId('video-subtitles')).toBeNull();
  });

  test('a music video: the priced Lip-sync switch, and no narrator, music or subtitles rows', () => {
    const { calls } = setup({ mode: 'musicvideo' });
    const lip = screen.getByTestId('video-lipsync');
    expect(lip.getAttribute('aria-checked')).toBe('true');
    expect(lip.closest('div')!.textContent).toContain(`+${quoteCredits({ tool: 'avatar' })} credits`);
    fireEvent.click(lip);
    expect(calls.onLipsync).toHaveBeenCalledWith(false);
    for (const id of ['video-narrator', 'video-music', 'video-subtitles']) expect(screen.queryByTestId(id)).toBeNull();
  });

  test('sound: on a connection that cannot switch Veo’s sound off the switch is On and locked, with the reason', () => {
    setup({ engine: { transport: 'gemini', googleOnly: true, audioToggle: false, enhancePrompt: false, nativeCameraControl: false } });
    const sw = screen.getByTestId('video-sound') as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.getAttribute('title')).toContain('always renders sound');
  });

  test('sound: where Veo’s sound can be switched, the switch toggles the plan’s nativeAudio', () => {
    const { calls } = setup({ engine: { transport: 'vertex', googleOnly: true, audioToggle: true, enhancePrompt: true, nativeCameraControl: false } });
    const sw = screen.getByTestId('video-sound') as HTMLButtonElement;
    expect(sw.disabled).toBe(false);
    fireEvent.click(sw);
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'nativeAudio', on: false });
  });

  test('sound: the selected tier\'s own row decides, over the transport-wide flag', () => {
    const row = (audioToggle: boolean) => ({ available: true, referenceImages: 3, audioToggle });
    setup({ engine: { transport: 'vertex', googleOnly: true, audioToggle: true, enhancePrompt: false, nativeCameraControl: false,
      tiers: { lite: row(true), fast: row(false), standard: row(true) } } });
    expect((screen.getByTestId('video-sound') as HTMLButtonElement).disabled).toBe(true); // the plan is on Fast
  });
});

describe('the Quality select reads each tier\'s Vertex row from GET /api/video/engine (MASTER TASK v3.1)', () => {
  const engine = (open: Record<'lite' | 'fast' | 'standard', boolean>) => ({
    transport: 'vertex' as const, googleOnly: true, audioToggle: true, enhancePrompt: false, nativeCameraControl: false,
    tiers: Object.fromEntries(Object.entries(open).map(([t, available]) => [t, { available, referenceImages: t === 'lite' ? 0 : 3, audioToggle: true }])),
  });

  test('a tier whose model the server refuses is offered disabled, says so, and shows no price', () => {
    setup({ engine: engine({ lite: false, fast: true, standard: true }) });
    const lite = Array.from(quality().options).find((o) => o.value === 'lite')!;
    expect(lite.disabled).toBe(true);
    expect(lite.textContent).toBe('Economy · unavailable');
    for (const t of ['fast', 'standard']) {
      expect(Array.from(quality().options).find((o) => o.value === t)!.disabled).toBe(false);
      expect(optionText(quality(), t)).toMatch(/✦ \d/);
    }
  });

  test('an older server without per-tier rows leaves every tier open', () => {
    setup({ engine: { transport: 'vertex', googleOnly: true, audioToggle: true, enhancePrompt: false, nativeCameraControl: false } });
    expect(Array.from(quality().options).filter((o) => ['lite', 'fast', 'standard'].includes(o.value)).every((o) => !o.disabled)).toBe(true);
  });
});

describe('the lip-sync pass is named beside the price, never folded into it (gap C2)', () => {
  test('a film that runs one says its own charge; the quality select keeps the film\'s number', () => {
    setup({ mode: 'musicvideo' }, { lipsyncCredits: 20 });
    const note = screen.getByTestId('video-lipsync-addon');
    expect(note.getAttribute('data-credits')).toBe('20');
    expect(note.textContent).toBe('+20 credits for lip-sync — taken only if it runs, returned if it fails');
    expect(qualityText()).toContain(`✦ ${quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'musicvideo' })}`);
  });

  test('no pass, no line', () => {
    setup({}, { lipsyncCredits: 0 });
    expect(screen.queryByTestId('video-lipsync-addon')).toBeNull();
    setup();
    expect(screen.queryByTestId('video-lipsync-addon')).toBeNull();
  });
});

describe('the length picker: the grid, the lock, the live price', () => {
  const open = () => { fireEvent.click(screen.getByTestId('video-tile-length')); return screen.getByTestId('video-duration-sheet'); };

  test('the slider walks the real stops (4, 6, 8, 16 … 96) — every value it produces is on the grid', () => {
    const { calls } = setup();
    const sheet = open();
    const slider = within(sheet).getByTestId('video-duration-slider') as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(VIDEO_DURATION_STOPS[Number(slider.max)]).toBe(96);
    for (let i = 0; i <= Number(slider.max); i++) fireEvent.change(slider, { target: { value: String(i) } });
    const sent = calls.onSeconds.mock.calls.map((c) => c[0] as number);
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) expect(VIDEO_DURATION_STOPS).toContain(s);
    expect(sent).toContain(4);
    expect(sent).toContain(6);
    expect(sent).toContain(96);
    expect(sent.every((s) => s <= 96)).toBe(true);
  });

  test('presets are 4s · 8s · 24s · 48s · 1:36 · 4:00; a tap picks that exact length', () => {
    const { calls } = setup();
    const sheet = open();
    const presets = within(sheet).getByTestId('video-duration-presets');
    expect(within(presets).getAllByRole('button').map((b) => b.textContent)).toEqual(['4s', '8s', '24s', '48s', '1:36', '4:00']);
    fireEvent.click(within(presets).getByText('48s'));
    expect(calls.onSeconds).toHaveBeenLastCalledWith(48);
  });

  test('long-form lengths are LOCKED with "opening soon" unless the server says it is open: 4:00 cannot be picked', () => {
    const { calls } = setup();
    const sheet = open();
    const locked = within(sheet).getByTestId('video-preset-240') as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    expect(locked.getAttribute('aria-label')).toContain('opening soon');
    fireEvent.click(locked);
    expect(calls.onSeconds).not.toHaveBeenCalled();
    expect((within(sheet).getByTestId('video-preset-96') as HTMLButtonElement).disabled).toBe(false);
    expect(within(sheet).getByTestId('video-duration-locked').textContent).toContain('1:44 – 4:00');
    expect(within(sheet).getByTestId('video-duration-locked').textContent).toContain('opening soon');
  });

  test('when the capabilities say long-form is open: 4:00 is a real preset and the slider reaches 240 (no lock note)', () => {
    const { calls } = setup({ caps: OPEN });
    const sheet = open();
    expect((within(sheet).getByTestId('video-preset-240') as HTMLButtonElement).disabled).toBe(false);
    const slider = within(sheet).getByTestId('video-duration-slider') as HTMLInputElement;
    expect(VIDEO_DURATION_STOPS[Number(slider.max)]).toBe(240);
    expect(within(sheet).queryByTestId('video-duration-locked')).toBeNull();
    fireEvent.click(within(sheet).getByTestId('video-preset-240'));
    expect(calls.onSeconds).toHaveBeenLastCalledWith(240);
  });

  test('a tier ceiling below 4:00 locks only what is above it', () => {
    setup({ caps: { longform: true, maxSeconds: 120 } });
    const sheet = open();
    const slider = within(sheet).getByTestId('video-duration-slider') as HTMLInputElement;
    expect(VIDEO_DURATION_STOPS[Number(slider.max)]).toBe(120);
    expect(within(sheet).getByTestId('video-duration-locked').textContent).toContain('2:08 – 4:00');
  });

  test('the readout is m:ss and the live price is the quote, updating as the length moves', () => {
    const { rerender } = setup({ seconds: 4 });
    const sheet = open();
    expect(within(sheet).getByTestId('video-duration-readout').textContent).toBe('0:04');
    expect(within(sheet).getByTestId('video-duration-price').getAttribute('data-price')).toBe(String(quoteCredits({ tool: 'video', seconds: 4, quality: 'fast' })));
    rerender({ seconds: 96 });
    expect(within(screen.getByTestId('video-duration-sheet')).getByTestId('video-duration-readout').textContent).toBe('1:36');
    expect(within(screen.getByTestId('video-duration-sheet')).getByTestId('video-duration-price').getAttribute('data-price')).toBe(String(quoteCredits({ tool: 'video', seconds: 96, quality: 'fast' })));
  });

  test('the sheet describes the film it makes: one clip at 720p for 4 s, scenes at 1080p from 16 s', () => {
    const { rerender } = setup({ seconds: 4 });
    open();
    expect(screen.getByTestId('video-duration-sheet').textContent).toContain('One clip · 720p');
    rerender({ seconds: 48 });
    expect(screen.getByTestId('video-duration-sheet').textContent).toContain('6 scenes · 1080p');
  });

  test('a length that is off the grid or locked never stays selected: it is pulled to the nearest open stop', () => {
    const a = setup({ seconds: 240 });
    expect(a.calls.onSeconds).toHaveBeenCalledWith(96);
    a.unmount();
    const b = setup({ seconds: 30 });
    expect(b.calls.onSeconds).toHaveBeenCalledWith(32);
    b.unmount();
    const c = setup({ seconds: 240, caps: OPEN });
    expect(c.calls.onSeconds).not.toHaveBeenCalled();
  });
});
describe('format and model pickers', () => {
  test('format: four ratios; a music video can only be 9:16; a cropped ratio says so', () => {
    const { calls } = setup({ mode: 'musicvideo' });
    fireEvent.click(screen.getByTestId('video-tile-format'));
    const sheet = screen.getByTestId('video-format-sheet');
    expect(within(sheet).getAllByRole('radio').map((r) => r.getAttribute('data-testid'))).toEqual(['video-format-9-16', 'video-format-1-1', 'video-format-16-9', 'video-format-4-5']);
    expect((within(sheet).getByTestId('video-format-16-9') as HTMLButtonElement).disabled).toBe(true);
    expect(sheet.textContent).toContain('always 9:16');
    fireEvent.click(within(sheet).getByTestId('video-format-1-1'));
    expect(calls.onFormat).not.toHaveBeenCalled();
  });

  test('format: picking a ratio calls onFormat and closes; 1:1 carries the "cropped" note', () => {
    const { calls } = setup({ format: '1:1' });
    fireEvent.click(screen.getByTestId('video-tile-format'));
    expect(screen.getByTestId('video-format-sheet').textContent).toContain('cropped');
    fireEvent.click(within(screen.getByTestId('video-format-sheet')).getByTestId('video-format-16-9'));
    expect(calls.onFormat).toHaveBeenCalledWith('16:9');
    expect(screen.queryByTestId('video-format-sheet')).toBeNull();
  });


  test('„Other models…" in the quality select opens the model picker: the catalogue\'s models — no prices', async () => {
    deployment([]);
    const { calls } = setup({ seconds: 24 });
    fireEvent.change(quality(), { target: { value: '__other' } });
    const sheet = screen.getByTestId('video-model-sheet');
    await waitFor(() => expect(within(sheet).getByText('Kling 3 — text to video').closest('[role="radio"]')!.textContent).toContain('Paused while it moves to Google’s engines'));
    // The film route's three Veo models are the rows a tap may choose; the Higgsfield models are listed, dimmed, saying why.
    const radios = within(sheet).getAllByRole('radio').filter((r) => r.hasAttribute('data-model'));
    const open = radios.filter((r) => r.getAttribute('aria-disabled') !== 'true').map((r) => r.getAttribute('data-model'));
    expect(open).toEqual(['google/veo-3.1-lite', 'google/veo-3.1-fast', 'google/veo-3.1']);
    expect(radios.find((r) => r.getAttribute('data-model') === 'google/veo-3.1-fast')!.getAttribute('aria-checked')).toBe('true');
    expect(sheet.textContent).not.toMatch(/credit/i);
    expect(within(sheet).queryByTestId('video-mode-choice')).toBeNull();
    // A model is one tap: it sets the tier (the tier IS the model on the film route) and closes.
    fireEvent.click(radios.find((r) => r.getAttribute('data-model') === 'google/veo-3.1')!);
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'tier', tier: 'standard' });
    expect(screen.queryByTestId('video-model-sheet')).toBeNull();
  });

  test('⚠️ a Higgsfield model is never a pick here, even when an older server says it runs; one remembered from before reads as Veo', async () => {
    window.localStorage.setItem('myavatar:model:video', 'hf/kling-3-std-t2v'); // remembered from before the refusal
    deployment(['hf/kling-3-std-t2v']);
    const { calls } = setup({ seconds: 24 });
    // The film renders from the chat box's priced Send, as for any Veo pick: no Higgsfield button.
    expect(screen.queryByTestId('hf-generate')).toBeNull();
    expect(screen.getByTestId('video-prompt-hint')).toBeTruthy();
    expect(qualityText()).not.toBe('Kling 3 — text to video');
    fireEvent.change(quality(), { target: { value: '__other' } });
    const sheet = screen.getByTestId('video-model-sheet');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/studio/catalogue'), expect.anything()));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // the server's answer is in
    const kling = within(sheet).getAllByRole('radio').find((r) => r.getAttribute('data-model') === 'hf/kling-3-std-t2v')!;
    expect(kling.getAttribute('aria-disabled')).toBe('true');
    expect(kling.textContent).toContain('Paused while it moves to Google’s engines');
    fireEvent.click(kling);
    expect(calls.dispatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('hf-generate')).toBeNull();
    expect(screen.getByTestId('video-prompt-hint')).toBeTruthy();
  });

  test('the pick is remembered in this browser: a stored Veo model is applied on mount', () => {
    window.localStorage.setItem('myavatar:model:video', 'google/veo-3.1-lite');
    const { calls } = setup();
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'tier', tier: 'lite' });
    window.localStorage.removeItem('myavatar:model:video');
  });
});

describe('the optional photos (and a song)', () => {
  const IMG = ['data:image/jpeg;base64,AAAA1', 'data:image/jpeg;base64,AAAA2'];

  test('two small buttons add a photo or a soundtrack; a full slot list disables the photo button and says why', () => {
    const { calls, rerender, props } = setup();
    expect(screen.getByTestId('video-references').textContent).toContain('optional');
    fireEvent.click(screen.getByTestId('video-add-image'));
    fireEvent.click(screen.getByTestId('video-add-audio'));
    expect(calls.onAddImage).toHaveBeenCalledTimes(1);
    expect(calls.onAddAudio).toHaveBeenCalledTimes(1);
    rerender({ refs: { ...props.refs, images: IMG, max: 2 } });
    expect((screen.getByTestId('video-add-image') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('video-references').textContent).toContain('One photo per scene');
  });

  test('each photo and the track can be removed', () => {
    const { calls } = setup({}, {}, { images: IMG, audio: { name: 'beat.mp3' } });
    const list = screen.getByTestId('video-reference-list');
    expect(list.querySelectorAll('img')).toHaveLength(2);
    expect(list.textContent).toContain('beat.mp3');
    fireEvent.click(screen.getByLabelText('Remove @image2'));
    expect(calls.onRemoveImage).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText('Remove beat.mp3'));
    expect(calls.onRemoveAudio).toHaveBeenCalledTimes(1);
  });
});

describe('targets', () => {
  test('every target is at least 44 px: the controls carry a 44 px floor class', () => {
    setup({}, {}, { images: ['data:image/jpeg;base64,AAAA1'] });
    const root = screen.getByTestId('video-create-panel');
    const small = Array.from(root.querySelectorAll('button, select')).filter((b) => !/(min-h-\[(4[4-9]|[5-9]\d)px\]|h-1[1-9]|h-14|min-h-\[56px\]|min-h-\[72px\]|min-h-\[52px\]|min-h-\[48px\])/.test(b.className));
    // The remove ✕ on a reference is a 20 px glyph with a 44 px hit area (before: -inset-3); nothing else may be small.
    expect(small.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Remove @image1']);
  });
});

describe('the other languages', () => {
  test.each(['ka', 'ru'])('%s: the panel renders its own words, and the price is the same number', (locale) => {
    setup({ locale });
    expect(screen.getByTestId('video-sound').getAttribute('aria-label')).toBe(locale === 'ka' ? 'ხმა' : 'Звук');
    expect(qualityText()).toContain(`✦ ${quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'documentary' })}`);
    expect(screen.getByTestId('video-prompt-hint').textContent).not.toMatch(/chat box/);
    expect(screen.queryByTestId('video-narrator')).toBeNull();
  });
});

describe('Video Core v1.0 §4 — the panel says requested · rendered · final for an off-grid ask', () => {
  test('60 s asked, 64 s rendered: the line names the three lengths and the trim; its data pins the frames', () => {
    setup({ seconds: 64, requestedSec: 60 });
    const line = screen.getByTestId('video-duration-plan');
    expect(line.textContent).toBe('Requested 1:00 · Rendered 1:04 (8 × 8s) · Final 1:00 (1800 frames, 4s trimmed; priced at 1:04)');
    expect(line.getAttribute('data-final')).toBe('60');
    expect(line.getAttribute('data-native')).toBe('64');
    expect(line.getAttribute('data-frames')).toBe('1800');
    // the price stays the RENDERED length's — the trim is not a discount
    expect(qualityText()).toContain(`✦ ${quoteCredits({ tool: 'video', seconds: 64, quality: 'fast', mode: 'documentary' })}`);
  });

  test('no request, or a request the panel\'s length no longer matches: no line', () => {
    const { rerender } = setup({ seconds: 24 });
    expect(screen.queryByTestId('video-duration-plan')).toBeNull();
    rerender({ seconds: 24, requestedSec: 60 }); // stale: 60 s plans on 64, the panel holds 24
    expect(screen.queryByTestId('video-duration-plan')).toBeNull();
    rerender({ seconds: 24, requestedSec: 24 }); // on the grid: one length, no trim to say
    expect(screen.queryByTestId('video-duration-plan')).toBeNull();
  });

  test('the length sheet repeats the plan under its clock, in the panel\'s language', () => {
    setup({ seconds: 32, requestedSec: 29.7, locale: 'ka' });
    fireEvent.click(screen.getByTestId('video-tile-length'));
    expect(screen.getByTestId('video-duration-plan-sheet').textContent).toBe('მოთხოვნილი 29.7წმ · რენდერი 32წმ (4 × 8წმ) · საბოლოო 29.7წმ (891 კადრი, 2.3წმ მოიჭრება; ფასი 32წმ-ზე)');
  });
});
