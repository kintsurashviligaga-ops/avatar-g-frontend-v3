/**
 * @jest-environment jsdom
 *
 * Interior polish, Phase 7.6 I1 · I3 · I4, behind NEXT_PUBLIC_INTERIOR_UX_V2: off changes nothing; on, a room photo is
 * "redesigned" (banner, button, quick edits), the footer says what Generate makes, and a finished render compares against
 * the uploaded room on a divider.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InteriorCreatePanel, type InteriorPanelProps } from '../InteriorCreatePanel';
import { ShootResultPane, type ShootPaneProps } from './ShootResultPane';
import { BeforeAfter } from './BeforeAfter';
import { addRoomEdit, interiorSummaryLine } from './interiorUxV2';
import type { InteriorForm } from './useShootStudio';
import type { ShootRun } from './shootRuns';

const FLAG = process.env.NEXT_PUBLIC_INTERIOR_UX_V2;
afterEach(() => { process.env.NEXT_PUBLIC_INTERIOR_UX_V2 = FLAG; });

const PHOTO = { id: 'p1', src: 'data:image/png;base64,AAA', w: 1200, h: 900 };
function panel(over: Partial<InteriorForm> = {}, onPatch = jest.fn()) {
  const form = { photos: [], brief: '', room: 'living', template: null, aspect: 'auto', quality: 'high', count: 2, ...over } as unknown as InteriorForm;
  const props: InteriorPanelProps = {
    locale: 'en', form, credits: 8, tiles: form.photos.length ? form.photos.length * form.count : form.count,
    insufficient: false, canGenerate: true, notice: null, onPatch, onAddPhotos: jest.fn(), onRemovePhoto: jest.fn(),
    onGenerate: jest.fn(), onClose: jest.fn(), onSwitchTool: jest.fn(),
  };
  render(<InteriorCreatePanel {...props} />);
  return onPatch;
}

test('flag off: no banner, no quick edits, no summary, the button says Generate', () => {
  delete process.env.NEXT_PUBLIC_INTERIOR_UX_V2;
  panel({ photos: [PHOTO] });
  for (const id of ['interior-edit-banner', 'interior-quick-edits', 'interior-summary']) expect(screen.queryByTestId(id)).toBeNull();
  expect(screen.getByTestId('interior-generate').textContent).not.toMatch(/Redesign/);
});

test('flag on with a room photo: banner, Redesign button, quick edits add their words, summary at the button price', () => {
  process.env.NEXT_PUBLIC_INTERIOR_UX_V2 = 'true';
  const onPatch = panel({ photos: [PHOTO], brief: 'Japandi' });
  expect(screen.getByTestId('interior-edit-banner').textContent).toMatch(/Redesigning your room/);
  expect(screen.getByTestId('interior-generate').textContent).toMatch(/Redesign/);
  fireEvent.click(screen.getByTestId('interior-edit-plants'));
  expect(onPatch).toHaveBeenCalledWith({ brief: 'Japandi, add green plants' });
  expect(screen.getByTestId('interior-summary').textContent).toBe('You will get: 2 images · Auto · 4:3 · ✦ 8');
});

test('flag on without a photo: still "create" wording, but the summary shows', () => {
  process.env.NEXT_PUBLIC_INTERIOR_UX_V2 = 'true';
  panel();
  expect(screen.queryByTestId('interior-edit-banner')).toBeNull();
  expect(screen.getByTestId('interior-summary')).toBeTruthy();
});

test('addRoomEdit adds once and respects the length cap', () => {
  expect(addRoomEdit('', 'brighter', 'en', 600)).toBe('brighter, more daylight');
  expect(addRoomEdit('oak floor.', 'floor', 'en', 600)).toBe('oak floor, a new floor');
  expect(addRoomEdit('x, brighter, more daylight', 'brighter', 'en', 600)).toBe('x, brighter, more daylight');
  expect(addRoomEdit('abc', 'plants', 'en', 5)).toBe('abc');
  expect(addRoomEdit('', 'plants', 'ka', 600)).toBe('დაამატე მწვანე მცენარეები');
  expect(interiorSummaryLine({ tilesLine: '2 photos × 2 = 4 images', aspect: '4:5', credits: 16 })).toBe('2 photos × 2 = 4 images · 4:5 · ✦ 16');
});

test('BeforeAfter: the divider is a range; moving it clips the after picture', () => {
  render(<BeforeAfter before="b.png" after="a.png" labels={{ before: 'Before', after: 'After', compare: 'Compare' }} />);
  const range = screen.getByLabelText('Compare');
  fireEvent.change(range, { target: { value: '30' } });
  expect((screen.getByTestId('before-after-after') as HTMLElement).style.clipPath).toBe('inset(0 0 0 30%)');
  expect(range.getAttribute('aria-valuetext')).toBe('Before 30% · After 70%');
});

function pane() {
  const run = {
    id: 'r1', tool: 'interior', createdAt: 1, label: 'Japandi', prompt: 'p', brief: '', quality: 'high', wire: { kind: 'interior' },
    photos: [PHOTO], tiles: [{ id: 't1', photoIndex: 0, variant: 0, aspect: '4:3', status: 'ready', url: 'https://x.supabase.co/a.png' }],
  } as unknown as ShootRun;
  const noop = jest.fn();
  const props: ShootPaneProps = {
    tool: 'interior', locale: 'en', runs: [run], prices: { image: 4, plan3d: 10, walkthrough: 30 },
    onOpenImage: noop, onRetry: noop, onCancel: noop, onAnother: noop, onPlan3d: noop, onWalkthrough: noop,
    onUseAsReference: noop, onDismissRun: noop, onDismissTile: noop, onClear: noop, onOpenSettings: noop,
  };
  render(<ShootResultPane {...props} />);
}

test('result pane: before/after only with the flag on', () => {
  delete process.env.NEXT_PUBLIC_INTERIOR_UX_V2;
  pane();
  expect(screen.queryByTestId('tile-before-after')).toBeNull();
  cleanup();
  process.env.NEXT_PUBLIC_INTERIOR_UX_V2 = 'true';
  pane();
  expect(screen.getByTestId('tile-before-after')).toBeTruthy();
});
