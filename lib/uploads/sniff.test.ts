import { sniffMatches, sniffMedia } from './sniff';

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const text = (s: string) => Uint8Array.from(Array.from(s).map((c) => c.charCodeAt(0)));

describe('sniffMedia', () => {
  it('reads the real test clips and track (first bytes copied from FFmpeg output)', () => {
    // clipA_9s.mp4 (ffmpeg libx264, brand isom), flower.mp4 (MDN, brand mp42), track_30s_120bpm.mp3 (ID3v2.4).
    expect(sniffMedia(hex('000000206674797069736f6d00000200'))).toEqual({ format: 'mp4', kinds: ['video', 'audio'] });
    expect(sniffMedia(hex('00000020667479706d70343200000000'))?.format).toBe('mp4');
    expect(sniffMedia(hex('49443304000000000023545353450000'))).toEqual({ format: 'mp3', kinds: ['audio'] });
  });

  it('tells sound-only and still-image MP4 brands from clips', () => {
    expect(sniffMedia(text('\0\0\0\x20ftypM4A \0\0\0\0'))?.kinds).toEqual(['audio']);
    expect(sniffMedia(text('\0\0\0\x18ftypheic\0\0\0\0'))?.kinds).toEqual(['image']);
    expect(sniffMedia(text('\0\0\0\x14ftypqt  \0\0\0\0'))?.format).toBe('mov');
    expect(sniffMedia(text('\0\0\0\x14ftyp3gp4\0\0\0\0'))?.format).toBe('3gp');
  });

  it('knows the other containers the upload policy allows', () => {
    expect(sniffMedia(hex('1a45dfa3a34286810142f7810142f2'))?.format).toBe('webm');
    expect(sniffMedia(text('RIFF\x24\0\0\0WAVEfmt '))?.kinds).toEqual(['audio']);
    expect(sniffMedia(text('RIFF\x24\0\0\0AVI LIST'))?.kinds).toEqual(['video']);
    expect(sniffMedia(text('RIFF\x24\0\0\0WEBPVP8 '))?.kinds).toEqual(['image']);
    expect(sniffMedia(text('OggS\0\x02\0\0'))?.format).toBe('ogg');
    expect(sniffMedia(text('fLaC\0\0\0\x22'))?.format).toBe('flac');
    expect(sniffMedia(hex('fffb9064000000000000'))?.format).toBe('mp3');
    expect(sniffMedia(hex('fff15080'))?.format).toBe('aac');
    expect(sniffMedia(hex('ffd8ffe000104a464946'))?.format).toBe('jpeg');
    expect(sniffMedia(hex('89504e470d0a1a0a'))?.format).toBe('png');
  });

  it('never guesses: text, HTML, PDF and short input are unknown', () => {
    expect(sniffMedia(text('hello, this is not a video'))).toBeNull();
    expect(sniffMedia(text('<!DOCTYPE html><html>'))).toBeNull();
    expect(sniffMedia(text('%PDF-1.7\n'))).toBeNull();
    expect(sniffMedia(hex('0000'))).toBeNull();
    expect(sniffMedia(text('RIFF\x24\0\0\0XXXX'))).toBeNull();
  });
});

describe('sniffMatches', () => {
  it('accepts a clip as video, an MP3 as audio, and refuses the swaps', () => {
    const mp4 = hex('000000206674797069736f6d00000200');
    const mp3 = hex('49443304000000000023545353450000');
    expect(sniffMatches(mp4, 'video')).toEqual({ ok: true, format: 'mp4' });
    expect(sniffMatches(mp3, 'audio')).toEqual({ ok: true, format: 'mp3' });
    expect(sniffMatches(mp3, 'video')).toEqual({ ok: false, format: 'mp3' });
    expect(sniffMatches(text('not media at all'), 'audio')).toEqual({ ok: false, format: null });
  });
});
