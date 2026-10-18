import { genresNamedIn, styleForBrief } from './musicGenreWords';
import { buildMusicBrief } from './musicBrief';
import { directions } from '@/lib/music/studio/prompt';

describe('the genre the user typed wins over the hidden panel chip (GG 2026-10-18)', () => {
  test('genres are found in ka · en · ru, in any form', () => {
    expect(genresNamedIn('a slow blues song about the road')).toContain('blues');
    expect(genresNamedIn('ბლუზური სიმღერა გზაზე')).toContain('ბლუზ');
    expect(genresNamedIn('джазовая песня')).toContain('джаз');
    expect(genresNamedIn('Hip-hop track with heavy bass')).toContain('hip-hop');
  });

  test('short English stems do not fire inside other words', () => {
    expect(genresNamedIn('a popular song about memory')).toEqual([]);
    expect(genresNamedIn('wrap it up, a rocky road')).not.toContain('rap');
    expect(genresNamedIn('pop song')).toContain('pop');
  });

  test('a panel style the description contradicts is dropped; a matching or genre-free one stays', () => {
    expect(styleForBrief('r&b', 'a blues song about the road')).toBe('');
    expect(styleForBrief('r&b', 'a song about my mother')).toBe('r&b');
    expect(styleForBrief('blues, jazz', 'slow blues')).toBe('blues, jazz');
    expect(styleForBrief('uplifting', 'a rock anthem')).toBe('uplifting');
    expect(styleForBrief('', 'rock')).toBe('');
  });

  test('the brief the engine reads no longer says "Style: r&b." after the user\'s blues', () => {
    const b = buildMusicBrief({ prompt: 'A slow blues song about the road', style: 'r&b' });
    expect(b.prompt).not.toMatch(/r&b/i);
    expect(b.prompt).toMatch(/blues/);
    expect(buildMusicBrief({ prompt: 'A song about the sea', style: 'r&b' }).prompt).toMatch(/Style: r&b\./);
  });

  test('Music Studio v1 directions follow the same rule', () => {
    const r = { prompt: 'heavy metal riff', genre: 'r&b', mode: 'instrumental' } as Parameters<typeof directions>[0];
    expect(directions(r).join(' ')).not.toMatch(/r&b/);
  });
});
