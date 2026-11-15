import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArtChatCard } from './ArtChatCard';
import { RecipeCard } from './RecipeCard';
import { postArtChat } from './chatRun';
import { planArtChat, type ArtChatRequest, type ArtChatState } from '@/lib/image/artDirector/chat';

const gen = (): ArtChatRequest => {
  const p = planArtChat({ text: 'a fox', base: null, settings: { aspectRatio: '1:1', count: 2 }, locale: 'en', sizes: ['1K', '2K', '4K'] });
  if (p.kind !== 'run') throw new Error('plan');
  return p.request;
};
const state = (): ArtChatState => ({
  request: gen(),
  tiles: [
    { index: 0, status: 'done', id: 'a', url: 'https://x/a.png', path: 'art-director/u/a.png', width: 1024, height: 1024, charged: 8 },
    { index: 1, status: 'failed', charged: 0, refunded: 0 },
  ],
});
// jsdom has no fetch Response: a minimal one is enough for these callers (status, ok, json()).
const json = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

describe('ArtChatCard (chat grid)', () => {
  it('Upscale (Re-render) 2K, Vary, Use as base and Retry each become a new press', () => {
    const onRun = jest.fn();
    const onPickBase = jest.fn();
    render(<ArtChatCard state={state()} lang="en" prices={{ '1K': 8, '2K': 12, '4K': 17 }} upload={jest.fn()} onRun={onRun} onPickBase={onPickBase} />);
    fireEvent.click(screen.getByTestId('art-upscale-2K-0'));
    expect(onRun).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'upscale', basePath: 'art-director/u/a.png', size: '2K', count: 1 }));
    expect(screen.getByTestId('art-upscale-2K-0')).toHaveAttribute('title', 'Re-renders the image at a higher resolution for more detail.');
    fireEvent.click(screen.getByTestId('art-failed-1').closest('[data-testid="art-tile-1"]')!.querySelector('button')!);
    expect(onRun).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'generate', count: 1 }));
    expect(screen.getByTestId('art-failed-1')).toHaveTextContent('not charged');
  });

  it('Edit opens the brush; Apply with nothing painted is a conversational edit of that tile', () => {
    const onRun = jest.fn();
    render(<ArtChatCard state={state()} lang="en" prices={{ '1K': 8 }} upload={jest.fn()} onRun={onRun} onPickBase={jest.fn()} />);
    fireEvent.click(screen.getByTestId('art-edit-0'));
    fireEvent.change(screen.getByTestId('art-mask-prompt'), { target: { value: 'make her jacket red' } });
    fireEvent.click(screen.getByTestId('art-mask-apply'));
    expect(onRun).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'edit', basePath: 'art-director/u/a.png', prompt: 'make her jacket red' }));
  });

  it('size not sold is said plainly', () => {
    render(<ArtChatCard state={{ ...state(), tiles: [], error: 'size_not_sold' }} lang="ka" prices={{}} upload={jest.fn()} onRun={jest.fn()} onPickBase={jest.fn()} />);
    expect(screen.getByTestId('art-chat-error')).toHaveTextContent('ეს ზომა ჯერ არ იყიდება.');
  });
});

describe('postArtChat', () => {
  it('maps slots to tiles', async () => {
    const fetcher = jest.fn(() => json(200, { ok: true, perImage: 8, charged: 8, slots: [{ index: 0, status: 'done', id: 'a', url: 'u', path: 'p', charged: 8, refunded: 0, meta: { width: 10, height: 20 } }] })) as unknown as typeof fetch;
    const r = await postArtChat(fetcher, gen());
    expect(r).toEqual({ kind: 'ok', perImage: 8, charged: 8, tiles: [{ index: 0, status: 'done', id: 'a', url: 'u', path: 'p', width: 10, height: 20, charged: 8, refunded: 0 }] });
  });
  it('feature_off → fallback to the old image path; other errors are errors', async () => {
    expect(await postArtChat((() => json(404, { ok: false, error: 'feature_off' })) as unknown as typeof fetch, gen())).toEqual({ kind: 'fallback' });
    expect(await postArtChat((() => json(402, { ok: false, error: 'insufficient_credits' })) as unknown as typeof fetch, gen())).toMatchObject({ kind: 'error', code: 'insufficient_credits' });
    expect(await postArtChat((() => Promise.reject(new Error('x'))) as unknown as typeof fetch, gen())).toEqual({ kind: 'error', code: 'network' });
  });
});

describe('RecipeCard (Library)', () => {
  it('shows the recipe and PNG/JPG downloads', async () => {
    const recipe = { kind: 'image', subtype: 'art-director-v1', model: 'gemini-3.1-flash-image', operation: 'generate', prompt: 'a fox', finalPrompt: 'a fox', styleId: null, avoid: [], aspectRatio: '1:1', size: '1K', seed: 7, seedBestEffort: true, references: [{ letter: 'A', role: 'face', locked: false }], parentId: null, gridId: 'g', gridIndex: 0, credits: 8, width: 1024, height: 1024, unmaskedDigest: null, createdAt: '2026-11-15T07:00:00Z' };
    const fetcher = jest.fn(() => json(200, { ok: true, recipe })) as unknown as typeof fetch;
    render(<RecipeCard path="art-director/u/a.png" lang="en" fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByTestId('art-recipe-prompt')).toHaveTextContent('a fox'));
    expect(screen.getByTestId('art-recipe-seed')).toHaveTextContent('7 (best effort)');
    expect(screen.getByTestId('art-recipe-refs')).toHaveTextContent('A face');
    expect(screen.getByTestId('art-recipe-jpg')).toHaveAttribute('href', '/api/image/art-director/download?path=art-director%2Fu%2Fa.png&format=jpg');
  });
  it('missing recipe', async () => {
    render(<RecipeCard path="p" lang="en" fetcher={(() => json(404, { ok: false })) as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByTestId('art-recipe-missing')).toBeInTheDocument());
  });
});
