/**
 * lib/contracts/providers.ts — the provider boundary interfaces (PROJECT_MASTER.md Part 1 §10, Section A).
 *
 * Section A permits two model providers, Google and ElevenLabs; nothing else may sit behind these interfaces, and no
 * implementation may fall back from one provider to another without the user asking (R7). The master leaves inputs
 * and outputs untyped (`input`, `Output`, `Chunk`, `opts`), so they are type parameters here: Part 2 binds them when it
 * moves each service behind its interface, without editing this file.
 *
 * Which provider serves which interface (Section A): coding + media → Google, voice (TTS, lipsync) → ElevenLabs,
 * speech-to-text → Google or the browser's own recogniser. BrowserProvider has no implementation yet (certification §H).
 */

/** The only model providers Section A allows. */
export const PERMITTED_MODEL_PROVIDERS = ['google', 'elevenlabs'] as const;
export type ModelProvider = (typeof PERMITTED_MODEL_PROVIDERS)[number];

export const isPermittedModelProvider = (v: unknown): v is ModelProvider =>
  typeof v === 'string' && (PERMITTED_MODEL_PROVIDERS as readonly string[]).includes(v);

export interface CodingModelProvider<In = unknown, Out = unknown, Chunk = unknown> {
  readonly provider: 'google';
  generate(input: In): Promise<Out>;
  stream(input: In): AsyncIterable<Chunk>;
}

export interface MediaProvider<In = unknown, Out = unknown> {
  readonly provider: 'google';
  generateImage(input: In): Promise<Out>;
  generateMusic(input: In): Promise<Out>;
}

export interface VoiceProvider<In = unknown, Out = unknown> {
  readonly provider: 'elevenlabs';
  synthesize(input: In): Promise<Out>;
  lipsync(input: In): Promise<Out>;
}

export interface SpeechToTextProvider<Opts = unknown, Session = unknown> {
  readonly provider: 'google' | 'browser';
  startSession(opts: Opts): Session;
}

/** Section E7: every action happens inside the central interface and is reported as an AgentEvent `browser_event`. */
export interface BrowserProvider<SessionId = string, Snapshot = unknown, Screenshot = unknown> {
  createSession(opts?: { startUrl?: string }): Promise<SessionId>;
  navigate(session: SessionId, url: string): Promise<void>;
  snapshot(session: SessionId): Promise<Snapshot>;
  click(session: SessionId, target: string): Promise<void>;
  type(session: SessionId, target: string, text: string): Promise<void>;
  select(session: SessionId, target: string, value: string): Promise<void>;
  press(session: SessionId, key: string): Promise<void>;
  screenshot(session: SessionId): Promise<Screenshot>;
  close(session: SessionId): Promise<void>;
}
