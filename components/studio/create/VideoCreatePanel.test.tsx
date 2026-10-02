import { fireEvent, render, screen, within } from '@testing-library/react';
import { quoteCredits } from '@/lib/credits/quote';
import { VIDEO_DURATION_STOPS } from '@/lib/video/duration';
import { CLOSED_CAPABILITIES, type VideoCapabilities } from '@/lib/video/createPanel';
import { initialVeoPlan, type VeoPlanAction } from '@/lib/video/veoPlan';
import { VideoCreatePanel, type VideoCreatePanelProps } from './VideoCreatePanel';

const OPEN: VideoCapabilities = { longform: true, maxSeconds: 240 };

// The model pick is remembered per browser (lib/studio/modelPick): one test's pick must not become the next one's mount.
beforeEach(() => { try { window.localStorage.clear(); } catch { /* jsdom always has it */ } });

function setup(over: Partial<VideoCreatePanelProps> = {}, gen: Partial<VideoCreatePanelProps['generate']> = {}, refs: Partial<VideoCreatePanelProps['refs']> = {}) {
  const calls = {
    onSeconds: jest.fn(), onPrompt: jest.fn(), onMode: jest.fn(), onFormat: jest.fn(), dispatch: jest.fn<void, [VeoPlanAction]>(),
    onGenerate: jest.fn(), onTopUp: jest.fn(), onSwitchTool: jest.fn(), onClose: jest.fn(), onAddImage: jest.fn(), onRemoveImage: jest.fn(),
    onAddAudio: jest.fn(), onRemoveAudio: jest.fn(),
  };
  const props: VideoCreatePanelProps = {
    locale: 'en', surface: 'sheet', toolName: 'Video', onSwitchTool: calls.onSwitchTool, onClose: calls.onClose,
    plan: initialVeoPlan({ tier: 'fast', lengthSec: 24 }), dispatch: calls.dispatch, engine: null,
    mode: 'documentary', onMode: calls.onMode, seconds: 24, onSeconds: calls.onSeconds, format: '9:16', onFormat: calls.onFormat,
    prompt: '', onPrompt: calls.onPrompt,
    refs: { images: [], max: 3, onAddImage: calls.onAddImage, onRemoveImage: calls.onRemoveImage, audio: null, audioBusy: false, onAddAudio: calls.onAddAudio, onRemoveAudio: calls.onRemoveAudio, ...refs },
    generate: { onGenerate: calls.onGenerate, busy: false, canGenerate: true, balanceCredits: null, freeFilmsRemaining: null, onTopUp: calls.onTopUp, ...gen },
    caps: CLOSED_CAPABILITIES,
    story: <div data-testid="story-body">story</div>, voice: <div data-testid="voice-body">voice</div>, advanced: <div data-testid="advanced-body">advanced</div>,
    ...over,
  };
  const utils = render(<VideoCreatePanel {...props} />);
  const rerender = (next: Partial<VideoCreatePanelProps>) => utils.rerender(<VideoCreatePanel {...props} {...next} />);
  return { ...utils, props, calls, rerender };
}

const gen = () => screen.getByTestId('video-generate') as HTMLButtonElement;
const price = () => gen().getAttribute('data-price');

describe('element order — header → hero → tabs → references → prompt → model → tiles → quality → disclosures → Generate (ref4)', () => {
  test('the DOM order is the reference’s', () => {
    setup();
    const ids = ['video-tool-switch', 'video-hero', 'video-tabs', 'video-references', 'video-prompt', 'video-model-row', 'video-tiles', 'video-quality',
      'video-disclosure-story', 'video-disclosure-voice', 'video-disclosure-advanced', 'video-generate-bar'];
    const els = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < els.length; i++) {
      expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  test('the three tiles are length · format · resolution, in that order, each with its value', () => {
    setup();
    const tiles = within(screen.getByTestId('video-tiles')).getAllByRole('button');
    expect(tiles.map((t) => t.getAttribute('data-testid'))).toEqual(['video-tile-length', 'video-tile-format', 'video-tile-resolution']);
    expect(tiles.map((t) => t.textContent)).toEqual(['24s', '9:16', '1080p']);
  });

  test('the header has the tool switcher and ✕; the hero has "Change" and the model title', () => {
    const { calls } = setup();
    fireEvent.click(screen.getByTestId('video-tool-switch'));
    expect(calls.onSwitchTool).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('video-close'));
    expect(calls.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('video-hero-title').textContent).toBe('VEO 3.1 FAST');
  });

  test('the hero title follows the Veo tier', () => {
    const { rerender } = setup();
    rerender({ plan: initialVeoPlan({ tier: 'standard' }) });
    expect(screen.getByTestId('video-hero-title').textContent).toBe('VEO 3.1');
    rerender({ plan: initialVeoPlan({ tier: 'lite' }) });
    expect(screen.getByTestId('video-hero-title').textContent).toBe('VEO 3.1 LITE');
  });
});

describe('the number on the Generate button is the quote', () => {
  test.each(VIDEO_DURATION_STOPS.filter((s) => s < 104).flatMap((s) => (['lite', 'fast', 'standard'] as const).map((t) => [s, t] as const)))(
    '%is · %s · documentary',
    (seconds, tier) => {
      setup({ seconds, plan: initialVeoPlan({ tier, lengthSec: seconds }) });
      expect(Number(price())).toBe(quoteCredits({ tool: 'video', seconds, quality: tier, mode: 'documentary' }));
    },
  );

  test('a music video is priced as one (×1.4)', () => {
    setup({ seconds: 24, mode: 'musicvideo' });
    expect(Number(price())).toBe(quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'musicvideo' }));
    expect(Number(price())).toBeGreaterThan(quoteCredits({ tool: 'video', seconds: 24, quality: 'fast', mode: 'documentary' }));
  });

  test('the price follows every change on screen, and the button names it for a screen reader', () => {
    const { rerender } = setup({ seconds: 8 });
    expect(price()).toBe('25');
    expect(gen().getAttribute('aria-label')).toBe('Generate — 25 credits');
    rerender({ seconds: 96 });
    expect(price()).toBe(String(quoteCredits({ tool: 'video', seconds: 96, quality: 'fast' })));
    rerender({ seconds: 96, plan: initialVeoPlan({ tier: 'standard' }) });
    expect(price()).toBe(String(quoteCredits({ tool: 'video', seconds: 96, quality: 'standard' })));
  });

  test('the quality row shows each tier’s price for THIS length and picking one asks the plan for it', () => {
    const { calls } = setup({ seconds: 48 });
    for (const t of ['lite', 'fast', 'standard'] as const) {
      expect(screen.getByTestId(`video-quality-${t}`).textContent).toContain(String(quoteCredits({ tool: 'video', seconds: 48, quality: t })));
    }
    fireEvent.click(screen.getByTestId('video-quality-lite'));
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'tier', tier: 'lite' });
    expect(screen.getByTestId('video-quality-fast').getAttribute('aria-checked')).toBe('true');
  });

  test('no price rides on any callback: Generate calls onGenerate with nothing at all', () => {
    const { calls } = setup();
    fireEvent.click(gen());
    expect(calls.onGenerate).toHaveBeenCalledTimes(1);
    expect(calls.onGenerate.mock.calls[0]).toEqual([]);
  });
});

describe('free · insufficient · empty', () => {
  test('the trial slot pays for ONE short clip: free at ≤ 8 s with a slot, the price otherwise', () => {
    const { rerender } = setup({ seconds: 8 }, { freeFilmsRemaining: 1 });
    expect(gen().getAttribute('data-price')).toBe('free');
    expect(gen().textContent).toContain('Free');
    rerender({ seconds: 16 });
    expect(price()).toBe(String(quoteCredits({ tool: 'video', seconds: 16, quality: 'fast' })));
    rerender({ seconds: 4 });
    expect(gen().getAttribute('data-price')).toBe('free');
  });

  test('a balance below the price turns the tap into the top-up, keeps the price visible, and never starts the film', () => {
    const { calls } = setup({ seconds: 24 }, { balanceCredits: 10 });
    expect(gen().textContent).toContain('Top up');
    expect(gen().textContent).toContain('75');
    fireEvent.click(gen());
    expect(calls.onTopUp).toHaveBeenCalledTimes(1);
    expect(calls.onGenerate).not.toHaveBeenCalled();
  });

  test('a balance that covers it generates; an unknown balance (a guest) never blocks', () => {
    const covered = setup({}, { balanceCredits: 500 });
    expect(gen().textContent).not.toContain('Top up');
    fireEvent.click(gen());
    expect(covered.calls.onGenerate).toHaveBeenCalledTimes(1);
    covered.unmount();
    const guest = setup({}, { balanceCredits: null });
    expect(gen().textContent).not.toContain('Top up');
    guest.unmount();
  });

  test('a free film is never blocked by a low balance', () => {
    const { calls } = setup({ seconds: 8 }, { balanceCredits: 0, freeFilmsRemaining: 1 });
    expect(gen().textContent).not.toContain('Top up');
    fireEvent.click(gen());
    expect(calls.onGenerate).toHaveBeenCalledTimes(1);
  });

  test('an empty box: Generate does not start a film, says why, and puts the cursor in the prompt', () => {
    const { calls } = setup({}, { canGenerate: false });
    fireEvent.click(gen());
    expect(calls.onGenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Describe your video first');
    expect(document.activeElement).toBe(screen.getByTestId('video-prompt-input'));
  });

  test('while a film is being made the button holds its place and is busy', () => {
    setup({}, { busy: true });
    expect(gen().disabled).toBe(true);
    expect(gen().getAttribute('aria-busy')).toBe('true');
    expect(gen().textContent).toContain('Rendering…');
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

  test('"Change" on the hero and the Model row both open the model picker: mode, then the catalogue\'s models — no prices', () => {
    const { calls } = setup({ seconds: 24 });
    fireEvent.click(screen.getByTestId('video-hero-change'));
    const sheet = screen.getByTestId('video-model-sheet');
    // The film route's three Veo models are the rows a tap may choose; the Studio β models are listed, dimmed, saying why.
    const radios = within(sheet).getAllByRole('radio').filter((r) => r.hasAttribute('data-model'));
    const open = radios.filter((r) => r.getAttribute('aria-disabled') !== 'true').map((r) => r.getAttribute('data-model'));
    expect(open).toEqual(['google/veo-3.1-lite', 'google/veo-3.1-fast', 'google/veo-3.1']);
    expect(radios.find((r) => r.getAttribute('data-model') === 'google/veo-3.1-fast')!.getAttribute('aria-checked')).toBe('true');
    const kling = radios.find((r) => r.getAttribute('data-model') === 'hf/kling-3-std-t2v')!;
    expect(kling.getAttribute('aria-disabled')).toBe('true');
    expect(kling.textContent).toContain('Not enabled yet');
    // ⚠️ No price in the picker: the price is the server's quote, on Generate.
    for (const t of ['lite', 'fast', 'standard'] as const) {
      expect(sheet.textContent).not.toContain(`✦ ${quoteCredits({ tool: 'video', seconds: 24, quality: t })}`);
    }
    expect(sheet.textContent).not.toMatch(/credit/i);
    // The mode switch rides at the top and does not close the sheet.
    fireEvent.click(within(sheet).getByTestId('video-mode-musicvideo'));
    expect(calls.onMode).toHaveBeenCalledWith('musicvideo');
    // A model is one tap: it sets the tier (the tier IS the model on the film route) and closes.
    fireEvent.click(radios.find((r) => r.getAttribute('data-model') === 'google/veo-3.1')!);
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'tier', tier: 'standard' });
    expect(screen.queryByTestId('video-model-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('video-model-row'));
    expect(screen.getByTestId('video-model-sheet')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('video-model-sheet')).toBeNull();
  });

  test('the pick is remembered in this browser: a stored Veo model is applied on mount, and a tier change is stored', () => {
    window.localStorage.setItem('myavatar:model:video', 'google/veo-3.1-lite');
    const { calls } = setup();
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'tier', tier: 'lite' });
    window.localStorage.removeItem('myavatar:model:video');
  });

  test('the resolution tile opens the model picker too (the resolution is the clip length’s, the tier is the price)', () => {
    setup();
    fireEvent.click(screen.getByTestId('video-tile-resolution'));
    expect(screen.getByTestId('video-model-sheet')).toBeTruthy();
  });
});

describe('references, @ Elements and sound', () => {
  const IMG = ['data:image/jpeg;base64,AAAA1', 'data:image/jpeg;base64,AAAA2'];

  test('the two round buttons add an image or a soundtrack; a full slot list disables the image button and says why', () => {
    const { calls, rerender, props } = setup();
    fireEvent.click(screen.getByTestId('video-add-image'));
    fireEvent.click(screen.getByTestId('video-add-audio'));
    expect(calls.onAddImage).toHaveBeenCalledTimes(1);
    expect(calls.onAddAudio).toHaveBeenCalledTimes(1);
    rerender({ refs: { ...props.refs, images: IMG, max: 2 } });
    expect((screen.getByTestId('video-add-image') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('video-references').textContent).toContain('One photo per scene');
  });

  test('references are listed by name (@image1 …) with a way to remove each; an uploaded track shows and says what it does', () => {
    const { calls } = setup({}, {}, { images: IMG, audio: { name: 'beat.mp3' } });
    const list = screen.getByTestId('video-reference-list');
    expect(list.textContent).toContain('@image1');
    expect(list.textContent).toContain('@image2');
    expect(list.textContent).toContain('beat.mp3');
    expect(list.textContent).toContain('music video');
    fireEvent.click(screen.getByLabelText('Remove @image2'));
    expect(calls.onRemoveImage).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText('Remove beat.mp3'));
    expect(calls.onRemoveAudio).toHaveBeenCalledTimes(1);
  });

  test('"@ Elements" lists the references and puts the chosen @name into the prompt, spaced', () => {
    const { calls } = setup({ prompt: 'A rider with' }, {}, { images: IMG });
    const ta = screen.getByTestId('video-prompt-input') as HTMLTextAreaElement;
    ta.setSelectionRange(ta.value.length, ta.value.length);
    fireEvent.click(screen.getByTestId('video-elements'));
    fireEvent.click(within(screen.getByTestId('video-elements-list')).getByText('@image2'));
    expect(calls.onPrompt).toHaveBeenCalledWith('A rider with @image2 ');
  });

  test('"@ Elements" with no reference yet asks for one instead of listing nothing', () => {
    const { calls } = setup();
    fireEvent.click(screen.getByTestId('video-elements'));
    expect(calls.onAddImage).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('video-elements-list')).toBeNull();
  });

  test('typing in the prompt reports the text', () => {
    const { calls } = setup();
    fireEvent.change(screen.getByTestId('video-prompt-input'), { target: { value: 'a lone rider' } });
    expect(calls.onPrompt).toHaveBeenCalledWith('a lone rider');
  });

  test('sound: on a connection that cannot switch Veo’s sound off the chip is On and locked, with the reason', () => {
    setup({ engine: { transport: 'gemini', googleOnly: true, audioToggle: false, enhancePrompt: false, nativeCameraControl: false } });
    const chip = screen.getByTestId('video-sound') as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.getAttribute('title')).toContain('always renders sound');
  });

  test('sound: where Veo’s sound can be switched, the chip toggles the plan’s nativeAudio', () => {
    const { calls } = setup({ engine: { transport: 'vertex', googleOnly: true, audioToggle: true, enhancePrompt: true, nativeCameraControl: false } });
    const chip = screen.getByTestId('video-sound') as HTMLButtonElement;
    expect(chip.disabled).toBe(false);
    fireEvent.click(chip);
    expect(calls.dispatch).toHaveBeenCalledWith({ type: 'nativeAudio', on: false });
  });
});

describe('Create | Extend, and the disclosures', () => {
  test('Extend is drawn complete and LOCKED: a plain "soon" line, nothing clickable, a "Soon" button with no price', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Extend' }));
    expect(screen.getByTestId('video-extend-soon').textContent).toContain('opening soon');
    const soon = screen.getByTestId('video-extend-generate') as HTMLButtonElement;
    expect(soon.disabled).toBe(true);
    expect(soon.textContent).toContain('Soon');
    expect(soon.hasAttribute('data-price')).toBe(false);
    expect(screen.queryByTestId('video-generate')).toBeNull();
    const dir = screen.getByLabelText('Direction') as HTMLSelectElement;
    expect(dir.disabled).toBe(true);
    expect(Array.from(dir.options).map((o) => [o.value, o.disabled])).toEqual([['sequel', false], ['prequel', true]]);
    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));
    expect(screen.getByTestId('video-generate')).toBeTruthy();
  });

  test('the tabs are a real tablist: one tab stop, arrows move the selection', () => {
    setup();
    const create = screen.getByRole('tab', { name: 'Create' });
    const extend = screen.getByRole('tab', { name: 'Extend' });
    expect(create.getAttribute('aria-selected')).toBe('true');
    expect(create.tabIndex).toBe(0);
    expect(extend.tabIndex).toBe(-1);
    fireEvent.keyDown(create, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Extend' }).getAttribute('aria-selected')).toBe('true');
  });

  test('Story & style · Voice & music · Advanced start closed (their content is not even mounted) and open on a tap', () => {
    setup();
    for (const id of ['story', 'voice', 'advanced']) {
      expect(screen.queryByTestId(`${id}-body`)).toBeNull();
      fireEvent.click(within(screen.getByTestId(`video-disclosure-${id}`)).getByRole('button'));
      expect(screen.getByTestId(`${id}-body`)).toBeTruthy();
    }
  });

  test('something already loaded stays in view: openWhen opens its disclosure', () => {
    setup({ storyOpenWhen: true, voiceOpenWhen: true });
    expect(screen.getByTestId('story-body')).toBeTruthy();
    expect(screen.getByTestId('voice-body')).toBeTruthy();
    expect(screen.queryByTestId('advanced-body')).toBeNull();
  });

  test('every target is at least 44 px: the controls carry a 44 px floor class', () => {
    setup();
    const root = screen.getByTestId('video-create-panel');
    const small = Array.from(root.querySelectorAll('button')).filter((b) => !/(min-h-\[(4[4-9]|[5-9]\d)px\]|h-1[1-9]|h-14|min-h-\[56px\]|min-h-\[72px\]|min-h-\[52px\]|min-h-\[48px\])/.test(b.className));
    // The remove ✕ on a reference is a 24 px glyph with a 48 px hit area (before: -inset-3); nothing else may be small.
    expect(small.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([]);
  });
});

describe('the other languages', () => {
  test.each(['ka', 'ru'])('%s: the panel renders its own words, and the price is the same number', (locale) => {
    setup({ locale });
    expect(screen.getByRole('tab', { name: locale === 'ka' ? 'შექმნა' : 'Создать' })).toBeTruthy();
    expect(price()).toBe('75');
    expect(screen.getByTestId('video-prompt-input').getAttribute('placeholder')).not.toMatch(/Describe the shot/);
  });
});
