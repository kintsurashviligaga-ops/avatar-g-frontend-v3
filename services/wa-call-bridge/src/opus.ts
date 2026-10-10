/**
 * Opus ↔ PCM for one call: 48 kHz mono, 20 ms frames (960 samples), the VOIP profile. libopus compiled to WebAssembly
 * (opusscript), so the bridge needs no native build. A mono decoder also decodes the stereo-signalled stream WhatsApp
 * negotiates (opus/48000/2), down-mixed by libopus.
 */
import OpusScript from 'opusscript';
import { FRAME_48K } from '@/lib/calls/bridge/pcm';

export class OpusCodec {
  private readonly enc = new OpusScript(48000, 1, OpusScript.Application.VOIP);
  private readonly dec = new OpusScript(48000, 1, OpusScript.Application.VOIP);

  constructor(bitrate = 24_000) {
    this.enc.setBitrate(bitrate);
  }

  /** One 20 ms frame → one Opus packet. */
  encode(pcm48: Int16Array): Buffer {
    if (pcm48.length !== FRAME_48K) throw new Error(`opus frame must be ${FRAME_48K} samples`);
    return this.enc.encode(Buffer.from(pcm48.buffer, pcm48.byteOffset, pcm48.byteLength), FRAME_48K);
  }

  /** One Opus packet → PCM (empty on a corrupt packet; the caller just hears a gap). */
  decode(packet: Buffer): Int16Array {
    try {
      const out = this.dec.decode(packet);
      const copy = Buffer.from(out);
      return new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength >> 1);
    } catch {
      return new Int16Array(0);
    }
  }

  close(): void {
    this.enc.delete();
    this.dec.delete();
  }
}
