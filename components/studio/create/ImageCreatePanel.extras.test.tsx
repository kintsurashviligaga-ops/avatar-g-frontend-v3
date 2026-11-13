/**
 * Phase 7.5 on the Image tool's Create screen, both flags OFF by default: the four extra ratios (NEXT_PUBLIC_IMAGE_EXTRA_RATIOS)
 * and edit mode (NEXT_PUBLIC_IMAGE_EDIT_MODE) — with a picture attached the screen says it is editing it, the button says Edit
 * and quick edits fill the prompt. Off, the screen is exactly today's.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ImageCreatePanel, type ImageCreatePanelProps } from './ImageCreatePanel';
import { IMG_ASPECTS } from '@/lib/studio/imageCreate';
import { IMG_EXTRA_ASPECTS, quickEdits } from '@/lib/studio/imageExtras';

const PHOTO = { src: 'data:image/png;base64,AAAA', name: 'me.png' };
function show(over: Partial<ImageCreatePanelProps> = {}) {
  const p: ImageCreatePanelProps = {
    locale: 'en', desktop: false, onOpenTools: jest.fn(), onClose: jest.fn(),
    references: [], onAddReference: jest.fn(), onRemoveReference: jest.fn(), foreignFileCount: 0, onClearForeignFiles: jest.fn(),
    prompt: '', onPrompt: jest.fn(), templates: [], activeTemplate: null, onPickTemplate: jest.fn(),
    aspect: '1:1', onAspect: jest.fn(), count: 1, onCount: jest.fn(),
    style: 'Auto', onStyle: jest.fn(), styleLabel: (s: string) => s, negative: '', onNegative: jest.fn(),
    balance: 100, onGenerate: jest.fn(), onTopUp: jest.fn(),
    ...over,
  };
  render(<ImageCreatePanel {...p} />);
  return p;
}

const KEYS = ['NEXT_PUBLIC_IMAGE_EXTRA_RATIOS', 'NEXT_PUBLIC_IMAGE_EDIT_MODE'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
beforeEach(() => { for (const k of KEYS) delete process.env[k]; try { window.localStorage.clear(); } catch { /* jsdom */ } });
afterAll(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const ratios = () => {
  fireEvent.click(screen.getByTestId('chip-aspect'));
  return within(screen.getByRole('dialog', { name: 'Aspect ratio' })).getAllByRole('radio').map((o) => o.textContent);
};

test('flag off: ten ratios, as today', () => {
  show();
  expect(ratios()).toEqual([...IMG_ASPECTS]);
});

test('flag on: 1:4, 4:1, 1:8 and 8:1 follow, and one can be picked', () => {
  process.env.NEXT_PUBLIC_IMAGE_EXTRA_RATIOS = '1';
  const p = show();
  expect(ratios()).toEqual([...IMG_ASPECTS, ...IMG_EXTRA_ASPECTS]);
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Aspect ratio' })).getByRole('radio', { name: /^1:8/ }));
  expect(p.onAspect).toHaveBeenCalledWith('1:8');
});

test('edit mode off: a picture attached changes nothing on the screen', () => {
  show({ references: [PHOTO] });
  expect(screen.queryByTestId('image-edit-mode')).toBeNull();
  expect(screen.getByTestId('create-generate').textContent).not.toMatch(/^Edit/);
});

test('edit mode on, no picture: still Create', () => {
  process.env.NEXT_PUBLIC_IMAGE_EDIT_MODE = '1';
  show();
  expect(screen.queryByTestId('image-edit-mode')).toBeNull();
});

test('edit mode on with a picture: the banner, the Edit button, and quick edits that fill the prompt', () => {
  process.env.NEXT_PUBLIC_IMAGE_EDIT_MODE = '1';
  const p = show({ references: [PHOTO], prompt: 'keep the cat' });
  expect(screen.getByTestId('image-edit-mode').textContent).toContain('Editing your image');
  expect(screen.getByTestId('create-generate').textContent).toContain('Edit');
  expect(screen.getByPlaceholderText('e.g. make the sky a sunset')).toBeTruthy();
  const remove = quickEdits('en').find((q) => q.id === 'remove-bg')!;
  fireEvent.click(screen.getByTestId('image-quick-edit-remove-bg'));
  expect(p.onPrompt).toHaveBeenCalledWith(`keep the cat\n${remove.prompt}`);
  fireEvent.click(screen.getByTestId('create-generate'));
  expect(p.onGenerate).toHaveBeenCalledTimes(1);
});
