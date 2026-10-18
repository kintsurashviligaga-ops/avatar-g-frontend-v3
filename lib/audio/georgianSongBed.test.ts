/** @jest-environment node */
/**
 * The Georgian song's instrumental bed runs ONE engine (the owner, 2026-10-09: no silent fallback to another outside
 * provider): ElevenLabs Music when its key is present, and its miss is a miss, never a MusicGen (Replicate) render.
 */
jest.mock('server-only', () => ({}));
jest.mock('ffmpeg-static', () => null);
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
const composeElevenLabsMusic = jest.fn();
const hasElevenLabsMusicKey = jest.fn();
jest.mock('../elevenlabs/music', () => ({
  ...jest.requireActual('../elevenlabs/music'),
  composeElevenLabsMusic: (...a: unknown[]) => composeElevenLabsMusic(...a),
  hasElevenLabsMusicKey: () => hasElevenLabsMusicKey(),
}));
const generateMusic = jest.fn();
jest.mock('../ai/replicate', () => ({ generateMusic: (...a: unknown[]) => generateMusic(...a) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/bed.mp3') }));
const generateWithGemini = jest.fn();
jest.mock('../gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => generateWithGemini(...a) }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => `EN: ${p}`) }));

import { instrumentalBed, instrumentalPrompt, writeGeorgianLyrics, cleanGeorgianLyrics } from './georgianSong';

beforeEach(() => jest.clearAllMocks());

it('ElevenLabs configured and it misses → null, and MusicGen is never called', async () => {
  hasElevenLabsMusicKey.mockReturnValue(true);
  composeElevenLabsMusic.mockRejectedValue(new Error('EL 500'));
  await expect(instrumentalBed('funk', 30)).resolves.toBeNull();
  expect(generateMusic).not.toHaveBeenCalled();
});

it('ElevenLabs configured and it lands → its hosted bed', async () => {
  hasElevenLabsMusicKey.mockReturnValue(true);
  composeElevenLabsMusic.mockResolvedValue({ audio: Buffer.from([1]), contentType: 'audio/mpeg' });
  await expect(instrumentalBed('funk', 30)).resolves.toBe('https://x.supabase.co/bed.mp3');
  expect(generateMusic).not.toHaveBeenCalled();
});

it('no ElevenLabs key → MusicGen is the configured engine', async () => {
  hasElevenLabsMusicKey.mockReturnValue(false);
  generateMusic.mockResolvedValue({ audioUrl: 'https://replicate.delivery/x.mp3' });
  await expect(instrumentalBed('funk', 30)).resolves.toBe('https://replicate.delivery/x.mp3');
});

describe('the Georgian song is written FROM THE BRIEF (it was one fixed funk template for every request)', () => {
  const brief = 'სიმღერა ჩემს ბებიაზე, რომელიც რაჭაში ცხოვრობს, ხალხური';

  it('asks the lyric writer about the brief, in Georgian, one line per ~3.5 s, and keeps its Georgian lines', async () => {
    generateWithGemini.mockResolvedValue({ text: [
      '[Verse 1]', 'ბებია რაჭაში ელის დილას,', 'მთები ანათებს მის ღიმილს,', 'Chorus:', 'ბებია, ბებია, შენი სიმღერა,',
      'რაჭის ქარი გვიმღერის ჩვენ,', 'visit myavatar.ge now', 'ბებია, ბებია, გული შენთანაა.',
    ].join('\n') });
    const lyrics = await writeGeorgianLyrics(brief, 32);
    const req = generateWithGemini.mock.calls[0][0] as { prompt: string; systemPrompt: string };
    expect(req.prompt).toContain(brief);
    expect(req.prompt).toContain('write 9 lines');
    expect(req.systemPrompt).toMatch(/ONLY in Georgian/);
    expect(req.systemPrompt).toMatch(/Never add a website, brand/);
    expect(lyrics).toBe(['ბებია რაჭაში ელის დილას,', 'მთები ანათებს მის ღიმილს,', 'ბებია, ბებია, შენი სიმღერა,', 'რაჭის ქარი გვიმღერის ჩვენ,', 'ბებია, ბებია, გული შენთანაა.'].join('\n'));
    expect(lyrics).not.toMatch(/თბილისი მთვლემარე|myavatar/);
  });

  it('a lyric writer miss is a miss: no canned song', async () => {
    generateWithGemini.mockRejectedValue(new Error('Gemini 503'));
    await expect(writeGeorgianLyrics(brief, 24)).resolves.toBeNull();
    generateWithGemini.mockResolvedValue({ text: 'Sorry, I cannot help with that.' });
    await expect(writeGeorgianLyrics(brief, 24)).resolves.toBeNull();
  });

  it('cleanGeorgianLyrics drops labels, Latin lines and addresses, and needs four real lines', () => {
    expect(cleanGeorgianLyrics('1. პირველი ხაზი აქ არის\n- მეორე ხაზი აქ არის\n(x2)\n**მესამე ხაზი აქ**\nმეოთხე ხაზი myavatar.ge\nმეხუთე ხაზი აქ არის', 10))
      .toBe('პირველი ხაზი აქ არის\nმეორე ხაზი აქ არის\nმესამე ხაზი აქ\nმეხუთე ხაზი აქ არის');
    expect(cleanGeorgianLyrics('ერთი ხაზი\nორი ხაზი\nhello', 10)).toBeNull();
  });

  it('the bed plays the genre the brief names, at a tempo that puts every 8 s cut on a bar line', () => {
    const p = instrumentalPrompt(brief, 32, { theme: 'a folk song about my grandmother in Racha', sceneSec: 8 });
    expect(p).toContain('folk instrumental');
    expect(p).toContain('90 BPM');
    expect(p).not.toMatch(/Funk/);
    expect(p).toContain('Theme: a folk song about my grandmother in Racha');
    // No genre named → the old groove, still on the grid.
    expect(instrumentalPrompt('სიმღერა ზღვაზე', 24, { sceneSec: 8 })).toMatch(/Funk .* at a steady 90 BPM/);
  });
});
