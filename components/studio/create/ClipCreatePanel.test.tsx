/**
 * components/studio/create/ClipCreatePanel + ClipQuickChips — the video tool's settings for ONE clip (GG 2026-10-25
 * 16:10Z: „like Gemini's Veo"). Pinned: 4 · 6 · 8 · 10 s, two frames, the quality said as a resolution with its engine and
 * the route's own price; two or three photos leave only 8 s and no Lite; no switch for sound, music, subtitles, a narrator,
 * lip-sync or a music video; the quick row in the chat box offers the same values with the same prices.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { directClipCredits } from '@/lib/video/directClip';
import { ClipCreatePanel, type ClipCreatePanelProps } from './ClipCreatePanel';
import { ClipQuickChips } from './ClipQuickChips';

const PHOTO = 'data:image/jpeg;base64,AAAA';

function panel(over: Partial<ClipCreatePanelProps> = {}) {
  const calls = {
    onSeconds: jest.fn(), onAspect: jest.fn(), onTier: jest.fn(), onResolution: jest.fn(), onClose: jest.fn(), onSwitchTool: jest.fn(),
    onAdd: jest.fn(), onRemove: jest.fn(),
  };
  const props: ClipCreatePanelProps = {
    locale: 'en', surface: 'sheet', toolName: 'Video', onSwitchTool: calls.onSwitchTool, onClose: calls.onClose,
    seconds: 8, onSeconds: calls.onSeconds, aspect: '9:16', onAspect: calls.onAspect, tier: 'fast', onTier: calls.onTier,
    resolution: '720p', onResolution: calls.onResolution,
    photos: { images: [], onAdd: calls.onAdd, onRemove: calls.onRemove },
    ...over,
  };
  const r = render(<ClipCreatePanel {...props} />);
  return { ...r, calls };
}

describe('ClipCreatePanel', () => {
  test('length, format and quality for one clip, each tier priced by the route\'s own function', () => {
    const { calls } = panel();
    expect(screen.getByTestId('clip-panel-len-8').getAttribute('aria-pressed')).toBe('true');
    for (const t of ['lite', 'fast', 'standard'] as const) {
      expect(screen.getByTestId(`clip-panel-tier-${t}`).getAttribute('data-price')).toBe(String(directClipCredits({ seconds: 8, tier: t, photos: 0 })));
    }
    expect(screen.getByTestId('clip-panel-tier-fast').textContent).toContain('Veo 3.1 Fast');
    expect(screen.getByTestId('clip-panel-tier-fast').textContent).toContain('1080p · 1080×1920');
    // Each row says what it changes, not only its price: the pixels are the same for all three.
    const subs = ['lite', 'fast', 'standard'].map((t) => screen.getByTestId(`clip-panel-tier-${t}`).textContent);
    expect(new Set(subs).size).toBe(3);
    expect(screen.getByTestId('clip-panel-tier-standard').textContent).toContain('The best detail and motion');
    fireEvent.click(screen.getByTestId('clip-panel-len-6'));
    fireEvent.click(screen.getByTestId('clip-panel-aspect-16x9'));
    fireEvent.click(screen.getByTestId('clip-panel-tier-standard'));
    expect(calls.onSeconds).toHaveBeenCalledWith(6);
    expect(calls.onAspect).toHaveBeenCalledWith('16:9');
    expect(calls.onTier).toHaveBeenCalledWith('standard');
  });

  test('10 s is Gemini Omni Flash at 720p ✦69 or 1080p ✦102 (GG\'s card 16:51Z)', () => {
    const { calls } = panel({ seconds: 10 });
    expect(screen.queryByTestId('clip-panel-tier-fast')).toBeNull();
    expect(screen.getByTestId('clip-panel-res-720p').getAttribute('data-price')).toBe('69');
    expect(screen.getByTestId('clip-panel-res-1080p').getAttribute('data-price')).toBe('102');
    expect(screen.getByTestId('clip-panel-res-1080p').textContent).toContain('1080p · 1080×1920');
    expect(screen.getByTestId('clip-panel-res-1080p').textContent).toContain('Gemini Omni Flash');
    fireEvent.click(screen.getByTestId('clip-panel-res-1080p'));
    expect(calls.onResolution).toHaveBeenCalledWith('1080p');
  });

  test('two or three photos are references: 8 s only, no Lite, and the third fills the slots', () => {
    const { calls } = panel({ photos: { images: [PHOTO, PHOTO, PHOTO], onAdd: jest.fn(), onRemove: jest.fn() } });
    for (const s of [4, 6, 10]) expect((screen.getByTestId(`clip-panel-len-${s}`) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('clip-panel-tier-lite') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('clip-panel-add-photo') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('clip-panel-photos').textContent).toContain('3/3');
    expect(screen.getByTestId('clip-panel-photos').textContent).toContain('With 2–3 photos the clip is 8 s.');
    expect(calls.onSeconds).not.toHaveBeenCalled();
  });

  test('a photo is added and removed through the caller', () => {
    const onAdd = jest.fn(), onRemove = jest.fn();
    panel({ photos: { images: [PHOTO], onAdd, onRemove } });
    fireEvent.click(screen.getByTestId('clip-panel-add-photo'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('clip-panel-photos').textContent).toContain('first frame');
  });

  test('no switch for sound, music, subtitles, a narrator, lip-sync or a music video: the sound follows the prompt', () => {
    const { container } = panel();
    expect(container.querySelectorAll('[role="switch"], input[type="checkbox"]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/music video|narrator|subtitle|lip-sync|soundtrack/i);
    expect(container.textContent).toContain('Sound and speech follow your prompt.');
  });

  test('the phone\'s sheet closes with Done; the desktop column has none', () => {
    const { calls, unmount } = panel();
    fireEvent.click(screen.getByTestId('video-settings-done'));
    expect(calls.onClose).toHaveBeenCalledTimes(1);
    unmount();
    panel({ surface: 'panel' });
    expect(screen.queryByTestId('video-settings-done')).toBeNull();
  });

  test('Georgian by default', () => {
    panel({ locale: 'ka' });
    expect(screen.getByTestId('clip-panel-len-8').textContent).toBe('8 წმ');
    expect(screen.getByTestId('clip-create-panel').textContent).toContain('ხმა და საუბარი შენი აღწერიდან მოდის.');
  });
});

describe('ClipQuickChips', () => {
  function chips(over: Partial<Parameters<typeof ClipQuickChips>[0]> = {}) {
    const calls = { onSeconds: jest.fn(), onAspect: jest.fn(), onTier: jest.fn(), onResolution: jest.fn(), onMore: jest.fn() };
    render(
      <ClipQuickChips locale="en" desktop={false} seconds={8} aspect="9:16" tier="fast" resolution="720p" photos={0}
        moreExpanded={false} moreLabel="More settings" {...calls} {...over} />,
    );
    return calls;
  }

  test('the row says the frame, the length and the engine; ⋯ opens the panel', () => {
    const calls = chips();
    expect(screen.getByTestId('quick-video-format').textContent).toContain('9:16');
    expect(screen.getByTestId('quick-video-length').textContent).toContain('8 s');
    expect(screen.getByTestId('quick-video-tier').textContent).toContain('Veo 3.1 Fast');
    expect(screen.queryByTestId('quick-video-mode')).toBeNull();
    fireEvent.click(screen.getByTestId('options-toggle'));
    expect(calls.onMore).toHaveBeenCalledTimes(1);
  });

  test('the length sheet offers 4 · 6 · 8 · 10 s with the clip\'s prices, the 10 s one Omni\'s', () => {
    const calls = chips();
    fireEvent.click(screen.getByTestId('quick-video-length'));
    const sheet = screen.getByTestId('video-length-picker');
    for (const s of [4, 6, 8]) expect(sheet.textContent).toContain(`✦ ${directClipCredits({ seconds: s, tier: 'fast', photos: 0 })}`);
    expect(sheet.textContent).toContain('✦ 69');
    expect(sheet.textContent).toContain('Gemini Omni Flash');
    fireEvent.click(within(sheet).getByRole('radio', { name: /10 s/ }));
    expect(calls.onSeconds).toHaveBeenCalledWith(10);
  });

  test('at 10 s the quality is a resolution, priced', () => {
    const calls = chips({ seconds: 10 });
    expect(screen.getByTestId('quick-video-tier').textContent).toContain('720p');
    fireEvent.click(screen.getByTestId('quick-video-tier'));
    const sheet = screen.getByTestId('video-tier-picker');
    expect(sheet.textContent).toContain('✦ 102');
    fireEvent.click(within(sheet).getByRole('radio', { name: /1080p/ }));
    expect(calls.onResolution).toHaveBeenCalledWith('1080p');
  });
});

test('ClipQuickChips: two photos leave only 8 s in the length sheet', () => {
  render(
    <ClipQuickChips locale="en" desktop={false} seconds={8} aspect="9:16" tier="fast" resolution="720p" photos={2}
      moreExpanded={false} moreLabel="More settings" onSeconds={jest.fn()} onAspect={jest.fn()} onTier={jest.fn()} onResolution={jest.fn()} onMore={jest.fn()} />,
  );
  fireEvent.click(screen.getByTestId('quick-video-length'));
  const sheet = screen.getByTestId('video-length-picker');
  for (const s of [4, 6, 10]) expect((within(sheet).getByRole('radio', { name: new RegExp(`^${s} s`) }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(sheet).getByRole('radio', { name: /^8 s/ }) as HTMLButtonElement).disabled).toBe(false);
});

test('a Veo tier this deployment cannot render is shown as unavailable and cannot be picked, in the panel and the quick row', () => {
  const { calls, unmount } = panel({ closedTiers: ['standard'] });
  const row = screen.getByTestId('clip-panel-tier-standard') as HTMLButtonElement;
  expect(row.disabled).toBe(true);
  expect(row.textContent).toContain('unavailable');
  expect(row.textContent).not.toContain('✦');
  fireEvent.click(row);
  expect(calls.onTier).not.toHaveBeenCalled();
  unmount();
  const onTier = jest.fn();
  render(
    <ClipQuickChips locale="en" desktop={false} seconds={8} aspect="9:16" tier="fast" resolution="720p" photos={0} closedTiers={['standard']}
      moreExpanded={false} moreLabel="More settings" onSeconds={jest.fn()} onAspect={jest.fn()} onTier={onTier} onResolution={jest.fn()} onMore={jest.fn()} />,
  );
  fireEvent.click(screen.getByTestId('quick-video-tier'));
  const standard = within(screen.getByTestId('video-tier-picker')).getByRole('radio', { name: /Veo 3\.1(?! Fast| Lite)/ }) as HTMLButtonElement;
  expect(standard.disabled).toBe(true);
  expect(standard.textContent).toContain('unavailable');
});
