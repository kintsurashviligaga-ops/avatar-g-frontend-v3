'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RealtimeVoiceLanguage, RealtimeVoiceState } from '@/types/voice';

interface UseSimpleVoiceProps {
  language?: RealtimeVoiceLanguage;
  onError?: (error: string) => void;
}

interface UseSimpleVoiceReturn {
  state: RealtimeVoiceState;
  transcript: string;
  partialTranscript: string;
  assistantTranscript: string;
  language: RealtimeVoiceLanguage;
  latencyMs: number | null;
  isSupported: boolean;
  setLanguage: (lang: RealtimeVoiceLanguage) => void;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  return Boolean(getSpeechRecognition()) && Boolean(navigator.mediaDevices?.getUserMedia);
}

async function fetchAiResponse(text: string, language: string): Promise<string> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      agentId: 'main-assistant',
      language: language.split('-')[0],
      channel: 'web',
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error('chat_failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6)) as { token?: string; done?: boolean; error?: string };
        if (parsed.token) fullText += parsed.token;
        if (parsed.done || parsed.error) break;
      } catch {
        // ignore parse errors
      }
    }
  }

  return fullText.trim();
}

async function speakText(text: string): Promise<void> {
  if (!text) return;

  try {
    const res = await fetch('/api/elevenlabs/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 800) }),
    });

    if (res.ok) {
      const data = await res.json() as { success: boolean; audio?: string };
      if (data.success && data.audio) {
        const audioBytes = atob(data.audio);
        const byteArray = new Uint8Array(audioBytes.length);
        for (let i = 0; i < audioBytes.length; i++) {
          byteArray[i] = audioBytes.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          void audio.play();
        });
        return;
      }
    }
  } catch {
    // fall through to browser TTS
  }

  // Browser TTS fallback
  if ('speechSynthesis' in window) {
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
      utterance.lang = 'ka-GE';
      utterance.rate = 0.9;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }
}

export function useSimpleVoice({
  language = 'ka-GE',
  onError,
}: UseSimpleVoiceProps = {}): UseSimpleVoiceReturn {
  const [state, setState] = useState<RealtimeVoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lang, setLang] = useState<RealtimeVoiceLanguage>(language);
  const [isSupported] = useState(isVoiceSupported);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const activeRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const stopListening = useCallback(() => {
    activeRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setState('idle');
    setPartialTranscript('');
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || activeRef.current) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    activeRef.current = true;
    setState('listening');

    finalTranscriptRef.current = '';

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }
      if (interim) setPartialTranscript(interim);
      if (final) {
        finalTranscriptRef.current = final;
        setTranscript(final);
        setPartialTranscript('');
      }
    };

    recognition.onerror = (event) => {
      const code = event.error;
      if (code !== 'aborted' && code !== 'no-speech') {
        onErrorRef.current?.(code);
        setState('error');
      } else {
        setState('idle');
      }
      activeRef.current = false;
    };

    recognition.onend = () => {
      if (!activeRef.current) return;
      activeRef.current = false;

      setPartialTranscript('');
      const finalText = finalTranscriptRef.current;
      if (!finalText) {
        setState('idle');
        return;
      }

      setState('processing');
      const startMs = Date.now();

      void (async () => {
        try {
          const reply = await fetchAiResponse(finalText, lang);
          setLatencyMs(Date.now() - startMs);
          setAssistantTranscript(reply);
          setState('speaking');
          await speakText(reply);
          setState('idle');
        } catch {
          onErrorRef.current?.('response_failed');
          setState('error');
        }
      })();
    };

    recognition.start();
  }, [lang]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setPartialTranscript('');
    setAssistantTranscript('');
    setLatencyMs(null);
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    state,
    transcript,
    partialTranscript,
    assistantTranscript,
    language: lang,
    latencyMs,
    isSupported,
    setLanguage: setLang,
    startListening,
    stopListening,
    resetTranscript,
  };
}
