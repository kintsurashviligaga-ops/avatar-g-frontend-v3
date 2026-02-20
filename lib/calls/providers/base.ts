export type CallChannel = 'phone' | 'telegram' | 'web_voice';
export type CallDirection = 'inbound' | 'outbound';
export type CallStatus = 'queued' | 'ringing' | 'active' | 'ended' | 'failed';

export type StartSessionInput = {
  userId: string;
  channel: CallChannel;
  mode: 'task_intake' | 'qa' | 'status_update';
  phoneNumber?: string | null;
  relatedTaskId?: string | null;
  initialText?: string;
};

export type ProviderCallResult = {
  providerCallId: string;
  status: CallStatus;
  transcript?: string;
  summary?: string;
  meta?: Record<string, unknown>;
};

export interface CallsProvider {
  name: string;
  startInboundSession(input: StartSessionInput): Promise<ProviderCallResult>;
  startOutboundCall(phoneNumber: string, textToSpeak: string, meta?: Record<string, unknown>): Promise<ProviderCallResult>;
  onWebhookEvent(event: Record<string, unknown>): Promise<{ ok: boolean; callId?: string; status?: CallStatus; meta?: Record<string, unknown> }>;
  endCall(callId: string): Promise<{ ok: boolean }>;
}
