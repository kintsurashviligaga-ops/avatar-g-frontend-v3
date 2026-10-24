/**
 * lib/speech/geminiAudio.ts — turn the audio parts of a Gemini TTS answer into the contract's one WAV (§5.2).
 *
 * Gemini TTS answers `generateContent` with one or more `inlineData` parts. Each part is either headerless signed 16-bit
 * PCM labelled with its rate (`audio/L16;codec=pcm;rate=24000`) or, for a model that answers in a container, a complete
 * WAV. The route used to keep the FIRST part only and wrap it in a WAV header unconditionally, so a second part was
 * silently dropped and a WAV part would have been wrapped twice (its header played as samples).
 *
 * Here every audio part is read, in order:
 *   · a WAV part (by label or by its RIFF/WAVE bytes) is checked with inspectWav and only its samples are kept;
 *   · a PCM part must state its rate; a part with no usable label is refused, never given a default rate;
 *   · every part must share one rate and channel count — there is no resampling here, so a mix is refused;
 * then the samples are joined and wrapped exactly once. Text parts are ignored (the audio is the answer).
 *
 * Pure (no Node API), so the browser can reuse it.
 */
import { isWavMime, pcmLayoutFromMime, type PcmLayout } from './contract';
import { inspectWav, looksLikeWav, wavSamples, wrapPcm16, type WavFault, type WavInfo } from './wav';
import { base64ToBytes } from '@/lib/voice/pcm';

export type GeminiAudioFault =
  | WavFault
  | 'no_audio' // no part carried inline audio
  | 'unlabelled' // a PCM part whose mimeType does not state a usable rate
  | 'mixed_layout' // parts at different rates or channel counts
  | 'bad_base64';

export type GeminiAudio =
  | { ok: true; wav: Uint8Array; info: WavInfo; audioParts: number }
  | { ok: false; fault: GeminiAudioFault; audioParts: number; /** Decoded bytes of the parts read before the fault. */ audioBytes: number };

interface InlinePart {
  inlineData?: { data?: unknown; mimeType?: unknown };
}

const sameLayout = (a: PcmLayout, b: PcmLayout) => a.sampleRate === b.sampleRate && a.channels === b.channels;

/** `parts` = `candidates[0].content.parts` of a generateContent answer (anything else counts as no audio). */
export function audioFromGeminiParts(parts: unknown): GeminiAudio {
  const audio = (Array.isArray(parts) ? (parts as InlinePart[]) : []).filter(
    (p) => typeof p?.inlineData?.data === 'string' && (p.inlineData.data as string).length > 0,
  );
  let audioBytes = 0;
  const fail = (fault: GeminiAudioFault): GeminiAudio => ({ ok: false, fault, audioParts: audio.length, audioBytes });
  if (audio.length === 0) return fail('no_audio');

  let layout: PcmLayout | null = null;
  const pcm: Uint8Array[] = [];
  for (const part of audio) {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(part.inlineData!.data as string);
    } catch {
      return fail('bad_base64');
    }
    audioBytes += bytes.length;
    const mime = part.inlineData!.mimeType;
    let partLayout: PcmLayout;
    let samples: Uint8Array;
    if (isWavMime(mime) || looksLikeWav(bytes)) {
      const w = wavSamples(bytes);
      if (!w.pcm) return fail(w.fault);
      partLayout = { sampleRate: w.info.sampleRate, channels: w.info.channels };
      samples = w.pcm;
    } else {
      const declared = pcmLayoutFromMime(mime);
      if (!declared) return fail('unlabelled');
      if (bytes.length % (declared.channels * 2) !== 0) return fail('partial_frame');
      partLayout = declared;
      samples = bytes;
    }
    if (layout && !sameLayout(layout, partLayout)) return fail('mixed_layout');
    layout = partLayout;
    pcm.push(samples);
  }

  const total = pcm.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of pcm) { joined.set(p, at); at += p.length; }
  const wav = wrapPcm16(joined, layout!);
  const checked = inspectWav(wav);
  // Cannot fail for what wrapPcm16 writes; checked anyway so the answer's facts always come from its own bytes.
  if (!checked.ok) return fail(checked.fault);
  return { ok: true, wav, info: checked.info, audioParts: audio.length };
}
