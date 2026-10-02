import { fireEvent, render, screen, within } from '@testing-library/react';
import { quoteCredits } from '@/lib/credits/quote';
import { PRICE_TABLE_LENGTHS } from '@/lib/video/createPanel';
import { VideoStage, type VideoStageProps } from './VideoStage';

function setup(over: Partial<VideoStageProps> = {}) {
  const onTier = jest.fn();
  const onOpenInEditor = jest.fn();
  const onNote = jest.fn();
  const props: VideoStageProps = { locale: 'en', latest: null, progress: null, tier: 'fast', mode: 'documentary', seconds: 24, onTier, onOpenInEditor, onNote, ...over };
  const utils = render(<VideoStage {...props} />);
  return { ...utils, props, onTier, onOpenInEditor, onNote };
}

describe('the result pane (ref6)', () => {
  test('nothing made yet: an empty pane that says where the video will appear', () => {
    setup();
    expect(screen.getByTestId('video-result-empty').textContent).toContain('Your video will appear here');
    expect(screen.queryByTestId('video-result-actions')).toBeNull();
  });

  test('the latest video of the thread plays in a ready card with the studio’s result actions and "Open in editor"', () => {
    const { onOpenInEditor, container } = setup({ latest: { url: 'https://cdn.example/film.mp4', aspect: '9:16', prompt: 'a rider' } });
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('https://cdn.example/film.mp4');
    expect(screen.getByTestId('result-card').getAttribute('data-state')).toBe('ready');
    const actions = screen.getByTestId('video-result-actions');
    expect(within(actions).getByLabelText('Download')).toBeTruthy();
    expect(within(actions).getByLabelText('Share')).toBeTruthy();
    expect(within(actions).getByLabelText('Save to Library')).toBeTruthy();
    fireEvent.click(within(actions).getByText('Open in editor'));
    expect(onOpenInEditor).toHaveBeenCalledWith('https://cdn.example/film.mp4');
  });

  test('a film in flight shows its real progress instead of the old result, and no actions until it lands', () => {
    setup({ latest: { url: 'https://cdn.example/old.mp4', aspect: '16:9' }, progress: { aspect: '16:9', pct: 42, stage: 'Rendering scenes 2/3' } });
    const card = screen.getByTestId('result-card');
    expect(card.getAttribute('data-state')).toBe('rendering');
    expect(card.textContent).toContain('42%');
    expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
    expect(screen.queryByTestId('video-result-actions')).toBeNull();
  });

  test('at 96 % the card says it is finishing', () => {
    setup({ progress: { aspect: '9:16', pct: 97 } });
    expect(screen.getByTestId('result-card').getAttribute('data-state')).toBe('finalizing');
  });

  test('the result is capped to 44 % of the window’s height in the film’s own shape (a 9:16 film does not push the table off screen)', () => {
    const { container } = setup({ latest: { url: 'u', aspect: '9:16' } });
    const wrap = container.querySelector('[data-testid="video-result"] > div.mx-auto') as HTMLElement;
    expect(wrap.style.maxWidth).toBe(`calc(44vh * ${9 / 16})`);
  });
});

describe('Models & prices — the table that also picks the model', () => {
  test('one row per tier (cheapest first), one column per length, every cell the quote', () => {
    setup();
    const table = screen.getByTestId('video-models-table');
    const rows = ['lite', 'fast', 'standard'] as const;
    expect(within(table).getAllByRole('radio').map((r) => r.getAttribute('data-testid'))).toEqual(rows.map((t) => `video-model-${t}`));
    for (const tier of rows) {
      const cells = Array.from(within(screen.getByTestId(`video-model-${tier}`)).getAllByText(/^\d+$/));
      expect(cells.map((c) => Number(c.textContent))).toEqual(PRICE_TABLE_LENGTHS.map((seconds) => quoteCredits({ tool: 'video', seconds, quality: tier, mode: 'documentary' })));
    }
  });

  test('the header names the lengths (4s · 8s · 24s · 48s · 1:36) and the current tier’s row is the selected one', () => {
    setup({ tier: 'standard' });
    expect(screen.getByTestId('video-models-table').textContent).toContain('1:36');
    expect(screen.getByTestId('video-model-standard').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('video-model-fast').getAttribute('aria-checked')).toBe('false');
  });

  test('choosing a row picks that tier', () => {
    const { onTier } = setup();
    fireEvent.click(screen.getByTestId('video-model-lite'));
    expect(onTier).toHaveBeenCalledWith('lite');
  });

  test('a music video is priced as one, and the table says so', () => {
    setup({ mode: 'musicvideo' });
    const fast = within(screen.getByTestId('video-model-fast')).getAllByText(/^\d+$/).map((c) => Number(c.textContent));
    expect(fast).toEqual(PRICE_TABLE_LENGTHS.map((seconds) => quoteCredits({ tool: 'video', seconds, quality: 'fast', mode: 'musicvideo' })));
    expect(screen.getByTestId('video-models-table').textContent).toContain('adds 40%');
  });

  test('the table never lists a long-form length (those are locked in the picker, not for sale here)', () => {
    setup();
    expect(Math.max(...PRICE_TABLE_LENGTHS)).toBe(96);
    expect(screen.getByTestId('video-models-table').textContent).not.toContain('4:00');
  });
});
