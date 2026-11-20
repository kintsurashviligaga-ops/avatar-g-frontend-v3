import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ControlPanel, DEFAULT_ART_SETTINGS } from './ControlPanel';
import { ReferenceTray, type TrayRef } from './ReferenceTray';
import { VariationGrid } from './VariationGrid';
import { ArtDirectorPanel } from './ArtDirectorPanel';
import { MaskBrush } from './MaskBrush';

const ref = (i: number, role: TrayRef['role'] = 'object'): TrayRef => ({ path: `u1/r${i}.png`, previewUrl: '', role, locked: false });

describe('ControlPanel', () => {
  it('shows all 14 ratios, prices per size and the live total (v8: 4 × 2K = ✦48)', () => {
    const onChange = jest.fn();
    render(<ControlPanel value={{ ...DEFAULT_ART_SETTINGS, size: '2K', count: 4 }} onChange={onChange} book="v8" references={0} lang="en" sizes={['1K', '2K', '4K']} />);
    expect(screen.getAllByTestId(/^art-ratio-/)).toHaveLength(14);
    expect(screen.getByTestId('art-ratio-1:8')).toBeInTheDocument();
    expect(screen.getByTestId('art-size-1K')).toHaveTextContent('✦8');
    expect(screen.getByTestId('art-size-2K')).toHaveTextContent('✦12');
    expect(screen.getByTestId('art-size-4K')).toHaveTextContent('✦17');
    expect(screen.getByTestId('art-total')).toHaveTextContent('4 × 2K = ✦48');
    fireEvent.click(screen.getByTestId('art-avoid-fingers'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ avoid: ['extra or deformed fingers and hands'] }));
  });
  it('today book: only 1K', () => {
    render(<ControlPanel value={DEFAULT_ART_SETTINGS} onChange={jest.fn()} book="today" references={0} lang="ka" sizes={['1K']} />);
    expect(screen.queryByTestId('art-size-4K')).toBeNull();
  });
});

describe('ReferenceTray (multi-reference)', () => {
  it('letters A–N, no add slot at 14', () => {
    render(<ReferenceTray refs={Array.from({ length: 14 }, (_, i) => ref(i))} onChange={jest.fn()} onAdd={jest.fn()} lang="en" />);
    expect(screen.getByTestId('art-ref-A')).toBeInTheDocument();
    expect(screen.getByTestId('art-ref-N')).toBeInTheDocument();
    expect(screen.queryByTestId('art-ref-add')).toBeNull();
  });
  it('warns above 5 people and lets a reference be locked and re-roled', () => {
    const onChange = jest.fn();
    render(<ReferenceTray refs={Array.from({ length: 6 }, (_, i) => ref(i, 'face'))} onChange={onChange} onAdd={jest.fn()} lang="en" />);
    expect(screen.getByTestId('art-identity-warn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('art-ref-lock-A'));
    expect(onChange.mock.calls[0][0][0].locked).toBe(true);
    fireEvent.change(screen.getByTestId('art-ref-role-B'), { target: { value: 'outfit' } });
    expect(onChange.mock.calls[1][0][1].role).toBe('outfit');
  });
});

describe('VariationGrid', () => {
  it('2×2 with Upscale (Re-render) + tooltip, and a refunded failed tile', () => {
    const onAction = jest.fn();
    render(<VariationGrid lang="en" prices={{ '2K': 12, '4K': 17 }} onAction={onAction} tiles={[
      { index: 0, status: 'done', url: 'https://x/0' }, { index: 1, status: 'done', url: 'https://x/1' },
      { index: 2, status: 'failed', refunded: 8 }, { index: 3, status: 'working' },
    ]} />);
    const up = screen.getByTestId('art-upscale-2K-0');
    expect(up).toHaveTextContent('Upscale (Re-render) 2K ✦12');
    expect(up).toHaveAttribute('title', 'Re-renders the image at a higher resolution for more detail.');
    expect(screen.getByTestId('art-failed-2')).toHaveTextContent('refunded ✦8');
    fireEvent.click(screen.getByTestId('art-edit-1'));
    expect(onAction).toHaveBeenCalledWith(1, 'edit');
  });
  it('Georgian upscale label', () => {
    render(<VariationGrid lang="ka" prices={{ '2K': 12 }} onAction={jest.fn()} tiles={[{ index: 0, status: 'done', url: 'u' }]} />);
    expect(screen.getByTestId('art-upscale-2K-0')).toHaveTextContent('გაუმჯობესება (ხელახლა დახატვა)');
  });
});

describe('ArtDirectorPanel (mocked route)', () => {
  const okSlots = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i, status: 'done', id: `id${i}`, url: `https://x/${i}`, path: `art-director/u1/id${i}.png`, charged: 5, refunded: 0, meta: { width: 64, height: 64 } }));
  it('generates a grid of 4; Edit opens the brush (today book hides 2K/4K re-render)', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, slots: okSlots(4) }) });
    render(<ArtDirectorPanel lang="en" upload={jest.fn()} fetcher={fetcher as unknown as typeof fetch} />);
    fireEvent.change(screen.getByTestId('art-prompt'), { target: { value: 'a cat in Tbilisi' } });
    fireEvent.click(screen.getByTestId('art-create'));
    await waitFor(() => expect(screen.getByTestId('art-tile-3')).toHaveAttribute('data-status', 'done'));
    expect(screen.getAllByTestId(/^art-tile-/)).toHaveLength(4);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ v: 1, operation: 'generate', count: 4, prompt: 'a cat in Tbilisi', size: '1K', aspectRatio: '1:1' });
    // Today's book (flag off): no 2K/4K re-render buttons; Edit opens the brush.
    expect(screen.queryByTestId('art-upscale-2K-0')).toBeNull();
    fireEvent.click(screen.getByTestId('art-edit-2'));
    expect(screen.getByTestId('art-mask-brush')).toBeInTheDocument();
  });
  it('a failed press says nothing was charged', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, message: 'x' }) });
    render(<ArtDirectorPanel lang="en" upload={jest.fn()} fetcher={fetcher as unknown as typeof fetch} />);
    fireEvent.change(screen.getByTestId('art-prompt'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('art-create'));
    await waitFor(() => expect(screen.getByTestId('art-error')).toHaveTextContent('Nothing was charged'));
  });
  it('a brush edit with no paint is a whole-image edit; keep-identical is on by default', () => {
    const onSubmit = jest.fn();
    render(<MaskBrush imageUrl="u" width={64} height={64} lang="en" price={8} onSubmit={onSubmit} onCancel={jest.fn()} />);
    expect(screen.getByTestId('art-keep-rest')).toBeChecked();
    fireEvent.change(screen.getByTestId('art-mask-prompt'), { target: { value: 'make her jacket red' } });
    fireEvent.click(screen.getByTestId('art-mask-apply'));
    expect(onSubmit).toHaveBeenCalledWith({ prompt: 'make her jacket red', mask: null, keepRest: true });
  });
});
