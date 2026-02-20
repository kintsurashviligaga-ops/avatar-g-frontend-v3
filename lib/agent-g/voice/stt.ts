export type SttResult = {
  transcript: string;
  provider: string;
};

export async function transcribeFromVoiceUrl(voiceUrl: string): Promise<SttResult> {
  if (!voiceUrl) {
    return { transcript: 'No voice URL provided.', provider: 'mock-stt' };
  }

  const fileHint = voiceUrl.split('/').pop() || 'voice';
  return {
    transcript: `Transcribed voice message (${fileHint}). Please refine if needed.`,
    provider: 'mock-stt',
  };
}
