import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MusicVideoLook, type MusicVideoLookValue } from './MusicVideoLook';
import { MV_GENRES, MV_LIGHTING } from '@/lib/chat/musicVideoPresets';

function Harness({ locale, onChange }: { locale: string; onChange?: (v: MusicVideoLookValue) => void }) {
  const [v, setV] = useState<MusicVideoLookValue>({ genre: null, lighting: null });
  return <MusicVideoLook locale={locale} value={v} onChange={(n) => { setV(n); onChange?.(n); }} />;
}

describe('MusicVideoLook — the music video presets the retired director had, inside the Video tool', () => {
  test('offers every genre and light, nothing picked by default', () => {
    render(<Harness locale="en" />);
    for (const g of MV_GENRES) expect(screen.getByTestId(`mv-genre-${g.id}`).getAttribute('aria-pressed')).toBe('false');
    for (const l of MV_LIGHTING) expect(screen.getByTestId(`mv-light-${l.id}`).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('mv-genre-blues').textContent).toBe('Blues');
  });

  test('a tap picks, a second tap clears, and the two rows are independent', () => {
    const seen: MusicVideoLookValue[] = [];
    render(<Harness locale="en" onChange={(v) => seen.push(v)} />);
    fireEvent.click(screen.getByTestId('mv-genre-hiphop'));
    fireEvent.click(screen.getByTestId('mv-light-moody'));
    expect(screen.getByTestId('mv-genre-hiphop').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('mv-light-moody').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('mv-genre-pop'));
    expect(screen.getByTestId('mv-genre-hiphop').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('mv-genre-pop'));
    expect(seen[seen.length - 1]).toEqual({ genre: null, lighting: 'moody' });
  });

  test('speaks Georgian by default and Russian when asked', () => {
    const { unmount } = render(<Harness locale="ka" />);
    expect(screen.getByTestId('mv-genre-blues').textContent).toBe('ბლუზი');
    expect(screen.getByTestId('mv-look').textContent).toContain('ჟანრი');
    unmount();
    render(<Harness locale="ru" />);
    expect(screen.getByTestId('mv-genre-blues').textContent).toBe('Блюз');
    expect(screen.getByTestId('mv-look').textContent).toContain('Свет');
  });
});
