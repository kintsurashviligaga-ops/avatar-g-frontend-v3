export type VoiceCallDirection = 'inbound' | 'outbound' | 'web';

export type VoiceCallStatus = 'initiated' | 'ringing' | 'active' | 'ended' | 'failed';

export interface VoiceCallRecord {
  id: string;
  user_id: string | null;
  vapi_call_id: string | null;
  direction: VoiceCallDirection;
  status: VoiceCallStatus;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  credits_used: number;
  phone_number: string | null;
  created_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
}

export interface VoiceHistoryResponse {
  calls: VoiceCallRecord[];
}

export type RealtimeVoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type RealtimeVoiceLanguage = 'ka-GE' | 'en-US' | 'ru-RU';

export type VoiceClientFrame =
  | {
      type: 'session.start';
      sessionId: string;
      token?: string;
      language: RealtimeVoiceLanguage;
      sampleRate: number;
      format: 'pcm16';
    }
  | {
      type: 'audio.chunk';
      seq: number;
      timestampMs: number;
      sampleRate: number;
      channels: 1;
      audioBase64: string;
      rms: number;
    }
  | {
      type: 'vad.event';
      event: 'speech_start' | 'speech_end';
      timestampMs: number;
    }
  | {
      type: 'control.interrupt' | 'session.stop';
      reason?: string;
    };

export type VoiceServerFrame =
  | {
      type: 'session.ready';
      sessionId: string;
      sttProvider: string;
      ttsProvider: string;
    }
  | {
      type: 'stt.partial' | 'stt.final';
      text: string;
      language: RealtimeVoiceLanguage;
    }
  | {
      type: 'assistant.partial' | 'assistant.final';
      text: string;
    }
  | {
      type: 'tts.audio';
      audioBase64: string;
      mimeType: string;
      chunkId: string;
    }
  | {
      type: 'tts.end' | 'tts.stopped';
      reason?: string;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };
