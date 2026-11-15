/**
 * lib/avatar/studio/liveTake.ts — one recorded Live presenter take: the setup it opens with, the one script turn, and
 * the recorder that turns the session's frames into a clip and a timed transcript. Pure (the socket is the server's).
 *
 * HOW A TAKE IS RECORDED (no relay change, so decision D5 needs no deploy): the SERVER opens our Live relay exactly as a
 * call screen does — a relay ticket minted locally (lib/voice/liveMint) that locks this setup — sends the setup and ONE
 * clientContent turn (the scene's words), and keeps every fragmented-MP4 piece (`video` events: picture AND voice) and
 * every output-transcript chunk with its arrival time, until `turnComplete`. The pieces joined in order are one playable
 * MP4 (an init segment, then media segments; lib/voice/fmp4).
 *
 * Avatars stream idle frames before and after speaking: the clip keeps the frames from the first transcript chunk minus
 * LEAD_SEC to `turnComplete` plus TAIL_SEC, as times; the server trims on those times (ffmpeg -ss/-to, stream copy).
 * ⚠️ Unverified until the paid probe (D4): that a server-side client gets the same stream as a browser, and that the
 * transcript arrives within ~0.3 s of the audio it transcribes.
 */
import { base64ToBytes, isInitSegment } from '@/lib/voice/fmp4';
import { LIVE_AVATAR_BITRATE_BPS, LIVE_AVATAR_MODEL } from '@/lib/voice/liveAvatar';
import type { LiveServerEvent } from '@/lib/voice/geminiLive';
import type { Presenter, Voice } from './catalog';
import { liveScriptTurn, liveSystemInstruction, type LivePromptInput } from './prompts';

/** A take longer than this is cut off (a 40 s scene plus setup and idle). */
export const LIVE_TAKE_MAX_MS = 75_000;
/** No first word within this after the turn was sent → the take failed (nothing kept). */
export const LIVE_FIRST_WORD_MS = 15_000;
export const LEAD_SEC = 0.3;
export const TAIL_SEC = 0.6;

export function liveTakeSetup(presenter: Presenter, voice: Voice, prompt: LivePromptInput): Record<string, unknown> {
  return {
    model: `models/${LIVE_AVATAR_MODEL}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.id } } },
    },
    systemInstruction: { parts: [{ text: liveSystemInstruction(prompt) }] },
    avatarConfig: { avatarName: presenter.face, videoBitrateBps: LIVE_AVATAR_BITRATE_BPS },
    outputAudioTranscription: {},
  };
}

/** The one turn: the words, then turnComplete (the model answers it by reading). */
export function liveTakeTurn(text: string): Record<string, unknown> {
  return { clientContent: { turns: [{ role: 'user', parts: [{ text: liveScriptTurn(text) }] }], turnComplete: true } };
}

export type TakeState = 'opening' | 'ready' | 'speaking' | 'done' | 'failed';

export interface TakeResult {
  /** The joined fMP4 (init + every media piece). */
  bytes: Uint8Array;
  mime: string;
  /** Where speech starts and ends in the recording, seconds (trim window). */
  trimStart: number;
  trimEnd: number;
  /** Transcript chunks with their arrival time, relative to trimStart (timing.fromChunks). */
  chunks: Array<{ text: string; atSec: number }>;
  heard: string;
}

/**
 * Feed it every parsed server event (lib/voice/geminiLive parseLiveServerMessage) with the time it arrived, in ms.
 * `t0` is the time of the first media piece: recording time 0.
 */
export class LiveTakeRecorder {
  state: TakeState = 'opening';
  failure: string | null = null;
  private pieces: Uint8Array[] = [];
  private mime = 'video/mp4';
  private t0: number | null = null;
  private sentAt: number | null = null;
  private chunks: Array<{ text: string; atMs: number }> = [];
  private doneAt: number | null = null;

  /** The setup was accepted: the caller sends liveTakeTurn now and calls `sent`. */
  get readyToSend(): boolean { return this.state === 'ready' && this.sentAt === null; }
  sent(nowMs: number): void { this.sentAt = nowMs; }

  onEvent(e: LiveServerEvent, nowMs: number): void {
    if (this.state === 'done' || this.state === 'failed') return;
    switch (e.kind) {
      case 'setupComplete':
        if (this.state === 'opening') this.state = 'ready';
        break;
      case 'video': {
        const bytes = base64ToBytes(e.data);
        if (this.pieces.length === 0 && !isInitSegment(bytes)) return; // wait for the init segment
        if (this.t0 === null) this.t0 = nowMs;
        if (e.mimeType) this.mime = e.mimeType.split(';')[0]!.trim() || this.mime;
        this.pieces.push(bytes);
        break;
      }
      case 'outputTranscript':
        if (e.text.trim()) {
          this.chunks.push({ text: e.text, atMs: nowMs });
          this.state = 'speaking';
        }
        break;
      case 'turnComplete':
        if (this.state === 'speaking') { this.doneAt = nowMs; this.state = 'done'; }
        break;
      case 'interrupted':
      case 'goAway':
        this.fail(e.kind);
        break;
      default:
        break;
    }
  }

  /** Call on a timer: a take that never speaks, or runs too long, fails. */
  tick(nowMs: number, startedMs: number): void {
    if (this.state === 'done' || this.state === 'failed') return;
    if (nowMs - startedMs > LIVE_TAKE_MAX_MS) return this.fail('too_long');
    if (this.sentAt !== null && this.chunks.length === 0 && nowMs - this.sentAt > LIVE_FIRST_WORD_MS) this.fail('no_speech');
  }

  /** The socket closed: a take that did not finish fails. */
  onClose(code: number): void {
    if (this.state !== 'done') this.fail(`closed_${code}`);
  }

  fail(why: string): void {
    if (this.state === 'done' || this.state === 'failed') return;
    this.state = 'failed';
    this.failure = why;
  }

  result(): TakeResult | null {
    if (this.state !== 'done' || this.t0 === null || this.pieces.length < 2 || this.doneAt === null) return null;
    const t0 = this.t0;
    const firstAt = (this.chunks[0]!.atMs - t0) / 1000;
    const trimStart = Math.max(0, round3(firstAt - LEAD_SEC));
    const trimEnd = round3((this.doneAt - t0) / 1000 + TAIL_SEC);
    const size = this.pieces.reduce((s, p) => s + p.length, 0);
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const p of this.pieces) { bytes.set(p, at); at += p.length; }
    return {
      bytes,
      mime: this.mime,
      trimStart,
      trimEnd,
      chunks: this.chunks.map((c) => ({ text: c.text, atSec: Math.max(0, round3((c.atMs - t0) / 1000 - trimStart)) })),
      heard: this.chunks.map((c) => c.text).join('').replace(/\s+/g, ' ').trim(),
    };
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
