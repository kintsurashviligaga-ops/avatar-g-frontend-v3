'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

import { AdaptiveEnergyVad } from '@/lib/voice-v2v/vad';
import type {
  RealtimeVoiceLanguage,
  RealtimeVoiceState,
  VoiceClientFrame,
  VoiceServerFrame,
} from '@/types/voice';

interface UseVoiceInputProps {
  language?: RealtimeVoiceLanguage;
  wsUrl?: string;
  sessionEndpoint?: string;
  onResult?: (transcript: string) => void;
  onPartialResult?: (transcript: string) => void;
  onAssistantText?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  state: RealtimeVoiceState;
  transcript: string;
  partialTranscript: string;
  assistantTranscript: string;
  language: RealtimeVoiceLanguage;
  latencyMs: number | null;
  analyserNode: AnalyserNode | null;
  setLanguage: (language: RealtimeVoiceLanguage) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
  browserSupportsSpeechRecognition: boolean;
  isMicrophoneAvailable: boolean;
}

type SessionBootstrap = {
  wsUrl: string;
  token?: string;
  sessionId: string;
  sampleRate: number;
};

const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_SESSION_ENDPOINT = '/api/voice/realtime/session';

function resolveLanguage(language: string | undefined): RealtimeVoiceLanguage {
  if (language === 'en-US' || language === 'ru-RU' || language === 'ka-GE') {
    return language;
  }

  return 'ka-GE';
}

function supportsRealtimeVoice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasAudioContext = Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasWebSocket = typeof window.WebSocket !== 'undefined';

  return hasAudioContext && hasGetUserMedia && hasWebSocket;
}

function appendTranscript(previous: string, nextChunk: string): string {
  const cleanChunk = nextChunk.trim();
  if (!cleanChunk) {
    return previous;
  }

  return previous.trim() ? `${previous.trim()} ${cleanChunk}` : cleanChunk;
}

function arrayBufferToBase64(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let binary = '';
  const step = 0x8000;

  for (let index = 0; index < bytes.length; index += step) {
    const slice = bytes.subarray(index, Math.min(index + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

function base64ToArrayBuffer(input: string): ArrayBuffer {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function resolveWsUrl(rawUrl: string, token: string | undefined, sessionId: string): string {
  const base = rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')
    ? rawUrl
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;

  const url = new URL(base);
  if (token) {
    url.searchParams.set('token', token);
  }
  url.searchParams.set('sessionId', sessionId);

  return url.toString();
}

function sendFrame(socket: WebSocket | null, frame: VoiceClientFrame): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(frame));
}

async function fetchSessionBootstrap(endpoint: string, language: RealtimeVoiceLanguage): Promise<SessionBootstrap> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ language }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('session_bootstrap_failed');
  }

  const payload = (await response.json()) as {
    wsUrl?: string;
    token?: string;
    sessionId?: string;
    sampleRate?: number;
    data?: {
      wsUrl?: string;
      token?: string;
      sessionId?: string;
      sampleRate?: number;
    };
  };

  const wsUrl = String(payload.wsUrl || payload.data?.wsUrl || '').trim();
  if (!wsUrl) {
    throw new Error('session_ws_url_missing');
  }

  const sessionId = String(payload.sessionId || payload.data?.sessionId || '').trim() || crypto.randomUUID();
  const sampleRate = Number(payload.sampleRate || payload.data?.sampleRate || DEFAULT_SAMPLE_RATE);

  return {
    wsUrl,
    token: String(payload.token || payload.data?.token || '').trim() || undefined,
    sessionId,
    sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : DEFAULT_SAMPLE_RATE,
  };
}

function decodePcm16ToAudioBuffer(audioContext: AudioContext, input: ArrayBuffer, sampleRate: number): AudioBuffer {
  const pcm = new Int16Array(input);
  const output = audioContext.createBuffer(1, pcm.length, sampleRate);
  const channel = output.getChannelData(0);

  for (let index = 0; index < pcm.length; index += 1) {
    channel[index] = (pcm[index] ?? 0) / 0x7fff;
  }

  return output;
}

export function useVoiceInput({
  language = 'ka-GE',
  wsUrl,
  sessionEndpoint = DEFAULT_SESSION_ENDPOINT,
  onResult,
  onPartialResult,
  onAssistantText,
  onError
}: UseVoiceInputProps = {}): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [state, setState] = useState<RealtimeVoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [languageState, setLanguageState] = useState<RealtimeVoiceLanguage>(resolveLanguage(language));
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [browserSupportsSpeechRecognition, setBrowserSupportsSpeechRecognition] = useState(false);
  const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef('');
  const sequenceRef = useRef(0);
  const playbackCursorRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const stateRef = useRef<RealtimeVoiceState>('idle');
  const turnClosedAtRef = useRef<number | null>(null);
  const waitingForTtsRef = useRef(false);
  const vadRef = useRef(new AdaptiveEnergyVad());
  const workletMessageHandlerRef = useRef<((payload: { type?: string; buffer?: ArrayBuffer; rms?: number }) => void) | null>(null);

  const callbacksRef = useRef({
    onResult,
    onPartialResult,
    onAssistantText,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onResult,
      onPartialResult,
      onAssistantText,
      onError,
    };
  }, [onResult, onPartialResult, onAssistantText, onError]);

  const setVoiceState = useCallback((nextState: RealtimeVoiceState) => {
    stateRef.current = nextState;
    setState(nextState);
    setIsListening(nextState === 'listening' || nextState === 'processing' || nextState === 'speaking');
  }, []);

  const stopPlayback = useCallback(() => {
    const context = audioContextRef.current;

    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source may already be finished.
      }
    }

    activeSourcesRef.current.clear();
    playbackCursorRef.current = context ? context.currentTime : 0;
  }, []);

  const enqueuePlayback = useCallback(async (audioBase64: string, mimeType: string) => {
    const context = audioContextRef.current;
    if (!context) {
      return;
    }

    const input = base64ToArrayBuffer(audioBase64);
    const isPcm = mimeType.includes('pcm');

    const audioBuffer = isPcm
      ? decodePcm16ToAudioBuffer(context, input, DEFAULT_SAMPLE_RATE)
      : await context.decodeAudioData(input.slice(0));

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.015, playbackCursorRef.current || context.currentTime);
    playbackCursorRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);

      if (activeSourcesRef.current.size === 0 && stateRef.current === 'speaking') {
        setVoiceState(vadRef.current.isSpeaking ? 'processing' : 'listening');
      }
    };

    source.start(startAt);
  }, [setVoiceState]);

  const closeAudioGraph = useCallback(async () => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    setAnalyserNode(null);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close().catch(() => undefined);
    }

    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    if (!supportsRealtimeVoice()) {
      setBrowserSupportsSpeechRecognition(false);
      setIsMicrophoneAvailable(false);
      return;
    }

    setBrowserSupportsSpeechRecognition(true);

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        setIsMicrophoneAvailable(true);
      })
      .catch(() => {
        setIsMicrophoneAvailable(false);
      });
  }, []);

  useEffect(() => {
    setLanguageState(resolveLanguage(language));
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') {
      return;
    }

    const runtime = window as Window & {
      __voiceV2vTest?: {
        emitFrames: (rms: number, count?: number) => void;
      };
    };

    runtime.__voiceV2vTest = {
      emitFrames(rms: number, count = 1) {
        const handler = workletMessageHandlerRef.current;
        if (!handler) {
          return;
        }

        const iterations = Math.max(1, Math.floor(count));
        for (let index = 0; index < iterations; index += 1) {
          const frame = new Int16Array(320);
          const sample = Math.max(-1, Math.min(1, rms));
          const value = Math.round(sample * 0x7fff);
          frame.fill(value);

          handler({
            type: 'pcm16',
            buffer: frame.buffer,
            rms,
          });
        }
      },
    };

    return () => {
      delete runtime.__voiceV2vTest;
    };
  }, []);

  const handleServerFrame = useCallback((frame: VoiceServerFrame) => {
    if (frame.type === 'stt.partial') {
      setPartialTranscript(frame.text);
      callbacksRef.current.onPartialResult?.(frame.text);
      return;
    }

    if (frame.type === 'stt.final') {
      setTranscript((prev) => {
        const next = appendTranscript(prev, frame.text);
        callbacksRef.current.onResult?.(next);
        return next;
      });
      setPartialTranscript('');
      setVoiceState('processing');
      return;
    }

    if (frame.type === 'assistant.partial') {
      setAssistantTranscript(frame.text);
      callbacksRef.current.onAssistantText?.(frame.text);
      setVoiceState('processing');
      return;
    }

    if (frame.type === 'assistant.final') {
      setAssistantTranscript(frame.text);
      callbacksRef.current.onAssistantText?.(frame.text);
      return;
    }

    if (frame.type === 'tts.audio') {
      if (waitingForTtsRef.current && turnClosedAtRef.current) {
        setLatencyMs(Math.max(0, Date.now() - turnClosedAtRef.current));
        waitingForTtsRef.current = false;
      }

      setVoiceState('speaking');
      void enqueuePlayback(frame.audioBase64, frame.mimeType).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'playback_failed';
        callbacksRef.current.onError?.(message);
        setVoiceState('error');
      });
      return;
    }

    if (frame.type === 'tts.end' || frame.type === 'tts.stopped') {
      if (!vadRef.current.isSpeaking) {
        setVoiceState('listening');
      }
      return;
    }

    if (frame.type === 'error') {
      callbacksRef.current.onError?.(frame.message);
      setVoiceState('error');
    }
  }, [enqueuePlayback, setVoiceState]);

  const startListening = useCallback(async () => {
    if (!browserSupportsSpeechRecognition) {
      callbacksRef.current.onError?.('browser_unsupported');
      return;
    }

    if (!isMicrophoneAvailable) {
      callbacksRef.current.onError?.('microphone_unavailable');
      return;
    }

    if (stateRef.current !== 'idle' && stateRef.current !== 'error') {
      return;
    }

    setPartialTranscript('');
    setAssistantTranscript('');
    setLatencyMs(null);
    setVoiceState('listening');

    try {
      const bootstrap = wsUrl
        ? {
            wsUrl,
            token: undefined,
            sessionId: crypto.randomUUID(),
            sampleRate: DEFAULT_SAMPLE_RATE,
          }
        : await fetchSessionBootstrap(sessionEndpoint, languageState);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: bootstrap.sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const context = new AudioContext({ sampleRate: bootstrap.sampleRate, latencyHint: 'interactive' });
      await context.audioWorklet.addModule('/worklets/pcm-capture-processor.js');

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.84;

      const worklet = new AudioWorkletNode(context, 'pcm-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        processorOptions: {
          frameSize: Math.round((bootstrap.sampleRate || DEFAULT_SAMPLE_RATE) * 0.02),
        },
      });

      source.connect(analyser);
      analyser.connect(worklet);

      const socket = new WebSocket(resolveWsUrl(bootstrap.wsUrl, bootstrap.token, bootstrap.sessionId));

      socket.onopen = () => {
        sessionIdRef.current = bootstrap.sessionId;
        sequenceRef.current = 0;

        sendFrame(socket, {
          type: 'session.start',
          sessionId: bootstrap.sessionId,
          token: bootstrap.token,
          language: languageState,
          sampleRate: bootstrap.sampleRate,
          format: 'pcm16',
        });
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(String(event.data || '')) as VoiceServerFrame;
          handleServerFrame(payload);
        } catch {
          callbacksRef.current.onError?.('invalid_server_payload');
        }
      };

      socket.onerror = () => {
        callbacksRef.current.onError?.('socket_error');
        setVoiceState('error');
      };

      socket.onclose = () => {
        if (stateRef.current !== 'idle') {
          setVoiceState('idle');
        }
      };

      const handleWorkletPayload = (payload: { type?: string; buffer?: ArrayBuffer; rms?: number }) => {
        if (!payload || payload.type !== 'pcm16' || !payload.buffer) {
          return;
        }

        const rms = Number(payload.rms || 0);
        const transition = vadRef.current.update(rms);

        if (transition === 'speech_start') {
          sendFrame(socket, {
            type: 'vad.event',
            event: 'speech_start',
            timestampMs: Date.now(),
          });

          if (stateRef.current === 'speaking') {
            stopPlayback();
            sendFrame(socket, {
              type: 'control.interrupt',
              reason: 'barge_in',
            });
            setVoiceState('listening');
          }
        }

        if (transition === 'speech_end') {
          sendFrame(socket, {
            type: 'vad.event',
            event: 'speech_end',
            timestampMs: Date.now(),
          });

          turnClosedAtRef.current = Date.now();
          waitingForTtsRef.current = true;
          setVoiceState('processing');
        }

        sendFrame(socket, {
          type: 'audio.chunk',
          seq: ++sequenceRef.current,
          timestampMs: Date.now(),
          sampleRate: bootstrap.sampleRate,
          channels: 1,
          audioBase64: arrayBufferToBase64(payload.buffer),
          rms,
        });
      };

      workletMessageHandlerRef.current = handleWorkletPayload;
      worklet.port.onmessage = (event: MessageEvent<{ type?: string; buffer?: ArrayBuffer; rms?: number }>) => {
        handleWorkletPayload(event.data || {});
      };

      websocketRef.current = socket;
      audioContextRef.current = context;
      mediaStreamRef.current = stream;
      sourceNodeRef.current = source;
      workletNodeRef.current = worklet;
      setAnalyserNode(analyser);
      setIsMicrophoneAvailable(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'voice_start_failed';
      callbacksRef.current.onError?.(message);
      setVoiceState('error');
      stopPlayback();
      await closeAudioGraph();
    }
  }, [
    browserSupportsSpeechRecognition,
    closeAudioGraph,
    handleServerFrame,
    isMicrophoneAvailable,
    languageState,
    sessionEndpoint,
    setVoiceState,
    stopPlayback,
    wsUrl,
  ]);

  const stopListening = useCallback(() => {
    sendFrame(websocketRef.current, {
      type: 'session.stop',
      reason: 'client_stop',
    });

    websocketRef.current?.close();
    websocketRef.current = null;
    sessionIdRef.current = '';
    workletMessageHandlerRef.current = null;

    stopPlayback();
    void closeAudioGraph();

    vadRef.current.reset();
    setPartialTranscript('');
    setVoiceState('idle');
  }, [closeAudioGraph, setVoiceState, stopPlayback]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setPartialTranscript('');
    setAssistantTranscript('');
    setLatencyMs(null);
    turnClosedAtRef.current = null;
    waitingForTtsRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      websocketRef.current?.close();
      workletMessageHandlerRef.current = null;
      stopPlayback();
      void closeAudioGraph();
    };
  }, [closeAudioGraph, stopPlayback]);

  return {
    isListening,
    state,
    transcript,
    partialTranscript,
    assistantTranscript,
    language: languageState,
    latencyMs,
    analyserNode,
    setLanguage: setLanguageState,
    startListening,
    stopListening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  };
}
