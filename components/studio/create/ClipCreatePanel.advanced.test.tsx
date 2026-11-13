/**
 * Phase 7.5 — the clip panel's run summary, its photo roles and its Advanced fold (what to avoid + a seed, Veo only,
 * lib/video/clipAdvanced). The fold exists only when OmniStudio passes `advanced` (NEXT_PUBLIC_CLIP_ADVANCED on).
 */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { directClipCredits } from '@/lib/video/directClip';
import { clipAdvancedLine, clipOrder, clipRequestBody, changeClip } from '@/components/studio/clip/clipOrder';
import { ClipCreatePanel, type ClipCreatePanelProps } from './ClipCreatePanel';

const PHOTO = 'data:image/jpeg;base64,AAAA';

function panel(over: Partial<ClipCreatePanelProps> = {}) {
  const props: ClipCreatePanelProps = {
    locale: 'en', surface: 'panel', toolName: 'Video', onSwitchTool: jest.fn(), onClose: jest.fn(),
    seconds: 8, onSeconds: jest.fn(), aspect: '9:16', onAspect: jest.fn(), tier: 'fast', onTier: jest.fn(),
    resolution: '720p', onResolution: jest.fn(), photos: { images: [], onAdd: jest.fn(), onRemove: jest.fn() },
    ...over,
  };
  return render(<ClipCreatePanel {...props} />);
}

test('the summary says what will be made and its price, the same price the route charges', () => {
  panel();
  const s = screen.getByTestId('clip-panel-summary').textContent ?? '';
  expect(s).toContain('8 s · 9:16 · 1080p · 1080×1920 · Veo 3.1 Fast');
  expect(s).toContain(`✦ ${directClipCredits({ seconds: 8, tier: 'fast', photos: 0 })}`);
});

test('the summary follows Omni at 10 s', () => {
  panel({ seconds: 10, resolution: '1080p' });
  const s = screen.getByTestId('clip-panel-summary').textContent ?? '';
  expect(s).toContain('Gemini Omni Flash');
  expect(s).toContain(`✦ ${directClipCredits({ seconds: 10, tier: 'fast', photos: 0, resolution: '1080p' })}`);
});

test('photo roles: no photo explains both; one is the first frame; two are references', () => {
  const { unmount } = panel();
  expect(screen.getByTestId('clip-panel-photo-roles').textContent).toMatch(/first frame/i);
  unmount();
  const one = panel({ photos: { images: [PHOTO] } });
  expect(screen.getByTestId('clip-panel-photo-role-0').textContent).toBe('First frame');
  one.unmount();
  panel({ photos: { images: [PHOTO, PHOTO] } });
  expect(screen.getByTestId('clip-panel-photo-role-0').textContent).toBe('Ref 1');
  expect(screen.getByTestId('clip-panel-photo-role-1').textContent).toBe('Ref 2');
});

test('no `advanced` prop (the flag off): no fold at all', () => {
  panel();
  expect(screen.queryByTestId('clip-panel-advanced')).toBeNull();
});

test('the fold edits avoid and seed; the dice picks a seed; clear empties it', () => {
  const onAvoid = jest.fn(), onSeed = jest.fn();
  function Harness() {
    const [avoid, setAvoid] = useState('');
    const [seed, setSeed] = useState<number | null>(7);
    return <ClipCreatePanel locale="en" surface="panel" toolName="Video" onSwitchTool={jest.fn()} onClose={jest.fn()}
      seconds={8} onSeconds={jest.fn()} aspect="9:16" onAspect={jest.fn()} tier="fast" onTier={jest.fn()} resolution="720p" onResolution={jest.fn()}
      photos={{ images: [] }}
      advanced={{ avoid, seed, onAvoid: (v) => { onAvoid(v); setAvoid(v); }, onSeed: (v) => { onSeed(v); setSeed(v); } }} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
  fireEvent.change(screen.getByTestId('clip-advanced-avoid'), { target: { value: 'blur' } });
  expect(onAvoid).toHaveBeenCalledWith('blur');
  fireEvent.change(screen.getByTestId('clip-advanced-seed'), { target: { value: '12x3' } });
  expect(onSeed).toHaveBeenLastCalledWith(123);
  fireEvent.change(screen.getByTestId('clip-advanced-seed'), { target: { value: '' } });
  expect(onSeed).toHaveBeenLastCalledWith(null);
  fireEvent.click(screen.getByTestId('clip-advanced-dice'));
  expect(typeof onSeed.mock.calls.at(-1)?.[0]).toBe('number');
  fireEvent.click(screen.getByTestId('clip-advanced-seed-clear'));
  expect(onSeed).toHaveBeenLastCalledWith(null);
});

test('a seed beyond uint32 is not taken', () => {
  const onSeed = jest.fn();
  panel({ advanced: { avoid: '', seed: 5, onAvoid: jest.fn(), onSeed } });
  fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
  fireEvent.change(screen.getByTestId('clip-advanced-seed'), { target: { value: '9999999999' } });
  expect(onSeed).toHaveBeenLastCalledWith(5);
});

test('for an Omni clip the fold says why and is disabled', () => {
  panel({ seconds: 10, advanced: { avoid: 'blur', seed: null, onAvoid: jest.fn(), onSeed: jest.fn() } });
  fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
  expect(screen.getByTestId('clip-advanced-omni')).toBeTruthy();
  expect((screen.getByTestId('clip-advanced-avoid') as HTMLTextAreaElement).disabled).toBe(true);
});

describe('the order and its request', () => {
  const base = { prompt: 'a fox', photos: [], seconds: 8, aspect: '9:16' as const, tier: 'fast' as const };

  test('without advanced fields the order and body are exactly today\'s', () => {
    const o = clipOrder(base);
    expect('avoid' in o).toBe(false);
    expect('seed' in o).toBe(false);
    const body = clipRequestBody(o);
    expect('avoid' in body).toBe(false);
    expect('seed' in body).toBe(false);
  });

  test('a Veo order carries them, unchanged price; the card line says them', () => {
    const o = clipOrder({ ...base, avoid: '  text  on screen ', seed: 42 });
    expect(o.credits).toBe(clipOrder(base).credits);
    expect(clipRequestBody(o)).toMatchObject({ avoid: 'text on screen', seed: 42 });
    expect(clipAdvancedLine(o, 'en')).toBe('Avoid: text on screen · seed 42');
  });

  test('an Omni order keeps them for later but never sends them', () => {
    const o = clipOrder({ ...base, seconds: 10, avoid: 'blur', seed: 1 });
    const body = clipRequestBody(o);
    expect('avoid' in body).toBe(false);
    expect('seed' in body).toBe(false);
    expect(clipAdvancedLine(o, 'en')).toBeNull();
    // Back to 8 s: Veo again, and the fields are still there.
    expect(clipRequestBody(changeClip(o, { seconds: 8 }))).toMatchObject({ avoid: 'blur', seed: 1 });
  });

  test('a change on the card edits them; seed null removes it', () => {
    const o = clipOrder({ ...base, seed: 3 });
    expect(changeClip(o, { avoid: 'blur' }).avoid).toBe('blur');
    expect('seed' in changeClip(o, { seed: null })).toBe(false);
  });
});

describe('first → last frame (NEXT_PUBLIC_CLIP_LAST_FRAME; the prop is passed only while it is on)', () => {
  const two = ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'];
  const base: ClipCreatePanelProps = {
    locale: 'en', surface: 'panel', toolName: 'Video', onSwitchTool: jest.fn(), onClose: jest.fn(),
    seconds: 8, onSeconds: jest.fn(), aspect: '9:16', onAspect: jest.fn(), tier: 'fast', onTier: jest.fn(),
    resolution: '720p', onResolution: jest.fn(), photos: { images: two, onAdd: jest.fn(), onRemove: jest.fn() },
  };

  test('without the prop: two photos are Ref 1 and Ref 2, no choice', () => {
    render(<ClipCreatePanel {...base} />);
    expect(screen.queryByTestId('clip-panel-two-photos')).toBeNull();
    expect(screen.getByTestId('clip-panel-photo-role-1').textContent).toBe('Ref 2');
  });

  test('with it and two photos: References / First → last; picking frames relabels the photos and the note', () => {
    const onChange = jest.fn();
    const { rerender } = render(<ClipCreatePanel {...base} lastFrame={{ on: false, onChange }} />);
    fireEvent.click(screen.getByTestId('clip-panel-as-frames'));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<ClipCreatePanel {...base} lastFrame={{ on: true, onChange }} />);
    expect(screen.getByTestId('clip-panel-photo-role-0').textContent).toBe('First frame');
    expect(screen.getByTestId('clip-panel-photo-role-1').textContent).toBe('Last frame');
    expect(screen.getByTestId('clip-panel-photos').textContent).toContain('From the first photo to the second');
    expect(screen.getByTestId('clip-panel-as-frames').getAttribute('aria-pressed')).toBe('true');
  });

  test('not with one or three photos, and not for an Omni clip (Georgian line)', () => {
    const { rerender } = render(<ClipCreatePanel {...base} photos={{ images: two.slice(0, 1) }} lastFrame={{ on: true, onChange: jest.fn() }} />);
    expect(screen.queryByTestId('clip-panel-two-photos')).toBeNull();
    rerender(<ClipCreatePanel {...base} speech="ka" lastFrame={{ on: true, onChange: jest.fn() }} />);
    expect(screen.queryByTestId('clip-panel-two-photos')).toBeNull();
    expect(screen.getByTestId('clip-panel-photo-role-1').textContent).toBe('Ref 2');
  });
});

describe('the order and the request body carry lastFrame only where it fits', () => {
  const two = ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'];
  test('two photos on Veo: kept and sent; a change keeps it; same price as references', () => {
    const o = clipOrder({ prompt: 'a fox', photos: two, seconds: 8, aspect: '9:16', tier: 'fast', lastFrame: true });
    expect(o.lastFrame).toBe(true);
    expect(clipRequestBody(o).lastFrame).toBe(true);
    expect(o.credits).toBe(clipOrder({ prompt: 'a fox', photos: two, seconds: 8, aspect: '9:16', tier: 'fast' }).credits);
    expect(changeClip(o, { aspect: '16:9' }).lastFrame).toBe(true);
    expect(changeClip(o, { lastFrame: false }).lastFrame).toBeUndefined();
  });
  test('one photo, or no lastFrame: not in the order, not in the body', () => {
    const one = clipOrder({ prompt: 'a fox', photos: two.slice(0, 1), seconds: 8, aspect: '9:16', tier: 'fast', lastFrame: true });
    expect(one.lastFrame).toBeUndefined();
    expect('lastFrame' in clipRequestBody(one)).toBe(false);
    expect('lastFrame' in clipRequestBody(clipOrder({ prompt: 'a fox', photos: two, seconds: 8, aspect: '9:16', tier: 'fast' }))).toBe(false);
  });
});
