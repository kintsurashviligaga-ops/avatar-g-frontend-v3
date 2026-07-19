/**
 * lib/voice/pcm.ts — pure PCM audio helpers for the Gemini Multimodal Live engine.
 *
 * Gemini Live expects INPUT audio as 16-bit signed PCM, little-endian, mono, 16 kHz, base64-encoded;
 * it returns OUTPUT audio as 16-bit signed PCM, little-endian, mono, 24 kHz. Browsers capture at the
 * AudioContext's native rate (commonly 44.1/48 kHz Float32), so mic frames must be resampled to 16 kHz
 * and quantised to int16 before send; playback frames must be decoded back to Float32 for a 24 kHz
 * AudioBuffer. These functions are pure (no Web Audio / no DOM) so the conversion math is unit-tested.
 *
 * Endianness: all target platforms (and Node) are little-endian, which matches Gemini's PCM_S16LE, so
 * the typed-array views below are byte-correct without manual swapping.
 */

/** Linear-resample a mono Float32 buffer from `inputRate` to `outputRate` (default 16 kHz). */
export function resample(input: Float32Array, inputRate: number, outputRate = 16000): Float32Array {
  if (!(input.length > 0) || !(inputRate > 0) || !(outputRate > 0)) return new Float32Array(0);
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? 0;
    out[i] = a + (b - a) * frac; // linear interpolation
  }
  return out;
}

/** Quantise a Float32 buffer in [-1, 1] to signed 16-bit PCM (clamped). */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    // Asymmetric int16 range: negative floors at -32768, positive caps at 32767.
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Dequantise signed 16-bit PCM back to Float32 in [-1, 1] (for playback into an AudioBuffer). */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = (input[i] ?? 0) / 0x8000;
  return out;
}

/** Base64-encode raw bytes (chunked so a large buffer never blows the call stack via spread). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

/** Decode base64 to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Full mic → Gemini path: resample a captured Float32 frame to 16 kHz, quantise to int16, base64-encode.
 * Returns '' for an empty/degenerate frame (nothing to send).
 */
export function encodeMicChunk(input: Float32Array, inputRate: number): string {
  const resampled = resample(input, inputRate, 16000);
  if (resampled.length === 0) return '';
  const pcm = floatTo16BitPCM(resampled);
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

/**
 * Full Gemini → playback path: decode a base64 24 kHz int16 PCM frame to Float32 in [-1, 1].
 * Odd trailing bytes (a split frame) are dropped so the Int16Array view is always well-formed.
 */
export function decodePlaybackChunk(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  const evenLen = bytes.length - (bytes.length % 2);
  if (evenLen <= 0) return new Float32Array(0);
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, evenLen / 2);
  return int16ToFloat32(int16);
}
