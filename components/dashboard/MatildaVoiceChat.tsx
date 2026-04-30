'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X, Volume2 } from 'lucide-react';

type Status = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface MatildaVoiceChatProps {
  locale?: string;
}

type MatildaLocale = 'ka' | 'en' | 'ru';
type MatildaLabelMap = Record<Status | 'title' | 'hint' | 'close', string>;

interface SpeechRecognitionResultLike {
  0: {
    transcript: string;
  };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

const LABELS: Record<MatildaLocale, MatildaLabelMap> = {
  ka: {
    idle: 'ილაპარაკე',
    listening: 'გისმენ...',
    thinking: 'ვფიქრობ...',
    speaking: 'ვლაპარაკობ...',
    title: 'მატილდა',
    hint: 'დააჭირე მიკროფონს და ილაპარაკე',
    close: 'დახურვა',
  },
  en: {
    idle: 'Speak',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
    title: 'Matilda',
    hint: 'Press the mic and speak',
    close: 'Close',
  },
  ru: {
    idle: 'Говорите',
    listening: 'Слушаю...',
    thinking: 'Думаю...',
    speaking: 'Говорю...',
    title: 'Матильда',
    hint: 'Нажмите микрофон и говорите',
    close: 'Закрыть',
  },
};

export default function MatildaVoiceChat({ locale = 'ka' }: MatildaVoiceChatProps) {
  const normalizedLocale: MatildaLocale = locale === 'en' || locale === 'ru' || locale === 'ka' ? locale : 'ka';
  const labels = LABELS[normalizedLocale];

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
    recognitionRef.current = rec;
  }, [locale]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, []);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || status !== 'idle') return;

    abortRef.current = false;
    setTranscript('');
    setStatus('listening');

    rec.onresult = (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
      const interim = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join('');
      setTranscript(interim);
    };

    rec.onend = async () => {
      if (abortRef.current) return;
      const finalText = transcript || '';
      if (!finalText.trim()) {
        setStatus('idle');
        return;
      }
      setStatus('thinking');
      try {
        const res = await fetch('/api/matilda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: finalText, history }),
        });
        const data = await res.json();
        const assistantText: string = data.response || '';
        setResponse(assistantText);
        setHistory((h) => [
          ...h,
          { role: 'user', content: finalText },
          { role: 'assistant', content: assistantText },
        ]);

        if (data.audio) {
          setStatus('speaking');
          const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            setStatus('idle');
          };
          audio.play().catch(() => setStatus('idle'));
        } else {
          setStatus('idle');
        }
      } catch {
        setStatus('idle');
      }
    };

    rec.onerror = () => setStatus('idle');
    rec.start();
  }, [status, transcript, history]);

  const stopListening = useCallback(() => {
    abortRef.current = true;
    recognitionRef.current?.stop();
    stopAudio();
    setStatus('idle');
  }, [stopAudio]);

  const handleMicClick = () => {
    if (status === 'idle') {
      startListening();
    } else {
      stopListening();
    }
  };

  const handleClose = () => {
    stopListening();
    setOpen(false);
    setTranscript('');
    setResponse('');
    setHistory([]);
    setStatus('idle');
  };

  const statusColor: Record<Status, string> = {
    idle: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300',
    listening: 'bg-red-500/20 border-red-400/50 text-red-300',
    thinking: 'bg-amber-500/20 border-amber-400/50 text-amber-300',
    speaking: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300',
  };

  const pulseRing = status === 'listening' || status === 'speaking';

  if (!supported) return null;

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={labels.title}
          className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/40 bg-[rgba(0,212,255,0.12)] text-cyan-300 shadow-lg backdrop-blur-xl transition-all hover:scale-105 hover:border-cyan-300/60 hover:bg-[rgba(0,212,255,0.2)] sm:bottom-24 sm:right-6"
        >
          <Volume2 className="h-6 w-6" />
        </button>
      )}

      {/* Voice panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-80 overflow-hidden rounded-3xl border border-white/14 bg-[rgba(12,12,26,0.92)] shadow-2xl backdrop-blur-2xl sm:right-6">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_2px_rgba(0,212,255,0.6)]" />
              <span className="text-sm font-semibold text-white/90">{labels.title}</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-white/50 transition hover:border-white/20 hover:text-white/80"
              aria-label={labels.close}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mic button */}
          <div className="flex flex-col items-center gap-4 px-5 pb-5">
            <div className="relative flex items-center justify-center">
              {pulseRing && (
                <span className="absolute h-24 w-24 animate-ping rounded-full bg-current opacity-15" style={{ color: status === 'listening' ? '#f87171' : '#34d399' }} />
              )}
              <button
                type="button"
                onClick={handleMicClick}
                className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full border-2 transition-all duration-200 ${statusColor[status]} ${status !== 'idle' ? 'scale-105' : 'hover:scale-105'}`}
              >
                {status === 'idle' || status === 'thinking' ? (
                  <Mic className="h-8 w-8" />
                ) : status === 'listening' ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <Volume2 className="h-8 w-8" />
                )}
              </button>
            </div>

            <p className="text-center text-sm font-medium text-white/60">
              {labels[status]}
            </p>

            {/* Transcript */}
            {transcript && (
              <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs text-white/40">შენ:</p>
                <p className="mt-1 text-sm text-white/80">{transcript}</p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="w-full rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-3">
                <p className="text-xs text-cyan-400/60">მატილდა:</p>
                <p className="mt-1 text-sm text-white/85">{response}</p>
              </div>
            )}

            {!transcript && !response && (
              <p className="text-center text-xs text-white/30">{labels.hint}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
