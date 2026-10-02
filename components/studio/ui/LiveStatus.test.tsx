/**
 * @jest-environment jsdom
 *
 * LiveStatus — what a screen reader hears about a long job: started, then ready or failed, in the studio's languages;
 * a polite live region that is always mounted (empty while idle) and never a second role="status".
 */
import { render, screen } from '@testing-library/react';
import { LiveStatus, generationAnnouncement } from './LiveStatus';

describe('generationAnnouncement', () => {
  it.each([
    ['en', 'started', '3D model — started'],
    ['en', 'done', '3D model — ready'],
    ['ka', 'done', '3D model — მზადაა'],
    ['ru', 'started', '3D model — запущено'],
  ] as const)('%s · %s', (locale, state, text) => {
    expect(generationAnnouncement('3D model', state, locale)).toBe(text);
  });

  it('says why a job failed, and nothing at all while idle', () => {
    expect(generationAnnouncement('Dubbing', 'failed', 'en', ' Video too long ')).toBe('Dubbing — failed: Video too long');
    expect(generationAnnouncement('Dubbing', 'failed', 'en')).toBe('Dubbing — failed');
    expect(generationAnnouncement('Dubbing', 'idle', 'en', 'x')).toBe('');
  });
});

describe('LiveStatus', () => {
  it('is a visually hidden polite region, mounted even while empty, and not a role="status"', () => {
    render(<LiveStatus text="" />);
    const region = screen.getByTestId('live-status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.className).toContain('sr-only');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
