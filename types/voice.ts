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
