/**
 * lib/speech/wav.ts — read and write the one audio container the speech contract answers with (§5.2).
 *
 * The contract's audio is a canonical WAV: RIFF/WAVE, a `fmt ` chunk with PCM (format 1), 16-bit samples,
 * little-endian, mono or stereo, then one `data` chunk. `inspectWav` reads every one of those facts from the bytes
 * rather than trusting a label, and names what is wrong when one does not hold, including the two faults a blind
 * PCM wrapper makes: a WAV wrapped inside another WAV (the inner header played as samples, a click and a skew) and a
 * data chunk that claims more bytes than arrived (a cut-off read). Duration is counted from the sample frames.
 *
 * Pure: DataView over a Uint8Array, so it runs the same in the route (Node) and in the browser.
 */
import type { PcmLayout } from './contract';

export const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2; // 16-bit

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: 16;
  /** Byte offset of the first sample in the file. */
  dataOffset: number;
  /** Bytes of sample data (the data chunk's size). */
  dataBytes: number;
  /** Sample frames: dataBytes / (channels × 2). */
  frames: number;
  /** frames / sampleRate, in milliseconds (not rounded). */
  durationMs: number;
}

export type WavFault =
  | 'too_short' // fewer bytes than a RIFF header
  | 'not_riff'
  | 'not_wave'
  | 'no_fmt'
  | 'not_pcm' // fmt format is not 1 (e.g. float, A-law, extensible)
  | 'not_16_bit'
  | 'bad_channels'
  | 'bad_rate'
  | 'bad_block_align' // fmt's blockAlign / byteRate disagree with channels × 16 bit
  | 'no_data'
  | 'truncated' // the data chunk claims more bytes than the file holds
  | 'partial_frame' // the data does not end on a whole sample frame
  | 'double_wrapped'; // the samples start with another RIFF/WAVE header

export type WavInspection = { ok: true; info: WavInfo } | { ok: false; fault: WavFault };

const ascii = (b: Uint8Array, at: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i++) s += String.fromCharCode(b[at + i]!);
  return s;
};

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** True when the bytes begin with a RIFF/WAVE header. */
export function looksLikeWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
}

/** Read a WAV's format and sample count from its bytes. Chunks other than `fmt ` and `data` (LIST, fact, …) are skipped. */
export function inspectWav(bytes: Uint8Array): WavInspection {
  if (bytes.length < 12) return { ok: false, fault: 'too_short' };
  if (ascii(bytes, 0, 4) !== 'RIFF') return { ok: false, fault: 'not_riff' };
  if (ascii(bytes, 8, 4) !== 'WAVE') return { ok: false, fault: 'not_wave' };
  const dv = view(bytes);
  let fmt: { format: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bits: number } | null = null;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at, 4);
    const size = dv.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.length) return { ok: false, fault: 'no_fmt' };
      fmt = {
        format: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        byteRate: dv.getUint32(body + 8, true),
        blockAlign: dv.getUint16(body + 12, true),
        bits: dv.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!fmt) return { ok: false, fault: 'no_fmt' };
      if (fmt.format !== 1) return { ok: false, fault: 'not_pcm' };
      if (fmt.bits !== 16) return { ok: false, fault: 'not_16_bit' };
      if (fmt.channels < 1 || fmt.channels > 2) return { ok: false, fault: 'bad_channels' };
      if (fmt.sampleRate < 8000 || fmt.sampleRate > 96000) return { ok: false, fault: 'bad_rate' };
      const frameBytes = fmt.channels * BYTES_PER_SAMPLE;
      if (fmt.blockAlign !== frameBytes || fmt.byteRate !== fmt.sampleRate * frameBytes) {
        return { ok: false, fault: 'bad_block_align' };
      }
      if (body + size > bytes.length) return { ok: false, fault: 'truncated' };
      if (size % frameBytes !== 0) return { ok: false, fault: 'partial_frame' };
      if (looksLikeWav(bytes.subarray(body, body + size))) return { ok: false, fault: 'double_wrapped' };
      const frames = size / frameBytes;
      return {
        ok: true,
        info: {
          sampleRate: fmt.sampleRate,
          channels: fmt.channels,
          bitsPerSample: 16,
          dataOffset: body,
          dataBytes: size,
          frames,
          durationMs: (frames / fmt.sampleRate) * 1000,
        },
      };
    }
    // RIFF chunks are word-aligned: an odd-sized chunk is followed by one pad byte.
    at = body + size + (size % 2);
  }
  return { ok: false, fault: fmt ? 'no_data' : 'no_fmt' };
}

/** The sample bytes of a valid WAV (a view, not a copy), or null with the inspection's fault. */
export function wavSamples(bytes: Uint8Array): { pcm: Uint8Array; info: WavInfo } | { pcm: null; fault: WavFault } {
  const r = inspectWav(bytes);
  if (!r.ok) return { pcm: null, fault: r.fault };
  return { pcm: bytes.subarray(r.info.dataOffset, r.info.dataOffset + r.info.dataBytes), info: r.info };
}

/**
 * Wrap headerless signed 16-bit little-endian PCM in a 44-byte canonical WAV header. The caller must have checked that
 * the bytes are NOT already a WAV (`looksLikeWav`) and that `layout` is what the provider declared; this function does
 * not resample or relabel. Throws on a layout it cannot describe, or on bytes that end mid-frame.
 */
export function wrapPcm16(pcm: Uint8Array, layout: PcmLayout): Uint8Array {
  const { sampleRate, channels } = layout;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new RangeError('wrapPcm16: sampleRate');
  if (channels !== 1 && channels !== 2) throw new RangeError('wrapPcm16: channels');
  const frameBytes = channels * BYTES_PER_SAMPLE;
  if (pcm.length % frameBytes !== 0) throw new RangeError('wrapPcm16: partial frame');
  const out = new Uint8Array(WAV_HEADER_BYTES + pcm.length);
  const dv = view(out);
  const put = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * frameBytes, true);
  dv.setUint16(32, frameBytes, true);
  dv.setUint16(34, 16, true);
  put(36, 'data');
  dv.setUint32(40, pcm.length, true);
  out.set(pcm, WAV_HEADER_BYTES);
  return out;
}
