'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVoiceInputProps {
  language?: string;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  browserSupportsSpeechRecognition: boolean;
  isMicrophoneAvailable: boolean;
}

export function useVoiceInput({
  language = 'ka-GE',
  onResult,
  onError
}: UseVoiceInputProps = {}): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [browserSupportsSpeechRecognition, setBrowserSupportsSpeechRecognition] = useState(false);
  const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setBrowserSupportsSpeechRecognition(true);
        
        if (navigator.mediaDevices?.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => setIsMicrophoneAvailable(true))
            .catch(() => setIsMicrophoneAvailable(false));
        }
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      onError?.('Browser does not support speech recognition');
      return;
    }

    if (!isMicrophoneAvailable) {
      onError?.('Microphone not available');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError?.('Speech recognition not available');
      return;
    }

    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      finalTranscriptRef.current = '';
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript;
        if (!transcript) continue;

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
        setTranscript(finalTranscriptRef.current);
        onResult?.(finalTranscriptRef.current);
      } else {
        setTranscript(finalTranscriptRef.current + interimTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      onError?.(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable, language, onResult, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    finalTranscriptRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  };
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
