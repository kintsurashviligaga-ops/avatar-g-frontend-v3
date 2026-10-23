import { fireEvent, render, screen, within } from '@testing-library/react';
import { ImageDesk } from './ImageDesk';
import { ImageModelsTable } from './ImageModelsTable';
import { ImageResultPane, type ImageResultActions } from './ImageResultPane';
import { IMAGE_CREATE_COPY } from './imageCreateCopy';
import { quoteCredits } from '@/lib/credits/quote';
import { deriveImageResults, type ImageMsgLike, type ImageResultView } from '@/lib/studio/imageResults';

/**
 * The desktop centre of the Image tool: the Result pane (every state of a job, the studio's own actions, the earlier results),
 * the Models & prices table (the one Google row and its price), and the conversation kept one tap away.
 */

const spec = { kind: 'image', prompt: 'a red fox', aspect: '4:5', quality: 'ultra' };

function actions(over: Partial<ImageResultActions> = {}): ImageResultActions {
  return {
    open: jest.fn(), download: jest.fn(), share: jest.fn(), upscale: jest.fn(), reroll: jest.fn(), edit: jest.fn(), toVideo: jest.fn(),
    renderSave: (url) => <button type="button" data-testid="save" data-url={url}>save</button>,
    renderEditor: (url) => <button type="button" data-testid="editor" data-url={url}>editor</button>,
    cancel: jest.fn(), cancelJob: jest.fn(), retryTile: jest.fn(), rerollBatch: jest.fn(), dismiss: jest.fn(), topUp: jest.fn(),
    ...over,
  };
}

const results = (msgs: ImageMsgLike[]): ImageResultView[] => deriveImageResults(msgs);
const ready = (id: string, url: string, prompt = 'a red fox'): ImageMsgLike[] => [
  { role: 'user', text: prompt }, { role: 'assistant', text: '', id, imageUrl: url, regen: { ...spec, prompt } },
];

function pane(over: Partial<React.ComponentProps<typeof ImageResultPane>> = {}) {
  const a = over.actions ?? actions();
  const view = render(
    <ImageResultPane locale="en" results={[]} notice={null} aspect="1:1" actions={a} busy={false} upscaling={false} {...over} />,
  );
  return { a, ...view };
}

describe('ImageResultPane', () => {
  test('empty: a dashed frame in the SELECTED ratio and the invitation to generate', () => {
    pane({ aspect: '16:9' });
    const frame = screen.getByTestId('result-empty');
    expect(frame.textContent).toContain('Your image will appear here');
    expect(frame.textContent).toContain('Describe it on the right and press Generate.');
    expect((frame.firstElementChild as HTMLElement).style.aspectRatio).toBe('16 / 9');
  });

  test('rendering: the studio\'s own progress tile, with Stop for THIS bubble', () => {
    const a = actions();
    pane({ actions: a, results: results([{ role: 'user', text: 'a fox' }, { role: 'assistant', text: '', id: 'j1', genKind: 'image' }]) });
    const card = screen.getByTestId('result-card');
    expect(card.getAttribute('data-state')).toBe('rendering');
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(a.cancel).toHaveBeenCalledWith(1);
  });

  test('ready: the picture, its ratio, its prompt — and every studio action wired to the right argument', () => {
    const a = actions();
    pane({ actions: a, results: results(ready('r1', 'https://x/fox.png')) });
    const img = screen.getByTestId('result-image') as HTMLImageElement;
    expect(img.src).toBe('https://x/fox.png');
    const heading = screen.getByRole('heading', { name: 'Result' }).parentElement!.textContent!;
    expect(heading).toContain('4:5');
    expect(heading).not.toMatch(/\b[124]K\b/); // the render takes no size (GG 2026-10-23, "Hide"), so none is claimed
    expect(screen.getByTestId('image-result-pane').textContent).toContain('a red fox');

    const bar = screen.getByRole('toolbar', { name: 'Result' });
    const press = (name: string) => fireEvent.click(within(bar).getByRole('button', { name }));
    press('Download'); expect(a.download).toHaveBeenCalledWith('https://x/fox.png');
    press('Share'); expect(a.share).toHaveBeenCalledWith('https://x/fox.png');
    press('Upscale'); expect(a.upscale).toHaveBeenCalledWith('https://x/fox.png');
    press('Generate again'); expect(a.reroll).toHaveBeenCalledWith(1);
    press('Edit this image'); expect(a.edit).toHaveBeenCalledWith('https://x/fox.png');
    press('Send to video'); expect(a.toVideo).toHaveBeenCalledWith('https://x/fox.png');
    // The studio draws save-to-library and open-in-editor itself; the pane only places them.
    expect(within(bar).getByTestId('save').getAttribute('data-url')).toBe('https://x/fox.png');
    expect(within(bar).getByTestId('editor').getAttribute('data-url')).toBe('https://x/fox.png');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(a.open).toHaveBeenCalledWith('https://x/fox.png');
  });

  test('every result action is a ≥ 44 px target', () => {
    pane({ results: results(ready('r1', 'https://x/fox.png')) });
    const small = [...screen.getByRole('toolbar', { name: 'Result' }).querySelectorAll('button')].filter((b) => !/\bh-11\b/.test(b.className) && b.getAttribute('data-testid') == null);
    expect(small.map((b) => b.getAttribute('aria-label'))).toEqual([]);
  });

  test('an upscaled picture has no spec to re-run: no "Generate again"; Upscale is disabled while one is running', () => {
    pane({ results: results([{ role: 'assistant', text: '', imageUrl: 'https://x/hd.png' }]), upscaling: true });
    expect(screen.queryByRole('button', { name: 'Generate again' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Upscale' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('re-roll and edit wait while another generation is busy', () => {
    pane({ results: results(ready('r1', 'https://x/fox.png')), busy: true });
    expect((screen.getByRole('button', { name: 'Generate again' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Edit this image' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('a batch: one ResultCard per tile; a failed tile is retried alone and can be dismissed; re-roll-all only when nothing is pending', () => {
    const a = actions();
    const batch = { spec: { prompt: 'cats', aspect: '1:1', quality: 'high' }, tiles: [{ status: 'done' as const, url: 'https://x/1.png' }, { status: 'failed' as const, error: 'x' }, { status: 'pending' as const, jobId: 'job2' }] };
    pane({ actions: a, results: results([{ role: 'user', text: 'cats' }, { role: 'assistant', text: '', id: 'b1', genKind: 'image', batch }]) });
    const cards = screen.getAllByTestId('result-card');
    expect(cards.map((c) => c.getAttribute('data-state'))).toEqual(['ready', 'error', 'rendering']);
    fireEvent.click(within(cards[1]!).getByRole('button', { name: 'Try again' }));
    expect(a.retryTile).toHaveBeenCalledWith(1);
    fireEvent.click(within(cards[1]!).getByRole('button', { name: 'Dismiss' }));
    expect(a.dismiss).toHaveBeenCalledWith(1, 1);
    fireEvent.click(within(cards[2]!).getByRole('button', { name: 'Cancel' }));
    expect(a.cancelJob).toHaveBeenCalledWith('job2');
    expect(screen.queryByRole('button', { name: 'Generate again' })).toBeNull(); // a tile is still pending
  });

  test('a finished batch offers one re-roll for all of it', () => {
    const a = actions();
    const batch = { spec: { prompt: 'cats', aspect: '1:1', quality: 'high' }, tiles: [{ status: 'done' as const, url: 'https://x/1.png' }, { status: 'done' as const, url: 'https://x/2.png' }] };
    pane({ actions: a, results: results([{ role: 'assistant', text: '', id: 'b1', batch }]) });
    fireEvent.click(screen.getByRole('button', { name: 'Generate again' }));
    expect(a.rerollBatch).toHaveBeenCalledWith(0);
  });

  test('failed: the reason, Try again when the job has a spec, a way to take it away, and Top up when the refusal was for credits', () => {
    const a = actions();
    pane({ actions: a, results: results([{ role: 'user', text: 'p' }, { role: 'assistant', text: '⚠️ Not enough credits', id: 'f1', genKind: 'image', topUp: true, regen: spec }]) });
    expect(screen.getByTestId('result-card').getAttribute('data-state')).toBe('error');
    expect(screen.getByTestId('result-card').textContent).toContain('Not enough credits');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(a.reroll).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(a.dismiss).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Top up balance' }));
    expect(a.topUp).toHaveBeenCalledTimes(1);
  });

  test('a failure with no spec has no retry, and a plain failure has no top-up', () => {
    pane({ results: results([{ role: 'assistant', text: '⚠️ Failed', id: 'f2', genKind: 'image' }]) });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Top up balance' })).toBeNull();
  });

  test('a refusal that is not an image bubble (a failed upscale) is shown above the result, with top-up when it asks for it', () => {
    const a = actions();
    pane({ actions: a, results: results(ready('r1', 'https://x/fox.png')), notice: { text: 'Upscaling failed', topUp: true } });
    const note = screen.getByTestId('result-notice');
    expect(note.textContent).toContain('Upscaling failed');
    fireEvent.click(within(note).getByRole('button', { name: 'Top up balance' }));
    expect(a.topUp).toHaveBeenCalled();
  });

  test('earlier results: newest first, at most eight, never the one on show; picking one shows it, a NEW result takes the pane back', () => {
    const msgs: ImageMsgLike[] = [];
    for (let i = 1; i <= 10; i++) msgs.push(...ready(`r${i}`, `https://x/${i}.png`, `prompt ${i}`));
    const { rerender, a } = pane({ results: results(msgs) });
    expect((screen.getByTestId('result-image') as HTMLImageElement).src).toBe('https://x/10.png');
    const strip = within(screen.getByTestId('result-earlier'));
    const thumbs = strip.getAllByRole('button');
    expect(thumbs).toHaveLength(8);
    expect(thumbs[0]!.getAttribute('aria-label')).toBe('Open: prompt 9');
    expect(thumbs[7]!.getAttribute('aria-label')).toBe('Open: prompt 2');
    fireEvent.click(thumbs[1]!); // prompt 8
    expect((screen.getByTestId('result-image') as HTMLImageElement).src).toBe('https://x/8.png');
    expect(screen.getByTestId('image-result-pane').textContent).toContain('prompt 8');
    // a new picture arrives → the latest is shown again
    rerender(<ImageResultPane locale="en" results={results([...msgs, ...ready('r11', 'https://x/11.png', 'prompt 11')])} notice={null} aspect="1:1" actions={a} busy={false} upscaling={false} />);
    expect((screen.getByTestId('result-image') as HTMLImageElement).src).toBe('https://x/11.png');
  });

  test.each([['ka', 'შედეგი'], ['ru', 'Результат']] as const)('%s: the pane speaks the language', (locale, heading) => {
    pane({ locale });
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByTestId('result-empty').textContent).toContain(IMAGE_CREATE_COPY[locale].resultEmpty);
  });
});

describe('ImageModelsTable — Models & prices: the one Google row and its price', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* jsdom */ } });
  const setup = (over: Partial<React.ComponentProps<typeof ImageModelsTable>> = {}) => render(<ImageModelsTable locale="en" {...over} />);
  const price = () => `${quoteCredits({ tool: 'image', count: 1 })} credits / image`;

  test('one row: the Google model, what it is for, and the quote per image — no sizes, no V2 / Pro (GG 2026-10-23, "Hide")', () => {
    setup();
    const table = screen.getByTestId('models-prices');
    const row = table.querySelector('[data-model]')!;
    expect(table.querySelectorAll('[data-model]')).toHaveLength(1);
    expect(row.getAttribute('data-model')).toBe('nb/auto');
    expect(row.textContent).toContain('Google Gemini');
    expect(row.textContent).toContain('Google’s image model on Vertex AI');
    expect(row.textContent).toContain(price());
    expect(table.textContent).not.toMatch(/Nano Banana|V2|\b[124]K\b/);
    expect(within(table).queryAllByRole('radio')).toHaveLength(0); // nothing to choose here
  });

  test.each(['hf/soul-2', 'nb/v2', 'nb/pro'])('a %s pick remembered from before is no pick: the table shows the Google row', (id) => {
    window.localStorage.setItem('myavatar:model:image', id);
    setup();
    expect(screen.getByTestId('models-prices').querySelector('[data-model]')!.getAttribute('data-model')).toBe('nb/auto');
  });

  test('a retired id handed in is the Google row too', () => {
    setup({ model: 'nb/pro' });
    expect(screen.getByTestId('models-prices').textContent).toContain('Google Gemini');
    expect(screen.getByTestId('models-prices').textContent).not.toContain('Nano Banana Pro');
  });

  test('the note says what is true: one price per image, ×N billed per image', () => {
    setup();
    expect(screen.getByTestId('models-prices').textContent).toContain('Every image costs the same; ×2 and ×4 are billed per image.');
  });

  test.each([['ka', 'მოდელები და ფასები'], ['ru', 'Модели и цены']] as const)('%s: the table speaks the language', (locale, heading) => {
    setup({ locale });
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
  });
});

describe('ImageDesk — the centre column', () => {
  const props = (over: Partial<React.ComponentProps<typeof ImageDesk>> = {}): React.ComponentProps<typeof ImageDesk> => ({
    locale: 'en', results: [], notice: null, aspect: '1:1',
    actions: actions(), busy: false, upscaling: false, conversation: <p data-testid="thread">the thread</p>, messageCount: 0, ...over,
  });

  test('the Result pane first, Models & prices under it — ref6\'s order', () => {
    render(<ImageDesk {...props()} />);
    const pane = screen.getByTestId('image-result-pane');
    const table = screen.getByTestId('models-prices');
    expect(pane.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('no conversation row for an empty thread; with messages it is a shut disclosure that keeps the thread one tap away', () => {
    const none = render(<ImageDesk {...props()} />);
    expect(screen.queryByTestId('image-conversation')).toBeNull();
    none.unmount();
    render(<ImageDesk {...props({ messageCount: 7 })} />);
    const toggle = within(screen.getByTestId('image-conversation')).getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Conversation');
    expect(toggle.textContent).toContain('7');
    expect(screen.queryByTestId('thread')).toBeNull(); // not mounted until asked for — the thread is never mounted twice
    fireEvent.click(toggle);
    expect(screen.getByTestId('thread')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('thread')).toBeNull();
  });

  test('the desk offers no size to choose: the table is the one Google row and its price', () => {
    render(<ImageDesk {...props()} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByTestId('models-prices').textContent).toContain('Google Gemini');
  });
});
