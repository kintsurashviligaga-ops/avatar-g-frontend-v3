/**
 * lib/audio/mp3Duration.ts — how long an MP3 plays, read from its own frame headers. Pure, client-safe.
 *
 * The talking avatar (app/api/avatar/veo) has 8 s of picture: its ElevenLabs line must fit BEFORE anything is charged,
 * and the route has no ffprobe (ffmpeg-static ships ffmpeg only). Every MPEG audio frame names its bitrate and sample
 * rate, so walking the frames gives the length exactly, constant or variable bitrate alike. An ID3v2 tag at the start is
 * skipped; anything that is not a frame ends the walk. Returns null when no frame is found (not an MP3).
 */

// Bitrates in kbps, by [MPEG-1 ? 0 : 1][layer III, II, I index] — only layer III matters here (ElevenLabs, every TTS).
const L3_KBPS: readonly (readonly number[])[] = [
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0], // MPEG-1 layer III
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0], // MPEG-2 / 2.5 layer III
];
const RATES: Readonly<Record<number, readonly number[]>> = {
  3: [44_100, 48_000, 32_000], // MPEG-1
  2: [22_050, 24_000, 16_000], // MPEG-2
  0: [11_025, 12_000, 8_000], // MPEG-2.5
};

function id3Size(buf: Uint8Array): number {
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // "ID3"
  // Synchsafe 28-bit size, plus the 10-byte header (and a 10-byte footer when flagged).
  const size = ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
  return 10 + size + ((buf[5]! & 0x10) !== 0 ? 10 : 0);
}

export function mp3DurationSec(buf: Uint8Array): number | null {
  let i = id3Size(buf);
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= buf.length) {
    const b1 = buf[i + 1]!;
    const b2 = buf[i + 2]!;
    if (buf[i] !== 0xff || (b1 & 0xe0) !== 0xe0) {
      if (frames > 0) break; // the audio ended (a trailing tag, or junk)
      i++; continue; // still looking for the first frame
    }
    const version = (b1 >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5, 1 = reserved
    const layer = (b1 >> 1) & 0x03; // 1 = layer III
    const kbps = L3_KBPS[version === 3 ? 0 : 1]![(b2 >> 4) & 0x0f] ?? 0;
    const rate = RATES[version]?.[(b2 >> 2) & 0x03];
    if (version === 1 || layer !== 1 || !kbps || !rate) {
      if (frames > 0) break;
      i++; continue;
    }
    const padding = (b2 >> 1) & 0x01;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor((samples / 8) * kbps * 1000 / rate) + padding;
    if (length < 4) break;
    seconds += samples / rate;
    frames++;
    i += length;
  }
  return frames > 0 ? seconds : null;
}
