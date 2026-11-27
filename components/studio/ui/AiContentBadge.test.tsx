/**
 * @jest-environment jsdom
 *
 * AiContentBadge — the visible "AI-generated" label (EU AI Act Art. 50). Pinned: it is off unless
 * NEXT_PUBLIC_AI_LABELS is on, it reads in ka / en / ru, the likeness label says "not a real recording", and the
 * result surfaces carry it only on finished media we made.
 */
import { render, screen } from '@testing-library/react';
import { AiContentBadge, AI_LABEL_COPY, aiLabelText, aiLabelsOn, showsLikeness } from './AiContentBadge';
import { ResultCard } from './ResultCard';
import { ChatAudioPlayer } from '../ChatAudioPlayer';

const prev = process.env.NEXT_PUBLIC_AI_LABELS;
afterEach(() => {
  if (prev === undefined) delete process.env.NEXT_PUBLIC_AI_LABELS;
  else process.env.NEXT_PUBLIC_AI_LABELS = prev;
});
const on = () => { process.env.NEXT_PUBLIC_AI_LABELS = '1'; };

describe('the switch', () => {
  it('is strictly opt-in: only exactly "1" turns it on (the public site stays clean, GG 2026-11-27)', () => {
    for (const v of [undefined, '', '0', 'true', 'on', 'yes', 'TRUE', ' 1', '1 ']) expect(aiLabelsOn(v)).toBe(false);
    expect(aiLabelsOn('1')).toBe(true);
  });
  it('with the flag unset, no result surface shows any label', () => {
    delete process.env.NEXT_PUBLIC_AI_LABELS;
    render(<ResultCard kind="avatar" aspect="9:16" state="ready" locale="en" media={{ type: 'video', url: 'https://x/a.mp4' }} />);
    expect(screen.queryByTestId('ai-content-badge')).toBeNull();
  });
  it('renders nothing while off', () => {
    delete process.env.NEXT_PUBLIC_AI_LABELS;
    const { container } = render(<AiContentBadge locale="en" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the words', () => {
  it('has every label in ka, en and ru; Georgian is the fallback', () => {
    for (const lang of ['ka', 'en', 'ru'] as const) {
      for (const k of ['generated', 'edited', 'likeness'] as const) expect(AI_LABEL_COPY[lang][k].length).toBeGreaterThan(3);
    }
    expect(aiLabelText('generated', 'de')).toBe(AI_LABEL_COPY.ka.generated);
    expect(aiLabelText('likeness', 'en')).toBe('AI-generated — not a real recording');
  });
  it('has an accessible name and ignores the pointer when over media', () => {
    on();
    render(<AiContentBadge locale="en" kind="likeness" />);
    const b = screen.getByRole('note', { name: 'AI-generated — not a real recording' });
    expect(b.getAttribute('data-ai-label')).toBe('likeness');
    expect(b.className).toContain('pointer-events-none');
  });
});

describe('on the result surfaces', () => {
  it('a ready ResultCard carries it; a rendering one and aiLabel={false} do not', () => {
    on();
    const media = { type: 'image' as const, url: 'https://x/a.png' };
    const { rerender } = render(<ResultCard kind="image" aspect="1:1" state="ready" locale="en" media={media} />);
    expect(screen.getByTestId('ai-content-badge').textContent).toContain('AI-generated');
    rerender(<ResultCard kind="image" aspect="1:1" state="rendering" locale="en" />);
    expect(screen.queryByTestId('ai-content-badge')).toBeNull();
    rerender(<ResultCard kind="image" aspect="1:1" state="ready" locale="en" media={media} aiLabel={false} />);
    expect(screen.queryByTestId('ai-content-badge')).toBeNull();
  });
  it('the audio row shows it only when asked (a user attachment has none)', () => {
    on();
    const { rerender } = render(<ChatAudioPlayer src="https://x/a.mp3" locale="ka" />);
    expect(screen.queryByTestId('ai-content-badge')).toBeNull();
    rerender(<ChatAudioPlayer src="https://x/a.mp3" locale="ka" variant="result" aiLabel="generated" />);
    expect(screen.getByTestId('ai-content-badge').textContent).toContain('AI-ით შექმნილი');
  });
});

describe('the deepfake label (Art. 50(4))', () => {
  it('a talking avatar or a clip from the user\'s photos shows a likeness; a text-only clip does not', () => {
    expect(showsLikeness({ genKind: 'lipsync' })).toBe(true);
    expect(showsLikeness({ avatarSpec: { prompt: 'hi', aspect: '9:16' } })).toBe(true);
    expect(showsLikeness({ genKind: 'video', clipSpec: { photos: ['https://x/face.jpg'] } })).toBe(true);
    expect(showsLikeness({ genKind: 'video', clipSpec: { photos: [] } })).toBe(false);
    expect(showsLikeness({ genKind: 'video' })).toBe(false);
  });
  it('an avatar ResultCard carries the likeness label by default', () => {
    on();
    render(<ResultCard kind="avatar" aspect="9:16" state="ready" locale="en" media={{ type: 'video', url: 'https://x/a.mp4' }} />);
    const b = screen.getByTestId('ai-content-badge');
    expect(b.getAttribute('data-ai-label')).toBe('likeness');
    expect(b.textContent).toContain('not a real recording');
  });
});
