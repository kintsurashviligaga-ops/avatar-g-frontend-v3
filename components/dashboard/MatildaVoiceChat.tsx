'use client';

import { useCallback, useState } from 'react';
import { Languages, Mic, RotateCcw, Volume2, X } from 'lucide-react';

import { RealtimeWaveform } from '@/components/voice/RealtimeWaveform';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import type { RealtimeVoiceLanguage, RealtimeVoiceState } from '@/types/voice';

import { useOmniStore } from './omni/store';

interface MatildaVoiceChatProps {
  locale?: string;
}

type MatildaLocale = 'ka' | 'en' | 'ru';
type MatildaLabelMap = {
  title: string;
  hint: string;
  close: string;
  reset: string;
  language: string;
  latency: string;
  unsupported: string;
  states: Record<RealtimeVoiceState, string>;
};

const LANGUAGE_OPTIONS: Array<{ code: RealtimeVoiceLanguage; short: string }> = [
  { code: 'ka-GE', short: 'GE' },
  { code: 'en-US', short: 'EN' },
  { code: 'ru-RU', short: 'RU' },
];

const LABELS: Record<MatildaLocale, MatildaLabelMap> = {
  ka: {
    title: 'G',
    hint: 'დააჭირე მიკროფონს და ილაპარაკე',
    close: 'დახურვა',
    reset: 'განულება',
    language: 'ენა',
    latency: 'რეაგირების დრო',
    unsupported: 'Realtime ხმა ამ ბრაუზერში ხელმისაწვდომი არ არის.',
    states: {
      idle: 'მზად ვარ',
      listening: 'გისმენ...',
      processing: 'ვამუშავებ...',
      speaking: 'ვლაპარაკობ...',
      error: 'შეცდომა',
    },
  },
  en: {
    title: 'G',
    hint: 'Press the mic and speak',
    close: 'Close',
    reset: 'Reset',
    language: 'Language',
    latency: 'Response latency',
    unsupported: 'Realtime voice is not available in this browser.',
    states: {
      idle: 'Ready',
      listening: 'Listening...',
      processing: 'Processing...',
      speaking: 'Speaking...',
      error: 'Error',
    },
  },
  ru: {
    title: 'G',
    hint: 'Нажмите микрофон и говорите',
    close: 'Закрыть',
    reset: 'Сброс',
    language: 'Язык',
    latency: 'Задержка ответа',
    unsupported: 'Realtime-голос недоступен в этом браузере.',
    states: {
      idle: 'Готово',
      listening: 'Слушаю...',
      processing: 'Обрабатываю...',
      speaking: 'Говорю...',
      error: 'Ошибка',
    },
  },
};

const BADGE_COLOR: Record<RealtimeVoiceState, string> = {
  idle: 'border-cyan-300/35 bg-cyan-500/15 text-cyan-100',
  listening: 'border-sky-300/50 bg-sky-500/20 text-sky-100',
  processing: 'border-amber-300/55 bg-amber-500/20 text-amber-100',
  speaking: 'border-emerald-300/55 bg-emerald-500/20 text-emerald-100',
  error: 'border-rose-300/55 bg-rose-500/20 text-rose-100',
};

const STATE_HALO: Record<RealtimeVoiceState, string> = {
  idle: 'from-cyan-500/20 to-sky-500/5',
  listening: 'from-sky-400/40 to-cyan-300/5',
  processing: 'from-amber-400/35 to-orange-300/5',
  speaking: 'from-emerald-400/35 to-teal-300/5',
  error: 'from-rose-500/35 to-red-300/5',
};

function statusIcon(state: RealtimeVoiceState) {
  if (state === 'speaking') {
    return <Volume2 className="h-7 w-7" />;
  }

  return <Mic className="h-7 w-7" />;
}

function toRealtimeLanguage(locale: MatildaLocale): RealtimeVoiceLanguage {
  if (locale === 'ru') return 'ru-RU';
  if (locale === 'en') return 'en-US';
  return 'ka-GE';
}

export default function MatildaVoiceChat({ locale = 'ka' }: MatildaVoiceChatProps) {
  const storeLocale = useOmniStore((state) => state.locale);
  const effectiveLocale = storeLocale || locale;
  const normalizedLocale: MatildaLocale =
    effectiveLocale === 'en' || effectiveLocale === 'ru' || effectiveLocale === 'ka' ? effectiveLocale : 'ka';
  const labels = LABELS[normalizedLocale];

  const [open, setOpen] = useState(false);
  const [errorText, setErrorText] = useState('');

  const {
    state,
    transcript,
    partialTranscript,
    assistantTranscript,
    analyserNode,
    latencyMs,
    language,
    setLanguage,
    startListening,
    stopListening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useVoiceInput({
    language: toRealtimeLanguage(normalizedLocale),
    onError: (error) => {
      const code = String(error || '');
      // Connection-level errors: mic button goes red, no text box
      const silent = new Set(['socket_error', 'session_bootstrap_failed', 'session_ws_url_missing']);
      if (!silent.has(code)) {
        setErrorText(code.replace(/_/g, ' '));
      }
    },
  });

  const statusLabel = labels.states[state] || labels.states.idle;
  const isActive = state !== 'idle' && state !== 'error';
  const pulseRing = state === 'listening' || state === 'speaking';

  const handleMicClick = useCallback(() => {
    if (isActive) {
      stopListening();
      return;
    }

    setErrorText('');
    void startListening();
  }, [isActive, startListening, stopListening]);

  const handleLanguageChange = useCallback((nextLanguage: RealtimeVoiceLanguage) => {
    setLanguage(nextLanguage);
    setErrorText('');
  }, [setLanguage]);

  const handleReset = useCallback(() => {
    resetTranscript();
    setErrorText('');
  }, [resetTranscript]);

  const handleClose = () => {
    stopListening();
    setOpen(false);
    handleReset();
  };

  if (!browserSupportsSpeechRecognition) {
    return null;
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={labels.title}
          data-testid="matilda-open"
          className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/40 bg-[rgba(0,212,255,0.12)] text-cyan-300 shadow-lg backdrop-blur-xl transition-all hover:scale-105 hover:border-cyan-300/60 hover:bg-[rgba(0,212,255,0.2)] sm:bottom-24 sm:right-6"
        >
          <Volume2 className="h-6 w-6" />
        </button>
      )}

      {/* Voice panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[22rem] overflow-hidden rounded-3xl border border-cyan-100/15 bg-[radial-gradient(circle_at_85%_0%,rgba(14,165,233,0.22),transparent_45%),linear-gradient(165deg,rgba(2,6,23,0.96),rgba(8,16,36,0.96))] shadow-2xl shadow-cyan-900/25 backdrop-blur-2xl sm:right-6">
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

          <div className="px-5 pb-3">
            <RealtimeWaveform analyserNode={analyserNode} state={state} />
          </div>

          <div className="px-5">
            <div data-testid="matilda-status" className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${BADGE_COLOR[state]}`}>
              {statusLabel}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-cyan-100/12 bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{labels.language}</span>
              <div className="flex items-center gap-1">
                <Languages className="h-3.5 w-3.5 text-cyan-200/75" />
                {LANGUAGE_OPTIONS.map((option) => {
                  const active = language === option.code;
                  return (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => handleLanguageChange(option.code)}
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${active ? 'bg-cyan-400/25 text-cyan-100' : 'text-white/55 hover:bg-white/10 hover:text-white/80'}`}
                    >
                      {option.short}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mic button */}
          <div className="flex flex-col items-center gap-4 px-5 pb-5">
            <div className="relative flex items-center justify-center">
              {pulseRing && (
                <span className="absolute h-24 w-24 animate-ping rounded-full bg-current opacity-20" style={{ color: state === 'listening' ? '#38bdf8' : '#34d399' }} />
              )}
              <button
                type="button"
                onClick={handleMicClick}
                data-testid="matilda-mic-toggle"
                className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full border-2 bg-gradient-to-br ${STATE_HALO[state]} ${BADGE_COLOR[state]} transition-all duration-200 ${isActive ? 'scale-105' : 'hover:scale-105'}`}
              >
                {statusIcon(state)}
              </button>
            </div>

            <p className="text-center text-sm font-medium text-white/60">
              {statusLabel}
            </p>

            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                data-testid="matilda-reset"
                className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {labels.reset}
              </button>
              {latencyMs !== null && (
                <div className="ml-auto rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-100/85">
                  {labels.latency}: {latencyMs}ms
                </div>
              )}
            </div>

            {/* Transcript */}
            {(transcript || partialTranscript) && (
              <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-xs text-white/40">შენ:</p>
                {transcript ? <p className="mt-1 text-sm text-white/85">{transcript}</p> : null}
                {partialTranscript ? <p className="mt-1 text-sm italic text-cyan-100/85">{partialTranscript}</p> : null}
              </div>
            )}

            {/* Response */}
            {assistantTranscript && (
              <div className="w-full rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-3">
                <p className="text-xs text-cyan-400/60">{labels.title}:</p>
                <p className="mt-1 text-sm text-white/85">{assistantTranscript}</p>
              </div>
            )}

            {errorText && (
              <div className="w-full rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3">
                <p className="text-xs text-rose-100/80">{labels.states.error}</p>
                <p className="mt-1 text-sm text-rose-100/90">{errorText}</p>
              </div>
            )}

            {!transcript && !assistantTranscript && !errorText && (
              <p className="text-center text-xs text-white/30">{labels.hint}</p>
            )}

          </div>
        </div>
      )}
    </>
  );
}
